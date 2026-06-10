import { Router, Request, Response } from 'express';
import parkingService from '../services/parking.service';
import paymentService from '../services/payment.service';
import { calculateShortTermCost, getLongTermPrice, calculateCashback } from '../utils/pricing';
import { logger } from '../server';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { noShowQueue, rentalExpiryQueue, overstayQueue, longTermNoShowQueue } from '../jobs/queues';
import { sendPushToUser } from '../utils/notifications';

const router = Router();

// Schedules (or reschedules) all overstay/warning BullMQ jobs for a short-term booking.
// Always removes existing jobs first so old timers don't accumulate.
async function scheduleBookingTimerJobs(bookingId: string, userId: string, spotId: string, endTime: Date) {
  await Promise.all([
    overstayQueue.getJob(`te-${bookingId}`).then(j => j?.remove()).catch(() => {}),
    overstayQueue.getJob(`warn-${bookingId}`).then(j => j?.remove()).catch(() => {}),
    overstayQueue.getJob(`os-${bookingId}`).then(j => j?.remove()).catch(() => {}),
  ]);
  const jobBase = { bookingId, userId, spotId };
  const msToEnd = Math.max(0, endTime.getTime() - Date.now());
  if (msToEnd > 5 * 60 * 1000) {
    await overstayQueue.add('time-ending', { ...jobBase, phase: 'time-ending' },
      { delay: msToEnd - 5 * 60 * 1000, jobId: `te-${bookingId}` }).catch(() => {});
  }
  await overstayQueue.add('warn', { ...jobBase, phase: 'warn' },
    { delay: msToEnd, jobId: `warn-${bookingId}` }).catch(() => {});
  await overstayQueue.add('overstay-start', { ...jobBase, phase: 'overstay-start' },
    { delay: msToEnd + 5 * 60 * 1000, jobId: `os-${bookingId}` }).catch(() => {});
}

const CYR_TO_LAT: Record<string, string> = {
  'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','У':'Y','Х':'X',
  'а':'A','в':'B','е':'E','к':'K','м':'M','н':'H','о':'O','р':'P','с':'C','т':'T','у':'Y','х':'X',
};
const normalizePlate = (p: string) =>
  p.toUpperCase().replace(/\s/g, '').split('').map(c => CYR_TO_LAT[c] ?? c).join('');


router.get('/spots', async (req: Request, res: Response) => {
  try {
    const spots = await parkingService.getAllSpots();


    const createTable = (spotsList: any[], type: string) => {
      const table = [];
      const statusIcons = {
        'FREE': '🟢',
        'BOOKED': '🟡',
        'OCCUPIED': '🔴',
        'RESERVED': '🟠',
        'RESERVING': '🟡',
        'REPAIR': '🔧'
      };

      const statusText = {
        'FREE': 'Свободно',
        'BOOKED': 'Забронировано',
        'OCCUPIED': 'Занято',
        'RESERVED': 'Резерв',
        'RESERVING': 'Резервируется',
        'REPAIR': 'Ремонт'
      };

      for (let i = 0; i < spotsList.length; i += 5) {
        const row = [];
        for (let j = 0; j < 5 && i + j < spotsList.length; j++) {
          const spot = spotsList[i + j];
          row.push({
            spotNumber: spot.spotNumber,
            icon: statusIcons[spot.status as keyof typeof statusIcons] || '⚪',
            status: spot.status,
            carPlate: spot.currentUserPlate || null,
            currentUserId: spot.currentUserId || null,
            type: type
          });
        }
        table.push(row);
      }
      return table;
    };

    const allSorted = spots.slice().sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));

    // All spots are UNIVERSAL — keep backward-compatible structure for admin dashboard
    // by putting all spots into shortTerm and leaving longTerm empty
    const allTable = createTable(allSorted, 'UNIVERSAL');
    const emptyTable: ReturnType<typeof createTable> = [];

    const freeCount     = spots.filter(s => s.status === 'FREE').length;
    const bookedCount   = spots.filter(s => s.status === 'BOOKED' || s.status === 'RESERVING').length;
    const occupiedCount = spots.filter(s => s.status === 'OCCUPIED').length;
    const repairCount   = spots.filter(s => s.status === 'REPAIR').length;

    const result = {
      title: '🚗 Парковка QPark - Текущий статус',
      lastUpdated: new Date().toLocaleString('ru-RU'),
      legend: {
        'FREE': 'Свободно',
        'BOOKED': 'Забронировано',
        'OCCUPIED': 'Занято',
        'RESERVED': 'Резерв',
        'REPAIR': 'Ремонт'
      },
      statistics: {
        total: spots.length,
        free: freeCount,
        booked: bookedCount,
        occupied: occupiedCount,
        repair: repairCount,
        // legacy fields expected by admin dashboard
        shortTerm: { total: spots.length, free: freeCount, booked: bookedCount, occupied: occupiedCount, repair: repairCount },
        longTerm:  { total: 0, free: 0, booked: 0, occupied: 0, repair: 0 },
      },
      tables: {
        // legacy keys expected by admin dashboard
        shortTerm: { title: '🅿️ Парковка QPark', table: allTable },
        longTerm:  { title: '', table: emptyTable },
        universal: { title: '🅿️ Универсальная парковка', table: allTable },
      }
    };

    res.json(result);
  } catch (error) {
    logger.error('❌ Error fetching spots:', error);
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});


router.get('/spots/available', async (req: Request, res: Response) => {
  try {
    const spots = await parkingService.getAvailableSpots();
    res.json(spots);
  } catch (error) {
    logger.error('❌ Error fetching available spots:', error);
    res.status(500).json({ error: 'Failed to fetch available spots' });
  }
});



