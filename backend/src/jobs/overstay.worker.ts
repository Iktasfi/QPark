import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { redisConnection } from './queues';
import { prisma } from '../lib/prisma';
import { logger } from '../server';

export function startOverstayWorker(io: SocketIOServer) {
  new Worker('overstay', async (job) => {
    const { bookingId, userId, spotId } = job.data as { bookingId: string; userId: string; spotId: string };
    try {
      const [spot, booking] = await Promise.all([
        prisma.parkingSpot.findUnique({ where: { id: spotId } }),
        prisma.booking.findUnique({ where: { id: bookingId } }),
      ]);

      if (!spot || spot.currentUserId !== userId || booking?.status === 'COMPLETED') {
        logger.info(`⏩ Overstay skipped — car already left (booking ${bookingId})`);
        return;
      }

      io.emit('overstay-warning', { userId, bookingId });
      logger.info(`⚠️ Overstay warning sent: user ${userId}, booking ${bookingId}`);
    } catch (err) {
      logger.error('❌ Overstay worker error:', err);
    }
  }, { connection: redisConnection });
}
