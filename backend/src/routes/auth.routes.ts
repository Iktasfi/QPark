import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import authService from '../services/auth.service';
import { verifyToken } from '../middleware/auth';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

const router = Router();


router.post(
  '/firebase-login',
  [
    body('phoneNumber').isString().trim().notEmpty().withMessage('Phone number required'),
    body('firebaseUid').isString().trim().notEmpty().withMessage('Firebase UID required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
      }

      const { phoneNumber, firebaseUid } = req.body
      const { user, token, isNew } = await authService.firebaseLogin(phoneNumber, firebaseUid)

      res.json({ user, token, isNew })
    } catch (error) {
      logger.error('❌ Firebase login error:', error)
      res.status(500).json({ error: 'Login failed' })
    }
  }
)


router.post(
  '/register',
  [
    body('phoneNumber')
      .isString()
      .trim()
      .matches(/^\+\d{1,15}$/)
      .withMessage('Invalid phone number'),
    body('firstName').optional().isString().trim(),
    body('lastName').optional().isString().trim(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { phoneNumber, firstName, lastName } = req.body;


      const user = await authService.registerUser(phoneNumber, firstName, lastName);


      const token = authService.generateToken(user.id);

      res.json({
        user,
        token,
        message: '✅ Registered successfully',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User already exists') {
        return res.status(400).json({ error: 'User already exists' });
      }
      logger.error('❌ Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);


router.post(
  '/login',
  [
    body('phoneNumber')
      .isString()
      .trim()
      .matches(/^\+\d{1,15}$/)
      .withMessage('Invalid phone number'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { phoneNumber } = req.body;


      const user = await authService.findUserByPhone(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }


      const isBanned = await authService.isUserBanned(user.id);
      if (isBanned) {
        return res.status(403).json({ error: 'User is banned' });
      }


      const token = authService.generateToken(user.id);

      res.json({
        user,
        token,
        message: '✅ Logged in successfully',
      });
    } catch (error) {
      logger.error('❌ Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);


router.get('/me', verifyToken, async (req: Request, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await authService.getUserProfile(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('❌ Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});


router.put(
  '/me',
  verifyToken,
  [
    body('firstName').optional().isString().trim(),
    body('lastName').optional().isString().trim(),
    body('email').optional().isEmail(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      if (!req.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { firstName, lastName } = req.body;

      const updatedUser = await authService.updateUserProfile(req.userId, {
        firstName,
        lastName,
      });

      res.json({
        user: updatedUser,
        message: '✅ Profile updated',
      });
    } catch (error) {
      logger.error('❌ Profile update error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }
);


router.get('/verify-token', verifyToken, (req: Request, res: Response) => {
  res.json({ valid: true, userId: req.userId });
});


router.get('/cars', verifyToken, async (req: Request, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const cars = await prisma.car.findMany({
      where: { userId: req.userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    res.json(cars);
  } catch (error) {
    logger.error('❌ Error fetching cars:', error);
    res.status(500).json({ error: 'Failed to fetch cars' });
  }
});


router.post(
  '/cars',
  verifyToken,
  [
    body('brand').isString().trim().notEmpty().withMessage('Brand is required'),
    body('model').isString().trim().notEmpty().withMessage('Model is required'),
    body('plateNumber').isString().trim().notEmpty().withMessage('Plate number is required'),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

      const { brand, model, plateNumber } = req.body;

      const existing = await prisma.car.findUnique({ where: { plateNumber } });
      if (existing) {

        if (existing.deletedAt && existing.userId === req.userId) {
          const car = await prisma.car.update({
            where: { id: existing.id },
            data: { brand, model, deletedAt: null },
          });
          return res.json({ car, message: '✅ Car added' });
        }
        return res.status(400).json({ error: 'This plate number is already registered' });
      }

      const car = await prisma.car.create({
        data: { userId: req.userId, brand, model, plateNumber },
      });

      res.json({ car, message: '✅ Car added' });
    } catch (error) {
      logger.error('❌ Error adding car:', error);
      res.status(500).json({ error: 'Failed to add car' });
    }
  }
);


router.delete('/cars/:id', verifyToken, async (req: Request, res: Response) => {
  try {
    if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
    const car = await prisma.car.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: null } });
    if (!car) return res.status(404).json({ error: 'Car not found' });
    await prisma.car.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.json({ message: '✅ Car removed' });
  } catch (error) {
    logger.error('❌ Error deleting car:', error);
    res.status(500).json({ error: 'Failed to delete car' });
  }
});

export default router;