router.post('/lpr/entry', async (req: Request, res: Response) => {
  try {
    const { carPlate, spotNumber } = req.body;
    if (!carPlate || !spotNumber) {
      return res.status(400).json({ error: 'carPlate and spotNumber are required' });
    }

    const { io } = await import('../server');

    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });

    if (!spot) {
      io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: 'Место не найдено' });
      return res.status(404).json({ success: false, message: 'Spot not found' });
    }


    const plateMatches = spot.currentUserPlate
      ? normalizePlate(spot.currentUserPlate) === normalizePlate(carPlate)
      : true;

    let success = false;
    let newStatus: 'OCCUPIED' | null = null;

    if (spot.status === 'BOOKED') {

      if (plateMatches) {
        newStatus = 'OCCUPIED';
        success = true;
      } else {
        io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: `Номер не совпадает с бронью` });
        return res.json({ success: false, message: 'Plate does not match booking' });
      }
    } else if (spot.status === 'RESERVED' || (spot.status === 'OCCUPIED' && spot.currentUserId)) {
      // Long-term rental: spot is RESERVED (parked away) or OCCUPIED (currently parked)
      // Check by active rental regardless of spot.type (spot may be SHORT_TERM type)
      const rental = await prisma.longTermRental.findFirst({
        where: { spotId: spot.id, status: 'ACTIVE' },
      });

      if (!rental) {
        io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: `Место ${spot.status} — аренда не найдена` });
        return res.json({ success: false, message: `Spot is ${spot.status} — no active rental` });
      }

      if (normalizePlate(rental.plateNumber) !== normalizePlate(carPlate)) {
        io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: 'Номер не совпадает с арендой' });
        return res.json({ success: false, message: 'Plate does not match rental' });
      }

      // /lpr/entry is always entry — use endpoint name, not spot status
      const toggledStatus = 'OCCUPIED';
      const eventType = 'entry';

      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: toggledStatus, currentUserPlate: carPlate },
      });

      if (!rental.arrivedAt) {
        await prisma.longTermRental.update({
          where: { id: rental.id },
          data: { arrivedAt: new Date() },
        });
        // User arrived within 30 min — cancel the no-show job (Rule 3)
        const ltNoShowJob = await longTermNoShowQueue.getJob(`ltnoshow-${rental.id}`);
        if (ltNoShowJob) await ltNoShowJob.remove().catch(() => {});
      }

      io.emit('lpr-gate-open', { carPlate, spotNumber, type: eventType });
      io.emit('spot-status-changed', { spotNumber, status: toggledStatus, carPlate });
      logger.info(`✅ LPR long-term ${eventType}: ${carPlate} → ${spotNumber} → ${toggledStatus}`);
      return res.json({ success: true, message: `Gate opened (${eventType})`, newStatus: toggledStatus });

    } else {
      io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: `Место ${spot.status} — бронь не найдена` });
      return res.json({ success: false, message: `Spot is ${spot.status}` });
    }

    if (success && newStatus) {
      const now = new Date();
      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: newStatus, currentUserPlate: carPlate },
      });

      
      const activeBooking = await prisma.booking.findFirst({
        where: { spotId: spot.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      });
      if (activeBooking) {
        if (activeBooking.arrivedAt) {
          // Already arrived — just re-broadcast existing state, don't recalculate
          const bookedMins = activeBooking.bookedMinutes + (activeBooking.minutesExtended ?? 0);
          io.emit('booking-updated', { bookingId: activeBooking.id, endTime: activeBooking.estimatedEndTime, arrivedAt: activeBooking.arrivedAt, bookedMinutes: bookedMins });
        } else {
          // First arrival: set arrivedAt and recalculate endTime from original bookedMinutes
          const bookedMins = activeBooking.bookedMinutes + (activeBooking.minutesExtended ?? 0);
          const newEstimatedEnd = new Date(now.getTime() + 7 * 60 * 1000 + bookedMins * 60 * 1000);
          await prisma.booking.update({
            where: { id: activeBooking.id },
            data: { arrivedAt: now, photoTimerStart: now, photoStatus: 'PENDING', estimatedEndTime: newEstimatedEnd },
          });
          io.emit('booking-updated', { bookingId: activeBooking.id, endTime: newEstimatedEnd, arrivedAt: now, bookedMinutes: bookedMins });
          await scheduleBookingTimerJobs(activeBooking.id, activeBooking.userId, spot.id, newEstimatedEnd);
        }
      }

      io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'entry' });
      io.emit('spot-status-changed', { spotNumber, status: newStatus, carPlate });
      logger.info(`✅ LPR entry: ${carPlate} → ${spotNumber} (${spot.type})`);
      return res.json({ success: true, message: 'Gate opened' });
    }

    res.json({ success: false, message: 'Access denied' });
  } catch (error) {
    logger.error('❌ Error handling LPR entry:', error);
    res.status(500).json({ error: 'Failed to process entry' });
  }
});


