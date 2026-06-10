import { Router, Request, Response } from 'express';
import authService from '../services/auth.service';
import promoCodeService from '../services/promocode.service';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { findFreeSpotNearby } from '../utils/spots';
import { sendPushToUser } from '../utils/notifications';

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
        exitRequestedAt: b.exitRequestedAt,
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
        exitRequestedAt: r.exitRequestedAt,
        isExpired: r.endDate < new Date(),
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

    // Normalize: strip spaces for comparison (444YSH01 == 444 YSH 01)
    const normalizedInput = plate.replace(/\s/g, '').toUpperCase();
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "cars"
      WHERE REPLACE("plateNumber", ' ', '') ILIKE ${normalizedInput}
      LIMIT 1
    `;
    if (!rows.length) return res.json(null);

    const car = await prisma.car.findUnique({
      where: { id: rows[0].id },
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

// Get user by ID (for auto-loading violator info in complaint card)
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        cars: true,
        bookings: { orderBy: { createdAt: 'desc' }, take: 10, include: { spot: true } },
        fines: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!u) return res.status(404).json({ error: 'User not found' });
    const car = u.cars[0];
    res.json({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      phoneNumber: u.phoneNumber,
      walletBalance: u.walletBalance,
      car: car ? { plateNumber: car.plateNumber, brand: car.brand, model: car.model } : { plateNumber: '—', brand: '—', model: '—' },
      bookings: u.bookings.map(b => ({ id: b.id, spotNumber: b.spot?.spotNumber, status: b.status, startTime: b.startTime, totalCost: b.totalCost, isPaid: b.isPaid })),
      fines: u.fines.map(f => ({ id: f.id, amount: f.amount, reason: f.reason, isPaid: f.isPaid, createdAt: f.createdAt })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
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

// Manually identify violator by plate (for cases where OCR failed)
router.patch('/complaints/:id/set-violator', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { plateNumber } = req.body;
    if (!plateNumber) return res.status(400).json({ error: 'plateNumber is required' });

    const complaint = await prisma.complaint.findUnique({ where: { id } });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const noSpaces = plateNumber.replace(/\s+/g, '');
    const violatorCar = await prisma.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT id, "userId" FROM "cars"
      WHERE REPLACE("plateNumber", ' ', '') ILIKE ${noSpaces}
      LIMIT 1
    `;
    if (!violatorCar.length) return res.status(404).json({ error: 'Car not found in system' });

    const violatorUserId = violatorCar[0].userId;
    await prisma.complaint.update({
      where: { id },
      data: { detectedPlate: plateNumber.toUpperCase(), violatorUserId },
    });

    res.json({ success: true, violatorUserId, message: 'Violator identified — now call /reassign' });
  } catch (error) {
    logger.error('❌ Error setting violator:', error);
    res.status(500).json({ error: 'Failed to set violator' });
  }
});

