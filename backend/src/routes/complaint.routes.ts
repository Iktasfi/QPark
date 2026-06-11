import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { uploadPhotoToCloudinary } from '../utils/cloudinary';
import paymentService from '../services/payment.service';
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

// Find next truly free spot (status=FREE AND not physically occupied) with retry support
async function findNextTrulyFreeSpot(
  prefix: string,
  excludeSpotNumber: string,
  excludeIds: string[],
) {
  return prisma.parkingSpot.findFirst({
    where: {
      status: 'FREE',
      currentUserId: null,
      spotNumber: { startsWith: `${prefix}-`, not: excludeSpotNumber },
      id: { notIn: excludeIds },
    },
    orderBy: { spotNumber: 'asc' },
  });
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

    // Respond to client immediately
    res.status(201).json({ success: true, complaint });

    // Background: OCR → identify violator → swap or redirect
    setImmediate(async () => {
      try {
        // Race condition guard: admin may have already processed this
        const freshComplaint = await prisma.complaint.findUnique({ where: { id: complaint.id } });
        if (freshComplaint?.status === 'REASSIGNED' || freshComplaint?.status === 'REFUNDED' || freshComplaint?.status === 'CLOSED') {
          logger.info(`⏭️ Complaint ${complaint.id} already processed, skipping`);
          return;
        }

        // 1) OCR to identify violator
        const ocrPlate = photoUrl ? await detectPlateFromPhoto(photoUrl) : null;
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

        const victimOldSpot = await prisma.parkingSpot.findFirst({ where: { spotNumber: spotId } });
        if (!victimOldSpot) {
          logger.error(`❌ Victim spot ${spotId} not found`);
          return;
        }
        const prefix = victimOldSpot.spotNumber.split('-')[0];

        // Helper: get user's registered car plate
        const getCarPlate = async (uid: string) => {
          const car = await prisma.car.findFirst({ where: { userId: uid } });
          return car?.plateNumber ?? null;
        };

        // Helper: move victim's booking OR rental to new spot inside a tx
        const moveVictimTx = async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], newSpotDbId: string) => {
          if (bookingId) {
            const asBooking = await tx.booking.findUnique({ where: { id: bookingId } });
            if (asBooking) { await tx.booking.update({ where: { id: bookingId }, data: { spotId: newSpotDbId } }); return; }
            const asRental = await tx.longTermRental.findUnique({ where: { id: bookingId } });
            if (asRental) { await tx.longTermRental.update({ where: { id: bookingId }, data: { spotId: newSpotDbId } }); return; }
          }
          await tx.longTermRental.updateMany({
            where: { userId, spotId: victimOldSpot.id, status: 'ACTIVE' },
            data: { spotId: newSpotDbId },
          });
        };

        // Helper: move violator's booking OR rental to new spot inside a tx (any type combo)
        const moveViolatorTx = async (
          tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
          violatorBooking: { id: string; arrivedAt?: Date | null } | null,
          violatorRental: { id: string } | null,
          newSpotDbId: string,
        ) => {
          if (violatorBooking) {
            await tx.booking.update({
              where: { id: violatorBooking.id },
              data: { spotId: newSpotDbId, arrivedAt: violatorBooking.arrivedAt ?? new Date() },
            });
          } else if (violatorRental) {
            await tx.longTermRental.update({ where: { id: violatorRental.id }, data: { spotId: newSpotDbId } });
          }
        };

        // Helper: fine violator 900₸
        const fineViolator = async (vid: string, spotNumber: string) => {
          await paymentService.chargeWallet(
            vid, 900,
            `Автоштраф 900₸: занял чужое место (${spotNumber})`,
            `Занял чужое место (${spotNumber})`,
          ).catch((err) => logger.error(`❌ chargeWallet failed for ${vid}:`, err));

          await prisma.fine.create({
            data: {
              userId: vid, amount: 900, paidAmount: 900,
              reason: `Занял чужое место (${spotNumber}). Штраф 900₸.`,
              ticketId: complaint.id, isPaid: true, paidAt: new Date(),
            },
          });
          io.emit('fine-issued', { userId: vid, amount: 900, complaintId: complaint.id, spotNumber });
          logger.info(`💸 Auto-fine 900₸ → violator ${vid}`);
        };

        // Helper: refund victim
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
            data: keepOpen ? { status: 'PENDING', resolvedAt: null } : { status: 'REFUNDED', resolvedAt: new Date() },
          });
          io.emit('no-spots-available', { userId, refundAmount, needsManualReview: keepOpen });
          logger.info(`😔 No free spots for victim ${userId}, refunded ${refundAmount}₸`);
        };

        let swapDone = false;

        // ── VIOLATOR KNOWN: swap or redirect ──
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
            const [victimPlate, violatorPlate] = await Promise.all([
              getCarPlate(userId),
              getCarPlate(violatorUserId),
            ]);

            // ── CASE A: Try free spots with retry ──
            // Excludes both contested spots and any that turn out to be physically occupied
            const excludeIds: string[] = [victimOldSpot.id, violatorOriginalSpot.id];
            let freeSpot = null;

            while (true) {
              const candidate = await findNextTrulyFreeSpot(prefix, victimOldSpot.spotNumber, excludeIds);
              if (!candidate) break;

              // Re-read to guard against race condition
              const fresh = await prisma.parkingSpot.findUnique({ where: { id: candidate.id } });
              if (fresh?.status === 'FREE' && !fresh.currentUserId) {
                freeSpot = fresh;
                break;
              }
              // Spot grabbed between query and check — skip and try next
              excludeIds.push(candidate.id);
              logger.info(`⚠️ Spot ${candidate.spotNumber} was taken between find and lock, retrying…`);
            }

            if (freeSpot) {
              // ── Free spot found → move victim there, legitimise violator ──
              logger.info(`🔄 Free spot: victim ${userId}→${freeSpot.spotNumber}, violator ${violatorUserId} stays at ${victimOldSpot.spotNumber}`);

              // Spot status + booking updates in one transaction
              await prisma.$transaction(async (tx) => {
                await moveVictimTx(tx, freeSpot!.id);
                await moveViolatorTx(tx, violatorBooking, violatorRental, victimOldSpot.id);
                await tx.parkingSpot.update({ where: { id: freeSpot!.id }, data: { status: 'OCCUPIED', currentUserId: userId, currentUserPlate: victimPlate } });
                await tx.parkingSpot.update({ where: { id: victimOldSpot.id }, data: { status: 'OCCUPIED', currentUserId: violatorUserId, currentUserPlate: violatorPlate } });
                await tx.parkingSpot.update({ where: { id: violatorOriginalSpot.id }, data: { status: 'FREE', currentUserId: null, currentUserPlate: null } });
                await tx.complaint.update({ where: { id: complaint.id }, data: { status: 'REASSIGNED', newSpotId: freeSpot!.spotNumber, resolvedAt: new Date(), detectedPlate, violatorUserId } });
              });

              io.emit('spot-status-changed', { spotNumber: freeSpot.spotNumber, status: 'OCCUPIED', carPlate: victimPlate });
              io.emit('spot-status-changed', { spotNumber: victimOldSpot.spotNumber, status: 'OCCUPIED', carPlate: violatorPlate });
              io.emit('spot-status-changed', { spotNumber: violatorOriginalSpot.spotNumber, status: 'FREE', carPlate: null });
              io.emit('spot-reassigned', { userId, newSpotId: freeSpot.spotNumber });
              io.emit('spot-moved', { userId: violatorUserId, newSpotId: victimOldSpot.spotNumber, oldSpotId: violatorOriginalSpot.spotNumber });

              await fineViolator(violatorUserId, victimOldSpot.spotNumber);

              await sendPushToUser(userId, '🔄 Ваше место изменено',
                `Ваше место было занято. Новое место: ${freeSpot.spotNumber}. Паркуйтесь там.`,
                { type: 'spot-reassigned', newSpotId: freeSpot.spotNumber }).catch(() => {});
              await sendPushToUser(violatorUserId, '⚠️ Штраф 900₸ — нарушение парковки',
                `Вы заняли чужое место (${victimOldSpot.spotNumber}). Штраф 900₸ списан. Ваше место: ${victimOldSpot.spotNumber}.`,
                { type: 'spot-moved', newSpotId: victimOldSpot.spotNumber }).catch(() => {});

            } else {
              // ── CASE B: No free spots → SWAP directly (any booking type combo) ──
              logger.info(`🔀 No free spots — swap: victim ${userId}→${violatorOriginalSpot.spotNumber}, violator ${violatorUserId}→${victimOldSpot.spotNumber}`);

              // Spot status + both booking updates in one transaction
              await prisma.$transaction(async (tx) => {
                await moveVictimTx(tx, violatorOriginalSpot.id);
                await moveViolatorTx(tx, violatorBooking, violatorRental, victimOldSpot.id);
                await tx.parkingSpot.update({ where: { id: violatorOriginalSpot.id }, data: { status: 'OCCUPIED', currentUserId: userId, currentUserPlate: victimPlate } });
                await tx.parkingSpot.update({ where: { id: victimOldSpot.id }, data: { status: 'OCCUPIED', currentUserId: violatorUserId, currentUserPlate: violatorPlate } });
                await tx.complaint.update({ where: { id: complaint.id }, data: { status: 'REASSIGNED', newSpotId: violatorOriginalSpot.spotNumber, resolvedAt: new Date(), detectedPlate, violatorUserId } });
              });

              io.emit('spot-status-changed', { spotNumber: violatorOriginalSpot.spotNumber, status: 'OCCUPIED', carPlate: victimPlate });
              io.emit('spot-status-changed', { spotNumber: victimOldSpot.spotNumber, status: 'OCCUPIED', carPlate: violatorPlate });
              io.emit('spot-reassigned', { userId, newSpotId: violatorOriginalSpot.spotNumber });
              io.emit('spot-moved', { userId: violatorUserId, newSpotId: victimOldSpot.spotNumber, oldSpotId: violatorOriginalSpot.spotNumber });

              await fineViolator(violatorUserId, victimOldSpot.spotNumber);

              await sendPushToUser(userId, '🔄 Ваше место изменено',
                `Ваше новое место: ${violatorOriginalSpot.spotNumber}. Паркуйтесь там.`,
                { type: 'spot-reassigned', newSpotId: violatorOriginalSpot.spotNumber }).catch(() => {});
              await sendPushToUser(violatorUserId, '⚠️ Штраф 900₸ — нарушение парковки',
                `Вы заняли чужое место (${victimOldSpot.spotNumber}). Штраф 900₸ списан. Ваше место: ${victimOldSpot.spotNumber}.`,
                { type: 'spot-moved', newSpotId: victimOldSpot.spotNumber }).catch(() => {});
            }

            io.emit('bookings-updated');
            swapDone = true;
          }
        }

        // ── VIOLATOR UNKNOWN: find free spot with retry, then refund ──
        if (!swapDone) {
          const victimPlate = await getCarPlate(userId);
          const excludeIds: string[] = [victimOldSpot.id];
          let freeSpot = null;

          while (true) {
            const candidate = await findNextTrulyFreeSpot(prefix, victimOldSpot.spotNumber, excludeIds);
            if (!candidate) break;
            const fresh = await prisma.parkingSpot.findUnique({ where: { id: candidate.id } });
            if (fresh?.status === 'FREE' && !fresh.currentUserId) {
              freeSpot = fresh;
              break;
            }
            excludeIds.push(candidate.id);
          }

          if (freeSpot) {
            await prisma.$transaction(async (tx) => {
              await moveVictimTx(tx, freeSpot!.id);
              await tx.parkingSpot.update({ where: { id: freeSpot!.id }, data: { status: 'OCCUPIED', currentUserId: userId, currentUserPlate: victimPlate } });
              await tx.complaint.update({ where: { id: complaint.id }, data: { status: 'REASSIGNED', newSpotId: freeSpot!.spotNumber, resolvedAt: new Date(), detectedPlate, violatorUserId } });
            });
            io.emit('spot-reassigned', { userId, newSpotId: freeSpot.spotNumber });
            io.emit('spot-status-changed', { spotNumber: freeSpot.spotNumber, status: 'OCCUPIED', carPlate: victimPlate });
            await sendPushToUser(userId, '🔄 Вас перенаправили на новое место',
              `Ваше место было занято. Новое место: ${freeSpot.spotNumber}. Паркуйтесь там.`,
              { type: 'spot-reassigned', newSpotId: freeSpot.spotNumber }).catch(() => {});
            logger.info(`🔄 Victim ${userId} → free spot ${freeSpot.spotNumber} (violator unknown)`);
          } else {
            await prisma.complaint.update({ where: { id: complaint.id }, data: { detectedPlate, violatorUserId } });
            await refundVictim(!detectedPlate);
          }
        }

        // Cloudinary upload for admin
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

    if (bookingId) {
      const adjustedStart = new Date(Date.now() - (30 - 7) * 60 * 1000);
      await prisma.booking.update({
        where: { id: bookingId },
        data: { spotId: newSpot.id, startTime: adjustedStart },
      }).catch(() => {});
    }

    const booking = bookingId
      ? await prisma.booking.findUnique({ where: { id: bookingId } })
      : null;
    const plate = booking?.plateNumber ?? null;

    await prisma.$transaction([
      prisma.parkingSpot.update({
        where: { spotNumber: oldSpotId },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      }),
      prisma.parkingSpot.update({
        where: { spotNumber: newSpotId },
        data: { status: 'BOOKED', currentUserId: userId, currentUserPlate: plate },
      }),
    ]);

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber: oldSpotId, status: 'FREE', carPlate: null });
    io.emit('spot-status-changed', { spotNumber: newSpotId, status: 'BOOKED', carPlate: plate });

    setTimeout(async () => {
      try {
        const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber: newSpotId } });
        if (spot?.status === 'BOOKED') {
          await prisma.parkingSpot.update({
            where: { spotNumber: newSpotId },
            data: { status: 'OCCUPIED' },
          });
          io.emit('spot-status-changed', { spotNumber: newSpotId, status: 'OCCUPIED', carPlate: plate });
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
