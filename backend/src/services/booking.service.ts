import { PrismaClient } from '@prisma/client';
import { calculateShortTermCost, getFreeTravelTimeRemaining } from '../utils/pricing';
import { logger } from '../server';

const prisma = new PrismaClient();

export class BookingService {
  /**
   * Создать краткосрочное бронирование
   */
  async createShortTermBooking(userId: string, spotId: string) {
    try {
      const now = new Date();
      const estimatedEndTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 минут свободно

      const booking = await prisma.booking.create({
        data: {
          userId,
          spotId,
          startTime: now,
          estimatedEndTime,
          status: 'PENDING',
        },
        include: {
          spot: true,
          user: true,
        },
      });

      // Обновить статус места на BOOKED
      await prisma.parkingSpot.update({
        where: { id: spotId },
        data: { status: 'BOOKED' },
      });

      logger.info(`✅ Short-term booking created: ${booking.id}`);
      return booking;
    } catch (error) {
      logger.error('❌ Error creating booking:', error);
      throw error;
    }
  }

  /**
   * Завершить бронирование
   */
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

      // Обновить место обратно на FREE
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

  /**
   * Отменить бронирование
   */
  async cancelBooking(bookingId: string, reason: string = 'User cancelled') {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { spot: true, user: true },
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      const updatedBooking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
        },
      });

      // Обновить место обратно на FREE
      await prisma.parkingSpot.update({
        where: { id: booking.spotId },
        data: { status: 'FREE' },
      });

      // Увеличить счетчик no-show
      const freeTimeRemaining = getFreeTravelTimeRemaining(booking.startTime);
      if (freeTimeRemaining > 0) {
        await prisma.user.update({
          where: { id: booking.userId },
          data: {
            noShowCount: { increment: 1 },
          },
        });
      }

      logger.info(`✅ Booking cancelled: ${bookingId}, reason: ${reason}`);
      return updatedBooking;
    } catch (error) {
      logger.error('❌ Error cancelling booking:', error);
      throw error;
    }
  }

  /**
   * Получить все активные бронирования пользователя
   */
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

  /**
   * Получить бронирование по номеру машины (для LPR)
   */
  async getBookingByCarPlate(carPlate: string) {
    try {
      const booking = await prisma.booking.findFirst({
        where: {
          user: { carPlate },
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
