import { Router, Request, Response } from 'express';
import parkingService from '../services/parking.service';
import paymentService from '../services/payment.service';
import { calculateShortTermCost, getLongTermPrice } from '../utils/pricing';
import { logger } from '../server';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { rentalExpiryQueue, overstayQueue } from '../jobs/queues';
import { sendPushToUser } from '../utils/notifications';

const router = Router();


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
        'REPAIR': '🔧'
      };

      const statusText = {
        'FREE': 'Свободно',
        'BOOKED': 'Забронировано',
        'OCCUPIED': 'Занято',
        'RESERVED': 'Резерв',
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
    const bookedCount   = spots.filter(s => s.status === 'BOOKED').length;
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

      const isExiting = spot.status === 'OCCUPIED';
      const toggledStatus = isExiting ? 'RESERVED' : 'OCCUPIED';
      const eventType = isExiting ? 'exit' : 'entry';

      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: toggledStatus, currentUserPlate: carPlate },
      });

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
        // Recalculate estimatedEndTime from actual arrival time:
        // estimatedEndTime = arrivedAt + 7 min grace + originally booked duration
        const bookedMs = activeBooking.estimatedEndTime.getTime() - activeBooking.startTime.getTime();
        const newEstimatedEnd = new Date(now.getTime() + 7 * 60 * 1000 + bookedMs);
        await prisma.booking.update({
          where: { id: activeBooking.id },
          data: { arrivedAt: now, photoTimerStart: now, photoStatus: 'PENDING', estimatedEndTime: newEstimatedEnd },
        });
        // Notify frontend of corrected endTime
        io.emit('booking-updated', { bookingId: activeBooking.id, endTime: newEstimatedEnd });
        // "5 min left" push at endTime - 5 min
        const fiveMinWarningDelay = newEstimatedEnd.getTime() - Date.now() - 5 * 60 * 1000;
        if (fiveMinWarningDelay > 0) {
          overstayQueue.add('check', { bookingId: activeBooking.id, userId: activeBooking.userId, spotId: spot.id, phase: 'time-ending' }, { delay: fiveMinWarningDelay }).catch(() => {});
        }
        // Overstay warn push immediately when time expires (not +7 min anymore)
        const warnDelay = Math.max(0, newEstimatedEnd.getTime() - Date.now());
        overstayQueue.add('check', { bookingId: activeBooking.id, userId: activeBooking.userId, spotId: spot.id, phase: 'warn' }, { delay: warnDelay }).catch(() => {});
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

      // Charge overstay: 3₸/min after 12 min past rental endDate
      const actualEnd = new Date();
      const overstayStart = new Date(activeRental.endDate.getTime() + 12 * 60 * 1000);
      const overstayMs = Math.max(0, actualEnd.getTime() - overstayStart.getTime());
      const overstayMinutes = Math.floor(overstayMs / 60000);
      if (overstayMinutes > 0) {
        const overstayCost = overstayMinutes * 3;
        const owner = await prisma.user.findUnique({ where: { id: activeRental.userId } });
        if (owner) {
          const charged = Math.min(overstayCost, owner.walletBalance);
          await Promise.all([
            prisma.user.update({ where: { id: owner.id }, data: { walletBalance: { decrement: charged } } }),
            prisma.transaction.create({
              data: {
                userId: owner.id, amount: -charged, type: 'PAYMENT',
                description: `Овертайм: ${overstayMinutes} мин × 3₸`,
                balanceBefore: owner.walletBalance,
                balanceAfter: owner.walletBalance - charged,
              },
            }),
          ]);
          io.emit('overstay-charged', { userId: owner.id, minutes: overstayMinutes, cost: charged });
          logger.info(`💸 Long-term overstay: ${owner.id}, ${overstayMinutes} min, -${charged}₸`);
        }
      }

      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: 'RESERVED', currentUserPlate: carPlate, currentUserId: spot.currentUserId },
      });
      io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
      io.emit('spot-status-changed', { spotNumber, status: 'RESERVED', carPlate });
      logger.info(`✅ LPR long-term exit: ${carPlate} from ${spotNumber} → RESERVED`);
      return res.json({ success: true, message: 'Gate opened for exit', newStatus: 'RESERVED' });
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

      // If user already paid overstay via "Finish Parking" button, skip charging again
      if (paidBooking.exitRequestedAt) {
        await prisma.$transaction([
          prisma.booking.update({ where: { id: paidBooking.id }, data: { status: 'COMPLETED', actualEndTime: new Date() } }),
          prisma.parkingSpot.update({ where: { spotNumber }, data: { status: 'FREE', currentUserPlate: null, currentUserId: null } }),
        ]);
        io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
        io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
        io.emit('parking-exit-confirmed', { userId: paidBooking.userId, bookingId: paidBooking.id });
        logger.info(`✅ LPR exit (overstay pre-paid): ${carPlate} from ${spotNumber}`);
        return res.json({ success: true, message: 'Gate opened, exit complete' });
      }

      // Charge overstay: 3₸/min after 5 min past estimatedEndTime
      const overstayStart = new Date(paidBooking.estimatedEndTime.getTime() + 5 * 60 * 1000);
      const overstayMs = Math.max(0, actualEnd.getTime() - overstayStart.getTime());
      const overstayMinutes = Math.floor(overstayMs / 60000);
      if (overstayMinutes > 0) {
        const overstayCost = overstayMinutes * 3;
        const owner = await prisma.user.findUnique({ where: { id: paidBooking.userId } });
        if (owner) {
          const charged = Math.min(overstayCost, owner.walletBalance);
          await Promise.all([
            prisma.user.update({ where: { id: owner.id }, data: { walletBalance: { decrement: charged } } }),
            prisma.transaction.create({
              data: {
                userId: owner.id, amount: -charged, type: 'PAYMENT',
                description: `Овертайм: ${overstayMinutes} мин × 3₸`,
                balanceBefore: owner.walletBalance,
                balanceAfter: owner.walletBalance - charged,
              },
            }),
          ]);
          io.emit('overstay-charged', { userId: owner.id, minutes: overstayMinutes, cost: charged });
          logger.info(`💸 Overstay charge: ${owner.id}, ${overstayMinutes} min, -${charged}₸`);
        }
      }

      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      });
      io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
      io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });
      logger.info(`✅ LPR exit (paid): ${carPlate} from ${spotNumber} → FREE`);
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
        await prisma.parkingSpot.update({
          where: { spotNumber },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        });
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
      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: { status: 'OCCUPIED' },
      });

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
      const now = new Date();
      const bookedMs = activeBooking.estimatedEndTime.getTime() - activeBooking.startTime.getTime();
      const newEstimatedEnd = new Date(now.getTime() + 7 * 60 * 1000 + bookedMs);
      await prisma.booking.update({
        where: { id: activeBooking.id },
        data: { arrivedAt: now, photoTimerStart: now, photoStatus: 'PENDING', estimatedEndTime: newEstimatedEnd },
      });
      io.emit('booking-updated', { bookingId: activeBooking.id, endTime: newEstimatedEnd });
      const fiveMinDelay = newEstimatedEnd.getTime() - Date.now() - 5 * 60 * 1000;
      if (fiveMinDelay > 0) {
        overstayQueue.add('check', { bookingId: activeBooking.id, userId: activeBooking.userId, spotId: spot.id, phase: 'time-ending' }, { delay: fiveMinDelay }).catch(() => {});
      }
      const warnDelay = Math.max(0, newEstimatedEnd.getTime() - Date.now());
      overstayQueue.add('check', { bookingId: activeBooking.id, userId: activeBooking.userId, spotId: spot.id, phase: 'warn' }, { delay: warnDelay }).catch(() => {});
      logger.info(`✅ Simulate entry: updated booking ${activeBooking.id}, newEndTime=${newEstimatedEnd.toISOString()}`);
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

    await prisma.parkingSpot.update({
      where: { spotNumber },
      data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
    });

    if (activeBooking) {
      await prisma.booking.update({
        where: { id: activeBooking.id },
        data: { status: 'COMPLETED', actualEndTime: new Date() },
      });
    }

    const { io } = await import('../server');
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

    if (status === 'BOOKED' && userId) {
      const minutes = Number(req.body.estimatedMinutes) || 60;
      const discount = Number(req.body.promoDiscount) || 0;
      const bonusSpend = Number(req.body.bonusDiscount) || 0;
      const userRecord = await prisma.user.findUnique({ where: { id: userId } });
      if (!userRecord) return res.status(404).json({ error: 'User not found' });
      const actualBonus = Math.min(bonusSpend, userRecord.bonusPoints);
      const cost = Math.max(0, calculateShortTermCost(minutes) - discount - actualBonus);
      if (cost > 0 && userRecord.walletBalance < cost) {
        return res.status(400).json({
          error: `Insufficient balance: need ${cost}₸, have ${userRecord.walletBalance}₸`,
        });
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

    if (status === 'BOOKED' && userId) {
      const minutes = Number(req.body.estimatedMinutes) || 60;
      const discount = Number(req.body.promoDiscount) || 0;
      const bonusSpend = Number(req.body.bonusDiscount) || 0;
      try {
        const now = new Date();
        const estimated = new Date(now.getTime() + minutes * 60 * 1000);
        const userRecord = await prisma.user.findUnique({ where: { id: userId } });
        if (!userRecord) throw new Error('User not found');
        const actualBonus = Math.min(bonusSpend, userRecord.bonusPoints);
        const cost = Math.max(0, calculateShortTermCost(minutes) - discount - actualBonus);
        if (cost > 0 && userRecord.walletBalance < cost) {
          throw new Error(`Insufficient balance: need ${cost}₸, have ${userRecord.walletBalance}₸`);
        }
        if (cost > 0 || actualBonus > 0) {
          const [booking, , updatedUser] = await prisma.$transaction([
            prisma.booking.create({
              data: {
                userId, spotId: updatedSpot.id, plateNumber: carPlate,
                startTime: now, estimatedEndTime: estimated,
                status: 'CONFIRMED', isPaid: true, totalCost: cost + actualBonus,
              },
            }),
            prisma.transaction.create({
              data: {
                userId, amount: -(cost + actualBonus), type: 'PAYMENT',
                description: `Краткосрочная парковка ${spotNumber}, ${minutes} мин${actualBonus > 0 ? ` (бонусы: ${actualBonus}₸)` : ''}`,
                balanceBefore: userRecord.walletBalance,
                balanceAfter: userRecord.walletBalance - cost,
              },
            }),
            prisma.user.update({
              where: { id: userId },
              data: {
                walletBalance: { decrement: cost },
                ...(actualBonus > 0 ? { bonusPoints: { decrement: actualBonus } } : {}),
              },
            }),
          ]);
          bookingRecord = booking;
          newBalance = updatedUser.walletBalance;
          // Notification jobs scheduled at arrival time (simulate-entry / lpr/entry), not here
          logger.info(`✅ Short-term booking paid: ${userId}, ${spotNumber}, -${cost}₸ wallet + ${actualBonus} bonus pts`);
        } else {
          const booking = await prisma.booking.create({
            data: {
              userId, spotId: updatedSpot.id, plateNumber: carPlate,
              startTime: now, estimatedEndTime: estimated,
              status: 'CONFIRMED', isPaid: true, totalCost: 0,
            },
          });
          bookingRecord = booking;
          newBalance = userRecord.walletBalance;
          // Notification jobs scheduled at arrival time (simulate-entry / lpr/entry), not here
          logger.info(`✅ Short-term booking (free/promo/bonus): ${userId}, ${spotNumber}`);
        }
      } catch (e) {
        logger.error('❌ Booking payment failed:', e);
        await prisma.parkingSpot.update({
          where: { spotNumber },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }).catch(() => {});
        return res.status(400).json({ error: e instanceof Error ? e.message : 'Booking failed' });
      }
    }

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
          // Schedule overstay warning 7 min after rental endDate
          const rentalOverstayDelay = endDate.getTime() - Date.now() + 7 * 60 * 1000;
          overstayQueue.add('check', { rentalId: rental.id, userId, spotId: spot.id, phase: 'warn' }, { delay: Math.max(rentalOverstayDelay, 0) }).catch(() => {});
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
