import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { redisConnection, overstayQueue } from './queues';
import { prisma } from '../lib/prisma';
import { logger } from '../server';

// Phase 1: fires 7 min after estimatedEndTime/endDate → send warning
// Phase 2: fires 5 min after warning (12 min total) → charging begins
export function startOverstayWorker(io: SocketIOServer) {
  new Worker('overstay', async (job) => {
    const { bookingId, rentalId, userId, spotId, phase } = job.data as {
      bookingId?: string; rentalId?: string; userId: string; spotId: string; phase: 'warn' | 'charge';
    };
    try {
      const [booking, rental] = await Promise.all([
        bookingId ? prisma.booking.findUnique({ where: { id: bookingId } }) : Promise.resolve(null),
        rentalId ? prisma.longTermRental.findUnique({ where: { id: rentalId } }) : Promise.resolve(null),
      ]);

      // After reassignment, booking/rental may point to a new spot — always use the current one
      const currentSpotId = booking?.spotId ?? rental?.spotId ?? spotId;
      const spot = await prisma.parkingSpot.findUnique({ where: { id: currentSpotId } });

      // Car already left — nothing to do
      if (!spot || spot.currentUserId !== userId) {
        logger.info(`⏩ Overstay ${phase} skipped — car already left`);
        return;
      }
      if (bookingId && booking?.status === 'COMPLETED') {
        logger.info(`⏩ Overstay ${phase} skipped — booking completed`);
        return;
      }
      if (rentalId && rental?.status !== 'ACTIVE') {
        logger.info(`⏩ Overstay ${phase} skipped — rental not active`);
        return;
      }

      if (phase === 'warn') {
        io.emit('overstay-warning', { userId, bookingId, rentalId });
        logger.info(`⚠️ Overstay warning sent: user ${userId}`);

        // Schedule charging phase in 5 more minutes
        await overstayQueue.add('check', { bookingId, rentalId, userId, spotId, phase: 'charge' }, { delay: 5 * 60 * 1000 });
      } else {
        io.emit('overstay-charging', { userId, bookingId, rentalId });
        logger.info(`💸 Overstay charging started: user ${userId}`);
      }
    } catch (err) {
      logger.error('❌ Overstay worker error:', err);
    }
  }, { connection: redisConnection });
}
