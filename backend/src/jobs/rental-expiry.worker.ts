import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma';
import { logger } from '../server';
import { redisConnection } from './queues';

export function startRentalExpiryWorker(io: SocketIOServer) {
  const worker = new Worker(
    'rental-expiry',
    async (job) => {
      const { rentalId } = job.data as { rentalId: string };

      const rental = await prisma.longTermRental.findUnique({
        where: { id: rentalId },
        include: { spot: true },
      });

      if (!rental || rental.status !== 'ACTIVE') return;

      // Double-check: if endDate is still in the future (e.g. rental was extended), skip
      if (rental.endDate > new Date()) {
        logger.info(`⏰ Rental expiry skipped: ${rentalId} — endDate still in future`);
        return;
      }

      await prisma.$transaction([
        prisma.longTermRental.update({
          where: { id: rentalId },
          data: { status: 'COMPLETED' },
        }),
        prisma.parkingSpot.update({
          where: { id: rental.spotId },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }),
      ]);

      io.emit('rental-expired', { rentalId, spotNumber: rental.spot.spotNumber, userId: rental.userId });
      io.emit('spot-status-changed', { spotNumber: rental.spot.spotNumber, status: 'FREE', carPlate: null });

      logger.info(`✅ Rental expired: ${rentalId}, spot ${rental.spot.spotNumber} → FREE`);
    },
    { connection: redisConnection },
  );

  worker.on('failed', (job, err) => {
    logger.error(`❌ Rental expiry job failed [${job?.id}]:`, err);
  });

  logger.info('⏰ BullMQ rental-expiry worker started');
  return worker;
}