router.post('/lpr/exit-lpr', async (req: Request, res: Response) => {
  try {
    const { carPlate, spotNumber } = req.body;
    if (!carPlate || !spotNumber) {
      return res.status(400).json({ error: 'carPlate and spotNumber are required' });
    }

    const { io } = await import('../server');

    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) {
      return res.status(404).json({ success: false, message: 'Spot not found' });
    }

    // Check for active long-term rental first (spot type may be SHORT_TERM even for long-term tenants)
    const activeRental = await prisma.longTermRental.findFirst({
      where: { spotId: spot.id, status: 'ACTIVE' },
    });

    if (activeRental) {
      if (normalizePlate(activeRental.plateNumber) !== normalizePlate(carPlate)) {
        io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: 'Номер не совпадает с арендой' });
        return res.json({ success: false, message: 'Plate does not match rental' });
      }

      const now = new Date();
      const isExpired = activeRental.endDate < now;
      const carIsInside = spot.status === 'OCCUPIED';

      // Rental expired and user hasn't paid debt in app → block gate
      if (isExpired && !activeRental.exitRequestedAt) {
        io.emit('lpr-gate-denied', {
          carPlate, spotNumber,
          reason: 'Аренда истекла — откройте приложение, нажмите «Завершить аренду» и оплатите долг',
        });
        logger.warn(`⛔ LPR long-term exit blocked — debt unpaid: ${carPlate} at ${spotNumber}`);
        return res.json({ success: false, message: 'Rental expired — pay debt in app first' });
      }

      // Final exit: rental expired and debt was paid (exitRequestedAt set) → complete rental, free spot
      if (isExpired && activeRental.exitRequestedAt && carIsInside) {
        await prisma.$transaction([
          prisma.longTermRental.update({ where: { id: activeRental.id }, data: { status: 'COMPLETED' } }),
          prisma.parkingSpot.update({
            where: { spotNumber },
            data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
          }),
        ]);
        io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
        io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
        io.emit('parking-exit-confirmed', { userId: activeRental.userId, rentalId: activeRental.id });
        logger.info(`✅ LPR long-term final exit: ${carPlate} from ${spotNumber} → FREE`);
        return res.json({ success: true, message: 'Gate opened, rental completed', newStatus: 'FREE' });
      }

      // Active rental: /lpr/exit-lpr is always exit
      const toggledStatus = 'RESERVED';

      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: toggledStatus, currentUserPlate: carPlate, currentUserId: spot.currentUserId },
      });
      io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
      io.emit('spot-status-changed', { spotNumber, status: toggledStatus, carPlate });
      logger.info(`✅ LPR long-term exit: ${carPlate} → ${spotNumber} → ${toggledStatus}`);
      return res.json({ success: true, message: 'Gate opened (exit)', newStatus: toggledStatus });
    }

    // Short-term booking exit: all spots are universal, check for a booking
    const paidBooking = await prisma.booking.findFirst({
      where: {
        spotId: spot.id,
        status: { in: ['COMPLETED', 'CONFIRMED', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (paidBooking) {
      const plateOk = paidBooking.plateNumber
        ? normalizePlate(paidBooking.plateNumber) === normalizePlate(carPlate)
        : true;

      const spotPlateOk = spot.currentUserPlate
        ? normalizePlate(spot.currentUserPlate) === normalizePlate(carPlate)
        : false;

      if (!plateOk && !spotPlateOk) {
        io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: 'Номер не совпадает с бронью' });
        logger.warn(`⛔ LPR exit denied (plate mismatch): ${carPlate} vs ${paidBooking.plateNumber} at ${spotNumber}`);
        return res.json({ success: false, message: 'Plate does not match booking' });
      }

      const actualEnd = new Date();
      if (paidBooking.status !== 'COMPLETED') {
        await prisma.booking.update({
          where: { id: paidBooking.id },
          data: { status: 'COMPLETED', actualEndTime: actualEnd },
        });
      }

      // User already settled via "Finish Parking" — no additional charge on LPR exit
      if (paidBooking.exitRequestedAt) {
        const bonusPrePaid = calculateCashback(paidBooking.totalCost ?? 0);
        const ownerId = paidBooking.userId;
        await prisma.$transaction([
          prisma.booking.update({ where: { id: paidBooking.id }, data: { status: 'COMPLETED', actualEndTime: new Date() } }),
          prisma.parkingSpot.update({ where: { spotNumber }, data: { status: 'FREE', currentUserPlate: null, currentUserId: null } }),
          ...(bonusPrePaid > 0 ? [
            prisma.user.update({ where: { id: ownerId }, data: { bonusPoints: { increment: bonusPrePaid } } }),
            prisma.transaction.create({ data: { userId: ownerId, amount: bonusPrePaid, type: 'CASHBACK', description: `Кэшбэк 1% за поездку`, balanceBefore: 0, balanceAfter: 0 } }),
          ] : []),
        ]);
        io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
        io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
        io.emit('parking-exit-confirmed', { userId: paidBooking.userId, bookingId: paidBooking.id });
        logger.info(`✅ LPR exit (overstay pre-paid): ${carPlate} from ${spotNumber}, +${bonusPrePaid} bonus pts`);
        return res.json({ success: true, message: 'Gate opened, exit complete' });
      }

      // Charge overstay: 3₸/min after 5-min grace past estimatedEndTime
      const OVERSTAY_GRACE_MS = 5 * 60 * 1000;
      const overstayMs = Math.max(0, actualEnd.getTime() - paidBooking.estimatedEndTime.getTime() - OVERSTAY_GRACE_MS);
      const overstayMinutes = Math.floor(overstayMs / 60000);
      if (overstayMinutes > 0) {
        const overstayCost = overstayMinutes * 3;
        const result = await paymentService.chargeWallet(
          paidBooking.userId, overstayCost,
          `Овертайм: ${overstayMinutes} мин × 3₸`,
          `Долг за превышение времени парковки (${overstayMinutes} мин × 3₸)`,
        );
        io.emit('overstay-charged', { userId: paidBooking.userId, minutes: overstayMinutes, cost: overstayCost });
        logger.info(`💸 Overstay charge: ${paidBooking.userId}, ${overstayMinutes} min, -${overstayCost}₸ → balance ${result.newBalance}₸`);
      }

      const bonusEarned = calculateCashback(paidBooking.totalCost ?? 0);
      await prisma.$transaction([
        prisma.parkingSpot.update({ where: { spotNumber }, data: { status: 'FREE', currentUserPlate: null, currentUserId: null } }),
        ...(bonusEarned > 0 ? [
          prisma.user.update({ where: { id: paidBooking.userId }, data: { bonusPoints: { increment: bonusEarned } } }),
          prisma.transaction.create({ data: { userId: paidBooking.userId, amount: bonusEarned, type: 'CASHBACK', description: `Кэшбэк 1% за поездку`, balanceBefore: 0, balanceAfter: 0 } }),
        ] : []),
      ]);
      io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
      io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
      logger.info(`✅ LPR exit (paid): ${carPlate} from ${spotNumber} → FREE, +${bonusEarned} bonus pts`);
      return res.json({ success: true, message: 'Gate opened', newStatus: 'FREE' });
    }

    const unpaidBooking = await prisma.booking.findFirst({
      where: { spotId: spot.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });

    const reason = unpaidBooking
      ? 'Оплатите парковку в приложении перед выездом'
      : 'Активная бронь не найдена';

    io.emit('lpr-gate-denied', { carPlate, spotNumber, reason });
    logger.warn(`⛔ LPR exit denied (unpaid): ${carPlate} at ${spotNumber}`);
    res.json({ success: false, message: reason });
  } catch (error) {
    logger.error('❌ Error handling LPR exit:', error);
    res.status(500).json({ error: 'Failed to process exit' });
  }
});



router.post('/lpr/scan', async (req: Request, res: Response) => {
  try {
    const { carPlate } = req.body;
    if (!carPlate) {
      return res.status(400).json({ error: 'carPlate is required' });
    }

    const { io } = await import('../server');
    const normPlate = normalizePlate(carPlate);

    
    const occupiedSpots = await prisma.parkingSpot.findMany({
      where: { status: 'OCCUPIED', currentUserPlate: { not: null } },
    });
    const occupiedSpot = occupiedSpots.find(s => s.currentUserPlate && normalizePlate(s.currentUserPlate) === normPlate);

    if (occupiedSpot) {
      const spotNumber = occupiedSpot.spotNumber;

      // If there is an active long-term rental the spot goes RESERVED (tenant may return);
      // otherwise it is a short-term booking and the spot goes FREE.
      const scanRental = await prisma.longTermRental.findFirst({
        where: { spotId: occupiedSpot.id, status: 'ACTIVE' },
      });

      let newStatus: string;
      if (scanRental) {
        newStatus = 'RESERVED';
        await prisma.parkingSpot.update({
          where: { spotNumber },
          data: { status: 'RESERVED' },
        });
      } else {
        newStatus = 'FREE';
        // Complete the active short-term booking on exit
        const exitBooking = await prisma.booking.findFirst({
          where: { spotId: occupiedSpot.id, status: { in: ['PENDING', 'CONFIRMED'] } },
          orderBy: { createdAt: 'desc' },
        });
        await prisma.parkingSpot.update({
          where: { spotNumber },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        });
        if (exitBooking) {
          await prisma.booking.update({
            where: { id: exitBooking.id },
            data: { status: 'COMPLETED', actualEndTime: new Date() },
          });
          io.emit('parking-exit-confirmed', { userId: exitBooking.userId, bookingId: exitBooking.id });
        }
      }

      io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
      io.emit('spot-status-changed', { spotNumber, status: newStatus, carPlate: newStatus === 'FREE' ? null : carPlate });
      logger.info(`✅ LPR scan EXIT: ${carPlate} from ${spotNumber} → ${newStatus}`);
      return res.json({ success: true, direction: 'exit', message: `Выезд разрешён (${spotNumber})`, newStatus, spotNumber });
    }

    
    const bookedSpots = await prisma.parkingSpot.findMany({
      where: { status: { in: ['BOOKED', 'RESERVED'] }, currentUserPlate: { not: null } },
    });
    const bookedSpot = bookedSpots.find(s => s.currentUserPlate && normalizePlate(s.currentUserPlate) === normPlate);

    if (bookedSpot) {
      const spotNumber = bookedSpot.spotNumber;
      const now = new Date();

      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: 'OCCUPIED' },
      });

      // Mirror lpr/entry: update arrivedAt, recalculate endTime, schedule notifications
      const scanBooking = await prisma.booking.findFirst({
        where: { spotId: bookedSpot.id, status: { in: ['PENDING', 'CONFIRMED'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (scanBooking) {
        if (scanBooking.arrivedAt) {
          const bookedMins = scanBooking.bookedMinutes + (scanBooking.minutesExtended ?? 0);
          io.emit('booking-updated', { bookingId: scanBooking.id, endTime: scanBooking.estimatedEndTime, arrivedAt: scanBooking.arrivedAt, bookedMinutes: bookedMins });
        } else {
          const bookedMins = scanBooking.bookedMinutes + (scanBooking.minutesExtended ?? 0);
          const newEstimatedEnd = new Date(now.getTime() + 7 * 60 * 1000 + bookedMins * 60 * 1000);
          await prisma.booking.update({
            where: { id: scanBooking.id },
            data: { arrivedAt: now, photoTimerStart: now, photoStatus: 'PENDING', estimatedEndTime: newEstimatedEnd },
          });
          io.emit('booking-updated', { bookingId: scanBooking.id, endTime: newEstimatedEnd, arrivedAt: now, bookedMinutes: bookedMins });
          await scheduleBookingTimerJobs(scanBooking.id, scanBooking.userId, bookedSpot.id, newEstimatedEnd);
        }
      }

      io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'entry' });
      io.emit('spot-status-changed', { spotNumber, status: 'OCCUPIED', carPlate });
      logger.info(`✅ LPR scan ENTRY: ${carPlate} → ${spotNumber} OCCUPIED`);
      return res.json({ success: true, direction: 'entry', message: `Въезд разрешён (${spotNumber})`, newStatus: 'OCCUPIED', spotNumber });
    }

    
    io.emit('lpr-gate-denied', { carPlate, spotNumber: '?', reason: 'Бронь не найдена' });
    logger.warn(`⛔ LPR scan denied: ${carPlate} — no booking found`);
    return res.json({ success: false, message: 'Бронь не найдена. Забронируйте место в приложении.' });

  } catch (error) {
    logger.error('❌ Error handling LPR scan:', error);
    res.status(500).json({ error: 'Failed to process scan' });
  }
});


router.post('/simulate-entry', async (req: Request, res: Response) => {
  try {
    const { spotNumber, carPlate } = req.body;

    if (!spotNumber || !carPlate) {
      return res.status(400).json({
        error: 'spotNumber and carPlate are required',
        example: { spotNumber: "SP-02", carPlate: "KZ777ABC01" }
      });
    }

    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });

    await prisma.parkingSpot.update({
      where: { spotNumber },
      data: { status: 'OCCUPIED', currentUserPlate: carPlate },
    });

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber, status: 'OCCUPIED', carPlate });

    // Mirror real LPR entry: update booking arrivedAt, recalculate endTime, schedule notifications
    const activeBooking = await prisma.booking.findFirst({
      where: { spotId: spot.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (activeBooking) {
      const { io: simIo } = await import('../server');
      const now = new Date();
      if (activeBooking.arrivedAt) {
        const bookedMins = activeBooking.bookedMinutes + (activeBooking.minutesExtended ?? 0);
        simIo.emit('booking-updated', { bookingId: activeBooking.id, endTime: activeBooking.estimatedEndTime, arrivedAt: activeBooking.arrivedAt, bookedMinutes: bookedMins });
        logger.info(`⏩ Simulate entry: booking ${activeBooking.id} already arrived, re-broadcast only`);
      } else {
        const bookedMins = activeBooking.bookedMinutes + (activeBooking.minutesExtended ?? 0);
        const newEstimatedEnd = new Date(now.getTime() + 7 * 60 * 1000 + bookedMins * 60 * 1000);
        await prisma.booking.update({
          where: { id: activeBooking.id },
          data: { arrivedAt: now, photoTimerStart: now, photoStatus: 'PENDING', estimatedEndTime: newEstimatedEnd },
        });
        simIo.emit('booking-updated', { bookingId: activeBooking.id, endTime: newEstimatedEnd, arrivedAt: now, bookedMinutes: bookedMins });
        await scheduleBookingTimerJobs(activeBooking.id, activeBooking.userId, spot.id, newEstimatedEnd);
        logger.info(`✅ Simulate entry: updated booking ${activeBooking.id}, newEndTime=${newEstimatedEnd.toISOString()}`);
      }
    }

    res.json({ success: true, message: `Car ${carPlate} entered spot ${spotNumber}` });
  } catch (error) {
    logger.error('❌ Error simulating entry:', error);
    res.status(500).json({ error: 'Failed to simulate entry' });
  }
});


