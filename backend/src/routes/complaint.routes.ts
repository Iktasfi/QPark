import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { uploadPhotoToCloudinary } from '../utils/cloudinary';
import { findFreeSpotNearby } from '../utils/spots';
import { sendPushToUser } from '../utils/notifications';

const router = Router();

router.use(verifyToken);

// Kazakh plate patterns: 444ABC01, A444BC, 123AB01, etc.
const PLATE_PATTERNS = [
  /\b\d{3}\s*[A-ZА-ЯA-Z]{2,3}\s*\d{2}\b/i,   // 444 ABC 01
  /\b[A-ZА-Я]{1,2}\s*\d{3,4}\s*[A-ZА-Я]{2}\b/i, // A 444 BC
  /\b\d{2,3}[A-ZА-Я]{2,4}\d{2}\b/i,             // 44ABC01
];

function extractPlateFromTexts(texts: { text: string }[]): string | null {
  const allText = texts.map(t => t.text.toUpperCase().replace(/\s+/g, '')).join(' ');
  for (const pattern of PLATE_PATTERNS) {
    const match = allText.match(pattern);
    if (match) return match[0].replace(/\s+/g, ' ').trim().toUpperCase();
  }
  // Fallback: look for any text that looks like a plate (6-9 chars, mixed letters+digits)
  for (const t of texts) {
    const clean = t.text.replace(/\s+/g, '').toUpperCase();
    if (clean.length >= 6 && clean.length <= 10 && /[A-ZА-Я]/.test(clean) && /\d/.test(clean)) {
      return clean;
    }
  }
  return null;
}

