import { Router, Request, Response } from 'express';
import longTermRentalService from '../services/longterm-rental.service';
import paymentService from '../services/payment.service';
import { verifyToken } from '../middleware/auth';
import { checkBalance, requireCarPlate } from '../middleware/balance.middleware';
import { validateLongTermRental } from '../middleware/validation.middleware';
import { getLongTermPrice } from '../utils/pricing';
import { logger } from '../server';

const router = Router();

// Все маршруты требуют авторизации
router.use(verifyToken);

/**
 * POST /rentals
 * Создать долгосрочную аренду
 */
router.post('/', requireCarPlate, validateLongTermRental, async (req: Request, res: Response) => {
  try {
    const { spotId, rentalDays } = req.body;
    const userId = req.userId!;
    
    const totalCost = getLongTermPrice(rentalDays);
    
    // Проверить баланс
    if (req.user!.walletBalance < totalCost) {
      return res.status(402).json({
        error: 'Insufficient balance',
        required: totalCost,
        current: req.user!.walletBalance,
      });
    }

    const rental = await longTermRentalService.createLongTermRental(userId, spotId, rentalDays);
    
    // Сразу списать оплату
    await paymentService.debitWallet(
      userId,
      totalCost,
      `Долгосрочная аренда: ${rentalDays} дней`
    );

    // Обновить статус оплаты в аренде
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.longTermRental.update({
      where: { id: rental.id },
      data: { isPaid: true },
    });

    // Отправить уведомление через Socket.io
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

/**
 * GET /rentals/active
 * Получить активные аренды пользователя
 */
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

/**
 * GET /rentals/all
 * Получить все активные аренды (админ)
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const rentals = await longTermRentalService.getAllActiveRentals();
    res.json(rentals);
  } catch (error) {
    logger.error('❌ Error fetching all rentals:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

/**
 * POST /rentals/:id/cancel
 * Отменить аренду
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    // Проверить, принадлежит ли аренда пользователю
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
    
    // Отправить уведомление через Socket.io
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

/**
 * POST /rentals/check-expired
 * Проверить истекшие аренды (админ/системный)
 */
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

export default router;
