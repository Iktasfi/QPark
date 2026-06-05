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

    // Cancel no-show short-term bookings: PENDING, older than 30 min,
    // and user has NOT arrived yet (arrivedAt is null)
    await prisma.booking.updateMany({
      where: {
        userId,
        status: 'PENDING',
        startTime: { lt: expiredCutoff },
        arrivedAt: null,
      },
      data: { status: 'CANCELLED' },
    });

    // Short-term: active booking (PENDING = waiting to arrive, CONFIRMED = arrived)
    const booking = await prisma.booking.findFirst({
      where: { userId, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });

    const bookingSpot = booking
      ? await prisma.parkingSpot.findUnique({ where: { id: booking.spotId } })
      : null;

    if (booking) {
      return res.json({
        id: booking.id,
        spotId: bookingSpot?.spotNumber ?? booking.spotId,
        userId: booking.userId,
        plateNumber: booking.plateNumber,
        type: 'short-term',
        status: 'active',
        startTime: booking.startTime,
        estimatedEndTime: booking.estimatedEndTime,
        arrivedAt: booking.arrivedAt,
        isPaid: booking.isPaid,
        waitingFee: 0,
      });
    }

    // Long-term: active rental — show until endDate passes or user explicitly cancels
    const rental = await prisma.longTermRental.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        endDate: { gt: now }, // only if the period hasn't expired
      },
      orderBy: { createdAt: 'desc' },
      include: { spot: true },
    });

    if (rental) {
      const remainingMs = rental.endDate.getTime() - now.getTime();
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
      await prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { decrement: 900 } },
      });
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