router.post('/simulate-exit', async (req: Request, res: Response) => {
  try {
    const { spotNumber, carPlate } = req.body;

    if (!spotNumber || !carPlate) {
      return res.status(400).json({
        error: 'spotNumber and carPlate are required',
        example: { spotNumber: "SP-02", carPlate: "KZ777ABC01" }
      });
    }

    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });

    // Complete booking and free spot (mirrors LPR exit logic)
    const activeBooking = await prisma.booking.findFirst({
      where: { spotId: spot.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
    });

    const { io } = await import('../server');
    const actualEnd = new Date();

    if (activeBooking) {
      // Charge overstay only if user didn't already pay via "Finish Parking"
      if (!activeBooking.exitRequestedAt) {
        const SIM_GRACE_MS = 5 * 60 * 1000;
        const overstayMs = Math.max(0, actualEnd.getTime() - activeBooking.estimatedEndTime.getTime() - SIM_GRACE_MS);
        const overstayMinutes = Math.floor(overstayMs / 60000);
        if (overstayMinutes > 0) {
          const overstayCost = overstayMinutes * 3;
          const result = await paymentService.chargeWallet(
            activeBooking.userId, overstayCost,
            `Овертайм (симуляция): ${overstayMinutes} мин × 3₸`,
            `Долг за превышение времени парковки (${overstayMinutes} мин × 3₸)`,
          );
          io.emit('overstay-charged', { userId: activeBooking.userId, minutes: overstayMinutes, cost: overstayCost });
          logger.info(`💸 Simulate overstay: ${activeBooking.userId}, ${overstayMinutes} min → balance ${result.newBalance}₸`);
        }
      }

      await prisma.booking.update({
        where: { id: activeBooking.id },
        data: { status: 'COMPLETED', actualEndTime: actualEnd },
      });
    }

    await prisma.parkingSpot.update({
      where: { spotNumber },
      data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
    });

    io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
    if (activeBooking) {
      io.emit('parking-exit-confirmed', { userId: activeBooking.userId, bookingId: activeBooking.id });
    }

    res.json({ success: true, message: `Car ${carPlate} exited spot ${spotNumber}` });
  } catch (error) {
    logger.error('❌ Error simulating exit:', error);
    res.status(500).json({ error: 'Failed to simulate exit' });
  }
});


