import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  private readonly JWT_EXPIRE = process.env.JWT_EXPIRE || '24h';


  async registerUser(phoneNumber: string, firstName?: string, lastName?: string) {
    try {

      const existingUser = await prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (existingUser) {
        throw new Error('User already exists');
      }


      const user = await prisma.user.create({
        data: {
          phoneNumber,
          firstName,
          lastName,
          walletBalance: 150,
        },
      });


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


  async firebaseLogin(phoneNumber: string, firebaseUid: string) {
    try {
      let isNew = false


      let user = await prisma.user.findUnique({
        where: { phoneNumber },
        include: {
          cars: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
          transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      })

      if (!user) {
        isNew = true
        user = await prisma.user.create({
          data: {
            phoneNumber,
            walletBalance: 150,
            bonusPoints: 0,
          },
          include: { cars: true, transactions: true },
        })


        await prisma.transaction.create({
          data: {
            userId: user.id,
            amount: 150,
            type: 'PROMO',
            description: 'Стартовый бонус для новых пользователей',
            balanceBefore: 0,
            balanceAfter: 150,
          },
        })

        logger.info(`✅ New user registered via Firebase: ${phoneNumber}`)
      } else {
        logger.info(`✅ Existing user logged in: ${phoneNumber}`)
      }

      const token = this.generateToken(user.id)
      return { user, token, isNew }
    } catch (error) {
      logger.error('❌ Firebase login error:', error)
      throw error
    }
  }


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


  generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRE } as SignOptions
    );
  }


  verifyToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET);
      return decoded as { userId: string };
    } catch (error) {
      logger.error('❌ Invalid token:', error);
      return null;
    }
  }


  async updateUserProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
    }
  ) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data,
        include: { cars: true },
      });

      logger.info(`✅ User profile updated: ${userId}`);
      return user;
    } catch (error) {
      logger.error('❌ Error updating user profile:', error);
      throw error;
    }
  }


  async getUserProfile(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          cars: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
          transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
        },
      })
      return user
    } catch (error) {
      logger.error('❌ Error fetching user profile:', error)
      throw error
    }
  }


}

export default new AuthService();
