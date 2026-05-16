import { getLongTermPrice } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

export class LongTermRentalService {

  async createLongTermRental(userId: string, spotId: string, rentalDays: number) {
    try {
      const now = new Date();
      const totalCost = getLongTermPrice(rentalDays);
      const endDate = new Date(now.getTime() + rentalDays * 24 * 60 * 60 * 1000);


      const spot = await prisma.parkingSpot.findUnique({
        where: { id: spotId },
      });

      if (!spot || spot.status !== 'FREE') {
        throw new Error('Spot is not available');
      }


      const rental = await prisma.longTermRental.create({
        data: {
          userId,
          spotId,
          rentalDays,
          totalCost,
          startDate: now,
          endDate,
          status: 'ACTIVE',
        },
        include: {
          spot: true,
          user: true,
        },
      });


      await prisma.parkingSpot.update({
        where: { id: spotId },
        data: { status: 'RESERVED' },
      });

      logger.info(`✅ Long-term rental created: ${rental.id}, ${rentalDays} days`);
      return rental;
    } catch (error) {
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
        data: { status: 'EXPIRED' },
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
        include: { spot: true },
      });

      if (!rental) {
        throw new Error('Rental not found');
      }


      const updatedRental = await prisma.longTermRental.update({
        where: { id: rentalId },
        data: { status: 'CANCELLED' },
      });


      await prisma.parkingSpot.update({
        where: { id: rental.spotId },
        data: { status: 'FREE' },
      });

      logger.info(`✅ Rental cancelled: ${rentalId}`);
      return updatedRental;
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
