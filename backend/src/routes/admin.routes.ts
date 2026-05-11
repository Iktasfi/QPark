import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import authService from '../services/auth.service';
import promoCodeService from '../services/promocode.service';
import parkingService from '../services/parking.service';
import { logger } from '../server';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /admin/users
 * Получить всех пользователей
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        bookings: { take: 5, orderBy: { createdAt: 'desc' } },
        transactions: { take: 5, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    logger.error('❌ Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * POST /admin/users/:id/unban
 * Разбанить пользователя
 */
router.post('/users/:id/unban', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await authService.unbanUser(id);
    res.json({ user, message: '✅ User unbanned' });
  } catch (error) {
    logger.error('❌ Error unbanning user:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

/**
 * GET /admin/stats
 * Получить статистику
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await parkingService.getParkingStats();
    const totalUsers = await prisma.user.count();
    const totalRevenue = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: 'PAYMENT' },
    });
    res.json({
      parking: stats,
      users: totalUsers,
      revenue: totalRevenue._sum.amount || 0,
    });
  } catch (error) {
    logger.error('❌ Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * POST /admin/promo
 * Создать промокод
 */
router.post('/promo', async (req: Request, res: Response) => {
  try {
    const promo = await promoCodeService.createPromoCode(req.body);
    res.status(201).json({ promo, message: '✅ Promo code created' });
  } catch (error) {
    logger.error('❌ Error creating promo:', error);
    res.status(500).json({ error: 'Failed to create promo' });
  }
});

export default router;
