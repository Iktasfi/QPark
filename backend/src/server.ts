import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import pino from 'pino';
import pinoHttp from 'pino-http';


import authRoutes from './routes/auth.routes';
import parkingRoutes from './routes/parking.routes';
import bookingRoutes from './routes/booking.routes';
import paymentRoutes from './routes/payment.routes';
import rentalRoutes from './routes/rental.routes';
import adminRoutes from './routes/admin.routes';
import testRoutes from './routes/test.routes';
import complaintRoutes from './routes/complaint.routes';
import { prisma } from './lib/prisma';


dotenv.config();


const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const httpLogger = pinoHttp({ logger });


const app: Express = express();
const httpServer = createServer(app);


const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});


app.use(cors());
app.use(httpLogger);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));


app.use('/auth', authRoutes);
app.use('/parking', parkingRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', paymentRoutes);
app.use('/rentals', rentalRoutes);
app.use('/admin', adminRoutes);
app.use('/test', testRoutes);
app.use('/complaints', complaintRoutes);


app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});


app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});


io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);


  socket.on('join-parking', (spotNumber: string) => {
    socket.join(`spot-${spotNumber}`);
    logger.info(`User joined spot ${spotNumber}`);
  });


  socket.on('leave-parking', (spotNumber: string) => {
    socket.leave(`spot-${spotNumber}`);
    logger.info(`User left spot ${spotNumber}`);
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});


export { app, httpServer, io, logger };


async function initializeParkingSpots() {
  try {

    const count = await prisma.parkingSpot.count();
    if (count > 0) {
      logger.info(`ℹ️  Parking spots already initialized: ${count} spots`);
      return;
    }


    const spotsData = [];


    for (let i = 1; i <= 15; i++) {
      spotsData.push({
        spotNumber: `SP-${String(i).padStart(2, '0')}`,
        type: 'SHORT_TERM' as const,
        status: 'FREE' as const,
      });
    }


    for (let i = 16; i <= 30; i++) {
      spotsData.push({
        spotNumber: `SP-${String(i).padStart(2, '0')}`,
        type: 'LONG_TERM' as const,
        status: 'FREE' as const,
      });
    }

    await prisma.parkingSpot.createMany({
      data: spotsData,
    });

    logger.info(`✅ Parking spots initialized: 30 spots created`);
  } catch (error) {
    logger.error('❌ Error initializing parking spots:', error);
  }
}




async function runNoShowJob() {
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);

    const expired = await prisma.booking.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        startTime: { lt: cutoff },
        spot: { type: 'SHORT_TERM', status: 'BOOKED' },
      },
      include: { spot: true },
    });

    for (const booking of expired) {
      await prisma.$transaction([
        prisma.booking.update({
          where: { id: booking.id },
          data: { status: 'CANCELLED', actualEndTime: new Date() },
        }),
        prisma.parkingSpot.update({
          where: { id: booking.spotId },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }),
        prisma.user.update({
          where: { id: booking.userId },
          data: { noShowCount: { increment: 1 } },
        }),
      ]);


      const user = await prisma.user.findUnique({ where: { id: booking.userId } });
      if (user && user.noShowCount >= 6 && !user.isBanned) {
        const bannedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await prisma.user.update({
          where: { id: booking.userId },
          data: { isBanned: true, bannedUntil },
        });
        logger.info(`🚫 User ${booking.userId} auto-banned until ${bannedUntil.toISOString()}`);
      }

      io.emit('spot-status-changed', { spotNumber: booking.spot.spotNumber, status: 'FREE', carPlate: null });
      logger.info(`⏰ No-show cancelled: booking ${booking.id}, spot ${booking.spot.spotNumber}`);
    }
  } catch (e) {
    logger.error('❌ No-show job error:', e);
  }
}


const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📡 Socket.io listening for connections`);


  await initializeParkingSpots();


  setInterval(runNoShowJob, 60 * 1000);
  logger.info('⏰ No-show auto-cancel job started (every 60s)');
});


process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
