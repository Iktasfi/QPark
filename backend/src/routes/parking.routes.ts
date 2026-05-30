import { Router, Request, Response } from 'express';
import parkingService from '../services/parking.service';
import paymentService from '../services/payment.service';
import { calculateShortTermCost } from '../utils/pricing';
import { logger } from '../server';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

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
            carPlate: spot.currentUserPlate || '-',
            type: type
          });
        }
        table.push(row);
      }
      return table;
    };

    const shortTermSpots = spots.filter(s => s.type === 'SHORT_TERM').sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));
    const longTermSpots = spots.filter(s => s.type === 'LONG_TERM').sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));

    const shortTermTable = createTable(shortTermSpots, 'SHORT_TERM');
    const longTermTable = createTable(longTermSpots, 'LONG_TERM');


    const stats = {
      total: spots.length,
      shortTerm: {
        total: shortTermSpots.length,
        free: shortTermSpots.filter(s => s.status === 'FREE').length,
        booked: shortTermSpots.filter(s => s.status === 'BOOKED').length,
        occupied: shortTermSpots.filter(s => s.status === 'OCCUPIED').length,
        repair: shortTermSpots.filter(s => s.status === 'REPAIR').length
      },
      longTerm: {
        total: longTermSpots.length,
        free: longTermSpots.filter(s => s.status === 'FREE').length,
        booked: longTermSpots.filter(s => s.status === 'BOOKED').length,
        occupied: longTermSpots.filter(s => s.status === 'OCCUPIED').length,
        repair: longTermSpots.filter(s => s.status === 'REPAIR').length
      }
    };

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
      statistics: stats,
      tables: {
        shortTerm: {
          title: '🅿️ Краткосрочная парковка',
          table: shortTermTable
        },
        longTerm: {
          title: '🅿️ Долгосрочная парковка',
          table: longTermTable
        }
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
    const { type = 'SHORT_TERM' } = req.query;
    const spots = await parkingService.getAvailableSpots(type as 'SHORT_TERM' | 'LONG_TERM');
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
    } else if ((spot.status === 'RESERVED' || spot.status === 'OCCUPIED') && spot.type === 'LONG_TERM') {

      if (!plateMatches) {
        io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: 'Номер не совпадает с арендой' });
        return res.json({ success: false, message: 'Plate does not match rental' });
      }



      const isExiting = spot.status === 'OCCUPIED';
      const toggledStatus = isExiting ? 'RESERVED' : 'OCCUPIED';
      const eventType = isExiting ? 'exit' : 'entry';

      await prisma.parkingSpot.update({
        where: { spotNumber },
        data: {
          status: toggledStatus,
          currentUserPlate: carPlate,
        },
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
        await prisma.booking.update({
          where: { id: activeBooking.id },
          data: { arrivedAt: now, photoTimerStart: now, photoStatus: 'PENDING' },
        });
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

    if (spot.type === 'SHORT_TERM') {

      
      const paidBooking = await prisma.booking.findFirst({
        where: {
          spotId: spot.id,
          isPaid: true,
          status: { in: ['COMPLETED', 'CONFIRMED', 'PENDING'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (paidBooking) {
        const plateOk = paidBooking.plateNumber
          ? normalizePlate(paidBooking.plateNumber) === normalizePlate(carPlate)
          : true;

        if (!plateOk) {
          io.emit('lpr-gate-denied', { carPlate, spotNumber, reason: 'Номер не совпадает с оплаченной бронью' });
          logger.warn(`⛔ LPR exit denied (plate mismatch): ${carPlate} vs ${paidBooking.plateNumber} at ${spotNumber}`);
          return res.json({ success: false, message: 'Plate does not match paid booking' });
        }

        if (paidBooking.status !== 'COMPLETED') {
          await prisma.booking.update({
            where: { id: paidBooking.id },
            data: { status: 'COMPLETED', actualEndTime: new Date() },
          });
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
      return res.json({ success: false, message: reason });
    }


    await prisma.parkingSpot.update({
      where: { spotNumber },
      data: { status: 'RESERVED', currentUserPlate: spot.currentUserPlate, currentUserId: spot.currentUserId },
    });

    io.emit('lpr-gate-open', { carPlate, spotNumber, type: 'exit' });
    io.emit('spot-status-changed', { spotNumber, status: 'RESERVED', carPlate });

    logger.info(`✅ LPR exit: ${carPlate} from ${spotNumber} → RESERVED`);
    res.json({ success: true, message: 'Gate opened for exit', newStatus: 'RESERVED' });
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
      let newStatus: string;

      if (occupiedSpot.type === 'LONG_TERM') {
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

    await prisma.parkingSpot.update({
      where: { spotNumber },
      data: { status: 'OCCUPIED', currentUserPlate: carPlate },
    });

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber, status: 'OCCUPIED', carPlate });

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

    await prisma.parkingSpot.update({
      where: { spotNumber },
      data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
    });

    const { io } = await import('../server');
    io.emit('spot-status-changed', { spotNumber, status: 'FREE', carPlate: null });

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

    if (status === 'BOOKED' && userId && carPlate) {
      const minutes = Number(req.body.estimatedMinutes) || 60;
      const discount = Number(req.body.promoDiscount) || 0;
      const cost = Math.max(0, calculateShortTermCost(minutes) - discount);
      if (cost > 0) {
        const userRecord = await prisma.user.findUnique({ where: { id: userId } });
        if (!userRecord) return res.status(404).json({ error: 'User not found' });
        if (userRecord.walletBalance < cost) {
          return res.status(400).json({
            error: `Insufficient balance: need ${cost}₸, have ${userRecord.walletBalance}₸`,
          });
        }
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

    if (status === 'BOOKED' && userId && carPlate) {
      const minutes = Number(req.body.estimatedMinutes) || 60;
      const discount = Number(req.body.promoDiscount) || 0;
      const cost = Math.max(0, calculateShortTermCost(minutes) - discount);
      try {
        const now = new Date();
        const estimated = new Date(now.getTime() + minutes * 60 * 1000);
        const userRecord = await prisma.user.findUnique({ where: { id: userId } });
        if (!userRecord) throw new Error('User not found');
        if (cost > 0 && userRecord.walletBalance < cost) {
          throw new Error(`Insufficient balance: need ${cost}₸, have ${userRecord.walletBalance}₸`);
        }
        if (cost > 0) {
          const [booking, , updatedUser] = await prisma.$transaction([
            prisma.booking.create({
              data: {
                userId, spotId: updatedSpot.id, plateNumber: carPlate,
                startTime: now, estimatedEndTime: estimated,
                status: 'CONFIRMED', isPaid: true, totalCost: cost,
              },
            }),
            prisma.transaction.create({
              data: {
                userId, amount: -cost, type: 'PAYMENT',
                description: `Краткосрочная парковка ${spotNumber}, ${minutes} мин`,
                balanceBefore: userRecord.walletBalance,
                balanceAfter: userRecord.walletBalance - cost,
              },
            }),
            prisma.user.update({
              where: { id: userId },
              data: { walletBalance: { decrement: cost } },
            }),
          ]);
          bookingRecord = booking;
          newBalance = updatedUser.walletBalance;
          logger.info(`✅ Short-term booking paid: ${userId}, ${spotNumber}, -${cost}₸, balance→${updatedUser.walletBalance}₸`);
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
          logger.info(`✅ Short-term booking (free/promo): ${userId}, ${spotNumber}`);
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
        const priceMap: Record<number, number> = { 1: 700, 3: 1800, 5: 2700, 7: 3500, 14: 6000 };
        const totalCost = priceMap[Number(rentalDays)] ?? Number(rentalDays) * 700;


        const payment = await paymentService.payLongTermRental(userId, spotNumber, Number(rentalDays), totalCost);
        newBalance = payment?.walletBalance;

        const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
        if (spot) {
          const now = new Date();
          const endDate = new Date(now.getTime() + Number(rentalDays) * 24 * 60 * 60 * 1000);
          await prisma.longTermRental.create({
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


router.get('/spots/simple', async (req: Request, res: Response) => {
  try {
    const spots = await parkingService.getAllSpots();
    const simpleSpots = spots.map(s => ({
      spotNumber: s.spotNumber,
      type: s.type,
      status: s.status,
      carPlate: s.currentUserPlate || '-'
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
    const shortTermSpots = spots.filter(s => s.type === 'SHORT_TERM').sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));
    const longTermSpots = spots.filter(s => s.type === 'LONG_TERM').sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));

    const statusIcons = {
      'FREE': '🟢',
      'BOOKED': '🟡',
      'OCCUPIED': '🔴',
      'RESERVED': '🟠',
      'REPAIR': '🔧'
    };

    let textOutput = '\n🚗 ПАРКОВКА QPARK - ТЕКУЩИЙ СТАТУС\n';
    textOutput += '=' .repeat(50) + '\n\n';


    textOutput += '📍 ЛЕГЕНДА:\n';
    Object.entries(statusIcons).forEach(([status, icon]) => {
      const statusText = {
        'FREE': 'Свободно',
        'BOOKED': 'Забронировано',
        'OCCUPIED': 'Занято',
        'RESERVED': 'Резерв',
        'REPAIR': 'Ремонт'
      }[status];
      textOutput += `   ${icon} ${statusText}\n`;
    });
    textOutput += '\n';


    textOutput += '🅿️ КРАТКОСРОЧНАЯ ПАРКОВКА:\n';
    textOutput += '-'.repeat(40) + '\n';

    for (let i = 0; i < shortTermSpots.length; i += 5) {
      textOutput += '   ';
      for (let j = 0; j < 5 && i + j < shortTermSpots.length; j++) {
        const spot = shortTermSpots[i + j];
        const icon = statusIcons[spot.status as keyof typeof statusIcons] || '⚪';
        textOutput += `${icon} ${spot.spotNumber.padEnd(8)}`;
      }
      textOutput += '\n';
    }
    textOutput += '\n';


    textOutput += '🅿️ ДОЛГОСРОЧНАЯ ПАРКОВКА:\n';
    textOutput += '-'.repeat(40) + '\n';

    for (let i = 0; i < longTermSpots.length; i += 5) {
      textOutput += '   ';
      for (let j = 0; j < 5 && i + j < longTermSpots.length; j++) {
        const spot = longTermSpots[i + j];
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
