import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { uploadPhotoToCloudinary } from '../utils/cloudinary';
import { findFreeSpotNearby } from '../utils/spots';

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

    // Background: OCR + free spot search run IN PARALLEL so we can auto-swap when all full
    setImmediate(async () => {
      try {
        // 1) Run free spot search AND OCR at the same time
        const [freeSpot, ocrPlate] = await Promise.all([
          findFreeSpotNearby(spotId),
          photoUrl ? detectPlateFromPhoto(photoUrl) : Promise.resolve(null),
        ]);

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
        const moveVictim = async (newSpotDbId: string) => {
          if (bookingId) {
            await prisma.booking.update({ where: { id: bookingId }, data: { spotId: newSpotDbId } });
          } else if (victimOldSpot) {
            await prisma.longTermRental.updateMany({
              where: { userId, spotId: victimOldSpot.id, status: 'ACTIVE' },
              data: { spotId: newSpotDbId },
            });
          }
        };

        // Helper: refund victim
        const refundVictim = async () => {
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
          await prisma.complaint.update({ where: { id: complaint.id }, data: { status: 'REFUNDED', resolvedAt: new Date() } });
          io.emit('no-spots-available', { userId, refundAmount });
          logger.info(`😔 No free spots for victim ${userId}, refunded ${refundAmount}₸`);
        };

        if (freeSpot) {
          // ── Case 2: Free spot found → move victim there ──
          await moveVictim(freeSpot.id);
          await prisma.parkingSpot.update({ where: { id: freeSpot.id }, data: { status: 'BOOKED', currentUserId: userId } });

          // If violator identified: move their booking to victim's old spot, free their original spot
          if (violatorUserId && victimOldSpot) {
            const violatorBooking = await prisma.booking.findFirst({
              where: { userId: violatorUserId, status: { in: ['PENDING', 'CONFIRMED'] } },
            });
            if (violatorBooking) {
              const violatorOriginalSpot = await prisma.parkingSpot.findUnique({ where: { id: violatorBooking.spotId } });
              await prisma.booking.update({ where: { id: violatorBooking.id }, data: { spotId: victimOldSpot.id } });
              await prisma.parkingSpot.update({ where: { id: victimOldSpot.id }, data: { currentUserId: violatorUserId } });
              io.emit('spot-status-changed', { spotNumber: victimOldSpot.spotNumber, status: 'OCCUPIED' });
              if (violatorOriginalSpot) {
                await prisma.parkingSpot.update({ where: { id: violatorOriginalSpot.id }, data: { status: 'FREE', currentUserId: null, currentUserPlate: null } });
                io.emit('spot-status-changed', { spotNumber: violatorOriginalSpot.spotNumber, status: 'FREE' });
              }
              // Notify violator silently (no timer reset — they're already inside)
              io.emit('spot-moved', { userId: violatorUserId, newSpotId: victimOldSpot.spotNumber, oldSpotId: violatorOriginalSpot?.spotNumber });
            }
          }

          await prisma.complaint.update({ where: { id: complaint.id }, data: { status: 'REASSIGNED', newSpotId: freeSpot.spotNumber, resolvedAt: new Date(), detectedPlate, violatorUserId } });
          io.emit('spot-reassigned', { userId, newSpotId: freeSpot.spotNumber });
          io.emit('spot-status-changed', { spotNumber: freeSpot.spotNumber, status: 'BOOKED' });
          logger.info(`🔄 Victim ${userId} → ${freeSpot.spotNumber}`);

        } else if (violatorUserId && victimOldSpot) {
          // ── Case 3: All spots full + violator identified → AUTO-SWAP ──
          const violatorBooking = await prisma.booking.findFirst({
            where: { userId: violatorUserId, status: { in: ['PENDING', 'CONFIRMED'] } },
          });
          const violatorOriginalSpot = violatorBooking
            ? await prisma.parkingSpot.findUnique({ where: { id: violatorBooking.spotId } })
            : null;

          if (violatorBooking && violatorOriginalSpot) {
            // Move victim → violator's original spot (physically empty)
            await moveVictim(violatorOriginalSpot.id);
            await prisma.parkingSpot.update({ where: { id: violatorOriginalSpot.id }, data: { status: 'BOOKED', currentUserId: userId } });
            io.emit('spot-status-changed', { spotNumber: violatorOriginalSpot.spotNumber, status: 'BOOKED' });

            // Move violator's booking → victim's spot (where they physically are)
            await prisma.booking.update({ where: { id: violatorBooking.id }, data: { spotId: victimOldSpot.id } });
            await prisma.parkingSpot.update({ where: { id: victimOldSpot.id }, data: { currentUserId: violatorUserId } });
            io.emit('spot-status-changed', { spotNumber: victimOldSpot.spotNumber, status: 'OCCUPIED' });

            await prisma.complaint.update({
              where: { id: complaint.id },
              data: { status: 'REASSIGNED', newSpotId: violatorOriginalSpot.spotNumber, resolvedAt: new Date(), detectedPlate, violatorUserId },
            });

            // Victim: gets 7-min timer to go park at new spot
            io.emit('spot-reassigned', { userId, newSpotId: violatorOriginalSpot.spotNumber });
            // Violator: silent update — just change spot label, timer keeps running
            io.emit('spot-moved', { userId: violatorUserId, newSpotId: victimOldSpot.spotNumber, oldSpotId: violatorOriginalSpot.spotNumber });

            logger.info(`🔀 Auto-swap: victim ${userId}→${violatorOriginalSpot.spotNumber}, violator ${violatorUserId}→${victimOldSpot.spotNumber}`);
          } else {
            // Violator identified but has no active booking — refund victim
            await prisma.complaint.update({ where: { id: complaint.id }, data: { detectedPlate, violatorUserId } });
            await refundVictim();
          }
        } else {
          // ── Case 4: No free spot, no violator → refund victim ──
          await prisma.complaint.update({ where: { id: complaint.id }, data: { detectedPlate, violatorUserId } });
          await refundVictim();
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