async function detectPlateFromPhoto(photoUrl: string): Promise<string | null> {
  const ocrUrl = process.env.OCR_SERVICE_URL;
  if (!ocrUrl) return null;
  try {
    const res = await fetch(`${ocrUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify({ image: photoUrl, spot: '' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { texts?: { text: string }[] };
    if (!data.texts?.length) return null;
    const plate = extractPlateFromTexts(data.texts);
    logger.info(`🔍 OCR plate detection: found="${plate}" in ${data.texts.length} texts`);
    return plate;
  } catch {
    logger.warn('⚠️ OCR service unavailable for plate detection');
    return null;
  }
}

// POST /complaints — submit a complaint
router.post('/', async (req: Request, res: Response) => {
  try {
    const { bookingId, spotId, reason, photoUrl, violatorPlateManual } = req.body;
    const userId = req.userId!;

    if (!spotId || !reason) {
      return res.status(400).json({ error: 'spotId and reason are required' });
    }

    // If user provided a plate manually, try to find the violator right away
    let initialViolatorUserId: string | null = null;
    if (violatorPlateManual) {
      const violatorCar = await prisma.car.findFirst({
        where: { plateNumber: { contains: violatorPlateManual.replace(/\s+/g, ''), mode: 'insensitive' } },
      });
      if (violatorCar) initialViolatorUserId = violatorCar.userId;
    }

    const complaint = await prisma.complaint.create({
      data: {
        userId,
        bookingId: bookingId ?? null,
        spotId,
        reason,
        photoUrl: photoUrl ?? null,
        detectedPlate: violatorPlateManual ?? null,
        violatorUserId: initialViolatorUserId,
      },
      include: { user: { select: { firstName: true, phoneNumber: true } } },
    });

    const { io } = await import('../server');
    io.emit('new-complaint', { complaintId: complaint.id, spotId, userId });

    // Отвечаем клиенту СРАЗУ
    res.status(201).json({ success: true, complaint });

    // Background: OCR to identify violator, then swap or find free spot
    setImmediate(async () => {
      try {
        // Check if admin already processed this complaint manually (race condition guard)
        const freshComplaint = await prisma.complaint.findUnique({ where: { id: complaint.id } });
        if (freshComplaint?.status === 'REASSIGNED' || freshComplaint?.status === 'REFUNDED' || freshComplaint?.status === 'CLOSED') {
          logger.info(`⏭️ Complaint ${complaint.id} already processed (status=${freshComplaint.status}), skipping background swap`);
          return;
        }

        // 1) Run OCR to identify violator from photo
        const ocrPlate = photoUrl ? await detectPlateFromPhoto(photoUrl) : null;

        // 2) Identify violator from OCR result (or manual input)
        let detectedPlate: string | null = ocrPlate ?? violatorPlateManual ?? null;
        let violatorUserId: string | null = initialViolatorUserId;
        if (detectedPlate && !violatorUserId) {
          const noSpaces = detectedPlate.replace(/\s+/g, '');
          const violatorCar = await prisma.$queryRaw<Array<{ id: string; userId: string }>>`
            SELECT id, "userId" FROM "cars"
            WHERE REPLACE("plateNumber", ' ', '') ILIKE ${noSpaces}
            LIMIT 1
          `;
          if (violatorCar.length) violatorUserId = violatorCar[0].userId;
        }
        if (detectedPlate) logger.info(`🎯 Violator plate: ${detectedPlate}, userId: ${violatorUserId ?? 'unknown'}`);

        // Victim's original spot record
        const victimOldSpot = await prisma.parkingSpot.findFirst({ where: { spotNumber: spotId } });

        // Helper: move victim's booking or LongTermRental to a new spot db id
        // bookingId from frontend may be a Booking id OR a LongTermRental id
        const moveVictim = async (newSpotDbId: string) => {
          if (bookingId) {
            const asBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
            if (asBooking) {
              await prisma.booking.update({ where: { id: bookingId }, data: { spotId: newSpotDbId } });
              return;
            }
            const asRental = await prisma.longTermRental.findUnique({ where: { id: bookingId } });
            if (asRental) {
              await prisma.longTermRental.update({ where: { id: bookingId }, data: { spotId: newSpotDbId } });
              return;
            }
          }
          // Fallback: find rental by userId + original spot
          if (victimOldSpot) {
            await prisma.longTermRental.updateMany({
              where: { userId, spotId: victimOldSpot.id, status: 'ACTIVE' },
              data: { spotId: newSpotDbId },
            });
          }
        };

        // Helper: refund victim
        // keepOpen=true → refund as compensation but leave complaint PENDING for admin manual review
        const refundVictim = async (keepOpen = false) => {
          let refundAmount = 0;
          if (bookingId) {
            const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
            if (booking) {
              refundAmount = booking.totalCost ?? 0;
              const victim = await prisma.user.findUnique({ where: { id: userId } });
              const balanceBefore = victim?.walletBalance ?? 0;
              await prisma.$transaction([
                prisma.user.update({ where: { id: userId }, data: { walletBalance: { increment: refundAmount } } }),
                prisma.transaction.create({
                  data: { userId, amount: refundAmount, type: 'REFUND', description: 'Возврат: нет свободных мест', balanceBefore, balanceAfter: balanceBefore + refundAmount },
                }),
              ]);
            }
          }
          await prisma.complaint.update({
            where: { id: complaint.id },
            data: keepOpen
              ? { status: 'PENDING', resolvedAt: null }
              : { status: 'REFUNDED', resolvedAt: new Date() },
          });
          io.emit('no-spots-available', { userId, refundAmount, needsManualReview: keepOpen });
          logger.info(`😔 No free spots for victim ${userId}, refunded ${refundAmount}₸${keepOpen ? ' (kept PENDING for admin review)' : ''}`);
        };

        // Helper: get user's registered car plate
        const getCarPlate = async (uid: string): Promise<string | null> => {
          const car = await prisma.car.findFirst({ where: { userId: uid } });
          return car?.plateNumber ?? null;
        };

        let swapDone = false;

        // ── PRIORITY: Violator known → swap bookings (give victim violator's spot) ──
        if (violatorUserId && victimOldSpot) {
          const violatorBooking = await prisma.booking.findFirst({
            where: { userId: violatorUserId, status: { in: ['PENDING', 'CONFIRMED'] } },
          });
          const violatorRental = !violatorBooking
            ? await prisma.longTermRental.findFirst({ where: { userId: violatorUserId, status: 'ACTIVE' } })
            : null;
          const violatorSpotId = violatorBooking?.spotId ?? violatorRental?.spotId ?? null;
          const violatorOriginalSpot = violatorSpotId
            ? await prisma.parkingSpot.findUnique({ where: { id: violatorSpotId } })
            : null;

          if (violatorOriginalSpot) {
            const [victimPlate, violatorPlate, victimRentalCheck] = await Promise.all([
              getCarPlate(userId),
              getCarPlate(violatorUserId),
              // Determine if victim is a long-term renter
              bookingId
                ? prisma.longTermRental.findUnique({ where: { id: bookingId } })
                : prisma.longTermRental.findFirst({ where: { userId, status: 'ACTIVE' } }),
            ]);
            // Victim is physically inside (arrivedAt set) → mark new spot OCCUPIED immediately
            // so exit gate opens automatically without needing a fresh LPR scan
            const victimIsInside = !!(victimRentalCheck?.arrivedAt);
            const victimNewSpotStatus = victimIsInside ? 'OCCUPIED' : (victimRentalCheck ? 'RESERVED' : 'BOOKED');

            // 1. Move victim → violator's original spot (physically empty)
            await moveVictim(violatorOriginalSpot.id);
            await prisma.parkingSpot.update({
              where: { id: violatorOriginalSpot.id },
              data: { status: victimNewSpotStatus, currentUserId: userId, currentUserPlate: victimPlate },
            });
            io.emit('spot-status-changed', { spotNumber: violatorOriginalSpot.spotNumber, status: victimNewSpotStatus, carPlate: victimPlate });

            // 2. Move violator's booking/rental → victim's spot (where they physically are)
            if (violatorBooking) {
              await prisma.booking.update({
                where: { id: violatorBooking.id },
                data: { spotId: victimOldSpot.id, arrivedAt: violatorBooking.arrivedAt ?? new Date() },
              });
            } else if (violatorRental) {
              await prisma.longTermRental.update({ where: { id: violatorRental.id }, data: { spotId: victimOldSpot.id } });
            }
            await prisma.parkingSpot.update({
              where: { id: victimOldSpot.id },
              data: { status: 'OCCUPIED', currentUserId: violatorUserId, currentUserPlate: violatorPlate },
            });
            io.emit('spot-status-changed', { spotNumber: victimOldSpot.spotNumber, status: 'OCCUPIED', carPlate: violatorPlate });

            await prisma.complaint.update({
              where: { id: complaint.id },
              data: { status: 'REASSIGNED', newSpotId: violatorOriginalSpot.spotNumber, resolvedAt: new Date(), detectedPlate, violatorUserId },
            });

            // Victim: 7-min timer to go park at new spot
            io.emit('spot-reassigned', { userId, newSpotId: violatorOriginalSpot.spotNumber });
            // Violator: silent update — spot label changes, timer keeps running
            io.emit('spot-moved', { userId: violatorUserId, newSpotId: victimOldSpot.spotNumber, oldSpotId: violatorOriginalSpot.spotNumber });

            logger.info(`🔀 Auto-swap: victim ${userId}→${violatorOriginalSpot.spotNumber}, violator ${violatorUserId}→${victimOldSpot.spotNumber}`);

            // Charge 900₸ fine to violator — financial penalty only, no bans (spec §3.5.6.3)
            const fineAmount = 900;
            const violator = await prisma.user.findUnique({ where: { id: violatorUserId } });
            if (violator) {
              const charged = Math.min(fineAmount, violator.walletBalance);
              const debt = fineAmount - charged;
              const newBalance = Math.max(0, violator.walletBalance - fineAmount);

              await prisma.$transaction([
                prisma.fine.create({
                  data: {
                    userId: violatorUserId,
                    amount: fineAmount,
                    paidAmount: charged,
                    reason: `Автоштраф: занял чужое место (${victimOldSpot.spotNumber}), места поменяны`,
                    ticketId: complaint.id,
                    isPaid: charged >= fineAmount,
                    paidAt: charged >= fineAmount ? new Date() : null,
                  },
                }),
                prisma.user.update({
                  where: { id: violatorUserId },
                  data: { walletBalance: newBalance },
                }),
                prisma.transaction.create({
                  data: {
                    userId: violatorUserId,
                    amount: -charged,
                    type: 'PAYMENT',
                    description: `Автоштраф 900₸: занял место ${victimOldSpot.spotNumber}`,
                    balanceBefore: violator.walletBalance,
                    balanceAfter: newBalance,
                  },
                }),
                ...(debt > 0 ? [prisma.transaction.create({
                  data: {
                    userId: violatorUserId,
                    amount: -debt,
                    type: 'PAYMENT',
                    description: `Долг по штрафу: ${debt}₸ (пополните кошелёк)`,
                    balanceBefore: 0,
                    balanceAfter: 0,
                  },
                })] : []),
              ]);

              io.emit('fine-issued', { userId: violatorUserId, amount: fineAmount, complaintId: complaint.id, spotNumber: victimOldSpot.spotNumber });
              logger.info(`💸 Auto-fine 900₸ → violator ${violatorUserId}`);

              // Push: violator only gets the fine notification
              await sendPushToUser(
                violatorUserId,
                '⚠️ Штраф 900₸ — смена места',
                `Вы заняли чужое место (${victimOldSpot.spotNumber}). Штраф 900₸ списан. Ваше место изменено: ${victimOldSpot.spotNumber}.`,
                { type: 'spot-moved', newSpotId: victimOldSpot.spotNumber }
              ).catch(() => {});
            }

            // Push to victim: just redirect, don't mention fine
            await sendPushToUser(
              userId,
              '🔄 Ваше место изменено',
              `Ваше новое место: ${violatorOriginalSpot.spotNumber}. Пожалуйста, паркуйтесь там.`,
              { type: 'spot-reassigned', newSpotId: violatorOriginalSpot.spotNumber }
            ).catch((err) => { logger.warn(`⚠️ Push to victim ${userId} failed:`, err?.message ?? err); });

            io.emit('bookings-updated'); // tells admin dashboard to refetch
            swapDone = true;
          }
        }

        if (!swapDone) {
          // ── FALLBACK: No swap possible — find a free spot ──
          const freeSpot = await findFreeSpotNearby(spotId);
          if (freeSpot) {
            await moveVictim(freeSpot.id);
            const victimCarPlate = await getCarPlate(userId);
            await prisma.parkingSpot.update({ where: { id: freeSpot.id }, data: { status: 'BOOKED', currentUserId: userId, currentUserPlate: victimCarPlate } });
            await prisma.complaint.update({ where: { id: complaint.id }, data: { status: 'REASSIGNED', newSpotId: freeSpot.spotNumber, resolvedAt: new Date(), detectedPlate, violatorUserId } });
            io.emit('spot-reassigned', { userId, newSpotId: freeSpot.spotNumber });
            io.emit('spot-status-changed', { spotNumber: freeSpot.spotNumber, status: 'BOOKED', carPlate: victimCarPlate });
            await sendPushToUser(userId, '🔄 Вас перенаправили на новое место', `Ваше место было занято. Новое место: ${freeSpot.spotNumber}. Паркуйтесь там.`, { type: 'spot-reassigned', newSpotId: freeSpot.spotNumber }).catch(() => {});
            logger.info(`🔄 Victim ${userId} → free spot ${freeSpot.spotNumber}`);
          } else {
            await prisma.complaint.update({ where: { id: complaint.id }, data: { detectedPlate, violatorUserId } });
            await refundVictim(!detectedPlate);
          }
        }

        // 3) Cloudinary upload (always, for admin to see the photo)
        if (photoUrl && process.env.CLOUDINARY_CLOUD_NAME) {
          try {
            const storedUrl = await uploadPhotoToCloudinary(photoUrl, 'qpark/complaints');
            await prisma.complaint.update({ where: { id: complaint.id }, data: { photoUrl: storedUrl } });
          } catch {
            logger.warn('⚠️ Cloudinary upload failed for complaint', complaint.id);
          }
        }

        io.emit('complaint-enriched', { complaintId: complaint.id, detectedPlate, violatorFound: !!violatorUserId });

      } catch (bgErr) {
        logger.error('❌ Background complaint processing failed:', bgErr);
      }
    });

  } catch (error) {
    logger.error('❌ Error creating complaint:', error);
    res.status(500).json({ error: 'Failed to submit complaint' });
  }
});

// POST /complaints/accept-reassignment — user accepts the new spot
router.post('/accept-reassignment', async (req: Request, res: Response) => {
  try {
    const { oldSpotId, newSpotId, bookingId } = req.body;
    const userId = req.userId!;

    const newSpot = await prisma.parkingSpot.findUnique({ where: { spotNumber: newSpotId } });
    if (!newSpot) return res.status(404).json({ error: 'New spot not found' });

    // Adjust booking startTime so the 30-min countdown shows exactly 7 min remaining
    if (bookingId) {
      const adjustedStart = new Date(Date.now() - (30 - 7) * 60 * 1000);
      await prisma.booking.update({
        where: { id: bookingId },
        data: { spotId: newSpot.id, startTime: adjustedStart },
      }).catch(() => {});
    }

    await prisma.parkingSpot.update({
      where: { spotNumber: oldSpotId },
      data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
    }).catch(() => {});

    const booking = bookingId
      ? await prisma.booking.findUnique({ where: { id: bookingId } })
      : null;
    const plate = booking?.plateNumber ?? null;

    await prisma.parkingSpot.update({
      where: { spotNumber: newSpotId },
      data: { status: 'BOOKED', currentUserId: userId, currentUserPlate: plate },
    }).catch(() => {});

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber: oldSpotId, status: 'FREE', carPlate: null });
    io.emit('spot-status-changed', { spotNumber: newSpotId, status: 'BOOKED', carPlate: plate });

    // After 7 min, auto-mark spot as OCCUPIED (user should be parked by then)
    setTimeout(async () => {
      try {
        const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber: newSpotId } });
        if (spot?.status === 'BOOKED') {
          await prisma.parkingSpot.update({
            where: { spotNumber: newSpotId },
            data: { status: 'OCCUPIED' },
          });
          io.emit('spot-status-changed', { spotNumber: newSpotId, status: 'OCCUPIED', carPlate: plate });
          logger.info(`🚗 Auto-OCCUPIED spot ${newSpotId} after 7-min reassignment grace`);
        }
      } catch (err) {
        logger.warn(`⚠️ Failed to auto-OCCUPIED spot ${newSpotId}:`, err);
      }
    }, 7 * 60 * 1000);

    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error accepting reassignment:', error);
    res.status(500).json({ error: 'Failed to accept reassignment' });
  }
});

export default router;
