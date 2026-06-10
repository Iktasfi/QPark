import { calculateShortTermCost, getFreeTravelTimeRemaining } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { noShowQueue, overstayQueue, reservingCleanupQueue } from '../jobs/queues';

export class BookingService {

  async createShortTermBooking(
    userId: string,
    spotId: string,
    plateNumber: string = '',
    estimatedMinutes: number = 60,
    promoDiscount: number = 0,
    bonusDiscount: number = 0,
  ) {
    // Phase 1: lock spot row with SELECT FOR UPDATE, set RESERVING atomically
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM "parking_spots" WHERE id = ${spotId} FOR UPDATE
      `;
      const spot = rows[0];
      if (!spot) throw new Error('Spot not found');
      if (spot.status === 'RESERVING') throw new Error('Место только что забрали, выберите другое');
      if (spot.status !== 'FREE') throw new Error('Spot is not available');
      await tx.parkingSpot.update({ where: { id: spotId }, data: { status: 'RESERVING' } });
    });

    // 15-second safety net: if server crashes before booking completes, reset to FREE
    await reservingCleanupQueue.add('reserving-cleanup', { spotId }, {
      delay: 15 * 1000,
      jobId: `res-${spotId}`,
    }).catch(() => {});

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');

      if (user.walletBalance < 0) {
        throw new Error(`Debt: balance is ${user.walletBalance}₸. Please top up your wallet to clear the debt before booking.`);
      }

      const plate = plateNumber || '';
      const now = new Date();
      const estimatedEndTime = new Date(now.getTime() + estimatedMinutes * 60 * 1000);

      // Charge wallet immediately at booking creation (per spec)
      const actualBonus = Math.min(bonusDiscount, user.bonusPoints);
      const baseCost = calculateShortTermCost(estimatedMinutes);
      const totalCost = Math.max(0, baseCost - promoDiscount - actualBonus);

      if (totalCost > 0 && user.walletBalance < totalCost) {
        throw new Error(`Insufficient balance: need ${totalCost}₸, have ${user.walletBalance}₸`);
      }

      const [booking] = await prisma.$transaction([
        prisma.booking.create({
          data: {
            userId,
            spotId,
            plateNumber: plate,
            startTime: now,
            estimatedEndTime,
            bookedMinutes: estimatedMinutes,
            status: 'CONFIRMED',
            isPaid: true,
            totalCost,
          },
        }),
        prisma.parkingSpot.update({
          where: { id: spotId },
          data: { status: 'BOOKED', currentUserPlate: plate, currentUserId: userId },
        }),
        ...(totalCost > 0 ? [
          prisma.user.update({
            where: { id: userId },
            data: {
              walletBalance: { decrement: totalCost },
              ...(actualBonus > 0 ? { bonusPoints: { decrement: actualBonus } } : {}),
            },
          }),
          prisma.transaction.create({
            data: {
              userId,
              amount: -(totalCost),
              type: 'PAYMENT',
              description: `Краткосрочная парковка ${estimatedMinutes} мин${actualBonus > 0 ? ` (бонусы: ${actualBonus}₸)` : ''}`,
              balanceBefore: user.walletBalance,
              balanceAfter: user.walletBalance - totalCost,
            },
          }),
        ] : [
          prisma.user.update({
            where: { id: userId },
            data: {
              ...(actualBonus > 0 ? { bonusPoints: { decrement: actualBonus } } : {}),
            },
          }),
        ]),
      ]);

      // Auto-cancel if driver doesn't arrive within 30 min — 50% penalty, 50% refund
      await noShowQueue.add(
        'no-show-check',
        { bookingId: booking.id },
        { delay: 30 * 60 * 1000, jobId: `noshow-${booking.id}` },
      );

      // Overstay notifications: 5-min warning → end-of-time grace → billing starts
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

      // Booking succeeded — remove the 15s safety-net cleanup job
      const cleanupJob = await reservingCleanupQueue.getJob(`res-${spotId}`);
      if (cleanupJob) await cleanupJob.remove().catch(() => {});

      logger.info(`✅ Short-term booking created & paid: ${booking.id}, -${totalCost}₸`);
      return booking;
    } catch (error) {
      // Reset spot to FREE and remove cleanup job so user can retry
      await prisma.parkingSpot.update({
        where: { id: spotId },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      }).catch(() => {});
      const cleanupJob = await reservingCleanupQueue.getJob(`res-${spotId}`);
      if (cleanupJob) await cleanupJob.remove().catch(() => {});

      logger.error('❌ Error creating booking:', error);
      throw error;
    }
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
