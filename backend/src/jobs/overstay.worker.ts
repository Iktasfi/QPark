import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { redisConnection, overstayQueue } from './queues';
import { prisma } from '../lib/prisma';
import { logger } from '../server';
import { sendPushToUser } from '../utils/notifications';

// Phase 1: fires 7 min after estimatedEndTime/endDate → send warning
// Phase 2: fires 5 min after warning (12 min total) → charging begins
export function startOverstayWorker(io: SocketIOServer) {
  new Worker('overstay', async (job) => {
    const { bookingId, rentalId, userId, spotId, phase } = job.data as {
      bookingId?: string; rentalId?: string; userId: string; spotId: string; phase: 'time-ending' | 'warn' | 'charge';
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

      if (phase === 'time-ending') {
        // Only notify if booking still active
        if (bookingId && booking?.status !== 'COMPLETED') {
          io.emit('time-ending-soon', { userId, bookingId });
          await sendPushToUser(
            userId,
            '⏰ 5 minutes left!',
            'Your parking time is almost up. Return to your car and press "Finish Parking" to get 7 min to exit.',
            { type: 'time-ending-soon' }
          );
          logger.info(`⏰ Time-ending-soon push sent: user ${userId}`);
        }
        return;
      }

      if (phase === 'warn') {
        io.emit('overstay-warning', { userId, bookingId, rentalId });
        await sendPushToUser(
          userId,
          '⚠️ Parking time exceeded',
          'Your parking time is up. Press "Finish Parking" to start exit. Charges begin in 5 minutes.',
          { type: 'overstay-warning' }
        );
        logger.info(`⚠️ Overstay warning sent: user ${userId}`);

        // Schedule charging phase in 5 more minutes
        await overstayQueue.add('check', { bookingId, rentalId, userId, spotId, phase: 'charge' }, { delay: 5 * 60 * 1000 });
      } else {
        io.emit('overstay-charging', { userId, bookingId, rentalId });
        await sendPushToUser(
          userId,
          '💸 Overstay charges started',
          'You are being charged 3₸/min for exceeding your parking time. Press "Finish Parking" to stop charges.',
          { type: 'overstay-charging' }
        );
        logger.info(`💸 Overstay charging started: user ${userId}`);
      }
    } catch (err) {
      logger.error('❌ Overstay worker error:', err);
    }
  }, { connection: redisConnection });
}
