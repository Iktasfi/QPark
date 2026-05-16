import { SpotStatus } from '@prisma/client';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

export class ParkingService {

  async getAllSpots() {
    try {
      const spots = await prisma.parkingSpot.findMany({
        include: {
          bookings: {
            where: { status: { in: ['PENDING', 'CONFIRMED'] } },
            take: 1,
          },
        },
        orderBy: { spotNumber: 'asc' },
      });

      return spots;
    } catch (error) {
      logger.error('❌ Error fetching spots:', error);
      throw error;
    }
  }


  async getSpotByNumber(spotNumber: string) {
    try {
      const spot = await prisma.parkingSpot.findUnique({
        where: { spotNumber },
        include: { bookings: true },
      });

      return spot;
    } catch (error) {
      logger.error('❌ Error fetching spot:', error);
      throw error;
    }
  }


  async getAvailableSpots(type: 'SHORT_TERM' | 'LONG_TERM' = 'SHORT_TERM') {
    try {
      const spots = await prisma.parkingSpot.findMany({
        where: {
          type,
          status: 'FREE',
        },
        orderBy: { spotNumber: 'asc' },
      });

      return spots;
    } catch (error) {
      logger.error('❌ Error fetching available spots:', error);
      throw error;
    }
  }


  async updateSpotStatus(spotId: string, status: SpotStatus) {
    try {
      const spot = await prisma.parkingSpot.update({
        where: { id: spotId },
        data: { status },
      });

      logger.info(`✅ Spot status updated: ${spotId} -> ${status}`);
      return spot;
    } catch (error) {
      logger.error('❌ Error updating spot status:', error);
      throw error;
    }
  }


  async handleLPREntry(carPlate: string, spotNumber: string) {
    try {

      const booking = await prisma.booking.findFirst({
        where: {
          spot: { currentUserPlate: carPlate },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        include: { spot: true, user: true },
      });

      if (!booking) {
        logger.warn(`⚠️  No booking found for car plate: ${carPlate}`);
        return {
          success: false,
          message: 'No active booking found',
        };
      }


      const spot = await this.getSpotByNumber(spotNumber);
      if (!spot) {
        logger.warn(`⚠️  Spot not found: ${spotNumber}`);
        return {
          success: false,
          message: 'Spot not found',
        };
      }


      await prisma.parkingSpot.update({
        where: { id: spot.id },
        data: {
          status: 'OCCUPIED',
          currentUserPlate: carPlate,
          currentUserId: booking.userId,
        },
      });


      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CONFIRMED' },
      });


      await prisma.lPREvent.create({
        data: {
          carPlate,
          eventType: 'ENTRY',
          spotNumber,
        },
      });

      logger.info(`✅ Car entry recorded: ${carPlate} at spot ${spotNumber}`);
      return {
        success: true,
        message: 'Gate opened',
        bookingId: booking.id,
        spotNumber,
      };
    } catch (error) {
      logger.error('❌ Error handling LPR entry:', error);
      throw error;
    }
  }


  async handleLPRExit(carPlate: string, spotNumber: string) {
    try {

      const spot = await this.getSpotByNumber(spotNumber);
      if (!spot) {
        logger.warn(`⚠️  Spot not found: ${spotNumber}`);
        return {
          success: false,
          message: 'Spot not found',
        };
      }


      const booking = await prisma.booking.findFirst({
        where: {
          spotId: spot.id,
          status: { in: ['CONFIRMED', 'COMPLETED'] },
        },
        include: { user: true },
      });

      if (!booking) {
        logger.warn(`⚠️  No active booking found for spot: ${spotNumber}`);
        return {
          success: false,
          message: 'No active booking',
        };
      }


      if (!booking.isPaid) {
        logger.warn(`⚠️  Booking not paid: ${booking.id}`);
        return {
          success: false,
          message: 'Booking not paid',
        };
      }


      await prisma.parkingSpot.update({
        where: { id: spot.id },
        data: {
          status: 'FREE',
          currentUserPlate: null,
          currentUserId: null,
        },
      });


      await prisma.lPREvent.create({
        data: {
          carPlate,
          eventType: 'EXIT',
          spotNumber,
        },
      });

      logger.info(`✅ Car exit recorded: ${carPlate} from spot ${spotNumber}`);
      return {
        success: true,
        message: 'Gate opened',
        spotNumber,
      };
    } catch (error) {
      logger.error('❌ Error handling LPR exit:', error);
      throw error;
    }
  }


  async initializeParkingSpots() {
    try {

      const count = await prisma.parkingSpot.count();
      if (count > 0) {
        logger.info(`ℹ️  Parking spots already initialized: ${count} spots`);
        return;
      }


      const spotsData = [];


      for (let i = 1; i <= 15; i++) {
        spotsData.push({
          spotNumber: `SP-${String(i).padStart(2, '0')}`,
          type: 'SHORT_TERM' as const,
          status: 'FREE' as const,
        });
      }


      for (let i = 16; i <= 30; i++) {
        spotsData.push({
          spotNumber: `SP-${String(i).padStart(2, '0')}`,
          type: 'LONG_TERM' as const,
          status: 'FREE' as const,
        });
      }

      await prisma.parkingSpot.createMany({
        data: spotsData,
      });

      logger.info(`✅ Parking spots initialized: 30 spots created`);
    } catch (error) {
      logger.error('❌ Error initializing parking spots:', error);
      throw error;
    }
  }


  async getParkingStats() {
    try {
      const totalSpots = await prisma.parkingSpot.count();
      const freeSpots = await prisma.parkingSpot.count({
        where: { status: 'FREE' },
      });
      const bookedSpots = await prisma.parkingSpot.count({
        where: { status: 'BOOKED' },
      });
      const occupiedSpots = await prisma.parkingSpot.count({
        where: { status: 'OCCUPIED' },
      });
      const reservedSpots = await prisma.parkingSpot.count({
        where: { status: 'RESERVED' },
      });

      return {
        totalSpots,
        freeSpots,
        bookedSpots,
        occupiedSpots,
        reservedSpots,
        occupancyRate: ((occupiedSpots + reservedSpots) / totalSpots) * 100,
      };
    } catch (error) {
      logger.error('❌ Error fetching parking stats:', error);
      throw error;
    }
  }
}

export default new ParkingService();
