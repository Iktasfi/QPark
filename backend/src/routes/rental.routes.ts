import { Router, Request, Response } from 'express';
import longTermRentalService from '../services/longterm-rental.service';
import paymentService from '../services/payment.service';
import { verifyToken } from '../middleware/auth';
import { checkBalance, requireCarPlate } from '../middleware/balance.middleware';
import { validateLongTermRental } from '../middleware/validation.middleware';
import { getLongTermPrice } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
const router = Router();


router.use(verifyToken);


router.post('/', requireCarPlate, validateLongTermRental, async (req: Request, res: Response) => {
  try {
    const { spotId, rentalDays } = req.body;
    const userId = req.userId!;

    const totalCost = getLongTermPrice(rentalDays);


    if (req.user!.walletBalance < totalCost) {
      return res.status(402).json({
        error: 'Insufficient balance',
        required: totalCost,
        current: req.user!.walletBalance,
      });
    }

    const rental = await longTermRentalService.createLongTermRental(userId, spotId, rentalDays);


    await paymentService.debitWallet(
      userId,
      totalCost,
      `Долгосрочная аренда: ${rentalDays} дней`
    );


    await prisma.longTermRental.update({
      where: { id: rental.id },
      data: { isPaid: true },
    });


    const { io } = await import('../server');
    io.emit('rental-created', rental);

    res.status(201).json({
      rental,
      totalCost,
      message: '✅ Long-term rental created successfully',
    });
  } catch (error) {
    logger.error('❌ Error creating rental:', error);
    res.status(500).json({ error: 'Failed to create rental' });
  }
});


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


router.get('/all', async (req: Request, res: Response) => {
  try {
    const rentals = await longTermRentalService.getAllActiveRentals();
    res.json(rentals);
  } catch (error) {
    logger.error('❌ Error fetching all rentals:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});


router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;


    const rental = await (await import('@prisma/client')).PrismaClient.prototype.longTermRental.findUnique({
      where: { id },
    });

    if (!rental) {
      return res.status(404).json({ error: 'Rental not found' });
    }

    if (rental.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cancelledRental = await longTermRentalService.cancelRental(id);


    const { io } = await import('../server');
    io.emit('rental-cancelled', cancelledRental);

    res.json({
      rental: cancelledRental,
      message: '✅ Rental cancelled',
    });
  } catch (error) {
    logger.error('❌ Error cancelling rental:', error);
    res.status(500).json({ error: 'Failed to cancel rental' });
  }
});


router.post('/check-expired', async (req: Request, res: Response) => {
  try {
    const expiredCount = await longTermRentalService.checkExpiredRentals();

    res.json({
      expiredCount,
      message: `✅ Completed ${expiredCount} expired rentals`,
    });
  } catch (error) {
    logger.error('❌ Error checking expired rentals:', error);
    res.status(500).json({ error: 'Failed to check expired rentals' });
  }
});


router.post('/terminate-by-spot', async (req: Request, res: Response) => {
  try {
    const { spotNumber } = req.body;
    const userId = req.userId!;

    if (!spotNumber) {
      return res.status(400).json({ error: 'spotNumber is required' });
    }


    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });

    const rental = await prisma.longTermRental.findFirst({
      where: { spotId: spot.id, userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!rental) return res.status(404).json({ error: 'Active rental not found' });

    await prisma.$transaction([
      prisma.longTermRental.update({
        where: { id: rental.id },
        data: { status: 'CANCELLED', endDate: new Date() },
      }),
      prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      }),
    ]);

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
    io.emit('rental-terminated', { rentalId: rental.id, spotNumber });

    res.json({ success: true, message: 'Rental terminated' });
  } catch (error) {
    logger.error('❌ Error terminating rental by spot:', error);
    res.status(500).json({ error: 'Failed to terminate rental' });
  }
});

export default router;
