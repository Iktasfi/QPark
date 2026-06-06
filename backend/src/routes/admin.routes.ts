import { Router, Request, Response } from 'express';
import authService from '../services/auth.service';
import promoCodeService from '../services/promocode.service';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { findFreeSpotNearby } from '../utils/spots';

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

    // Find free spot: same parking location first, then nearest other
    const freeSpot = await findFreeSpotNearby(complaint.spotId);

    const { io } = await import('../server');

    if (!freeSpot) {
      // ── AUTO-SWAP: if violator is identified and has their own booking ──
      if (complaint.violatorUserId) {
        const violatorBooking = await prisma.booking.findFirst({
          where: {
            userId: complaint.violatorUserId,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        });

        const violatorSpotRecord = violatorBooking
          ? await prisma.parkingSpot.findUnique({ where: { id: violatorBooking.spotId } })
          : null;

        if (violatorBooking && violatorSpotRecord) {
          const violatorSpotNumber = violatorSpotRecord.spotNumber;
          const violatorSpotId    = violatorBooking.spotId;

          // 1. Move User 1's booking to violator's spot
          if (complaint.bookingId) {
            await prisma.booking.update({
              where: { id: complaint.bookingId },
              data: { spotId: violatorSpotId },
            });
          }

          // 2. Move violator's booking to User 1's original spot (where they physically are)
          const user1Spot = await prisma.parkingSpot.findFirst({
            where: { spotNumber: complaint.spotId },
          });
          if (user1Spot) {
            await prisma.booking.update({
              where: { id: violatorBooking.id },
              data: { spotId: user1Spot.id },
            });
          }

          // 3. Auto-issue fine to violator
          const violatorUser = await prisma.user.findUnique({ where: { id: complaint.violatorUserId } });
          if (violatorUser) {
            const fineAmount = 900;
            const debt = fineAmount - violatorUser.walletBalance;
            await Promise.all([
              prisma.fine.create({
                data: {
                  userId: complaint.violatorUserId,
                  amount: fineAmount,
                  reason: `Автоштраф: занял чужое место (${complaint.spotId}), места поменяны`,
                  isPaid: violatorUser.walletBalance >= fineAmount,
                },
              }),
              prisma.user.update({
                where: { id: complaint.violatorUserId },
                data: { walletBalance: { decrement: Math.min(fineAmount, violatorUser.walletBalance) } },
              }),
              prisma.transaction.create({
                data: {
                  userId: complaint.violatorUserId,
                  amount: -Math.min(fineAmount, violatorUser.walletBalance),
                  type: 'PAYMENT',
                  description: `Автоштраф 900₸: занял место ${complaint.spotId}`,
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
            io.emit('fine-issued', { userId: complaint.violatorUserId, amount: fineAmount, complaintId: id, spotId: complaint.spotId });
          }

          // 4. Notify User 1 of their new spot
          await prisma.complaint.update({
            where: { id },
            data: { status: 'REASSIGNED', newSpotId: violatorSpotNumber, resolvedAt: new Date() },
          });
          io.emit('spot-reassigned', { userId: complaint.userId, newSpotId: violatorSpotNumber });

          logger.info(`✅ Auto-swap: ${complaint.userId} → ${violatorSpotNumber}, violator fined 900₸`);
          return res.json({ success: true, action: 'swapped', newSpotId: violatorSpotNumber });
        }
      }

      // ── No swap possible — refund User 1 ──
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
        const newViolationCount = violator.violationCount + 1;
        // Auto-ban: 3+ violations → 7-day temporary ban (diploma section 3.5.6.3)
        const shouldBan = newViolationCount >= 3;
        const bannedUntil = shouldBan ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : undefined;

        await prisma.$transaction([
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
          prisma.user.update({
            where: { id: violatorUserId },
            data: {
              walletBalance: newBalance,
              violationCount: { increment: 1 },
              ...(shouldBan ? { isBanned: true, bannedUntil } : {}),
            },
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

        if (shouldBan) {
          logger.info(`🚫 Auto-ban: user ${violatorUserId} has ${newViolationCount} violations — banned until ${bannedUntil}`);
        }
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
