import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { uploadPhotoToCloudinary } from '../utils/cloudinary';

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
    const { bookingId, spotId, reason, photoUrl } = req.body;
    const userId = req.userId!;

    if (!spotId || !reason) {
      return res.status(400).json({ error: 'spotId and reason are required' });
    }

    // Создаём жалобу сразу — без ожидания Cloudinary и OCR
    // Cloudinary может висеть до 30+ сек и роняет Vercel proxy timeout
    const complaint = await prisma.complaint.create({
      data: {
        userId,
        bookingId: bookingId ?? null,
        spotId,
        reason,
        photoUrl: photoUrl ?? null,   // пока base64; фоновый таск заменит на CDN URL
        detectedPlate: null,
        violatorUserId: null,
      },
      include: { user: { select: { firstName: true, phoneNumber: true } } },
    });

    const { io } = await import('../server');
    io.emit('new-complaint', { complaintId: complaint.id, spotId, userId });

    // Отвечаем клиенту НЕМЕДЛЕННО
    res.status(201).json({ success: true, complaint, detectedPlate: null, violatorFound: false });

    // Фоновые задачи: Cloudinary upload + OCR (не блокируют ответ)
    setImmediate(async () => {
      try {
        let storedUrl = photoUrl as string | null;

        if (photoUrl && process.env.CLOUDINARY_CLOUD_NAME) {
          try {
            storedUrl = await uploadPhotoToCloudinary(photoUrl, 'qpark/complaints');
          } catch {
            logger.warn('⚠️ Cloudinary upload failed for complaint', complaint.id);
          }
        }

        let detectedPlate: string | null = null;
        let violatorUserId: string | null = null;

        if (storedUrl) {
          detectedPlate = await detectPlateFromPhoto(storedUrl);
          if (detectedPlate) {
            const violatorCar = await prisma.car.findFirst({
              where: { plateNumber: { contains: detectedPlate.replace(/\s+/g, ''), mode: 'insensitive' } },
              include: { user: true },
            });
            if (violatorCar) {
              violatorUserId = violatorCar.userId;
              logger.info(`🎯 Violator identified: ${violatorCar.user.firstName ?? violatorCar.user.phoneNumber} (plate: ${detectedPlate})`);
            }
          }
        }

        await prisma.complaint.update({
          where: { id: complaint.id },
          data: {
            photoUrl: storedUrl,
            detectedPlate,
            violatorUserId,
          },
        });

        logger.info(`📢 Complaint enriched: ${complaint.id} | plate=${detectedPlate ?? 'none'}`);
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
      await prisma.booking.update({ where: { id: bookingId }, data: { spotId: newSpot.id } }).catch(() => {});
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

    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error accepting reassignment:', error);
    res.status(500).json({ error: 'Failed to accept reassignment' });
  }
});

export default router;
