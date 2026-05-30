import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { uploadPhotoToCloudinary } from '../utils/cloudinary';

const router = Router();

router.use(verifyToken);

// POST /complaints — submit a complaint
router.post('/', async (req: Request, res: Response) => {
  try {
    const { bookingId, spotId, reason, photoUrl } = req.body;
    const userId = req.userId!;

    if (!spotId || !reason) {
      return res.status(400).json({ error: 'spotId and reason are required' });
    }

    let storedPhotoUrl = photoUrl;
    if (photoUrl && process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        storedPhotoUrl = await uploadPhotoToCloudinary(photoUrl, 'qpark/complaints');
      } catch {
        logger.warn('⚠️ Cloudinary unavailable for complaint photo');
      }
    }

    const complaint = await prisma.complaint.create({
      data: { userId, bookingId: bookingId ?? null, spotId, reason, photoUrl: storedPhotoUrl ?? null },
      include: { user: { select: { firstName: true, phoneNumber: true } } },
    });

    const { io } = await import('../server');
    io.emit('new-complaint', { complaintId: complaint.id, spotId, userId });

    logger.info(`📢 Complaint created: ${complaint.id} for spot ${spotId} by ${userId}`);
    res.status(201).json({ success: true, complaint });
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

    // Update the booking to point to the new spot
    const newSpot = await prisma.parkingSpot.findUnique({ where: { spotNumber: newSpotId } });
    if (!newSpot) return res.status(404).json({ error: 'New spot not found' });

    if (bookingId) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { spotId: newSpot.id },
      }).catch(() => {});
    }

    // Free the old spot
    await prisma.parkingSpot.update({
      where: { spotNumber: oldSpotId },
      data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
    }).catch(() => {});

    // Mark new spot as booked
    const user = await prisma.user.findUnique({ where: { id: userId } });
    await prisma.parkingSpot.update({
      where: { spotNumber: newSpotId },
      data: { status: 'BOOKED', currentUserId: userId, currentUserPlate: user?.carPlate ?? null },
    }).catch(() => {});

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber: oldSpotId, status: 'FREE', carPlate: null });
    io.emit('spot-status-changed', { spotNumber: newSpotId, status: 'BOOKED', carPlate: user?.carPlate ?? null });

    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error accepting reassignment:', error);
    res.status(500).json({ error: 'Failed to accept reassignment' });
  }
});

export default router;
