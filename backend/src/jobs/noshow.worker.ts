import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma';
import { logger } from '../server';
import { redisConnection } from './queues';
import { sendPushToUser } from '../utils/notifications';

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

      const user = await prisma.user.findUnique({ where: { id: booking.userId } });

      // 50% penalty: keep half, refund the other half to wallet
      const totalCost = booking.totalCost ?? 0;
      const penaltyAmount = Math.ceil(totalCost * 0.5);
      const refundAmount = totalCost - penaltyAmount;

      await prisma.$transaction([
        prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'CANCELLED', actualEndTime: new Date() },
        }),
        prisma.parkingSpot.update({
          where: { id: booking.spotId },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }),
        ...(refundAmount > 0 && user ? [
          prisma.user.update({
            where: { id: booking.userId },
            data: { walletBalance: { increment: refundAmount } },
          }),
          prisma.transaction.create({
            data: {
              userId: booking.userId,
              amount: refundAmount,
              type: 'REFUND',
              description: `Частичный возврат: не явился вовремя (50% от ${totalCost}₸)`,
              balanceBefore: user.walletBalance,
              balanceAfter: user.walletBalance + refundAmount,
            },
          }),
        ] : []),
      ]);

      io.emit('spot-status-changed', {
        spotNumber: booking.spot.spotNumber,
        status: 'FREE',
        carPlate: null,
      });

      if (totalCost > 0) {
        await sendPushToUser(
          booking.userId,
          '⏰ Бронь отменена',
          `Вы не явились вовремя. Штраф: ${penaltyAmount}₸. Возврат: ${refundAmount}₸.`,
          { type: 'no-show' }
        ).catch(() => {});
        logger.info(`💸 No-show: kept ${penaltyAmount}₸ penalty, refunded ${refundAmount}₸ to user ${booking.userId}`);
      }

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
