import { Router, Request, Response } from 'express';
import longTermRentalService from '../services/longterm-rental.service';
import { verifyToken } from '../middleware/auth';
import { requireCarPlate } from '../middleware/balance.middleware';
import { validateLongTermRental } from '../middleware/validation.middleware';
import { getLongTermPrice } from '../utils/pricing';
import { rentalExpiryQueue, overstayQueue } from '../jobs/queues';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(verifyToken);

// POST / — create long-term rental (charges wallet immediately)
router.post('/', requireCarPlate, validateLongTermRental, async (req: Request, res: Response) => {
  try {
    const { spotId, rentalDays, plateNumber } = req.body;
    const userId = req.userId!;

    // Balance check is also done in service, but keep here for early rejection
    const totalCost = getLongTermPrice(rentalDays);
    if (req.user!.walletBalance < totalCost) {
      return res.status(402).json({
        error: 'Insufficient balance',
        required: totalCost,
        current: req.user!.walletBalance,
      });
    }

    // Service handles wallet deduction + spot assignment atomically
    const rental = await longTermRentalService.createLongTermRental(userId, spotId, rentalDays, plateNumber ?? '');

    await prisma.longTermRental.update({ where: { id: rental.id }, data: { isPaid: true } });

    // Schedule rental-expiry job (fires when rental period ends)
    const expiryDelay = rental.endDate.getTime() - Date.now();
    if (expiryDelay > 0) {
      await rentalExpiryQueue.add(
        'rental-expiry',
        { rentalId: rental.id },
        { delay: expiryDelay, jobId: `rental-expiry-${rental.id}` },
      ).catch(() => {});

      // Overstay warning fires at exact end date
      await overstayQueue.add(
        'overstay',
        { rentalId: rental.id, userId, spotId: rental.spotId, phase: 'warn' },
        { delay: expiryDelay, jobId: `overstay-warn-${rental.id}` },
      ).catch(() => {});
    }

    const { io } = await import('../server');
    io.emit('rental-created', rental);

    res.status(201).json({
      rental,
      totalCost,
      message: '✅ Long-term rental created successfully',
    });
  } catch (error: any) {
    logger.error('❌ Error creating rental:', error);
    const status = error.message?.includes('Insufficient') ? 402 : 500;
    res.status(status).json({ error: error.message ?? 'Failed to create rental' });
  }
});

