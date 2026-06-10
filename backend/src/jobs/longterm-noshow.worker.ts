import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma';
import { logger } from '../server';
import { redisConnection } from './queues';
import { sendPushToUser } from '../utils/notifications';
import { getLongTermPrice } from '../utils/pricing';

export function startLongTermNoShowWorker(io: SocketIOServer) {
  return new Worker(
    'longterm-noshow',
    async (job) => {
      const { rentalId } = job.data as { rentalId: string };

      const rental = await prisma.longTermRental.findUnique({
        where: { id: rentalId },
        include: { spot: true, user: true },
      });

      if (!rental) return;
      if (rental.status !== 'ACTIVE') return;
      if (rental.arrivedAt) {
        logger.info(`⏰ LT no-show skipped: rental ${rentalId} — user already arrived`);
        return;
      }

      const penalty = getLongTermPrice(1); // стоимость одного дня — удерживается как штраф
      const refundAmount = Math.max(0, (rental.totalCost ?? 0) - penalty);
      const user = rental.user;
      const balBefore = user?.walletBalance ?? 0;

      await prisma.$transaction([
        prisma.longTermRental.update({
          where: { id: rentalId },
          data: { status: 'CANCELLED' },
        }),
        prisma.parkingSpot.update({
          where: { id: rental.spotId },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }),
        ...(refundAmount > 0 && user ? [
          prisma.user.update({
            where: { id: rental.userId },
            data: { walletBalance: { increment: refundAmount } },
          }),
          prisma.transaction.create({
            data: {
              userId: rental.userId,
              amount: refundAmount,
              type: 'REFUND',
              description: `Возврат при отмене долгосрочной аренды: не явился 30 мин (штраф ${penalty}₸ удержан)`,
              balanceBefore: balBefore,
              balanceAfter: balBefore + refundAmount,
            },
          }),
        ] : []),
      ]);

      io.emit('spot-status-changed', { spotNumber: rental.spot.spotNumber, status: 'FREE', carPlate: null });
      io.emit('rental-cancelled', { rentalId, userId: rental.userId, spotNumber: rental.spot.spotNumber });

      await sendPushToUser(
        rental.userId,
        '❌ Бронирование отменено',
        `Бронирование отменено — вы не появились в течение 30 минут. Удержан 1 день (${penalty}₸).${refundAmount > 0 ? ` Возврат: ${refundAmount}₸.` : ''}`,
        { type: 'longterm-noshow', rentalId },
      ).catch(() => {});

      logger.info(`⏰ LT no-show: rental ${rentalId} cancelled, penalty ${penalty}₸, refund ${refundAmount}₸`);
    },
    { connection: redisConnection },
  );
}
