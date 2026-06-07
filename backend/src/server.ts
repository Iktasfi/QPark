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
import applicationRoutes from './routes/application.routes';
import supportRoutes from './routes/support.routes';
import { prisma } from './lib/prisma';
import { startNoShowWorker } from './jobs/noshow.worker';
import { startRentalExpiryWorker } from './jobs/rental-expiry.worker';
import { startOverstayWorker } from './jobs/overstay.worker';


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
app.use('/applications', applicationRoutes);
app.use('/support', supportRoutes);


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

  // Support chat: user joins their personal room to receive admin replies
  socket.on('join-support', (userId: string) => {
    socket.join(`support-${userId}`);
    logger.info(`User ${userId} joined support room`);
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});


export { app, httpServer, io, logger };


async function initializeParkingSpots() {
  try {
    // Migrate any legacy SHORT_TERM / LONG_TERM spots to UNIVERSAL
    const migrated = await prisma.parkingSpot.updateMany({
      where: { type: { in: ['SHORT_TERM', 'LONG_TERM'] } },
      data: { type: 'UNIVERSAL' },
    });
    if (migrated.count > 0) {
      logger.info(`🔄 Migrated ${migrated.count} spots → UNIVERSAL type`);
    }

    const count = await prisma.parkingSpot.count();
    if (count > 0) {
      logger.info(`ℹ️  Parking spots already initialized: ${count} spots`);
      return;
    }

    const spotsData = [];
    for (let i = 1; i <= 30; i++) {
      spotsData.push({
        spotNumber: `SP-${String(i).padStart(2, '0')}`,
        type: 'UNIVERSAL' as const,
        status: 'FREE' as const,
      });
    }

    await prisma.parkingSpot.createMany({ data: spotsData });
    logger.info(`✅ Parking spots initialized: 30 universal spots created`);
  } catch (error) {
    logger.error('❌ Error initializing parking spots:', error);
  }
}




const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, async () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📡 Socket.io listening for connections`);

  await initializeParkingSpots();

  startNoShowWorker(io);
  startRentalExpiryWorker(io);
  startOverstayWorker(io);
});


process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