// GET /active — user's active rentals
router.get('/active', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const rentals = await longTermRentalService.getUserActiveRentals(userId);
    res.json(rentals);
  } catch (error) {
    logger.error('❌ Error fetching active rentals:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

// GET /all — all active rentals (admin)
router.get('/all', async (req: Request, res: Response) => {
  try {
    const rentals = await longTermRentalService.getAllActiveRentals();
    res.json(rentals);
  } catch (error) {
    logger.error('❌ Error fetching all rentals:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

// POST /:id/cancel — cancel rental with 900₸ penalty + refund remainder
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const rental = await prisma.longTermRental.findUnique({ where: { id } });
    if (!rental) return res.status(404).json({ error: 'Rental not found' });
    if (rental.userId !== userId) return res.status(403).json({ error: 'Access denied' });

    // Service handles the 900₸ penalty + refund atomically
    const result = await longTermRentalService.cancelRental(id);

    // Cancel BullMQ jobs if they exist
    await rentalExpiryQueue.remove(`rental-expiry-${id}`).catch(() => {});
    await overstayQueue.remove(`overstay-warn-${id}`).catch(() => {});

    const { io } = await import('../server');
    io.emit('rental-cancelled', result);

    res.json({
      rental: result,
      refundAmount: result.refundAmount ?? 0,
      penaltyKept: Math.min(900, rental.totalCost),
      message: '✅ Rental cancelled',
    });
  } catch (error) {
    logger.error('❌ Error cancelling rental:', error);
    res.status(500).json({ error: 'Failed to cancel rental' });
  }
});

// POST /:id/extend — extend rental by additional days
router.post('/:id/extend', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { additionalDays } = req.body;
    const userId = req.userId!;

    if (!additionalDays || additionalDays < 1) {
      return res.status(400).json({ error: 'additionalDays must be >= 1' });
    }

    const rental = await prisma.longTermRental.findUnique({ where: { id }, include: { user: true } });
    if (!rental) return res.status(404).json({ error: 'Rental not found' });
    if (rental.userId !== userId) return res.status(403).json({ error: 'Access denied' });
    if (rental.status !== 'ACTIVE') return res.status(400).json({ error: 'Rental is not active' });

    const extendCost = getLongTermPrice(additionalDays);
    const user = rental.user;
    if (user.walletBalance < extendCost) {
      return res.status(402).json({ error: 'Insufficient balance', required: extendCost, current: user.walletBalance });
    }

    const newEndDate = new Date(rental.endDate.getTime() + additionalDays * 24 * 60 * 60 * 1000);
    const balBefore = user.walletBalance;

    const [updatedRental] = await prisma.$transaction([
      prisma.longTermRental.update({
        where: { id },
        data: {
          endDate: newEndDate,
          rentalDays: rental.rentalDays + additionalDays,
          totalCost: rental.totalCost + extendCost,
        },
      }),
      prisma.user.update({ where: { id: userId }, data: { walletBalance: { decrement: extendCost } } }),
      prisma.transaction.create({
        data: {
          userId,
          amount: -(extendCost),
          type: 'PAYMENT',
          description: `Продление аренды +${additionalDays} дней`,
          balanceBefore: balBefore,
          balanceAfter: balBefore - extendCost,
        },
      }),
    ]);

    // Reschedule BullMQ jobs with new endDate
    await rentalExpiryQueue.remove(`rental-expiry-${id}`).catch(() => {});
    await overstayQueue.remove(`overstay-warn-${id}`).catch(() => {});
    const newDelay = newEndDate.getTime() - Date.now();
    if (newDelay > 0) {
      await rentalExpiryQueue.add('rental-expiry', { rentalId: id }, { delay: newDelay, jobId: `rental-expiry-${id}` }).catch(() => {});
      await overstayQueue.add('overstay', { rentalId: id, userId, spotId: rental.spotId, phase: 'warn' }, { delay: newDelay, jobId: `overstay-warn-${id}` }).catch(() => {});
    }

    const { io } = await import('../server');
    io.emit('rental-extended', { rentalId: id, newEndDate, additionalDays, extendCost });

    res.json({ rental: updatedRental, extendCost, newEndDate, message: '✅ Rental extended' });
  } catch (error) {
    logger.error('❌ Error extending rental:', error);
    res.status(500).json({ error: 'Failed to extend rental' });
  }
});

// POST /check-expired — manual trigger (admin/cron)
router.post('/check-expired', async (req: Request, res: Response) => {
  try {
    const expiredCount = await longTermRentalService.checkExpiredRentals();
    res.json({ expiredCount, message: `✅ Completed ${expiredCount} expired rentals` });
  } catch (error) {
    logger.error('❌ Error checking expired rentals:', error);
    res.status(500).json({ error: 'Failed to check expired rentals' });
  }
});

// POST /terminate-by-spot — force-terminate rental at a spot (admin/barrier)
router.post('/terminate-by-spot', async (req: Request, res: Response) => {
  try {
    const { spotNumber } = req.body;

    if (!spotNumber) return res.status(400).json({ error: 'spotNumber is required' });

    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });

    const activeRentals = await prisma.longTermRental.findMany({ where: { spotId: spot.id, status: 'ACTIVE' } });
    if (activeRentals.length === 0) return res.status(404).json({ error: 'Active rental not found' });

    const rental = activeRentals[0];
    const penaltyAmount = 900;
    const refundAmount = rental.arrivedAt === null
      ? Math.max(0, rental.totalCost - penaltyAmount)
      : 0;
    const owner = await prisma.user.findUnique({ where: { id: rental.userId } });

    await prisma.$transaction([
      prisma.longTermRental.updateMany({ where: { spotId: spot.id, status: 'ACTIVE' }, data: { status: 'CANCELLED', endDate: new Date() } }),
      prisma.booking.updateMany({ where: { spotId: spot.id, status: { in: ['PENDING', 'CONFIRMED'] } }, data: { status: 'CANCELLED' } }),
      prisma.parkingSpot.update({ where: { spotNumber }, data: { status: 'FREE', currentUserPlate: null, currentUserId: null } }),
      ...(refundAmount > 0 && owner ? [
        prisma.user.update({ where: { id: rental.userId }, data: { walletBalance: { increment: refundAmount } } }),
        prisma.transaction.create({
          data: {
            userId: rental.userId,
            amount: refundAmount,
            type: 'REFUND',
            description: `Возврат при принудительном завершении аренды (штраф ${penaltyAmount}₸ удержан)`,
            balanceBefore: owner.walletBalance,
            balanceAfter: owner.walletBalance + refundAmount,
          },
        }),
      ] : []),
    ]);

    await rentalExpiryQueue.remove(`rental-expiry-${rental.id}`).catch(() => {});
    await overstayQueue.remove(`overstay-warn-${rental.id}`).catch(() => {});

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
    io.emit('rental-terminated', { rentalId: rental.id, spotNumber });

    res.json({ success: true, refundAmount, penaltyKept: rental.arrivedAt === null ? Math.min(penaltyAmount, rental.totalCost) : 0, message: 'Rental terminated' });
  } catch (error) {
    logger.error('❌ Error terminating rental by spot:', error);
    res.status(500).json({ error: 'Failed to terminate rental' });
  }
});

export default router;