// Reassign user to a new spot
router.post('/complaints/:id/reassign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const complaint = await prisma.complaint.findUnique({ where: { id } });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const { io } = await import('../server');

    // Victim's original spot (the one they filed complaint about)
    const victimOriginalSpot = await prisma.parkingSpot.findFirst({ where: { spotNumber: complaint.spotId } });

    // Move victim's Booking or LongTermRental to a new spot DB id
    // complaint.bookingId may be a Booking id OR a LongTermRental id (frontend sends activeBooking.id for both)
    const moveVictimBookingToSpot = async (newSpotDbId: string) => {
      if (complaint.bookingId) {
        const asBooking = await prisma.booking.findUnique({ where: { id: complaint.bookingId } });
        if (asBooking) {
          await prisma.booking.update({ where: { id: complaint.bookingId }, data: { spotId: newSpotDbId } });
          return;
        }
        const asRental = await prisma.longTermRental.findUnique({ where: { id: complaint.bookingId } });
        if (asRental) {
          await prisma.longTermRental.update({ where: { id: complaint.bookingId }, data: { spotId: newSpotDbId } });
          return;
        }
      }
      // Fallback: find rental by userId + original spot
      if (victimOriginalSpot) {
        await prisma.longTermRental.updateMany({
          where: { userId: complaint.userId, spotId: victimOriginalSpot.id, status: 'ACTIVE' },
          data: { spotId: newSpotDbId },
        });
      }
    };

    // Fine the violator 900₸
    const issueFineToViolator = async (violatorSpotNumber: string) => {
      if (!complaint.violatorUserId) return;
      const violatorUser = await prisma.user.findUnique({ where: { id: complaint.violatorUserId } });
      if (!violatorUser) return;
      const fineAmount = 900;
      const charged = Math.min(fineAmount, violatorUser.walletBalance);
      const debt = fineAmount - charged;
      await Promise.all([
        prisma.fine.create({
          data: {
            userId: complaint.violatorUserId,
            amount: fineAmount,
            paidAmount: charged,
            reason: `Автоштраф: занял чужое место (${violatorSpotNumber}), места поменяны`,
            isPaid: charged >= fineAmount,
          },
        }),
        prisma.user.update({
          where: { id: complaint.violatorUserId },
          data: { walletBalance: { decrement: charged } },
        }),
        prisma.transaction.create({
          data: {
            userId: complaint.violatorUserId,
            amount: -charged,
            type: 'PAYMENT',
            description: `Автоштраф 900₸: занял место ${violatorSpotNumber}`,
            balanceBefore: violatorUser.walletBalance,
            balanceAfter: Math.max(0, violatorUser.walletBalance - fineAmount),
          },
        }),
        ...(debt > 0 ? [prisma.transaction.create({
          data: {
            userId: complaint.violatorUserId,
            amount: 0,
            type: 'PAYMENT',
            description: `Долг по штрафу: ${debt}₸ (пополните кошелёк)`,
            balanceBefore: 0,
            balanceAfter: 0,
          },
        })] : []),
      ]);
      io.emit('fine-issued', { userId: complaint.violatorUserId, amount: fineAmount, complaintId: id });
    };

    // ── CASE 1 (PRIORITY): Violator known → always swap bookings ──
    // Violator is physically at victim's spot; their own reserved spot is physically empty.
    // Give victim the violator's spot, move violator's booking to match where they physically are.
    if (complaint.violatorUserId && victimOriginalSpot) {
      const violatorBooking = await prisma.booking.findFirst({
        where: { userId: complaint.violatorUserId, status: { in: ['PENDING', 'CONFIRMED'] } },
      });
      const violatorRental = !violatorBooking
        ? await prisma.longTermRental.findFirst({ where: { userId: complaint.violatorUserId, status: 'ACTIVE' } })
        : null;
      const violatorSpotId = violatorBooking?.spotId ?? violatorRental?.spotId ?? null;
      const violatorOriginalSpot = violatorSpotId
        ? await prisma.parkingSpot.findUnique({ where: { id: violatorSpotId } })
        : null;

      if (violatorOriginalSpot) {
        const [victimPlate, violatorPlate, victimRentalCheck] = await Promise.all([
          prisma.car.findFirst({ where: { userId: complaint.userId } }).then(c => c?.plateNumber ?? null),
          prisma.car.findFirst({ where: { userId: complaint.violatorUserId! } }).then(c => c?.plateNumber ?? null),
          // Determine if victim is a long-term renter
          complaint.bookingId
            ? prisma.longTermRental.findUnique({ where: { id: complaint.bookingId } })
            : prisma.longTermRental.findFirst({ where: { userId: complaint.userId, status: 'ACTIVE' } }),
        ]);
        // Victim is physically inside (arrivedAt set) → mark new spot OCCUPIED immediately
        const victimIsInside = !!(victimRentalCheck?.arrivedAt);
        const victimNewSpotStatus = victimIsInside ? 'OCCUPIED' : (victimRentalCheck ? 'RESERVED' : 'BOOKED');

        //
        // SWAP: Victim → violator's spot (physically empty) | Violator booking → victim's spot (physically there)
        //
        // 1. Move victim's booking/rental → violator's original spot
        await moveVictimBookingToSpot(violatorOriginalSpot.id);
        await prisma.parkingSpot.update({
          where: { id: violatorOriginalSpot.id },
          data: { status: victimNewSpotStatus, currentUserId: complaint.userId, currentUserPlate: victimPlate },
        });
        io.emit('spot-status-changed', { spotNumber: violatorOriginalSpot.spotNumber, status: victimNewSpotStatus, carPlate: victimPlate });

        // 2. Move violator's booking/rental → victim's spot (where they physically are)
        if (violatorBooking) {
          await prisma.booking.update({
            where: { id: violatorBooking.id },
            data: { spotId: victimOriginalSpot.id, arrivedAt: violatorBooking.arrivedAt ?? new Date() },
          });
        } else if (violatorRental) {
          await prisma.longTermRental.update({ where: { id: violatorRental.id }, data: { spotId: victimOriginalSpot.id } });
        }
        await prisma.parkingSpot.update({
          where: { id: victimOriginalSpot.id },
          data: { status: 'OCCUPIED', currentUserId: complaint.violatorUserId, currentUserPlate: violatorPlate },
        });
        io.emit('spot-status-changed', { spotNumber: victimOriginalSpot.spotNumber, status: 'OCCUPIED', carPlate: violatorPlate });

        // 3. Fine violator (skip if complaint is already CLOSED — fine was issued separately)
        const existingFine = await prisma.fine.findFirst({ where: { ticketId: id } });
        if (!existingFine) {
          await issueFineToViolator(complaint.spotId);
        }

        // 4. Resolve complaint — victim's new spot is violator's original spot
        await prisma.complaint.update({
          where: { id },
          data: { status: 'REASSIGNED', newSpotId: violatorOriginalSpot.spotNumber, resolvedAt: new Date() },
        });
        // Notify both parties via socket + push
        io.emit('spot-reassigned', {
          userId: complaint.userId,
          newSpotId: violatorOriginalSpot.spotNumber,
          oldSpotId: victimOriginalSpot.spotNumber,
          victimPlate,
        });
        io.emit('spot-moved', {
          userId: complaint.violatorUserId,
          newSpotId: victimOriginalSpot.spotNumber,
          oldSpotId: violatorOriginalSpot.spotNumber,
          violatorPlate,
        });

        // Push notifications — victim gets redirect notice; violator gets fine notice
        await Promise.allSettled([
          sendPushToUser(
            complaint.userId,
            '🔄 Ваше место изменено',
            `Ваше новое место: ${violatorOriginalSpot.spotNumber}. Паркуйтесь там.`,
            { type: 'spot-reassigned', newSpotId: violatorOriginalSpot.spotNumber }
          ),
          sendPushToUser(
            complaint.violatorUserId!,
            '⚠️ Штраф 900₸ — смена места',
            `Вы заняли чужое место. Штраф 900₸ списан. Ваше место изменено: ${victimOriginalSpot.spotNumber}. Паркуйтесь там.`,
            { type: 'spot-moved', newSpotId: victimOriginalSpot.spotNumber }
          ),
        ]);

        io.emit('bookings-updated'); // tells admin dashboard to refetch
        logger.info(`✅ Swap complete: victim ${complaint.userId}→${violatorOriginalSpot.spotNumber}, violator ${complaint.violatorUserId}→${victimOriginalSpot.spotNumber}, fined 900₸`);
        return res.json({
          success: true,
          action: 'swapped',
          newSpotId: violatorOriginalSpot.spotNumber,
          victimNewSpot: violatorOriginalSpot.spotNumber,
          violatorNewSpot: victimOriginalSpot.spotNumber,
        });
      }
    }

    // ── CASE 2 (FALLBACK): Violator unknown or has no booking — find a free spot ──
    const freeSpot = await findFreeSpotNearby(complaint.spotId);

    if (!freeSpot) {
      // No swap possible, no free spot — refund victim
      const booking = complaint.bookingId
        ? await prisma.booking.findUnique({ where: { id: complaint.bookingId } })
        : null;
      const refundAmount = booking?.totalCost ?? 0;
      if (refundAmount > 0) {
        const victim = await prisma.user.findUnique({ where: { id: complaint.userId } });
        await prisma.user.update({ where: { id: complaint.userId }, data: { walletBalance: { increment: refundAmount } } });
        await prisma.transaction.create({
          data: {
            userId: complaint.userId,
            amount: refundAmount,
            type: 'REFUND',
            description: `Возврат: место занято (${complaint.spotId})`,
            balanceBefore: victim?.walletBalance ?? 0,
            balanceAfter: (victim?.walletBalance ?? 0) + refundAmount,
          },
        });
      }
      await prisma.complaint.update({ where: { id }, data: { status: 'REFUNDED', resolvedAt: new Date() } });
      io.emit('no-spots-available', { userId: complaint.userId, refundAmount });
      return res.json({ success: true, action: 'refunded', refundAmount });
    }

    // 1. Move victim to free spot
    const victimCarPlate = await prisma.car.findFirst({ where: { userId: complaint.userId } }).then(c => c?.plateNumber ?? null);
    await moveVictimBookingToSpot(freeSpot.id);
    await prisma.parkingSpot.update({
      where: { id: freeSpot.id },
      data: { status: 'BOOKED', currentUserId: complaint.userId, currentUserPlate: victimCarPlate },
    });
    io.emit('spot-status-changed', { spotNumber: freeSpot.spotNumber, status: 'BOOKED', carPlate: victimCarPlate });

    // 2. Fine violator if known (no booking/rental found for them, so no spot to swap)
    if (complaint.violatorUserId) {
      await issueFineToViolator(complaint.spotId);
    }

    // 3. Resolve complaint
    await prisma.complaint.update({
      where: { id },
      data: { status: 'REASSIGNED', newSpotId: freeSpot.spotNumber, resolvedAt: new Date() },
    });
    io.emit('spot-reassigned', { userId: complaint.userId, newSpotId: freeSpot.spotNumber });

    // Push: notify victim about the new spot
    await sendPushToUser(
      complaint.userId,
      '🔄 Вас перенаправили на новое место',
      `Ваше место (${complaint.spotId}) было занято. Новое место: ${freeSpot.spotNumber}. Паркуйтесь там.`,
      { type: 'spot-reassigned', newSpotId: freeSpot.spotNumber }
    ).catch(() => {});

    logger.info(`✅ Complaint ${id}: victim→${freeSpot.spotNumber}${complaint.violatorUserId ? ', violator fined' : ''}`);
    res.json({ success: true, action: 'reassigned', newSpotId: freeSpot.spotNumber });
  } catch (error) {
    logger.error('❌ Error reassigning complaint:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to reassign' });
  }
});

