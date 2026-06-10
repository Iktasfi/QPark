import { Router, Request, Response } from 'express';
import bookingService from '../services/booking.service';
import paymentService from '../services/payment.service';
import { verifyToken } from '../middleware/auth';
import { checkBalance, requireCarPlate } from '../middleware/balance.middleware';
import { validateBooking } from '../middleware/validation.middleware';
import { getExtendBookingCost } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { uploadPhotoToCloudinary } from '../utils/cloudinary';
import { sendPushToUser } from '../utils/notifications';
import { overstayQueue, noShowQueue } from '../jobs/queues';

const router = Router();


router.use(verifyToken);


router.post('/', requireCarPlate, validateBooking, async (req: Request, res: Response) => {
  try {
    const { spotId, carPlate, estimatedMinutes = 60, promoDiscount = 0, bonusDiscount = 0 } = req.body;
    const userId = req.userId!;

    const booking = await bookingService.createShortTermBooking(
      userId, spotId, carPlate ?? '', Number(estimatedMinutes), Number(promoDiscount), Number(bonusDiscount),
    );


    const { io } = await import('../server');
    io.emit('booking-created', booking);

    res.status(201).json({
      booking,
      message: '✅ Booking created successfully',
    });
  } catch (error: any) {
    const msg: string = error?.message ?? 'Failed to create booking';
    if (msg === 'Spot just taken') return res.status(409).json({ error: msg });
    if (msg.startsWith('Insufficient balance') || msg.startsWith('Debt:')) return res.status(400).json({ error: msg });
    logger.error('❌ Error creating booking:', error);
    res.status(500).json({ error: msg });
  }
});


