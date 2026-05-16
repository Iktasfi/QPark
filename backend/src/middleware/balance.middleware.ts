import { Request, Response, NextFunction } from 'express';
import { logger } from '../server';
import { prisma } from '../lib/prisma';


export const checkBalance = (requiredAmount: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.walletBalance < requiredAmount) {
        return res.status(402).json({
          error: 'Insufficient balance',
          required: requiredAmount,
          current: user.walletBalance,
        });
      }


      req.user = user;
      next();
    } catch (error) {
      logger.error('❌ Error checking balance:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};


export const checkBanStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isBanned) {

      if (user.bannedUntil && user.bannedUntil < new Date()) {
        await prisma.user.update({
          where: { id: req.userId },
          data: {
            isBanned: false,
            bannedUntil: null,
            noShowCount: 0,
          },
        });
      } else {
        return res.status(403).json({
          error: 'User is banned',
          bannedUntil: user.bannedUntil,
        });
      }
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('❌ Error checking ban status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


export const requireCarPlate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('❌ Error checking car plate:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}
