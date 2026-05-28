import { calculateShortTermCost, getFreeTravelTimeRemaining } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

export class BookingService {

  async createShortTermBooking(userId: string, spotId: string, plateNumber: string = '') {
    try {
      const now = new Date();
      const estimatedEndTime = new Date(now.getTime() + 15 * 60 * 1000);

      // Get user's car plate if not provided
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { carPlate: true } });
      const plate = plateNumber || user?.carPlate || '';

      const booking = await prisma.booking.create({
        data: {
          userId,
          spotId,
          plateNumber: plate,
          startTime: now,
          estimatedEndTime,
          status: 'PENDING',
        },
        include: {
          spot: true,
          user: true,
        },
      });


      await prisma.parkingSpot.update({
        where: { id: spotId },
        data: { status: 'BOOKED', currentUserPlate: plate, currentUserId: userId },
      });

      logger.info(`✅ Short-term booking created: ${booking.id}`);
      return booking;
    } catch (error) {
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

      // No-show refund logic
      if (isNoShow && booking.totalCost && booking.totalCost > 0) {
        const isLongTerm = booking.spot?.type === 'LONG_TERM';
        if (isLongTerm) {
          // Keep 900₸ (1 day), refund the rest
          refundAmount = Math.max(0, booking.totalCost - 900);
        } else {
          // Short-term: refund 50%
          refundAmount = Math.floor(booking.totalCost * 0.5);
        }

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
              description: `Возврат при неявке: ${bookingId}`,
              balanceBefore: booking.user?.walletBalance ?? 0,
              balanceAfter: (booking.user?.walletBalance ?? 0) + refundAmount,
            },
          });
          logger.info(`💰 No-show refund: ${refundAmount}₸ → user ${booking.userId}`);
        }

        await prisma.user.update({
          where: { id: booking.userId },
          data: { noShowCount: { increment: 1 } },
        });
      }

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
