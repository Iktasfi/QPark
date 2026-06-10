import { getLongTermPrice } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';
import { reservingCleanupQueue } from '../jobs/queues';

export class LongTermRentalService {

  async createLongTermRental(userId: string, spotId: string, rentalDays: number, plateNumber: string = '') {
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

    await reservingCleanupQueue.add('reserving-cleanup', { spotId }, {
      delay: 15 * 1000,
      jobId: `res-${spotId}`,
    }).catch(() => {});

    try {
      const now = new Date();
      const totalCost = getLongTermPrice(rentalDays);
      const endDate = new Date(now.getTime() + rentalDays * 24 * 60 * 60 * 1000);

      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) throw new Error('User not found');
      if (user.walletBalance < 0) {
        throw new Error(`Debt: balance is ${user.walletBalance}₸. Please top up your wallet to clear the debt before booking.`);
      }
      if (totalCost > 0 && user.walletBalance < totalCost) {
        throw new Error(`Insufficient balance: need ${totalCost}₸, have ${user.walletBalance}₸`);
      }

      const plate = plateNumber || '';
      const balBefore = user.walletBalance;

      const [rental] = await prisma.$transaction([
        prisma.longTermRental.create({
          data: {
            userId,
            spotId,
            rentalDays,
            totalCost,
            plateNumber: plate,
            startDate: now,
            endDate,
            status: 'ACTIVE',
          },
        }),
        prisma.parkingSpot.update({
          where: { id: spotId },
          data: { status: 'RESERVED', currentUserId: userId, currentUserPlate: plate },
        }),
        ...(totalCost > 0 ? [
          prisma.user.update({
            where: { id: userId },
            data: { walletBalance: { decrement: totalCost } },
          }),
          prisma.transaction.create({
            data: {
              userId,
              amount: -(totalCost),
              type: 'PAYMENT',
              description: `Долгосрочная аренда ${rentalDays} дней`,
              balanceBefore: balBefore,
              balanceAfter: balBefore - totalCost,
            },
          }),
        ] : []),
      ]);

      const rentalWithRelations = await prisma.longTermRental.findUnique({
        where: { id: rental.id },
        include: { spot: true, user: true },
      });

      // Rental succeeded — remove the 15s safety-net cleanup job
      const cleanupJob = await reservingCleanupQueue.getJob(`res-${spotId}`);
      if (cleanupJob) await cleanupJob.remove().catch(() => {});

      logger.info(`✅ Long-term rental created & paid: ${rental.id}, ${rentalDays} days, -${totalCost}₸`);
      return rentalWithRelations!;
    } catch (error) {
      await prisma.parkingSpot.update({
        where: { id: spotId },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      }).catch(() => {});
      const cleanupJob = await reservingCleanupQueue.getJob(`res-${spotId}`);
      if (cleanupJob) await cleanupJob.remove().catch(() => {});

      logger.error('❌ Error creating long-term rental:', error);
      throw error;
    }
  }


  async getUserActiveRentals(userId: string) {
    try {
      const rentals = await prisma.longTermRental.findMany({
        where: {
          userId,
          status: 'ACTIVE',
        },
        include: { spot: true },
        orderBy: { createdAt: 'desc' },
      });

      return rentals;
    } catch (error) {
      logger.error('❌ Error fetching user rentals:', error);
      throw error;
    }
  }


  async completeRental(rentalId: string) {
    try {
      const rental = await prisma.longTermRental.findUnique({
        where: { id: rentalId },
        include: { spot: true },
      });

      if (!rental) {
        throw new Error('Rental not found');
      }


      const updatedRental = await prisma.longTermRental.update({
        where: { id: rentalId },
        data: { status: 'COMPLETED' },
      });


      await prisma.parkingSpot.update({
        where: { id: rental.spotId },
        data: {
          status: 'FREE',
          currentUserPlate: null,
          currentUserId: null,
        },
      });

      logger.info(`✅ Rental completed: ${rentalId}`);
      return updatedRental;
    } catch (error) {
      logger.error('❌ Error completing rental:', error);
      throw error;
    }
  }


  async cancelRental(rentalId: string) {
    try {
      const rental = await prisma.longTermRental.findUnique({
        where: { id: rentalId },
        include: { spot: true, user: true },
      });

      if (!rental) throw new Error('Rental not found');

      // Spec: cancel without showing up → 900₸ penalty + refund remainder
      const CANCEL_PENALTY = 900;
      const refundAmount = Math.max(0, (rental.totalCost ?? 0) - CANCEL_PENALTY);
      const user = rental.user;

      const balBefore = user?.walletBalance ?? 0;

      const [updatedRental] = await prisma.$transaction([
        prisma.longTermRental.update({ where: { id: rentalId }, data: { status: 'CANCELLED' } }),
        prisma.parkingSpot.update({
          where: { id: rental.spotId },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }),
        ...(refundAmount > 0 && user ? [
          prisma.user.update({ where: { id: rental.userId }, data: { walletBalance: { increment: refundAmount } } }),
          prisma.transaction.create({
            data: {
              userId: rental.userId,
              amount: refundAmount,
              type: 'REFUND',
              description: `Возврат при отмене аренды (штраф 900₸ удержан): ${rentalId}`,
              balanceBefore: balBefore,
              balanceAfter: balBefore + refundAmount,
            },
          }),
        ] : []),
      ]);

      logger.info(`✅ Rental cancelled: ${rentalId}, refund: ${refundAmount}₸ (penalty: ${CANCEL_PENALTY}₸)`);
      return { ...updatedRental, refundAmount };
    } catch (error) {
      logger.error('❌ Error cancelling rental:', error);
      throw error;
    }
  }


  async getAllActiveRentals() {
    try {
      const rentals = await prisma.longTermRental.findMany({
        where: { status: 'ACTIVE' },
        include: { spot: true, user: true },
        orderBy: { createdAt: 'desc' },
      });

      return rentals;
    } catch (error) {
      logger.error('❌ Error fetching all rentals:', error);
      throw error;
    }
  }


  async checkExpiredRentals() {
    try {
      const expiredRentals = await prisma.longTermRental.findMany({
        where: {
          status: 'ACTIVE',
          endDate: { lt: new Date() },
        },
      });

      for (const rental of expiredRentals) {
        await this.completeRental(rental.id);
      }

      logger.info(`✅ Completed ${expiredRentals.length} expired rentals`);
      return expiredRentals.length;
    } catch (error) {
      logger.error('❌ Error checking expired rentals:', error);
      throw error;
    }
  }
}

export default new LongTermRentalService();
