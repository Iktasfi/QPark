import { calculateShortTermCost, getFreeTravelTimeRemaining } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { noShowQueue, overstayQueue } from '../jobs/queues';

export class BookingService {

  async createShortTermBooking(
    userId: string,
    spotId: string,
    plateNumber: string = '',
    estimatedMinutes: number = 60,
    promoDiscount: number = 0,
    bonusDiscount: number = 0,
  ) {
    let booking: any;
    let estimatedEndTime: Date;
    let now: Date;
    let totalCost: number;

    try {
      // Single transaction: lock row with NOWAIT → all checks → booking + spot + wallet atomically
      const result = await prisma.$transaction(async (tx) => {
        // NOWAIT: fail immediately if another transaction already holds the lock
        const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM "parking_spots" WHERE id = ${spotId} FOR UPDATE NOWAIT
        `;
        const spot = rows[0];
        if (!spot) throw new Error('Spot not found');
        if (spot.status !== 'FREE') throw new Error('Spot just taken');

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');
        if (user.walletBalance < 0) {
          throw new Error(`Debt: balance is ${user.walletBalance}₸. Please top up your wallet to clear the debt before booking.`);
        }

        const plate = plateNumber || '';
        const txNow = new Date();
        const txEndTime = new Date(txNow.getTime() + estimatedMinutes * 60 * 1000);
        const actualBonus = Math.min(bonusDiscount, user.bonusPoints);
        const baseCost = calculateShortTermCost(estimatedMinutes);
        const txTotalCost = Math.max(0, baseCost - promoDiscount - actualBonus);

        if (txTotalCost > 0 && user.walletBalance < txTotalCost) {
          throw new Error(`Insufficient balance: need ${txTotalCost}₸, have ${user.walletBalance}₸`);
        }

        const newBooking = await tx.booking.create({
          data: {
            userId, spotId, plateNumber: plate,
            startTime: txNow, estimatedEndTime: txEndTime,
            bookedMinutes: estimatedMinutes, status: 'CONFIRMED', isPaid: true, totalCost: txTotalCost,
          },
        });

        await tx.parkingSpot.update({
          where: { id: spotId },
          data: { status: 'BOOKED', currentUserPlate: plate, currentUserId: userId },
        });

        if (txTotalCost > 0) {
          await tx.user.update({
            where: { id: userId },
            data: {
              walletBalance: { decrement: txTotalCost },
              ...(actualBonus > 0 ? { bonusPoints: { decrement: actualBonus } } : {}),
            },
          });
          await tx.transaction.create({
            data: {
              userId, amount: -(txTotalCost), type: 'PAYMENT',
              description: `Краткосрочная парковка ${estimatedMinutes} мин${actualBonus > 0 ? ` (бонусы: ${actualBonus}₸)` : ''}`,
              balanceBefore: user.walletBalance, balanceAfter: user.walletBalance - txTotalCost,
            },
          });
        } else if (actualBonus > 0) {
          await tx.user.update({ where: { id: userId }, data: { bonusPoints: { decrement: actualBonus } } });
        }

        return { booking: newBooking, totalCost: txTotalCost, estimatedEndTime: txEndTime, now: txNow };
      }, { timeout: 15000 });

      booking = result.booking;
      estimatedEndTime = result.estimatedEndTime;
      now = result.now;
      totalCost = result.totalCost;

    } catch (error: any) {
      // PostgreSQL lock_not_available (55P03) or Prisma P2034 write conflict
      const msg: string = error?.message ?? '';
      const causeMsg: string = error?.cause?.message ?? '';
      if (msg.includes('could not obtain lock') || causeMsg.includes('could not obtain lock') || error?.code === 'P2034') {
        throw new Error('Spot just taken');
      }
      logger.error('❌ Error creating booking:', error);
      throw error;
    }

    // BullMQ jobs are outside the transaction — if these fail, the booking still exists
    await noShowQueue.add('no-show-check', { bookingId: booking.id },
      { delay: 30 * 60 * 1000, jobId: `noshow-${booking.id}` }).catch(() => {});

    const msToEnd = estimatedEndTime.getTime() - now.getTime();
    const jobBase = { bookingId: booking.id, userId, spotId };
    if (msToEnd > 5 * 60 * 1000) {
      await overstayQueue.add('time-ending', { ...jobBase, phase: 'time-ending' },
        { delay: msToEnd - 5 * 60 * 1000, jobId: `te-${booking.id}` }).catch(() => {});
    }
    await overstayQueue.add('warn', { ...jobBase, phase: 'warn' },
      { delay: msToEnd, jobId: `warn-${booking.id}` }).catch(() => {});
    await overstayQueue.add('overstay-start', { ...jobBase, phase: 'overstay-start' },
      { delay: msToEnd + 5 * 60 * 1000, jobId: `os-${booking.id}` }).catch(() => {});

    logger.info(`✅ Short-term booking created & paid: ${booking.id}, -${totalCost}₸`);
    return booking;
  }


  async completeBooking(bookingId: string, carPlate: string) {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { spot: true },
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      const endTime = new Date();
      const durationMs = endTime.getTime() - booking.startTime.getTime();
      const durationMinutes = Math.ceil(durationMs / (1000 * 60));

      const totalCost = calculateShortTermCost(durationMinutes);

      const updatedBooking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          actualEndTime: endTime,
          status: 'COMPLETED',
          totalCost,
          isPaid: false,
        },
      });


      await prisma.parkingSpot.update({
        where: { id: booking.spotId },
        data: {
          status: 'FREE',
          currentUserPlate: null,
          currentUserId: null,
        },
      });

      logger.info(`✅ Booking completed: ${bookingId}, cost: ${totalCost}₸`);
      return updatedBooking;
    } catch (error) {
      logger.error('❌ Error completing booking:', error);
      throw error;
    }
  }


  async cancelBooking(bookingId: string, reason: string = 'User cancelled') {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { spot: true, user: true },
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      const isNoShow = getFreeTravelTimeRemaining(booking.startTime) === 0;
      let refundAmount = 0;

      if (booking.totalCost && booking.totalCost > 0 && !booking.arrivedAt) {
        // Manual cancel before arrival: 100% refund. No-show safety-net: 50% refund.
        refundAmount = isNoShow
          ? Math.floor(booking.totalCost * 0.5)
          : booking.totalCost;

        if (refundAmount > 0) {
          await prisma.user.update({
            where: { id: booking.userId },
            data: { walletBalance: { increment: refundAmount } },
          });
          await prisma.transaction.create({
            data: {
              userId: booking.userId,
              amount: refundAmount,
              type: 'REFUND',
              description: isNoShow
                ? `Частичный возврат: не явился вовремя (50% от ${booking.totalCost}₸)`
                : `Полный возврат: бронь отменена пользователем (${refundAmount}₸)`,
              balanceBefore: booking.user?.walletBalance ?? 0,
              balanceAfter: (booking.user?.walletBalance ?? 0) + refundAmount,
            },
          });
          logger.info(`💰 Cancel refund (${isNoShow ? '50%' : '100%'}): ${refundAmount}₸ → user ${booking.userId}`);
        }
      }

      // Remove the BullMQ no-show job to prevent double-processing
      const noShowJob = await noShowQueue.getJob(`noshow-${bookingId}`);
      if (noShowJob) await noShowJob.remove().catch(() => {});

      const updatedBooking = await prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      });

      await prisma.parkingSpot.update({
        where: { id: booking.spotId },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      });

      logger.info(`✅ Booking cancelled: ${bookingId}, reason: ${reason}, refund: ${refundAmount}₸`);
      return { ...updatedBooking, refundAmount };
    } catch (error) {
      logger.error('❌ Error cancelling booking:', error);
      throw error;
    }
  }


  async getUserActiveBookings(userId: string) {
    try {
      const bookings = await prisma.booking.findMany({
        where: {
          userId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        include: { spot: true },
        orderBy: { createdAt: 'desc' },
      });

      return bookings;
    } catch (error) {
      logger.error('❌ Error fetching user bookings:', error);
      throw error;
    }
  }


  async getBookingByCarPlate(carPlate: string) {
    try {

      const booking = await prisma.booking.findFirst({
        where: {
          spot: { currentUserPlate: carPlate },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        include: { spot: true, user: true },
      });

      return booking;
    } catch (error) {
      logger.error('❌ Error fetching booking by car plate:', error);
      throw error;
    }
  }
}

export default new BookingService();
