import Stripe from 'stripe';
import { calculateShortTermCost } from '../utils/pricing';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

export class PaymentService {
  async topUpWallet(userId: string, amount: number) {
    if (amount <= 0) throw new Error('Amount must be positive');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const [transaction, updatedUser] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          amount,
          type: 'DEPOSIT',
          description: 'Пополнение кошелька',
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance + amount,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
      }),
    ]);

    logger.info(`✅ Wallet top-up: ${userId}, +${amount}₸ → ${updatedUser.walletBalance}₸`);
    return { transaction, walletBalance: updatedUser.walletBalance };
  }

  async debitWallet(userId: string, amount: number, description: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (user.walletBalance < amount) throw new Error('Insufficient balance');

    const [transaction, updatedUser] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          amount: -amount,
          type: 'PAYMENT',
          description,
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance - amount,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { decrement: amount } },
      }),
    ]);

    logger.info(`✅ Wallet debit: ${userId}, -${amount}₸ → ${updatedUser.walletBalance}₸`);
    return { transaction, walletBalance: updatedUser.walletBalance };
  }

  async payLongTermRental(userId: string, spotNumber: string, rentalDays: number, totalCost: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (user.walletBalance < totalCost) {
      throw new Error(`Insufficient balance: need ${totalCost}₸, have ${user.walletBalance}₸`);
    }

    const [transaction, updatedUser] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          amount: -totalCost,
          type: 'PAYMENT',
          description: `Долгосрочная аренда ${spotNumber} — ${rentalDays} дн.`,
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance - totalCost,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { decrement: totalCost } },
      }),
    ]);

    logger.info(`✅ Long-term rental paid: ${userId}, ${spotNumber}, -${totalCost}₸`);
    return { transaction, walletBalance: updatedUser.walletBalance };
  }

  async checkoutBooking(spotNumber: string, userId: string) {
    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) throw new Error('Spot not found');

    const booking = await prisma.booking.findFirst({
      where: {
        userId,
        spotId: spot.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!booking) throw new Error('No active booking found for this spot');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const now = new Date();

    if (booking.isPaid) {
      const updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: { actualEndTime: now, status: 'COMPLETED' },
      });
      return {
        booking: updatedBooking,
        parkingCost: booking.totalCost ?? 0,
        alreadyPaidWaiting: 0,
        netCharge: 0,
        bonusEarned: 0,
        walletBalance: user.walletBalance,
        bonusPoints: user.bonusPoints,
      };
    }

    const totalMinutes = Math.ceil((now.getTime() - booking.startTime.getTime()) / 60000);
    const paidMinutes = Math.max(0, totalMinutes - 15);
    const parkingCost = calculateShortTermCost(paidMinutes);
    const alreadyPaidWaiting = booking.minutesExtended > 0 ? 75 : 0;
    const netCharge = Math.max(0, parkingCost - alreadyPaidWaiting);
    const bonusEarned = Math.floor(parkingCost * 0.01);

    if (user.walletBalance < netCharge) {
      throw new Error(`Insufficient balance: need ${netCharge}₸, have ${user.walletBalance}₸`);
    }

    const [updatedBooking, _transaction, updatedUser] = await prisma.$transaction([
      prisma.booking.update({
        where: { id: booking.id },
        data: { actualEndTime: now, status: 'COMPLETED', totalCost: parkingCost, isPaid: true },
      }),
      prisma.transaction.create({
        data: {
          userId,
          amount: -netCharge,
          type: 'PAYMENT',
          description: `Краткосрочная парковка ${spotNumber}, ${paidMinutes} мин`,
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance - netCharge,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          walletBalance: { decrement: netCharge },
          bonusPoints: { increment: bonusEarned },
        },
      }),
    ]);

    logger.info(`✅ Checkout: ${userId} → ${spotNumber}, cost ${parkingCost}₸, net ${netCharge}₸, bonus +${bonusEarned}`);
    return {
      booking: updatedBooking,
      parkingCost,
      alreadyPaidWaiting,
      netCharge,
      bonusEarned,
      walletBalance: updatedUser.walletBalance,
      bonusPoints: updatedUser.bonusPoints,
    };
  }

  async extendWaiting(spotNumber: string, userId: string) {
    const spot = await prisma.parkingSpot.findUnique({ where: { spotNumber } });
    if (!spot) throw new Error('Spot not found');

    const booking = await prisma.booking.findFirst({
      where: {
        userId,
        spotId: spot.id,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!booking) throw new Error('No active booking found for this spot');

    const EXTEND_COST = 75;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (user.walletBalance < EXTEND_COST) throw new Error('Insufficient balance');

    const newDeadline = new Date(booking.estimatedEndTime.getTime() + 30 * 60 * 1000);

    const [updatedBooking, _transaction, updatedUser] = await prisma.$transaction([
      prisma.booking.update({
        where: { id: booking.id },
        data: { estimatedEndTime: newDeadline, minutesExtended: { increment: 30 } },
      }),
      prisma.transaction.create({
        data: {
          userId,
          amount: -EXTEND_COST,
          type: 'PAYMENT',
          description: `Продление ожидания ${spotNumber} +30 мин`,
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance - EXTEND_COST,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { decrement: EXTEND_COST } },
      }),
    ]);

    logger.info(`✅ Waiting extended: ${userId} → ${spotNumber}, -75₸, new deadline ${newDeadline.toISOString()}`);
    return {
      booking: updatedBooking,
      newDeadline,
      walletBalance: updatedUser.walletBalance,
      extendCost: EXTEND_COST,
    };
  }

  async createStripeIntent(userId: string, amount: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const amountTiyn = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountTiyn,
      currency: 'kzt',
      metadata: { userId, walletAmount: amount.toString() },
      description: `QPark wallet top-up ${amount}₸ for user ${userId}`,
    });

    logger.info(`💳 Stripe intent created: ${paymentIntent.id}, ${amount}₸ for ${userId}`);
    return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
  }

  async confirmStripeTopUp(userId: string, paymentIntentId: string) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment not completed: status=${paymentIntent.status}`);
    }

    if (paymentIntent.metadata.userId !== userId) {
      throw new Error('Payment intent does not belong to this user');
    }

    const existing = await prisma.transaction.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (existing) {
      throw new Error('This payment has already been credited');
    }

    const amount = Number(paymentIntent.metadata.walletAmount);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const [transaction, updatedUser] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          amount,
          type: 'DEPOSIT',
          description: `Пополнение через Stripe (тест)`,
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance + amount,
          stripePaymentIntentId: paymentIntentId,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
      }),
    ]);

    logger.info(`✅ Stripe top-up confirmed: ${userId}, +${amount}₸ → ${updatedUser.walletBalance}₸`);
    return { transaction, walletBalance: updatedUser.walletBalance };
  }

  async getUserTransactions(userId: string, limit = 50) {
    return prisma.transaction.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllTransactions(limit = 100) {
    return prisma.transaction.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, phoneNumber: true, firstName: true, lastName: true } },
      },
    });
  }
}

export default new PaymentService();
