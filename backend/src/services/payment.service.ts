import { PrismaClient } from '@prisma/client';
import stripe from '../config/stripe';
import { calculateCashback } from '../utils/pricing';
import { logger } from '../server';

const prisma = new PrismaClient();

export class PaymentService {
  /**
   * Пополнить кошелек через Stripe
   */
  async createStripePaymentIntent(userId: string, amount: number) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe работает в центах
        currency: 'kzt',
        metadata: {
          userId,
        },
      });

      // Создать запись о платеже
      const payment = await prisma.payment.create({
        data: {
          userId,
          amount,
          status: 'PENDING',
          paymentMethod: 'STRIPE',
          stripePaymentIntentId: paymentIntent.id,
        },
      });

      logger.info(`✅ Payment intent created: ${paymentIntent.id}`);
      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount,
      };
    } catch (error) {
      logger.error('❌ Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Подтвердить платёж Stripe
   */
  async confirmStripePayment(paymentIntentId: string) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment not succeeded');
      }

      const userId = paymentIntent.metadata.userId;
      const amount = paymentIntent.amount / 100;

      // Обновить платёж в БД
      const payment = await prisma.payment.update({
        where: { stripePaymentIntentId: paymentIntentId },
        data: { status: 'COMPLETED' },
      });

      // Пополнить кошелек
      const cashback = calculateCashback(amount);
      const totalCredit = amount + cashback;

      const transaction = await prisma.transaction.create({
        data: {
          userId,
          amount: totalCredit,
          type: 'DEPOSIT',
          description: `Пополнение кошелька: ${amount}₸ + ${cashback}₸ кэшбэк`,
          balanceBefore: (
            await prisma.user.findUnique({ where: { id: userId } })
          )?.walletBalance || 0,
          balanceAfter: 0,
        },
      });

      // Обновить баланс пользователя
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          walletBalance: { increment: totalCredit },
        },
      });

      logger.info(
        `✅ Payment confirmed: ${paymentIntentId}, credit: ${totalCredit}₸`
      );
      return {
        payment,
        transaction,
        walletBalance: updatedUser.walletBalance,
      };
    } catch (error) {
      logger.error('❌ Error confirming payment:', error);
      throw error;
    }
  }

  /**
   * Списать с кошелька для оплаты парковки
   */
  async debitWallet(userId: string, amount: number, description: string) {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.walletBalance < amount) {
        throw new Error('Insufficient balance');
      }

      const transaction = await prisma.transaction.create({
        data: {
          userId,
          amount,
          type: 'WITHDRAWAL',
          description,
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance - amount,
        },
      });

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          walletBalance: { decrement: amount },
        },
      });

      logger.info(`✅ Wallet debited: ${userId}, amount: ${amount}₸`);
      return {
        transaction,
        walletBalance: updatedUser.walletBalance,
      };
    } catch (error) {
      logger.error('❌ Error debiting wallet:', error);
      throw error;
    }
  }

  /**
   * Процессировать платеж за парковку
   */
  async processBookingPayment(bookingId: string) {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { user: true },
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      // Списать с кошелька
      const { walletBalance } = await this.debitWallet(
        booking.userId,
        booking.totalCost,
        `Оплата парковки: место ${booking.spotId}`
      );

      // Обновить платеж
      const payment = await prisma.payment.update({
        where: { bookingId },
        data: {
          status: 'COMPLETED',
        },
      });

      // Обновить бронирование
      const updatedBooking = await prisma.booking.update({
        where: { id: bookingId },
        data: { isPaid: true },
      });

      logger.info(`✅ Booking payment processed: ${bookingId}`);
      return {
        payment,
        booking: updatedBooking,
        walletBalance,
      };
    } catch (error) {
      logger.error('❌ Error processing booking payment:', error);
      throw error;
    }
  }

  /**
   * Получить историю транзакций пользователя
   */
  async getUserTransactions(userId: string, limit: number = 50) {
    try {
      const transactions = await prisma.transaction.findMany({
        where: { userId },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return transactions;
    } catch (error) {
      logger.error('❌ Error fetching transactions:', error);
      throw error;
    }
  }
}

export default new PaymentService();
