import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /test/db
 * Тест подключения к базе данных
 */
router.get('/db', async (req: Request, res: Response) => {
  try {
    // Проверить подключение через простую операцию
    await prisma.user.findMany({ take: 1 });
    
    // Получить количество пользователей
    const userCount = await prisma.user.count();
    
    // Получить количество парковочных мест
    const parkingPointCount = await prisma.parkingSpot.count();
    
    res.json({
      status: 'connected',
      database: 'QPark',
      stats: {
        users: userCount,
        parkingPoints: parkingPointCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Database connection failed',
    });
  }
});

/**
 * GET /test/users
 * Получить первых 5 пользователей
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      take: 5,
      include: {
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch users',
    });
  }
});

export default router;