router.get('/active', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const now = new Date();

    // Short-term active bookings
    const bookings = await bookingService.getUserActiveBookings(userId);

    // Long-term active rental (still within its paid period)
    const rental = await prisma.longTermRental.findFirst({
      where: { userId, status: 'ACTIVE', endDate: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { spot: true },
    });

    const result: object[] = [...bookings];
    if (rental) {
      result.push({
        id: rental.id,
        spotId: rental.spot?.spotNumber ?? rental.spotId,
        plateNumber: rental.plateNumber,
        type: 'long-term',
        status: 'ACTIVE',
        startDate: rental.startDate,
        endDate: rental.endDate,
        remainingMs: rental.endDate.getTime() - now.getTime(),
        rentalDays: rental.rentalDays,
        totalCost: rental.totalCost,
        isPaid: rental.isPaid,
      });
    }

    res.json(result);
  } catch (error) {
    logger.error('❌ Error fetching active bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});


router.get('/restore', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const now = new Date();
    const expiredCutoff = new Date(now.getTime() - 30 * 60 * 1000);
    const EXIT_GRACE_MS = 7 * 60 * 1000;

    // Safety-net: cancel no-show PENDING bookings older than 30 min that the BullMQ worker
    // might have missed (e.g. Redis restart). Includes proper 50% penalty / 50% refund.
    const noShowBookings = await prisma.booking.findMany({
      where: { userId, status: 'PENDING', startTime: { lt: expiredCutoff }, arrivedAt: null },
      include: { user: true },
    });
    for (const b of noShowBookings) {
      const totalCost = b.totalCost ?? 0;
      const penaltyAmount = Math.ceil(totalCost * 0.5);
      const refundAmount = totalCost - penaltyAmount;
      await prisma.$transaction([
        prisma.booking.update({
          where: { id: b.id },
          data: { status: 'CANCELLED', actualEndTime: now },
        }),
        prisma.parkingSpot.update({
          where: { id: b.spotId },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }),
        ...(refundAmount > 0 && b.user ? [
          prisma.user.update({
            where: { id: userId },
            data: { walletBalance: { increment: refundAmount } },
          }),
          prisma.transaction.create({
            data: {
              userId,
              amount: refundAmount,
              type: 'REFUND',
              description: `Частичный возврат: не явился вовремя (50% от ${totalCost}₸)`,
              balanceBefore: b.user.walletBalance,
              balanceAfter: b.user.walletBalance + refundAmount,
            },
          }),
        ] : []),
      ]);
      logger.info(`⏰ Restore safety-net: cancelled no-show booking ${b.id}, refunded ${refundAmount}₸`);
    }

    // Short-term: find any active booking
    const booking = await prisma.booking.findFirst({
      where: { userId, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (booking) {
      // If exit grace has already expired: the car is still physically on the lot.
      // The spot stays OCCUPIED — only physical LPR exit will free it and complete the booking.
      // Return null so the user can interact with the app normally; the booking stays in DB.
      if (booking.exitRequestedAt) {
        const graceElapsed = now.getTime() - booking.exitRequestedAt.getTime();
        if (graceElapsed >= EXIT_GRACE_MS) {
          return res.json(null);
        }
      }

      const bookingSpot = await prisma.parkingSpot.findUnique({ where: { id: booking.spotId } });
      const GRACE_MS = 5 * 60 * 1000;
      const overstayStartMs = booking.estimatedEndTime.getTime() + GRACE_MS;
      const overstayMs = Math.max(0, now.getTime() - overstayStartMs);
      const overstayMinutes = Math.floor(overstayMs / 60000);
      const waitingFee = overstayMinutes * 3;
      return res.json({
        id: booking.id,
        spotId: bookingSpot?.spotNumber ?? booking.spotId,
        userId: booking.userId,
        plateNumber: booking.plateNumber,
        type: 'short-term',
        status: 'active',
        startTime: booking.startTime,
        endTime: booking.estimatedEndTime,
        arrivedAt: booking.arrivedAt,
        exitRequestedAt: booking.exitRequestedAt,
        isPaid: booking.isPaid,
        isOvertime: now > booking.estimatedEndTime,
        waitingFee,
        currentDebt: waitingFee,
        bookedMinutes: booking.bookedMinutes + (booking.minutesExtended ?? 0),
      });
    }

    // Long-term: active rental — show while active OR expired but not yet exited
    const rental = await prisma.longTermRental.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { spot: true },
    });

    if (rental) {
      // Same rule: if exit grace expired, car is still on lot — wait for LPR exit
      if (rental.exitRequestedAt) {
        const graceElapsed = now.getTime() - rental.exitRequestedAt.getTime();
        if (graceElapsed >= EXIT_GRACE_MS) {
          return res.json(null);
        }
      }

      const isExpired = rental.endDate < now;
      const remainingMs = Math.max(0, rental.endDate.getTime() - now.getTime());
      const overstayMs = isExpired ? now.getTime() - rental.endDate.getTime() : 0;
      const overstayMinutes = Math.floor(overstayMs / 60000);
      return res.json({
        id: rental.id,
        spotId: rental.spot?.spotNumber ?? rental.spotId,
        userId: rental.userId,
        plateNumber: rental.plateNumber,
        type: 'long-term',
        status: 'active',
        startTime: rental.startDate,
        endDate: rental.endDate,
        remainingMs,
        isPaid: rental.isPaid,
        waitingFee: 0,
        rentalDays: rental.rentalDays,
        isExpired,
        exitRequestedAt: rental.exitRequestedAt,
        currentDebt: overstayMinutes * 3,
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


router.post('/:id/extend', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const additionalMinutes: number = Number(req.body.additionalMinutes) || 30;

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.userId !== userId) return res.status(403).json({ error: 'Access denied' });

    const { calculateShortTermCost } = await import('../utils/pricing');
    const extendCost = calculateShortTermCost(additionalMinutes);

    const owner = await prisma.user.findUnique({ where: { id: userId } });
    if (!owner) return res.status(404).json({ error: 'User not found' });
    if (owner.walletBalance < extendCost) {
      return res.status(402).json({ error: `Недостаточно средств: нужно ${extendCost}₸, есть ${owner.walletBalance}₸` });
    }

    const newEndTime = new Date(new Date(booking.estimatedEndTime).getTime() + additionalMinutes * 60 * 1000);

    const [updatedBooking, updatedUser] = await prisma.$transaction([
      prisma.booking.update({
        where: { id },
        data: { estimatedEndTime: newEndTime, minutesExtended: { increment: additionalMinutes } },
      }),
      prisma.user.update({ where: { id: userId }, data: { walletBalance: { decrement: extendCost } } }),
      prisma.transaction.create({
        data: {
          userId, amount: -extendCost, type: 'PAYMENT',
          description: `Продление на ${additionalMinutes} мин: место ${booking.spotId}`,
          balanceBefore: owner.walletBalance, balanceAfter: owner.walletBalance - extendCost,
        },
      }),
    ]) as [typeof booking, typeof owner, unknown];

    // Remove old overstay/warning jobs before scheduling new ones
    await Promise.all([
      overstayQueue.getJob(`te-${id}`).then(j => j?.remove()).catch(() => {}),
      overstayQueue.getJob(`warn-${id}`).then(j => j?.remove()).catch(() => {}),
      overstayQueue.getJob(`os-${id}`).then(j => j?.remove()).catch(() => {}),
    ]);

    // Schedule new overstay jobs for the updated end time (use stable IDs so they can be removed again on next extension)
    const msToNewEnd = newEndTime.getTime() - Date.now();
    if (msToNewEnd > 5 * 60 * 1000) {
      await overstayQueue.add('time-ending', { bookingId: id, userId, spotId: booking.spotId, phase: 'time-ending' },
        { delay: msToNewEnd - 5 * 60 * 1000, jobId: `te-${id}` }).catch(() => {});
    }
    await overstayQueue.add('warn', { bookingId: id, userId, spotId: booking.spotId, phase: 'warn' },
      { delay: msToNewEnd, jobId: `warn-${id}` }).catch(() => {});
    await overstayQueue.add('overstay-start', { bookingId: id, userId, spotId: booking.spotId, phase: 'overstay-start' },
      { delay: msToNewEnd + 5 * 60 * 1000, jobId: `os-${id}` }).catch(() => {});

    const { io } = await import('../server');
    io.emit('booking-extended', {
      bookingId: updatedBooking.id,
      endTime: updatedBooking.estimatedEndTime,
      additionalMinutes,
    });

    res.json({
      booking: { ...updatedBooking, endTime: updatedBooking.estimatedEndTime },
      walletBalance: updatedUser.walletBalance,
      extendCost,
      newEndTime,
      message: `✅ Booking extended by ${additionalMinutes} minutes`,
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
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    // 100% refund if user cancels manually before arriving (waiting status)
    const refundAmount = (booking && !booking.arrivedAt && booking.totalCost && booking.totalCost > 0)
      ? booking.totalCost
      : 0;

    await prisma.$transaction([
      ...(booking ? [prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', actualEndTime: new Date() } })] : []),
      prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      }),
      ...(refundAmount > 0 && booking?.user ? [
        prisma.user.update({
          where: { id: userId },
          data: { walletBalance: { increment: refundAmount } },
        }),
        prisma.transaction.create({
          data: {
            userId,
            amount: refundAmount,
            type: 'REFUND',
            description: `Полный возврат: бронь отменена пользователем (${refundAmount}₸)`,
            balanceBefore: booking.user.walletBalance,
            balanceAfter: booking.user.walletBalance + refundAmount,
          },
        }),
      ] : []),
    ]);

    // Cancel the BullMQ no-show job so it doesn't fire and double-refund
    if (booking) {
      const noShowJob = await noShowQueue.getJob(`noshow-${booking.id}`);
      if (noShowJob) await noShowJob.remove().catch(() => {});
    }

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
    if (booking) io.emit('booking-cancelled', { bookingId: booking.id, spotNumber });

    res.json({ success: true, refundAmount, message: 'Booking cancelled' });
  } catch (error) {
    logger.error('❌ Error cancelling booking by spot:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});


// User presses "Finish Parking" (short-term) — charges overstay, marks exit intent, SPOT STAYS OCCUPIED
router.post('/finish-parking', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const now = new Date();

    const booking = await prisma.booking.findFirst({
      where: { userId, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!booking) {
      return res.status(404).json({ error: 'No active booking found' });
    }

    if (booking.exitRequestedAt) {
      return res.json({ overstayCharge: 0, newBalance: null, message: 'Already processing exit' });
    }

    // Overstay starts 5 min after estimatedEndTime (grace period)
    const OVERSTAY_GRACE_MS = 5 * 60 * 1000;
    const overstayStartMs = booking.estimatedEndTime.getTime() + OVERSTAY_GRACE_MS;
    let overstayCharge = 0;
    if (now.getTime() > overstayStartMs) {
      const overstayMs = now.getTime() - overstayStartMs;
      const overstayMinutes = Math.floor(overstayMs / 60000);
      overstayCharge = overstayMinutes * 3;
    }

    let newBalance: number | null = null;
    if (overstayCharge > 0) {
      const result = await paymentService.chargeWallet(
        userId, overstayCharge,
        `Овертайм при выезде: ${Math.floor(overstayCharge / 3)} мин × 3₸`,
        `Долг за превышение времени парковки (${Math.floor(overstayCharge / 3)} мин × 3₸)`,
      );
      newBalance = result.newBalance;
    }

    await prisma.booking.update({ where: { id: booking.id }, data: { exitRequestedAt: now } });

    sendPushToUser(
      userId,
      '🚗 Выезжайте в течение 7 минут',
      'Таймер запущен. Подъедьте к шлагбауму и выедьте. Если не выедете за 7 минут — штраф 900₸. ⚠️ Не нажимайте «Завершить», пока не находитесь у выезда!',
      { type: 'exit-grace-started' }
    ).catch(() => {});

    overstayQueue.add('check', {
      bookingId: booking.id, userId, spotId: booking.spotId, phase: 'fake-finish-check',
    }, { delay: 7 * 60 * 1000 }).catch(() => {});

    res.json({ overstayCharge, newBalance, message: '✅ Exit grace started' });
  } catch (error) {
    logger.error('❌ Error in finish-parking:', error);
    res.status(500).json({ error: 'Failed to finish parking' });
  }
});

// User presses "Завершить аренду" (long-term expired) — charges debt, sets exitRequestedAt
router.post('/finish-parking-longterm', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const now = new Date();

    const rental = await prisma.longTermRental.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!rental) {
      return res.status(404).json({ error: 'No active rental found' });
    }

    if (rental.exitRequestedAt) {
      return res.json({ debtCharged: 0, message: 'Already processing exit' });
    }

    const isExpired = rental.endDate < now;
    let debtCharged = 0;

    if (isExpired) {
      const overstayMs = now.getTime() - rental.endDate.getTime();
      const overstayMinutes = Math.floor(overstayMs / 60000);
      const debtAmount = overstayMinutes * 3;

      if (debtAmount > 0) {
        const result = await paymentService.chargeWallet(
          userId, debtAmount,
          `Долг за превышение аренды: ${overstayMinutes} мин × 3₸`,
          `Долг за превышение времени аренды (${overstayMinutes} мин × 3₸)`,
        );
        debtCharged = debtAmount;
        // If balance went negative, still allow exit (gate opens after this call)
        void result;
      }
    }

    await prisma.longTermRental.update({ where: { id: rental.id }, data: { exitRequestedAt: now } });

    sendPushToUser(
      userId,
      '✅ Долг оплачен',
      'Шлагбаум откроется автоматически при выезде. У вас 7 минут.',
      { type: 'lt-exit-ready' }
    ).catch(() => {});

    overstayQueue.add('check', {
      rentalId: rental.id, userId, spotId: rental.spotId, phase: 'fake-finish-check',
    }, { delay: 7 * 60 * 1000 }).catch(() => {});

    res.json({ debtCharged, message: '✅ Exit approved' });
  } catch (error) {
    logger.error('❌ Error in finish-parking-longterm:', error);
    res.status(500).json({ error: 'Failed to finish rental' });
  }
});

// Called after 7-min exit grace (or by LPR on physical exit) — frees the spot
router.post('/complete-exit', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const booking = await prisma.booking.findFirst({
      where: { userId, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!booking) {
      return res.status(404).json({ error: 'No active booking found' });
    }

    await prisma.$transaction([
      prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED', actualEndTime: new Date() } }),
      prisma.parkingSpot.update({
        where: { id: booking.spotId },
        data: { status: 'FREE', currentUserId: null, currentUserPlate: null },
      }),
    ]);

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotId: booking.spotId, status: 'FREE', carPlate: null });
    io.emit('booking-completed', { bookingId: booking.id, spotId: booking.spotId });

    res.json({ message: '✅ Exit complete' });
  } catch (error) {
    logger.error('❌ Error in complete-exit:', error);
    res.status(500).json({ error: 'Failed to complete exit' });
  }
});


router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const [bookings, rentals] = await Promise.all([
      prisma.booking.findMany({
        where: { userId, status: { in: ['COMPLETED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.longTermRental.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const spotIds = [...new Set([
      ...bookings.map(b => b.spotId),
      ...rentals.map(r => r.spotId),
    ])];
    const spots = await prisma.parkingSpot.findMany({
      where: { id: { in: spotIds } },
      select: { id: true, spotNumber: true },
    });
    const spotMap = Object.fromEntries(spots.map(s => [s.id, s.spotNumber]));

    const shortTermItems = bookings.map(b => ({
      id: b.id,
      spotId: spotMap[b.spotId] ?? b.spotId,
      plateNumber: b.plateNumber,
      status: b.status,
      startTime: b.startTime,
      totalCost: b.totalCost,
      type: 'short-term',
    }));

    const longTermItems = rentals.map(r => ({
      id: r.id,
      spotId: spotMap[r.spotId] ?? r.spotId,
      plateNumber: r.plateNumber,
      status: r.status === 'ACTIVE' ? 'ACTIVE' : r.status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED',
      startTime: r.startDate,
      totalCost: r.totalCost,
      type: 'long-term',
      rentalDays: r.rentalDays,
      endDate: r.endDate,
    }));

    const all = [...shortTermItems, ...longTermItems]
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    res.json(all);
  } catch (error) {
    logger.error('❌ Error fetching booking history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ─── OCR helper ────────────────────────────────────────────
// Проверяет что на фото виден номер места (например "07" или "SP-07")
async function runOCR(photoUrl: string, spotId: string): Promise<'CONFIRMED' | 'WRONG_SPOT' | null> {
  const ocrUrl = process.env.OCR_SERVICE_URL;
  if (!ocrUrl) return null; // OCR не настроен — ручная проверка

  try {
    const res = await fetch(`${ocrUrl}/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
      body: JSON.stringify({ image: photoUrl, spot: spotId }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;

    const data = await res.json() as { spot_found?: boolean; matched_text?: string | null; texts?: {text: string}[] };

    logger.info(`🔍 OCR: spot="${spotId}" found=${data.spot_found} matched="${data.matched_text}"`);

    if (data.spot_found) return 'CONFIRMED';

    // Если нашли ДРУГОЙ номер места — WRONG_SPOT
    // Ищем паттерны вида "SP01", "02", "03" в текстах
    const spotDigits = spotId.replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
    const otherSpotFound = data.texts?.some(t => {
      const n = t.text.replace(/^0+/, '') || '0';
      return n !== spotDigits && /^\d{1,2}$/.test(n) && parseInt(n) >= 1 && parseInt(n) <= 50;
    });

    if (otherSpotFound) return 'WRONG_SPOT';

    // Номер места не найден вообще — оставляем на ручную проверку
    return null;
  } catch {
    logger.warn('⚠️  OCR service unavailable, falling back to manual review');
    return null;
  }
}

// ─── PHOTO UPLOAD ──────────────────────────────────────────
router.post('/:id/photo', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const { photoUrl } = req.body;

    if (!photoUrl) return res.status(400).json({ error: 'photoUrl is required' });

    // Загружаем фото в Cloudinary (если настроен), иначе сохраняем base64
    let storedUrl = photoUrl;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        storedUrl = await uploadPhotoToCloudinary(photoUrl, 'qpark/photos');
        logger.info(`📸 Фото загружено в Cloudinary: ${storedUrl}`);
      } catch (err) {
        logger.warn('⚠️ Cloudinary недоступен, сохраняем base64');
      }
    }

    let booking = await prisma.booking.findFirst({
      where: { id, userId },
    });

    // Fallback: если ID фейковый — ищем любое незавершённое бронирование пользователя
    if (!booking) {
      booking = await prisma.booking.findFirst({
        where: { userId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!booking) {
      const rental = await prisma.longTermRental.findFirst({ where: { id, userId } })
        ?? await prisma.longTermRental.findFirst({
          where: { userId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        });
      if (!rental) return res.status(404).json({ error: 'Booking not found' });

      const ocrStatus = await runOCR(storedUrl, rental.spotId);
      const finalStatus = ocrStatus ?? 'UPLOADED';

      const updated = await prisma.longTermRental.update({
        where: { id: rental.id },   // используем реальный ID из БД
        data: { photoUrl: storedUrl, photoUploadedAt: new Date(), photoStatus: finalStatus },
      });
      return res.json({ success: true, photoStatus: updated.photoStatus, autoVerified: !!ocrStatus });
    }

    const photoTimerStart = booking.photoTimerStart ?? new Date();
    const elapsed = (Date.now() - photoTimerStart.getTime()) / 1000 / 60;
    if (elapsed > 7) return res.status(400).json({ error: 'Photo upload time expired (7 minutes)' });

    // Запускаем OCR параллельно с сохранением в БД
    const [, ocrStatus] = await Promise.all([
      prisma.booking.update({
        where: { id },
        data: { photoUrl: storedUrl, photoUploadedAt: new Date(), photoStatus: 'UPLOADED' },
      }),
      runOCR(storedUrl, booking.spotId),
    ]);

    const finalStatus = ocrStatus ?? 'UPLOADED';

    // Обновляем статус если OCR дал результат
    if (ocrStatus) {
      await prisma.booking.update({
        where: { id },
        data: { photoStatus: finalStatus },
      });
    }

    const { io } = await import('../server');
    if (finalStatus === 'CONFIRMED') {
      io.emit('photo-confirmed',   { bookingId: id, spotId: booking.spotId, autoVerified: true });
    } else if (finalStatus === 'WRONG_SPOT') {
      io.emit('photo-wrong-spot',  { bookingId: id, spotId: booking.spotId, autoVerified: true });

      // Штраф 900₸ за неправильное место
      await paymentService.chargeWallet(userId, 900, 'Штраф 900₸: неправильное место парковки', 'Штраф: припаркован не на своём месте');
    } else {
      io.emit('photo-uploaded', { bookingId: id, spotId: booking.spotId });
    }

    res.json({ success: true, photoStatus: finalStatus, autoVerified: !!ocrStatus });
  } catch (error) {
    logger.error('❌ Error uploading photo:', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});


// ─── PHOTO CONFIRM (admin) ─────────────────────────────────
router.post('/:id/photo/confirm', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type = 'booking' } = req.body;

    if (type === 'rental') {
      await prisma.longTermRental.update({
        where: { id },
        data: { photoStatus: 'CONFIRMED' },
      });
    } else {
      await prisma.booking.update({
        where: { id },
        data: { photoStatus: 'CONFIRMED' },
      });
    }

    const { io } = await import('../server');
    io.emit('photo-confirmed', { bookingId: id, type });

    res.json({ success: true });
  } catch (error) {
    logger.error('❌ Error confirming photo:', error);
    res.status(500).json({ error: 'Failed to confirm photo' });
  }
});


// ─── PHOTO WRONG SPOT (admin) ──────────────────────────────
router.post('/:id/photo/wrong-spot', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type = 'booking' } = req.body;

    let userId: string;

    if (type === 'rental') {
      const rental = await prisma.longTermRental.update({
        where: { id },
        data: { photoStatus: 'WRONG_SPOT' },
      });
      userId = rental.userId;
    } else {
      const booking = await prisma.booking.update({
        where: { id },
        data: { photoStatus: 'WRONG_SPOT' },
      });
      userId = booking.userId;
    }

    // Fine 900₸
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await prisma.user.update({
        where: { id: userId },
        data: { walletBalance: user.walletBalance - 900 },
      });
      await prisma.transaction.create({
        data: {
          userId,
          amount: -900,
          type: 'PAYMENT',
          description: 'Штраф за неправильное место (900₸)',
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance - 900,
        },
      });
    }

    const { io } = await import('../server');
    io.emit('photo-wrong-spot', { bookingId: id, userId, type });

    res.json({ success: true, fine: 900 });
  } catch (error) {
    logger.error('❌ Error processing wrong spot:', error);
    res.status(500).json({ error: 'Failed to process wrong spot' });
  }
});


// ─── PENDING PHOTOS (admin) ────────────────────────────────
router.get('/admin/pending-photos', async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { photoStatus: 'UPLOADED' },
      include: { spot: true, user: true },
      orderBy: { photoUploadedAt: 'asc' },
    });
    const rentals = await prisma.longTermRental.findMany({
      where: { photoStatus: 'UPLOADED' },
      include: { spot: true, user: true },
      orderBy: { photoUploadedAt: 'asc' },
    });

    const result = [
      ...bookings.map(b => ({
        id: b.id, type: 'booking', photoUrl: b.photoUrl,
        photoUploadedAt: b.photoUploadedAt, spotNumber: b.spot.spotNumber,
        plateNumber: b.plateNumber, userId: b.userId,
        userName: b.user?.firstName ?? b.user?.phoneNumber ?? '—',
      })),
      ...rentals.map(r => ({
        id: r.id, type: 'rental', photoUrl: r.photoUrl,
        photoUploadedAt: r.photoUploadedAt, spotNumber: r.spot.spotNumber,
        plateNumber: r.plateNumber, userId: r.userId,
        userName: r.user?.firstName ?? r.user?.phoneNumber ?? '—',
      })),
    ].sort((a, b) => new Date(a.photoUploadedAt!).getTime() - new Date(b.photoUploadedAt!).getTime());

    res.json(result);
  } catch (error) {
    logger.error('❌ Error fetching pending photos:', error);
    res.status(500).json({ error: 'Failed to fetch pending photos' });
  }
});

export default router;
