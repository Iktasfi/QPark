import { Router, Request, Response } from 'express';
import bookingService from '../services/booking.service';
import paymentService from '../services/payment.service';
import { verifyToken } from '../middleware/auth';
import { checkBalance, requireCarPlate } from '../middleware/balance.middleware';
import { validateBooking } from '../middleware/validation.middleware';
import { getExtendBookingCost } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

const router = Router();


router.use(verifyToken);


router.post('/', requireCarPlate, validateBooking, async (req: Request, res: Response) => {
  try {
    const { spotId } = req.body;
    const userId = req.userId!;

    const booking = await bookingService.createShortTermBooking(userId, spotId);


    const { io } = await import('../server');
    io.emit('booking-created', booking);

    res.status(201).json({
      booking,
      message: '✅ Booking created successfully',
    });
  } catch (error) {
    logger.error('❌ Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});


router.get('/active', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const bookings = await bookingService.getUserActiveBookings(userId);
    res.json(bookings);
  } catch (error) {
    logger.error('❌ Error fetching active bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});


router.get('/restore', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;


    const booking = await prisma.booking.findFirst({
      where: { userId, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
      include: { spot: true },
    });

    if (booking) {
      return res.json({
        id: booking.id,
        spotId: booking.spot?.spotNumber ?? booking.spotId,
        userId: booking.userId,
        plateNumber: booking.plateNumber,
        type: 'short-term',
        status: 'active',
        startTime: booking.startTime,
        isPaid: booking.isPaid,
        waitingFee: 0,
      });
    }


    const rental = await prisma.longTermRental.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { spot: true },
    });

    if (rental) {
      return res.json({
        id: rental.id,
        spotId: rental.spot?.spotNumber ?? rental.spotId,
        userId: rental.userId,
        plateNumber: rental.plateNumber,
        type: 'long-term',
        status: 'active',
        startTime: rental.startDate,
        isPaid: rental.isPaid,
        waitingFee: 0,
        rentalDays: rental.rentalDays,
      });
    }

    res.json(null);
  } catch (error) {
    logger.error('❌ Error restoring booking:', error);
    res.status(500).json({ error: 'Failed to restore booking' });
  }
});


router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { carPlate } = req.body;
    const userId = req.userId!;


    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const completedBooking = await bookingService.completeBooking(id, carPlate);


    const { io } = await import('../server');
    io.emit('booking-completed', completedBooking);

    res.json({
      booking: completedBooking,
      message: '✅ Booking completed',
    });
  } catch (error) {
    logger.error('❌ Error completing booking:', error);
    res.status(500).json({ error: 'Failed to complete booking' });
  }
});


router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.userId!;


    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cancelledBooking = await bookingService.cancelBooking(id, reason);


    const { io } = await import('../server');
    io.emit('booking-cancelled', cancelledBooking);

    res.json({
      booking: cancelledBooking,
      message: '✅ Booking cancelled',
    });
  } catch (error) {
    logger.error('❌ Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});


router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const { spotNumber } = req.body;
    const userId = req.userId!;

    if (!spotNumber) {
      return res.status(400).json({ error: 'spotNumber is required' });
    }

    const result = await paymentService.checkoutBooking(spotNumber, userId);

    const { io } = await import('../server');
    io.emit('booking-completed', { spotNumber });


    res.json({ ...result, message: '✅ Payment complete' });
  } catch (error) {
    logger.error('❌ Error during checkout:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Checkout failed' });
  }
});


router.post('/extend-waiting', async (req: Request, res: Response) => {
  try {
    const { spotNumber } = req.body;
    const userId = req.userId!;

    if (!spotNumber) {
      return res.status(400).json({ error: 'spotNumber is required' });
    }

    const result = await paymentService.extendWaiting(spotNumber, userId);
    res.json({ ...result, message: '✅ Waiting extended by 30 min' });
  } catch (error) {
    logger.error('❌ Error extending waiting:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to extend waiting' });
  }
});


router.post('/:id/extend', checkBalance(getExtendBookingCost()), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;


    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }


    const extendCost = getExtendBookingCost();
    const { walletBalance } = await paymentService.debitWallet(
      userId,
      extendCost,
      `Продление бронирования: ${id}`
    );


    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        estimatedEndTime: new Date(
          new Date(booking.estimatedEndTime).getTime() + 30 * 60 * 1000
        ),
        minutesExtended: { increment: 30 },
      },
    });


    const { io } = await import('../server');
    io.emit('booking-extended', updatedBooking);

    res.json({
      booking: updatedBooking,
      walletBalance,
      extendCost,
      message: '✅ Booking extended by 30 minutes',
    });
  } catch (error) {
    logger.error('❌ Error extending booking:', error);
    res.status(500).json({ error: 'Failed to extend booking' });
  }
});


router.post('/cancel-by-spot', async (req: Request, res: Response) => {
  try {
    const { spotNumber } = req.body;
    const userId = req.userId!;

    if (!spotNumber) {
      return res.status(400).json({ error: 'spotNumber is required' });
    }

    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });


    const booking = await prisma.booking.findFirst({
      where: { spotId: spot.id, userId, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });

    await prisma.$transaction([
      ...(booking ? [prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } })] : []),
      prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      }),
    ]);

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
    if (booking) io.emit('booking-cancelled', { bookingId: booking.id, spotNumber });

    res.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    logger.error('❌ Error cancelling booking by spot:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});


router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const bookings = await prisma.booking.findMany({
      where: { userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { spot: true },
    });

    res.json(bookings.map(b => ({
      id: b.id,
      spotId: b.spot?.spotNumber ?? b.spotId,
      plateNumber: b.plateNumber,
      status: b.status,
      startTime: b.startTime,
      endTime: b.actualEndTime ?? b.estimatedEndTime,
      totalCost: b.totalCost,
      type: b.spot?.type === 'LONG_TERM' ? 'long-term' : 'short-term',
    })));
  } catch (error) {
    logger.error('❌ Error fetching booking history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;