// On-demand OCR plate detection for a complaint photo
router.post('/complaints/:id/detect-plate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const complaint = await prisma.complaint.findUnique({ where: { id } });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });
    if (!complaint.photoUrl) return res.status(400).json({ error: 'No photo attached to this complaint' });

    const ocrUrl = process.env.OCR_SERVICE_URL;
    if (!ocrUrl) return res.status(503).json({ error: 'OCR service not configured' });

    // Download image if Cloudinary URL, else send as-is (base64)
    let imagePayload = complaint.photoUrl;
    if (complaint.photoUrl.startsWith('http')) {
      const imgRes = await fetch(complaint.photoUrl, { signal: AbortSignal.timeout(10000) });
      if (!imgRes.ok) return res.status(502).json({ error: 'Could not fetch photo' });
      const buf = Buffer.from(await imgRes.arrayBuffer());
      imagePayload = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }

    const ocrRes = await fetch(`${ocrUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify({ image: imagePayload, spot: '' }),
      signal: AbortSignal.timeout(25000),
    });

    if (!ocrRes.ok) return res.status(502).json({ error: 'OCR service error' });

    const data = await ocrRes.json() as { texts?: { text: string; confidence: number }[] };
    const texts = data.texts ?? [];

    // Kazakh plate patterns
    const PLATE_PATTERNS = [
      /\b\d{3}\s*[A-Z]{2,3}\s*\d{2}\b/i,
      /\b[A-Z]{1,2}\s*\d{3,4}\s*[A-Z]{2}\b/i,
      /\b\d{2,3}[A-Z]{2,4}\d{2}\b/i,
    ];
    const allText = texts.map(t => t.text.toUpperCase()).join(' ');
    let plate: string | null = null;
    for (const pat of PLATE_PATTERNS) {
      const m = allText.match(pat);
      if (m) { plate = m[0].replace(/\s+/g, ' ').trim().toUpperCase(); break; }
    }

    if (!plate && texts.length > 0) {
      // Fallback: look for token that looks like a plate (6-9 chars, mixed)
      for (const t of texts) {
        const clean = t.text.replace(/\s+/g, '').toUpperCase();
        if (clean.length >= 6 && clean.length <= 10 && /[A-Z]/.test(clean) && /\d/.test(clean)) {
          plate = clean; break;
        }
      }
    }

    if (!plate) return res.json({ plate: null, message: 'Plate not found in photo' });

    // Reformat plate to standard spaced format: "444YSH01" → "444 YSH 01"
    const formatPlate = (p: string) => {
      const noSpaces = p.replace(/\s/g, '');
      const m = noSpaces.match(/^(\d{3})([A-Z]{2,3})(\d{2})$/i);
      return m ? `${m[1]} ${m[2].toUpperCase()} ${m[3]}` : p.toUpperCase();
    };
    plate = formatPlate(plate);
    const plateNoSpaces = plate.replace(/\s/g, '');

    // Search by exact formatted plate OR by stripped version
    const car = await prisma.car.findFirst({
      where: {
        OR: [
          { plateNumber: { contains: plate, mode: 'insensitive' } },
          { plateNumber: { contains: plateNoSpaces, mode: 'insensitive' } },
        ],
      },
      include: { user: true },
    });

    await prisma.complaint.update({
      where: { id },
      data: { detectedPlate: plate, violatorUserId: car?.userId ?? undefined },
    });

    logger.info(`🔍 Admin OCR detect: complaint ${id} → plate "${plate}" → user ${car?.userId ?? 'not found'}`);
    res.json({ plate, userId: car?.userId ?? null, userName: car ? (car.user.firstName ?? car.user.phoneNumber) : null });
  } catch (error) {
    logger.error('❌ Error detecting plate:', error);
    res.status(500).json({ error: 'OCR detection failed' });
  }
});

// Fine the violator — сразу списываем с кошелька, как в дипломе
router.post('/complaints/:id/fine', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { violatorUserId, amount = 900 } = req.body;

    const complaint = await prisma.complaint.findUnique({ where: { id } });
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (violatorUserId) {
      const violator = await prisma.user.findUnique({ where: { id: violatorUserId } });
      if (violator) {
        const deductable = Math.min(violator.walletBalance, amount);
        const debt = amount - deductable;
        const newBalance = Math.max(0, violator.walletBalance - amount);

        await prisma.$transaction([
          prisma.fine.create({
            data: {
              userId: violatorUserId,
              amount,
              paidAmount: deductable,
              reason: `Нарушение парковки — занято чужое место`,
              ticketId: id,
              isPaid: deductable >= amount,
              paidAt: deductable >= amount ? new Date() : null,
            },
          }),
          prisma.user.update({
            where: { id: violatorUserId },
            data: { walletBalance: newBalance },
          }),
          prisma.transaction.create({
            data: {
              userId: violatorUserId,
              amount: -deductable,
              type: 'PAYMENT',
              description: `Штраф 900₸ за нарушение парковки (место ${complaint.spotId})`,
              balanceBefore: violator.walletBalance,
              balanceAfter: newBalance,
            },
          }),
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

        logger.info(`💸 Fine ${amount}₸ → violator ${violatorUserId}`);
      }
    }

    await prisma.complaint.update({ where: { id }, data: { status: 'CLOSED', resolvedAt: new Date() } });

    // ── Correct spot statuses to reflect reality ──────────────────────────────
    // The violator physically occupied the victim's spot, but has their own
    // booking on a different spot. We:
    //   1. Cancel the violator's original booking and free that spot
    //   2. Mark the violated spot as OCCUPIED by the violator
    if (violatorUserId) {
      const { io } = await import('../server');

      const violatedSpot = await prisma.parkingSpot.findUnique({
        where: { spotNumber: complaint.spotId },
      });

      if (violatedSpot) {
        // Find violator's active booking on a DIFFERENT spot
        const violatorBooking = await prisma.booking.findFirst({
          where: {
            userId: violatorUserId,
            status: { in: ['PENDING', 'CONFIRMED'] },
            spotId: { not: violatedSpot.id },
          },
          include: { spot: true },
        });

        // Get violator's plate: prefer car record, fall back to OCR-detected plate
        const violatorCar = await prisma.car.findFirst({
          where: { userId: violatorUserId },
          orderBy: { createdAt: 'desc' },
        });
        const violatorPlate = violatorCar?.plateNumber ?? complaint.detectedPlate ?? null;

        // Mark violated spot as OCCUPIED by the violator (they're physically there)
        // and optionally cancel their phantom booking on the other spot
        await prisma.$transaction([
          prisma.parkingSpot.update({
            where: { id: violatedSpot.id },
            data: { status: 'OCCUPIED', currentUserId: violatorUserId, currentUserPlate: violatorPlate },
          }),
          ...(violatorBooking ? [
            prisma.booking.update({
              where: { id: violatorBooking.id },
              data: { status: 'CANCELLED', actualEndTime: new Date() },
            }),
            prisma.parkingSpot.update({
              where: { id: violatorBooking.spotId },
              data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
            }),
          ] : []),
        ]);

        // Notify frontend about both spot changes
        io.emit('spot-status-changed', {
          spotNumber: complaint.spotId,
          status: 'OCCUPIED',
          carPlate: violatorPlate,
        });
        if (violatorBooking) {
          io.emit('spot-status-changed', {
            spotNumber: violatorBooking.spot.spotNumber,
            status: 'FREE',
            carPlate: null,
          });
          logger.info(
            `🔄 Spot correction: freed ${violatorBooking.spot.spotNumber} (phantom booking), ` +
            `marked ${complaint.spotId} OCCUPIED by violator ${violatorUserId}`,
          );
        }
      }

      io.emit('fine-issued', { userId: violatorUserId, amount, complaintId: id, spotId: complaint.spotId });
    }

    res.json({ success: true, fined: amount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fine' });
  }
});

// ─── РУЧНОЕ ПОДТВЕРЖДЕНИЕ ВЫЕЗДА (долгосрочная аренда) ────────────────────────
router.post('/confirm-exit-rental/:rentalId', async (req: Request, res: Response) => {
  try {
    const { rentalId } = req.params;

    const rental = await prisma.longTermRental.findUnique({
      where: { id: rentalId },
      include: { spot: true },
    });

    if (!rental) return res.status(404).json({ error: 'Rental not found' });
    if (rental.status === 'COMPLETED') return res.json({ success: true, message: 'Already completed' });

    await prisma.$transaction([
      prisma.longTermRental.update({
        where: { id: rentalId },
        data: { status: 'COMPLETED' },
      }),
      prisma.parkingSpot.update({
        where: { id: rental.spotId },
        data: { status: 'FREE', currentUserId: null, currentUserPlate: null },
      }),
    ]);

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber: rental.spot.spotNumber, status: 'FREE', carPlate: null });
    io.emit('parking-exit-confirmed', { userId: rental.userId, rentalId });

    logger.info(`✅ Admin manually confirmed rental exit: ${rentalId}, spot ${rental.spot.spotNumber}`);
    res.json({ success: true, spotNumber: rental.spot.spotNumber });
  } catch (error) {
    logger.error('❌ Error confirming rental exit:', error);
    res.status(500).json({ error: 'Failed to confirm exit' });
  }
});

// ─── РУЧНОЕ ПОДТВЕРЖДЕНИЕ ВЫЕЗДА (краткосрочная бронь) ────────────────────────
// Менеджер нажимает "Подтвердить выезд" когда OCR не смог прочитать номер

router.post('/confirm-exit/:bookingId', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { spot: true },
    });

    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status === 'COMPLETED') return res.json({ success: true, message: 'Already completed' });

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'COMPLETED', actualEndTime: new Date() },
      }),
      prisma.parkingSpot.update({
        where: { id: booking.spotId },
        data: { status: 'FREE', currentUserId: null, currentUserPlate: null },
      }),
    ]);

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber: booking.spot.spotNumber, status: 'FREE', carPlate: null });
    io.emit('parking-exit-confirmed', { userId: booking.userId, bookingId });

    logger.info(`✅ Admin manually confirmed exit: booking ${bookingId}, spot ${booking.spot.spotNumber}`);
    res.json({ success: true, spotNumber: booking.spot.spotNumber });
  } catch (error) {
    logger.error('❌ Error confirming exit:', error);
    res.status(500).json({ error: 'Failed to confirm exit' });
  }
});

// ─── РУЧНОЕ ОТКРЫТИЕ ШЛАГБАУМА ────────────────────────────
// Менеджер открывает шлагбаум вручную (OCR не прочитал номер на въезде)

router.post('/open-gate', async (req: Request, res: Response) => {
  try {
    const { spotNumber, carPlate, direction } = req.body;
    if (!spotNumber) return res.status(400).json({ error: 'spotNumber is required' });

    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });

    const { io } = await import('../server');

    // Если у места есть активная долгосрочная аренда — открываем без изменения статуса
    const rental = await prisma.longTermRental.findFirst({
      where: { spotId: spot.id, status: 'ACTIVE' },
    });

    if (rental) {
      // Use direction param if provided; otherwise infer from spot status
      const isEntry = direction ? direction === 'entry' : spot.status !== 'OCCUPIED';
      const newStatus = isEntry ? 'OCCUPIED' : 'RESERVED';
      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: newStatus, ...(carPlate ? { currentUserPlate: carPlate } : {}) },
      });
      if (isEntry && !rental.arrivedAt) {
        await prisma.longTermRental.update({ where: { id: rental.id }, data: { arrivedAt: new Date() } });
      }
      io.emit('lpr-gate-open', { carPlate: carPlate ?? spot.currentUserPlate, spotNumber, type: isEntry ? 'entry' : 'exit' });
      io.emit('spot-status-changed', { spotNumber, status: newStatus, carPlate: carPlate ?? spot.currentUserPlate });
      logger.info(`🔑 Admin opened gate (long-term ${isEntry ? 'entry' : 'exit'}): ${spotNumber}`);
      return res.json({ success: true, type: isEntry ? 'entry' : 'exit', newStatus });
    }

    // Краткосрочная бронь — открываем как въезд
    const booking = await prisma.booking.findFirst({
      where: { spotId: spot.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    await prisma.parkingSpot.update({
      where: { spotNumber },
      data: { status: 'OCCUPIED', ...(carPlate ? { currentUserPlate: carPlate } : {}) },
    });

    if (booking) {
      const bookedMs = booking.estimatedEndTime.getTime() - booking.startTime.getTime();
      const newEstimatedEnd = new Date(now.getTime() + 7 * 60 * 1000 + bookedMs);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { arrivedAt: now, photoTimerStart: now, photoStatus: 'PENDING', estimatedEndTime: newEstimatedEnd },
      });
      io.emit('booking-updated', { bookingId: booking.id, endTime: newEstimatedEnd, arrivedAt: now });
    }

    io.emit('lpr-gate-open', { carPlate: carPlate ?? spot.currentUserPlate, spotNumber, type: 'entry' });
    io.emit('spot-status-changed', { spotNumber, status: 'OCCUPIED', carPlate: carPlate ?? spot.currentUserPlate });
    logger.info(`🔑 Admin opened gate manually: ${spotNumber}`);
    res.json({ success: true, type: 'entry', newStatus: 'OCCUPIED' });
  } catch (error) {
    logger.error('❌ Error opening gate manually:', error);
    res.status(500).json({ error: 'Failed to open gate' });
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
