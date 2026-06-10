import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { redisConnection, overstayQueue } from './queues';
import { prisma } from '../lib/prisma';
import { logger } from '../server';
import { sendPushToUser } from '../utils/notifications';

// Phase time-ending: fires 5 min before estimatedEndTime → "5 min left" push
// Phase warn:        fires exactly at estimatedEndTime/endDate → overstay counter starts
// Phase fake-finish-check: fires 7 min after exitRequestedAt → 900₸ fine if car still parked
export function startOverstayWorker(io: SocketIOServer) {
  new Worker('overstay', async (job) => {
    const { bookingId, rentalId, userId, spotId, phase, rentalDays } = job.data as {
      bookingId?: string; rentalId?: string; userId: string; spotId: string;
      phase: 'time-ending' | 'warn' | 'overstay-start' | 'fake-finish-check' | 'lt-near-expiry';
      rentalDays?: number;
    };
    try {
      const [booking, rental] = await Promise.all([
        bookingId ? prisma.booking.findUnique({ where: { id: bookingId } }) : Promise.resolve(null),
        rentalId ? prisma.longTermRental.findUnique({ where: { id: rentalId } }) : Promise.resolve(null),
      ]);

      const currentSpotId = booking?.spotId ?? rental?.spotId ?? spotId;
      const spot = await prisma.parkingSpot.findUnique({ where: { id: currentSpotId } });

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

      // ── Fake-finish: user pressed Finish but car never exited ──────────────
      if (phase === 'fake-finish-check') {
        // Skip if no exit was ever requested
        const hasExit = booking?.exitRequestedAt ?? rental?.exitRequestedAt;
        if (!hasExit) {
          logger.info(`⏩ fake-finish-check skipped — no exitRequestedAt`);
          return;
        }

        const owner = await prisma.user.findUnique({ where: { id: userId } });
        if (owner) {
          const fineAmount = 900;
          const charged = Math.min(fineAmount, owner.walletBalance);
          const unpaidDebt = fineAmount - charged;
          const ops: Parameters<typeof prisma.$transaction>[0] = [
            prisma.user.update({ where: { id: userId }, data: { walletBalance: { decrement: charged } } }),
            prisma.transaction.create({
              data: {
                userId,
                amount: -charged,
                type: 'PAYMENT',
                description: 'Штраф 900₸: автомобиль не выехал в течение 7 минут после нажатия «Завершить»',
                balanceBefore: owner.walletBalance,
                balanceAfter: owner.walletBalance - charged,
              },
            }),
          ];
          // If wallet couldn't cover full fine, record the remaining debt — it will be
          // auto-deducted from the next wallet top-up via collectFineDebts()
          if (unpaidDebt > 0) {
            ops.push(
              prisma.fine.create({
                data: {
                  userId,
                  amount: unpaidDebt,
                  paidAmount: 0,
                  reason: `Долг по штрафу: автомобиль не выехал за 7 мин (списано ${charged}₸, осталось ${unpaidDebt}₸)`,
                  isPaid: false,
                },
              }) as any,
            );
          }
          await prisma.$transaction(ops);
        }

        // Spot stays OCCUPIED — physical LPR exit will free it later
        // Booking/rental stays active

        io.emit('fake-finish-fined', { userId, bookingId, rentalId, fine: 900 });

        await sendPushToUser(
          userId,
          '⛔ Штраф 900₸ выписан',
          'Ваш автомобиль не выехал в течение 7 минут после нажатия «Завершить». Штраф 900₸ списан. Ваш автомобиль по-прежнему занимает место — заберите его как можно скорее через шлагбаум.',
          { type: 'fake-finish-fine' }
        ).catch(() => {});

        logger.info(`💸 Fake-finish fine 900₸: user ${userId}, booking ${bookingId ?? rentalId}`);
        return;
      }

      if (phase === 'lt-near-expiry') {
        const days = rentalDays ?? 1;
        const msg = days === 1
          ? 'До окончания аренды остаётся 30 минут. Хотите продлить?'
          : 'До окончания аренды остаётся 1 день. Хотите продлить?';
        await sendPushToUser(userId, '📅 Аренда заканчивается', msg, { type: 'lt-near-expiry' });
        logger.info(`📅 LT near-expiry warning: user ${userId}, ${days} days rental`);
        return;
      }

      if (phase === 'time-ending') {
        if (bookingId && booking?.status !== 'COMPLETED') {
          io.emit('time-ending-soon', { userId, bookingId });
          await sendPushToUser(
            userId,
            '⏰ 5 минут до конца',
            'Время парковки скоро закончится. Хотите продлить? Нажмите «Завершить парковку» или продлите на 15 мин / 30 мин / 1 час.',
            { type: 'time-ending-soon' }
          );
          logger.info(`⏰ Time-ending-soon push sent: user ${userId}`);
        }
        return;
      }

      if (phase === 'warn') {
        // Paid time expired — 5-minute grace period starts now
        io.emit('overstay-grace-started', { userId, bookingId, rentalId });

        const msg = rentalId
          ? 'Аренда истекла. Даём 5 минут на выезд. После этого начнётся списание 3₸/мин.'
          : 'Время парковки истекло. Даём 5 минут на выезд — после этого начнётся списание 3₸/мин.';

        await sendPushToUser(
          userId,
          '⏳ 5 минут до штрафного времени',
          msg,
          { type: 'overstay-grace' }
        );
        logger.info(`⏳ Overstay 5-min grace started: user ${userId}`);
        return;
      }

      if (phase === 'overstay-start') {
        // 5-minute grace expired — actual overstay charges begin.
        // Cancel the 5-min warning job in case it hasn't fired yet (e.g. after a recent extension).
        if (bookingId) {
          overstayQueue.getJob(`te-${bookingId}`).then(j => j?.remove()).catch(() => {});
        }
        io.emit('overstay-warning', { userId, bookingId, rentalId });

        const msg = rentalId
          ? 'Льготные 5 минут истекли. Идёт списание 3₸/мин. Оплатите долг в приложении — шлагбаум откроется.'
          : 'Льготные 5 минут истекли. Идёт списание 3₸/мин. Нажмите «Завершить парковку» для оплаты и выезда.';

        await sendPushToUser(
          userId,
          '🚨 Превышение времени',
          msg,
          { type: 'overstay-warning' }
        );
        logger.info(`🚨 Overstay started (after 5-min grace): user ${userId}`);
        return;
      }

    } catch (err) {
      logger.error('❌ Overstay worker error:', err);
    }
  }, { connection: redisConnection });
}
