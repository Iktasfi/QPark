import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { logger } from '../server';

const prisma = new PrismaClient();

export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  private readonly JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

  /**
   * Регистрация пользователя по номеру телефона
   */
  async registerUser(phoneNumber: string, firstName?: string, lastName?: string) {
    try {
      // Проверить, есть ли уже пользователь
      const existingUser = await prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (existingUser) {
        throw new Error('User already exists');
      }

      // Создать пользователя
      const user = await prisma.user.create({
        data: {
          phoneNumber,
          firstName,
          lastName,
          walletBalance: 150, // Промокод FIRST - первые 150 тенге
        },
      });

      // Создать транзакцию для промокода
      await prisma.transaction.create({
        data: {
          userId: user.id,
          amount: 150,
          type: 'PROMO',
          description: 'Промокод FIRST для новых пользователей',
          balanceBefore: 0,
          balanceAfter: 150,
        },
      });

      logger.info(`✅ User registered: ${phoneNumber}`);
      return user;
    } catch (error) {
      logger.error('❌ Error registering user:', error);
      throw error;
    }
  }

  /**
   * Найти пользователя
   */
  async findUserByPhone(phoneNumber: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { phoneNumber },
      });

      return user;
    } catch (error) {
      logger.error('❌ Error finding user:', error);
      throw error;
    }
  }

  /**
   * Получить JWT токен
   */
  generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRE } as SignOptions
    );
  }

  /**
   * Проверить JWT токен
   */
  verifyToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET);
      return decoded as { userId: string };
    } catch (error) {
      logger.error('❌ Invalid token:', error);
      return null;
    }
  }

  /**
   * Обновить профиль пользователя
   */
  async updateUserProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      carPlate?: string;
    }
  ) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data,
      });

      logger.info(`✅ User profile updated: ${userId}`);
      return user;
    } catch (error) {
      logger.error('❌ Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Получить профиль пользователя
   */
  async getUserProfile(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      return user;
    } catch (error) {
      logger.error('❌ Error fetching user profile:', error);
      throw error;
    }
  }

  /**
   * Проверить и применить бан
   */
  async checkAndApplyBan(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const BAN_THRESHOLD = parseInt(process.env.BAN_THRESHOLD || '6');
      const BAN_DURATION = parseInt(process.env.BAN_DURATION || '259200'); // 3 дня в секундах

      if (user.noShowCount >= BAN_THRESHOLD) {
        const bannedUntil = new Date(Date.now() + BAN_DURATION * 1000);

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: {
            isBanned: true,
            bannedUntil,
            noShowCount: 0,
          },
        });

        logger.warn(
          `⚠️  User banned: ${userId}, until ${bannedUntil.toISOString()}`
        );
        return updatedUser;
      }

      return user;
    } catch (error) {
      logger.error('❌ Error checking ban:', error);
      throw error;
    }
  }

  /**
   * Разблокировать пользователя (для админа)
   */
  async unbanUser(userId: string) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          isBanned: false,
          bannedUntil: null,
          noShowCount: 0,
        },
      });

      logger.info(`✅ User unbanned: ${userId}`);
      return user;
    } catch (error) {
      logger.error('❌ Error unbanning user:', error);
      throw error;
    }
  }

  /**
   * Проверить, забанен ли пользователь
   */
  async isUserBanned(userId: string): Promise<boolean> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return false;
      }

      if (!user.isBanned) {
        return false;
      }

      // Если срок бана истёк, разблокировать
      if (user.bannedUntil && user.bannedUntil < new Date()) {
        await this.unbanUser(userId);
        return false;
      }

      return user.isBanned;
    } catch (error) {
      logger.error('❌ Error checking ban status:', error);
      return false;
    }
  }
}

export default new AuthService();
