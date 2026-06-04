import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma';
import { logger } from '../server';
import { redisConnection } from './queues';

export function startNoShowWorker(io: SocketIOServer) {
  const worker = new Worker(
    'noshow',
    async (job) => {
      const { bookingId } = job.data as { bookingId: string };

      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { spot: true },
      });

      // Already completed, cancelled, or user has physically arrived — nothing to do
      if (!booking || !['PENDING', 'CONFIRMED'].includes(booking.status)) return;
      if (booking.arrivedAt) {
        logger.info(`⏰ No-show skipped: booking ${bookingId} — user already arrived`);
        return;
      }

      await prisma.$transaction([
        prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'CANCELLED', actualEndTime: new Date() },
        }),
        prisma.parkingSpot.update({
          where: { id: booking.spotId },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }),
      ]);

      io.emit('spot-status-changed', {
        spotNumber: booking.spot.spotNumber,
        status: 'FREE',
        carPlate: null,
      });

      logger.info(
        `⏰ No-show auto-cancelled via BullMQ: booking ${bookingId}, spot ${booking.spot.spotNumber}`,
      );
    },
    { connection: redisConnection },
  );

  worker.on('failed', (job, err) => {
    logger.error(`❌ No-show job failed [${job?.id}]:`, err);
  });

  logger.info('⏰ BullMQ no-show worker started');
  return worker;
}
