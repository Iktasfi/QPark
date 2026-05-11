import { PrismaClient } from '@prisma/client';
import { logger } from '../server';

const prisma = new PrismaClient();

export class PromoCodeService {
  /**
   * Создать новый промокод
   */
  async createPromoCode(data: {
    code: string;
    discount: number;
    type: 'PERCENTAGE' | 'FIXED' | 'FIRST_RIDE';
    maxUses?: number;
    expiresAt?: Date;
  }) {
    try {
      const promoCode = await prisma.promoCode.create({
        data: {
          code: data.code.toUpperCase(),
          discount: data.discount,
          type: data.type,
          maxUses: data.maxUses,
          expiresAt: data.expiresAt,
        },
      });

      logger.info(`✅ Promo code created: ${promoCode.code}`);
      return promoCode;
    } catch (error) {
      logger.error('❌ Error creating promo code:', error);
      throw error;
    }
  }

  /**
   * Применить промокод
   */
  async applyPromoCode(userId: string, code: string, amount: number) {
    try {
      const promoCode = await prisma.promoCode.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (!promoCode) {
        throw new Error('Promo code not found');
      }

      // Проверить активность
      if (!promoCode.isActive) {
        throw new Error('Promo code is inactive');
      }

      // Проверить срок действия
      if (promoCode.expiresAt && promoCode.expiresAt < new Date()) {
        throw new Error('Promo code has expired');
      }

      // Проверить лимит использований
      if (promoCode.maxUses && promoCode.usedCount >= promoCode.maxUses) {
        throw new Error('Promo code usage limit exceeded');
      }

      // Для промокода FIRST - проверить первый ли это раз для пользователя
      if (promoCode.type === 'FIRST_RIDE') {
        const existingPayments = await prisma.payment.count({
          where: { userId },
        });
        
        if (existingPayments > 0) {
          throw new Error('First ride promo only for new users');
        }
      }

      // Рассчитать скидку
      let discountAmount = 0;
      if (promoCode.type === 'FIXED') {
        discountAmount = Math.min(promoCode.discount, amount);
      } else if (promoCode.type === 'PERCENTAGE') {
        discountAmount = Math.floor((amount * promoCode.discount) / 100);
      } else if (promoCode.type === 'FIRST_RIDE') {
        discountAmount = Math.min(promoCode.discount, amount);
      }

      // Обновить счетчик использований
      await prisma.promoCode.update({
        where: { id: promoCode.id },
        data: { usedCount: { increment: 1 } },
      });

      logger.info(`✅ Promo code applied: ${code}, discount: ${discountAmount}₸`);
      return {
        promoCode,
        discountAmount,
        finalAmount: amount - discountAmount,
      };
    } catch (error) {
      logger.error('❌ Error applying promo code:', error);
      throw error;
    }
  }

  /**
   * Получить все промокоды
   */
  async getAllPromoCodes() {
    try {
      const promoCodes = await prisma.promoCode.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return promoCodes;
    } catch (error) {
      logger.error('❌ Error fetching promo codes:', error);
      throw error;
    }
  }

  /**
   * Получить активные промокоды
   */
  async getActivePromoCodes() {
    try {
      const promoCodes = await prisma.promoCode.findMany({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });

      return promoCodes;
    } catch (error) {
      logger.error('❌ Error fetching active promo codes:', error);
      throw error;
    }
  }

  /**
   * Обновить промокод
   */
  async updatePromoCode(id: string, data: Partial<{
    discount: number;
    type: 'PERCENTAGE' | 'FIXED' | 'FIRST_RIDE';
    maxUses: number;
    isActive: boolean;
    expiresAt: Date;
  }>) {
    try {
      const promoCode = await prisma.promoCode.update({
        where: { id },
        data,
      });

      logger.info(`✅ Promo code updated: ${promoCode.code}`);
      return promoCode;
    } catch (error) {
      logger.error('❌ Error updating promo code:', error);
      throw error;
    }
  }

  /**
   * Удалить промокод
   */
  async deletePromoCode(id: string) {
    try {
      const promoCode = await prisma.promoCode.delete({
        where: { id },
      });

      logger.info(`✅ Promo code deleted: ${promoCode.code}`);
      return promoCode;
    } catch (error) {
      logger.error('❌ Error deleting promo code:', error);
      throw error;
    }
  }

  /**
   * Получить статистику использования промокода
   */
  async getPromoCodeStats(id: string) {
    try {
      const promoCode = await prisma.promoCode.findUnique({
        where: { id },
        include: {
          _count: true,
        },
      });

      if (!promoCode) {
        throw new Error('Promo code not found');
      }

      return {
        promoCode,
        usageRate: promoCode.maxUses ? (promoCode.usedCount / promoCode.maxUses) * 100 : null,
        isExpired: promoCode.expiresAt ? promoCode.expiresAt < new Date() : false,
      };
    } catch (error) {
      logger.error('❌ Error fetching promo code stats:', error);
      throw error;
    }
  }
}

export default new PromoCodeService();
