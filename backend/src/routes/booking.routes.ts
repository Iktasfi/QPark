import { Router, Request, Response } from 'express';
import bookingService from '../services/booking.service';
import paymentService from '../services/payment.service';
import { verifyToken } from '../middleware/auth';
import { checkBalance, requireCarPlate } from '../middleware/balance.middleware';
import { validateBooking } from '../middleware/validation.middleware';
import { getExtendBookingCost } from '../utils/pricing';
import { logger } from '../server';

const router = Router();

// Все маршруты требуют авторизации
router.use(verifyToken);

/**
 * POST /bookings
 * Создать краткосрочное бронирование
 */
router.post('/', requireCarPlate, validateBooking, async (req: Request, res: Response) => {
  try {
    const { spotId } = req.body;
    const userId = req.userId!;

    const booking = await bookingService.createShortTermBooking(userId, spotId);
    
    // Отправить уведомление через Socket.io
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

/**
 * GET /bookings/active
 * Получить активные бронирования пользователя
 */
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

/**
 * POST /bookings/:id/complete
 * Завершить бронирование
 */
router.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { carPlate } = req.body;
    const userId = req.userId!;

    // Получить бронирование для проверки
    const booking = await (await import('@prisma/client')).PrismaClient.prototype.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const completedBooking = await bookingService.completeBooking(id, carPlate);
    
    // Отправить уведомление через Socket.io
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

/**
 * POST /bookings/:id/cancel
 * Отменить бронирование
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.userId!;

    // Проверить, принадлежит ли бронирование пользователю
    const booking = await (await import('@prisma/client')).PrismaClient.prototype.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cancelledBooking = await bookingService.cancelBooking(id, reason);
    
    // Отправить уведомление через Socket.io
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

/**
 * POST /bookings/:id/pay
 * Оплатить бронирование
 */
router.post('/:id/pay', checkBalance(0), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Получить бронирование для проверки стоимости
    const booking = await (await import('@prisma/client')).PrismaClient.prototype.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Проверить баланс
    if (req.user!.walletBalance < booking.totalCost) {
      return res.status(402).json({
        error: 'Insufficient balance',
        required: booking.totalCost,
        current: req.user!.walletBalance,
      });
    }

    const paymentResult = await paymentService.processBookingPayment(id);
    
    // Отправить уведомление через Socket.io
    const { io } = await import('../server');
    io.emit('payment-completed', paymentResult);
    
    res.json({
      payment: paymentResult.payment,
      walletBalance: paymentResult.walletBalance,
      message: '✅ Payment completed',
    });
  } catch (error) {
    logger.error('❌ Error processing payment:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

/**
 * POST /bookings/:id/extend
 * Продлить бронирование
 */
router.post('/:id/extend', checkBalance(getExtendBookingCost()), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Проверить, принадлежит ли бронирование пользователю
    const booking = await (await import('@prisma/client')).PrismaClient.prototype.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Продлить бронирование
    const extendCost = getExtendBookingCost();
    const { walletBalance } = await paymentService.debitWallet(
      userId,
      extendCost,
      `Продление бронирования: ${id}`
    );

    // Обновить время окончания
    const updatedBooking = await (await import('@prisma/client')).PrismaClient.prototype.booking.update({
      where: { id },
      data: {
        estimatedEndTime: new Date(
          new Date(booking.estimatedEndTime).getTime() + 30 * 60 * 1000 // 30 минут
        ),
        minutesExtended: { increment: 30 },
      },
    });

    // Отправить уведомление через Socket.io
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

export default router;
