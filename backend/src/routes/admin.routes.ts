import { Router, Request, Response } from 'express';
import authService from '../services/auth.service';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

const router = Router();

/**
 * GET /admin/dashboard
 * Полные данные для дашборда — spots + users + bookings + stats
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const [spots, users, bookings, rentals, lprEvents] = await Promise.all([
      prisma.parkingSpot.findMany({ orderBy: { spotNumber: 'asc' } }),
      prisma.user.findMany({
        include: { cars: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.booking.findMany({
        include: { user: true, spot: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.longTermRental.findMany({
        include: { user: true, spot: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.lPREvent.findMany({
        orderBy: { timestamp: 'desc' },
        take: 20,
      }),
    ]);

    const statusCount = (status: string) => spots.filter(s => s.status === status).length;

    res.json({
      spots: spots.map(s => ({
        id: s.spotNumber,
        spotNumber: s.spotNumber,
        type: s.type,
        status: s.status,
        currentUserPlate: s.currentUserPlate,
      })),
      stats: {
        total: spots.length,
        free: statusCount('FREE'),
        booked: statusCount('BOOKED'),
        occupied: statusCount('OCCUPIED'),
        reserved: statusCount('RESERVED'),
        repair: statusCount('REPAIR'),
        totalUsers: users.length,
        activeBookings: bookings.filter(b => b.status === 'CONFIRMED').length,
        activeRentals: rentals.filter(r => r.status === 'ACTIVE').length,
      },
      users: users.map(u => ({
        id: u.id,
        phoneNumber: u.phoneNumber,
        firstName: u.firstName,
        lastName: u.lastName,
        walletBalance: u.walletBalance,
        bonusPoints: u.bonusPoints,
        noShowCount: u.noShowCount,
        isBanned: u.isBanned,
        cars: u.cars,
        createdAt: u.createdAt,
      })),
      bookings: bookings.map(b => ({
        id: b.id,
        spotNumber: b.spot.spotNumber,
        plateNumber: b.plateNumber,
        userName: `${b.user.firstName ?? ''} ${b.user.lastName ?? ''}`.trim() || b.user.phoneNumber,
        status: b.status,
        startTime: b.startTime,
        totalCost: b.totalCost,
      })),
      rentals: rentals.map(r => ({
        id: r.id,
        spotNumber: r.spot.spotNumber,
        plateNumber: r.plateNumber,
        userName: `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() || r.user.phoneNumber,
        rentalDays: r.rentalDays,
        totalCost: r.totalCost,
        status: r.status,
        startDate: r.startDate,
        endDate: r.endDate,
      })),
      lprEvents,
    });
  } catch (error) {
    logger.error('❌ Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

/**
 * GET /admin/users
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: { cars: true, bookings: { take: 5, orderBy: { createdAt: 'desc' } } },
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
 */
router.post('/users/:id/unban', async (req: Request, res: Response) => {
  try {
    const user = await authService.unbanUser(req.params.id);
    res.json({ user, message: '✅ User unbanned' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

/**
 * GET /admin/spots
 */
router.get('/spots', async (req: Request, res: Response) => {
  try {
    const spots = await prisma.parkingSpot.findMany({ orderBy: { spotNumber: 'asc' } });
    res.json(spots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});

/**
 * PATCH /admin/spots/:spotNumber/status
 * Изменить статус места (из дашборда)
 */
router.patch('/spots/:spotNumber/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const spot = await prisma.parkingSpot.update({
      where: { spotNumber: req.params.spotNumber },
      data: { status, currentUserPlate: status === 'FREE' ? null : undefined },
    });
    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber: spot.spotNumber, status: spot.status, carPlate: spot.currentUserPlate });
    res.json(spot);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update spot' });
  }
});

/**
 * GET /admin/bookings
 */
router.get('/bookings', async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: { user: { include: { cars: true } }, spot: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

/**
 * GET /admin/rentals
 */
router.get('/rentals', async (req: Request, res: Response) => {
  try {
    const rentals = await prisma.longTermRental.findMany({
      include: { user: { include: { cars: true } }, spot: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rentals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

/**
 * GET /admin/lpr-events
 */
router.get('/lpr-events', async (req: Request, res: Response) => {
  try {
    const events = await prisma.lPREvent.findMany({ orderBy: { timestamp: 'desc' }, take: 100 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch LPR events' });
  }
});

export default router;
