import { Router, Request, Response } from 'express';
import authService from '../services/auth.service';
import promoCodeService from '../services/promocode.service';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

const router = Router();

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


// Find user by car plate + their booking history
router.get('/users/find-by-plate', async (req: Request, res: Response) => {
  try {
    const { plate } = req.query as { plate: string };
    if (!plate) return res.status(400).json({ error: 'plate is required' });

    const norm = plate.replace(/\s/g, '').toUpperCase();
    const car = await prisma.car.findFirst({
      where: { plateNumber: { contains: norm, mode: 'insensitive' } },
      include: {
        user: {
          include: {
            bookings: { orderBy: { createdAt: 'desc' }, take: 10, include: { spot: true } },
            longTermRentals: { orderBy: { createdAt: 'desc' }, take: 5, include: { spot: true } },
            fines: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        },
      },
    });

    if (!car) return res.json(null);

    const u = car.user;
    res.json({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      phoneNumber: u.phoneNumber,
      walletBalance: u.walletBalance,
      car: { plateNumber: car.plateNumber, brand: car.brand, model: car.model },
      bookings: u.bookings.map(b => ({
        id: b.id, spotNumber: b.spot?.spotNumber, status: b.status,
        startTime: b.startTime, totalCost: b.totalCost, isPaid: b.isPaid,
      })),
      fines: u.fines.map(f => ({
        id: f.id, amount: f.amount, reason: f.reason,
        isPaid: f.isPaid, createdAt: f.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to find user' });
  }
});

router.get('/spots', async (req: Request, res: Response) => {
  try {
    const spots = await prisma.parkingSpot.findMany({ orderBy: { spotNumber: 'asc' } });
    res.json(spots);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});

router.patch('/spots/:spotNumber/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const spot = await prisma.parkingSpot.update({
      where: { spotNumber: req.params.spotNumber },
      data: { status, currentUserPlate: status === 'FREE' ? null : undefined, currentUserId: status === 'FREE' ? null : undefined },
    });

    if (status === 'FREE') {
      await prisma.longTermRental.updateMany({
        where: { spotId: spot.id, status: 'ACTIVE' },
        data: { status: 'CANCELLED', endDate: new Date() },
      });
      await prisma.booking.updateMany({
        where: { spotId: spot.id, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELLED' },
      });
    }

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber: spot.spotNumber, status: spot.status, carPlate: spot.currentUserPlate });
    res.json(spot);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update spot' });
  }
});

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

router.get('/lpr-events', async (req: Request, res: Response) => {
  try {
    const events = await prisma.lPREvent.findMany({ orderBy: { timestamp: 'desc' }, take: 100 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch LPR events' });
  }
});

router.get('/promo/all', async (req: Request, res: Response) => {
  try {
    const promoCodes = await promoCodeService.getAllPromoCodes();
    res.json(promoCodes);
  } catch (error) {
    logger.error('❌ Error fetching promo codes:', error);
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});

router.post('/promo/create', async (req: Request, res: Response) => {
  try {
    const { code, discount, type, maxUses, expiresAt } = req.body;
    if (!code || !discount || !type) {
      return res.status(400).json({ error: 'code, discount and type are required' });
    }
    const promo = await promoCodeService.createPromoCode({
      code,
      discount: Number(discount),
      type,
      maxUses: maxUses ? Number(maxUses) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    res.status(201).json(promo);
  } catch (error) {
    logger.error('❌ Error creating promo code:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create promo code' });
  }
});

router.delete('/promo/:id', async (req: Request, res: Response) => {
  try {
    await promoCodeService.deletePromoCode(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error deleting promo code:', error);
    res.status(500).json({ error: 'Failed to delete promo code' });
  }
});

router.patch('/promo/:id/toggle', async (req: Request, res: Response) => {
  try {
    const promo = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
    if (!promo) return res.status(404).json({ error: 'Not found' });
    const updated = await promoCodeService.updatePromoCode(req.params.id, { isActive: !promo.isActive });
    res.json(updated);
  } catch (error) {
    logger.error('❌ Error toggling promo code:', error);
    res.status(500).json({ error: 'Failed to toggle promo code' });
  }
});

// ─── COMPLAINTS ───────────────────────────────────────────

router.get('/complaints', async (req: Request, res: Response) => {
  try {
    const complaints = await prisma.complaint.findMany({
      include: { user: { select: { id: true, firstName: true, lastName: true, phoneNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
});

// Reassign user to a new spot
router.post('/complaints/:id/reassign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const complaint = await prisma.complaint.findUnique({ where: { id } });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    // Find a free spot of same type as the original
    const originalSpot = await prisma.parkingSpot.findUnique({ where: { spotNumber: complaint.spotId } });
    const spotType = originalSpot?.type ?? 'SHORT_TERM';

    const freeSpot = await prisma.parkingSpot.findFirst({
      where: { status: 'FREE', type: spotType, spotNumber: { not: complaint.spotId } },
      orderBy: { spotNumber: 'asc' },
    });

    const { io } = await import('../server');

    if (!freeSpot) {
      // No spots — refund the user
      const booking = complaint.bookingId
        ? await prisma.booking.findUnique({ where: { id: complaint.bookingId } })
        : null;
      const refundAmount = booking?.totalCost ?? 0;

      if (refundAmount > 0) {
        await prisma.user.update({
          where: { id: complaint.userId },
          data: { walletBalance: { increment: refundAmount } },
        });
        await prisma.transaction.create({
          data: {
            userId: complaint.userId,
            amount: refundAmount,
            type: 'REFUND',
            description: `Возврат: место занято (${complaint.spotId})`,
            balanceBefore: 0,
            balanceAfter: refundAmount,
          },
        });
      }

      await prisma.complaint.update({ where: { id }, data: { status: 'REFUNDED', resolvedAt: new Date() } });
      io.emit('no-spots-available', { userId: complaint.userId, refundAmount });
      return res.json({ success: true, action: 'refunded', refundAmount });
    }

    // Found a spot — notify user
    await prisma.complaint.update({
      where: { id },
      data: { status: 'REASSIGNED', newSpotId: freeSpot.spotNumber, resolvedAt: new Date() },
    });

    io.emit('spot-reassigned', { userId: complaint.userId, newSpotId: freeSpot.spotNumber });
    logger.info(`✅ Complaint ${id}: reassigned ${complaint.userId} → ${freeSpot.spotNumber}`);
    res.json({ success: true, action: 'reassigned', newSpotId: freeSpot.spotNumber });
  } catch (error) {
    logger.error('❌ Error reassigning complaint:', error);
    res.status(500).json({ error: 'Failed to reassign' });
  }
});

// Fine the violator — сразу списываем с кошелька, как в дипломе
router.post('/complaints/:id/fine', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { violatorUserId, amount = 700 } = req.body;

    const complaint = await prisma.complaint.findUnique({ where: { id } });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (violatorUserId) {
      const violator = await prisma.user.findUnique({ where: { id: violatorUserId } });
      if (violator) {
        // Сколько реально можем списать
        const deductable = Math.min(violator.walletBalance, amount);
        const debt = amount - deductable;
        const newBalance = Math.max(0, violator.walletBalance - amount);

        await prisma.$transaction([
          // Журнал штрафа
          prisma.fine.create({
            data: {
              userId: violatorUserId,
              amount,
              reason: `Нарушение парковки — занято чужое место`,
              ticketId: id,
              isPaid: deductable >= amount,
              paidAt: deductable >= amount ? new Date() : null,
            },
          }),
          // Кошелёк не уходит ниже 0
          prisma.user.update({
            where: { id: violatorUserId },
            data: { walletBalance: newBalance },
          }),
          // Запись в транзакции — штраф
          prisma.transaction.create({
            data: {
              userId: violatorUserId,
              amount: -deductable,
              type: 'PAYMENT',
              description: `Штраф 700₸ за нарушение парковки (место ${complaint.spotId})`,
              balanceBefore: violator.walletBalance,
              balanceAfter: newBalance,
            },
          }),
          // Если баланса не хватило — записываем долг отдельной строкой
          ...(debt > 0 ? [prisma.transaction.create({
            data: {
              userId: violatorUserId,
              amount: -debt,
              type: 'PAYMENT',
              description: `Долг по штрафу: ${debt}₸ (пополните кошелёк)`,
              balanceBefore: 0,
              balanceAfter: 0,
            },
          })] : []),
        ]);
      }
    }

    await prisma.complaint.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });

    if (violatorUserId) {
      const { io } = await import('../server');
      io.emit('fine-issued', { userId: violatorUserId, amount, complaintId: id, spotId: complaint.spotId });
    }

    res.json({ success: true, fined: amount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fine' });
  }
});

// ─── APPLICATIONS ─────────────────────────────────────────

router.get('/applications', async (req: Request, res: Response) => {
  try {
    const apps = await prisma.application.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

router.patch('/applications/:id', async (req: Request, res: Response) => {
  try {
    const { status, adminNote } = req.body;
    const app = await prisma.application.update({
      where: { id: req.params.id },
      data: { ...(status ? { status } : {}), ...(adminNote !== undefined ? { adminNote } : {}) },
    });
    res.json(app);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update application' });
  }
});

export default router;