router.post('/set-status', async (req: Request, res: Response) => {
  try {
    const { spotNumber, status, carPlate, userId: bodyUserId, rentalDays } = req.body;


    let userId = bodyUserId;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const secret = process.env.JWT_SECRET || 'your-secret-key';
        const decoded = jwt.verify(authHeader.slice(7), secret) as { userId: string };
        if (decoded.userId) userId = decoded.userId;
      } catch {  }
    }

    if (!spotNumber || !status) {
      return res.status(400).json({ error: 'spotNumber and status are required' });
    }

    const validStatuses = ['FREE', 'BOOKED', 'OCCUPIED', 'RESERVED', 'REPAIR'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Short-term booking: single transaction with SELECT FOR UPDATE NOWAIT
    // This is the race condition fix — spot lock held from check to commit
    if (status === 'BOOKED' && userId) {
      const minutes = Number(req.body.estimatedMinutes) || 60;
      const discount = Number(req.body.promoDiscount) || 0;
      const bonusSpend = Number(req.body.bonusDiscount) || 0;

      try {
        const txResult = await prisma.$transaction(async (tx) => {
          // Lock spot row — NOWAIT fails immediately if another transaction holds the lock
          const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
            SELECT id, status FROM "parking_spots" WHERE "spotNumber" = ${spotNumber} FOR UPDATE NOWAIT
          `;
          const lockedSpot = rows[0];
          if (!lockedSpot) throw new Error('Spot not found');
          if (lockedSpot.status !== 'FREE') throw new Error('Spot just taken');

          const userRecord = await tx.user.findUnique({ where: { id: userId } });
          if (!userRecord) throw new Error('User not found');

          const actualBonus = Math.min(bonusSpend, userRecord.bonusPoints);
          const cost = Math.max(0, calculateShortTermCost(minutes) - discount - actualBonus);
          if (cost > 0 && userRecord.walletBalance < cost) {
            throw new Error(`Insufficient balance: need ${cost}₸, have ${userRecord.walletBalance}₸`);
          }

          const txNow = new Date();
          const estimated = new Date(txNow.getTime() + minutes * 60 * 1000);

          const spotUpdated = await tx.parkingSpot.update({
            where: { spotNumber },
            data: { status: 'BOOKED', currentUserPlate: carPlate ?? undefined, currentUserId: userId },
          });

          const booking = await tx.booking.create({
            data: {
              userId, spotId: lockedSpot.id, plateNumber: carPlate,
              startTime: txNow, estimatedEndTime: estimated, bookedMinutes: minutes,
              status: 'CONFIRMED', isPaid: true, totalCost: cost,
            },
          });

          if (cost > 0 || actualBonus > 0) {
            await tx.transaction.create({
              data: {
                userId, amount: -(cost), type: 'PAYMENT',
                description: `Краткосрочная парковка ${spotNumber}, ${minutes} мин${actualBonus > 0 ? ` (бонусы: ${actualBonus}₸)` : ''}`,
                balanceBefore: userRecord.walletBalance,
                balanceAfter: userRecord.walletBalance - cost,
              },
            });
            await tx.user.update({
              where: { id: userId },
              data: {
                walletBalance: { decrement: cost },
                ...(actualBonus > 0 ? { bonusPoints: { decrement: actualBonus } } : {}),
              },
            });
          }

          const newBal = cost > 0
            ? userRecord.walletBalance - cost
            : userRecord.walletBalance;

          return { booking, spotUpdated, newBalance: newBal, now: txNow, estimated };
        }, { timeout: 15000 });

        // BullMQ jobs outside the transaction
        noShowQueue.add('no-show-check', { bookingId: txResult.booking.id },
          { delay: 30 * 60 * 1000, jobId: `noshow-${txResult.booking.id}` }).catch(() => {});

        const msToEnd = txResult.estimated.getTime() - txResult.now.getTime();
        const jobBase = { bookingId: txResult.booking.id, userId, spotId: txResult.spotUpdated.id };
        if (msToEnd > 5 * 60 * 1000) {
          overstayQueue.add('time-ending', { ...jobBase, phase: 'time-ending' },
            { delay: msToEnd - 5 * 60 * 1000, jobId: `te-${txResult.booking.id}` }).catch(() => {});
        }
        overstayQueue.add('warn', { ...jobBase, phase: 'warn' },
          { delay: msToEnd, jobId: `warn-${txResult.booking.id}` }).catch(() => {});
        overstayQueue.add('overstay-start', { ...jobBase, phase: 'overstay-start' },
          { delay: msToEnd + 5 * 60 * 1000, jobId: `os-${txResult.booking.id}` }).catch(() => {});

        logger.info(`✅ Short-term booking: ${userId}, ${spotNumber}, -${txResult.booking.totalCost}₸`);

        const { io } = await import('../server');
        io.emit('spot-status-changed', { spotNumber, status: 'BOOKED', carPlate: txResult.spotUpdated.currentUserPlate ?? null });

        return res.status(201).json({
          success: true,
          spot: { spotNumber: txResult.spotUpdated.spotNumber, status: txResult.spotUpdated.status },
          booking: txResult.booking,
          newBalance: txResult.newBalance,
        });

      } catch (error: any) {
        const msg: string = error?.message ?? 'Booking failed';
        const causeMsg: string = error?.cause?.message ?? '';
        if (msg === 'Spot just taken' || msg.includes('could not obtain lock') || causeMsg.includes('could not obtain lock') || error?.code === 'P2034') {
          return res.status(409).json({ error: 'Spot just taken' });
        }
        if (msg.startsWith('Insufficient') || msg.startsWith('Debt:')) {
          return res.status(400).json({ error: msg });
        }
        logger.error('❌ Booking failed (set-status):', error);
        return res.status(500).json({ error: msg });
      }
    }

    const updatedSpot = await prisma.parkingSpot.update({
      where: { spotNumber },
      data: {
        status,
        currentUserPlate: status === 'FREE' ? null : (carPlate ?? undefined),
        currentUserId: status === 'FREE' ? null : (userId ?? undefined),
      },
    });

    let bookingRecord: any = null;
    let newBalance: number | undefined;

    if (status === 'RESERVED' && userId && carPlate && rentalDays) {
      try {
        const totalCost = getLongTermPrice(Number(rentalDays));


        const payment = await paymentService.payLongTermRental(userId, spotNumber, Number(rentalDays), totalCost);
        newBalance = payment?.walletBalance;

        const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
        if (spot) {
          const now = new Date();
          const endDate = new Date(now.getTime() + Number(rentalDays) * 24 * 60 * 60 * 1000);
          const rental = await prisma.longTermRental.create({
            data: {
              userId,
              spotId: spot.id,
              plateNumber: carPlate,
              rentalDays: Number(rentalDays),
              totalCost,
              startDate: now,
              endDate,
              isPaid: true,
              status: 'ACTIVE',
            },
          });
          // Attach rentalId to the payment transaction
          if (payment?.transactionId) {
            await prisma.transaction.update({
              where: { id: payment.transactionId },
              data: { rentalId: rental.id },
            });
          }
          // Schedule auto-expiry job — fire-and-forget so it doesn't block the response
          rentalExpiryQueue.add(
            'rental-expiry',
            { rentalId: rental.id },
            { delay: endDate.getTime() - Date.now(), jobId: `expiry-${rental.id}` },
          ).catch(err => logger.warn('⚠️ Could not schedule expiry job:', err));
          // Schedule overstay warning exactly at rental endDate (no grace period)
          const rentalOverstayDelay = Math.max(0, endDate.getTime() - Date.now());
          overstayQueue.add('check', { rentalId: rental.id, userId, spotId: spot.id, phase: 'warn' }, { delay: rentalOverstayDelay }).catch(() => {});
          // Schedule early expiry warning: 30 min before for 1-day, 1 day before for 3+ days
          const earlyWarningMs = Number(rentalDays) === 1
            ? endDate.getTime() - 30 * 60 * 1000
            : endDate.getTime() - 24 * 60 * 60 * 1000;
          const earlyWarningDelay = earlyWarningMs - Date.now();
          if (earlyWarningDelay > 0) {
            overstayQueue.add('check', { rentalId: rental.id, userId, spotId: spot.id, phase: 'lt-near-expiry', rentalDays: Number(rentalDays) }, { delay: earlyWarningDelay }).catch(() => {});
          }
          bookingRecord = { ...rental, _type: 'rental' };
        }
      } catch (e) {
        logger.warn('⚠️ Could not process long-term rental payment:', e);
        return res.status(400).json({ error: e instanceof Error ? e.message : 'Payment failed' });
      }
    }

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber, status, carPlate: updatedSpot.currentUserPlate ?? null });

    res.json({
      success: true,
      spot: { spotNumber: updatedSpot.spotNumber, status: updatedSpot.status },
      ...(bookingRecord ? { booking: bookingRecord } : {}),
      ...(newBalance !== undefined ? { newBalance } : {}),
    });
  } catch (error) {
    logger.error('❌ Error setting spot status:', error);
    res.status(500).json({ error: 'Failed to set spot status' });
  }
});


router.get('/spot-status/:spotNumber', async (req: Request, res: Response) => {
  try {
    const spot = await prisma.parkingSpot.findUnique({
      where: { spotNumber: req.params.spotNumber },
      select: { spotNumber: true, status: true, type: true, currentUserPlate: true },
    });
    if (!spot) return res.status(404).json({ error: 'Spot not found' });
    res.json(spot);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch spot status' });
  }
});


// Location prefix map: locationId → { prefix, shortTermCount, longTermCount }
const LOCATION_CONFIG: Record<number, { prefix: string; short: number; long: number }> = {
  1:  { prefix: 'SP',  short: 15, long: 15 },  // 30 — Улы Дала
  2:  { prefix: 'P2',  short: 13, long: 12 },  // 25 — Сыганак
  3:  { prefix: 'P3',  short: 10, long: 10 },  // 20 — Кабанбай батыр
  4:  { prefix: 'P4',  short: 10, long:  9 },  // 19 — Туран
  5:  { prefix: 'P5',  short: 12, long: 10 },  // 22 — пр. Республики
  6:  { prefix: 'P6',  short:  7, long:  7 },  // 14 — Достык
  7:  { prefix: 'P7',  short:  9, long:  8 },  // 17 — Сарыарка
  8:  { prefix: 'P8',  short:  8, long:  8 },  // 16 — Бейбітшілік
  9:  { prefix: 'P9',  short: 11, long: 10 },  // 21 — Иманов
  10: { prefix: 'P10', short:  9, long:  9 },  // 18 — Хан Шатыр
  11: { prefix: 'P11', short: 10, long: 10 },  // 20 — Мәңгілік Ел
  12: { prefix: 'P12', short:  8, long:  8 },  // 16 — EXPO
  13: { prefix: 'P13', short:  9, long:  9 },  // 18 — Туран
  14: { prefix: 'P14', short:  7, long:  7 },  // 14 — Байтерек
  15: { prefix: 'P15', short:  9, long:  9 },  // 18 — ЖК Нурсай
  16: { prefix: 'P16', short:  9, long:  8 },  // 17 — ЖК Байтерек
  17: { prefix: 'P17', short:  8, long:  7 },  // 15 — ЖК Авиатор
  18: { prefix: 'P18', short:  8, long:  8 },  // 16 — ЖК Думан
  19: { prefix: 'P19', short:  9, long:  8 },  // 17 — ЖК Комфорт
};

async function ensureLocationSpots(locationId: number) {
  const cfg = LOCATION_CONFIG[locationId];
  if (!cfg) return;
  const existing = await prisma.parkingSpot.findFirst({ where: { spotNumber: { startsWith: cfg.prefix + '-' } } });
  if (existing) return; // already created
  const spots = [];
  for (let i = 1; i <= cfg.short + cfg.long; i++) {
    spots.push({ spotNumber: `${cfg.prefix}-${String(i).padStart(2, '0')}`, type: 'UNIVERSAL' as const, status: 'FREE' as const });
  }
  await prisma.parkingSpot.createMany({ data: spots, skipDuplicates: true });
  logger.info(`✅ Auto-created ${spots.length} spots for location ${locationId} (prefix: ${cfg.prefix})`);
}

router.get('/spots/simple', async (req: Request, res: Response) => {
  try {
    const locationId = req.query.locationId ? Number(req.query.locationId) : null;

    // Auto-create spots for this location if they don't exist yet
    if (locationId && LOCATION_CONFIG[locationId]) {
      await ensureLocationSpots(locationId);
    }

    const allSpots = await parkingService.getAllSpots();
    const filtered = locationId && LOCATION_CONFIG[locationId]
      ? allSpots.filter(s => s.spotNumber.startsWith(LOCATION_CONFIG[locationId!].prefix + '-'))
      : allSpots;

    const simpleSpots = filtered.map(s => ({
      spotNumber: s.spotNumber,
      type: s.type,
      status: s.status,
      carPlate: s.currentUserPlate || null,
    }));
    res.json(simpleSpots);
  } catch (error) {
    logger.error('❌ Error fetching spots:', error);
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});


router.get('/spots/text', async (req: Request, res: Response) => {
  try {
    const spots = await parkingService.getAllSpots();
    const allSortedSpots = spots.slice().sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));

    const statusIcons = {
      'FREE': '🟢',
      'BOOKED': '🟡',
      'OCCUPIED': '🔴',
      'RESERVED': '🟠',
      'REPAIR': '🔧'
    };

    let textOutput = '\n🚗 ПАРКОВКА QPARK - ТЕКУЩИЙ СТАТУС\n';
    textOutput += '='.repeat(50) + '\n\n';

    textOutput += '📍 ЛЕГЕНДА:\n';
    Object.entries(statusIcons).forEach(([status, icon]) => {
      const statusText: Record<string, string> = {
        'FREE': 'Свободно', 'BOOKED': 'Забронировано',
        'OCCUPIED': 'Занято', 'RESERVED': 'Резерв', 'REPAIR': 'Ремонт',
      };
      textOutput += `   ${icon} ${statusText[status]}\n`;
    });
    textOutput += '\n';

    textOutput += '🅿️ УНИВЕРСАЛЬНАЯ ПАРКОВКА (тип брони выбирает водитель):\n';
    textOutput += '-'.repeat(40) + '\n';

    for (let i = 0; i < allSortedSpots.length; i += 5) {
      textOutput += '   ';
      for (let j = 0; j < 5 && i + j < allSortedSpots.length; j++) {
        const spot = allSortedSpots[i + j];
        const icon = statusIcons[spot.status as keyof typeof statusIcons] || '⚪';
        textOutput += `${icon} ${spot.spotNumber.padEnd(8)}`;
      }
      textOutput += '\n';
    }
    textOutput += '\n';


    const stats = {
      totalFree: spots.filter(s => s.status === 'FREE').length,
      totalBooked: spots.filter(s => s.status === 'BOOKED').length,
      totalOccupied: spots.filter(s => s.status === 'OCCUPIED').length,
      totalRepair: spots.filter(s => s.status === 'REPAIR').length
    };

    textOutput += '📊 СТАТИСТИКА:\n';
    textOutput += '=' .repeat(30) + '\n';
    textOutput += `   🟢 Свободно:     ${stats.totalFree}\n`;
    textOutput += `   🟡 Забронировано: ${stats.totalBooked}\n`;
    textOutput += `   🔴 Занято:       ${stats.totalOccupied}\n`;
    textOutput += `   🔧 На ремонте:   ${stats.totalRepair}\n`;
    textOutput += '\n';
    textOutput += `🕐 Обновлено: ${new Date().toLocaleString('ru-RU')}\n`;

    res.json({
      title: '🚗 Парковка QPark - Текущий статус',
      textTable: textOutput,
      lastUpdated: new Date().toLocaleString('ru-RU')
    });
  } catch (error) {
    logger.error('❌ Error generating text table:', error);
    res.status(500).json({ error: 'Failed to generate text table' });
  }
});



router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await parkingService.getParkingStats();
    res.json(stats);
  } catch (error) {
    logger.error('❌ Error fetching parking stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});


router.post('/initialize', async (req: Request, res: Response) => {
  try {
    await parkingService.initializeParkingSpots();
    res.json({ message: 'Parking spots initialized successfully' });
  } catch (error) {
    logger.error('❌ Error initializing parking spots:', error);
    res.status(500).json({ error: 'Failed to initialize spots' });
  }
});


router.get('/spots/:spotNumber', async (req: Request, res: Response) => {
  try {
    const { spotNumber } = req.params;
    const spot = await parkingService.getSpotByNumber(spotNumber);

    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }

    res.json(spot);
  } catch (error) {
    logger.error('❌ Error fetching spot:', error);
    res.status(500).json({ error: 'Failed to fetch spot' });
  }
});

export default router;
