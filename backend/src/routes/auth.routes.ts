import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import authService from '../services/auth.service';
import { verifyToken } from '../middleware/auth';
import { logger } from '../server';

const router = Router();

/**
 * POST /auth/register
 * Регистрация нового пользователя
 */
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

      // Попытаться зарегистрировать пользователя
      const user = await authService.registerUser(phoneNumber, firstName, lastName);

      // Сгенерировать токен
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

/**
 * POST /auth/login
 * Вход пользователя
 */
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

      // Найти пользователя
      const user = await authService.findUserByPhone(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Проверить, забанен ли
      const isBanned = await authService.isUserBanned(user.id);
      if (isBanned) {
        return res.status(403).json({ error: 'User is banned' });
      }

      // Сгенерировать токен
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

/**
 * GET /auth/me
 * Получить информацию о текущем пользователе
 */
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

/**
 * PUT /auth/me
 * Обновить профиль пользователя
 */
router.put(
  '/me',
  verifyToken,
  [
    body('firstName').optional().isString().trim(),
    body('lastName').optional().isString().trim(),
    body('email').optional().isEmail(),
    body('carPlate').optional().isString().trim().toUpperCase(),
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

      const { firstName, lastName, email, carPlate } = req.body;

      const updatedUser = await authService.updateUserProfile(req.userId, {
        firstName,
        lastName,
        email,
        carPlate,
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

/**
 * GET /auth/verify-token
 * Проверить валидность токена
 */
router.get('/verify-token', verifyToken, (req: Request, res: Response) => {
  res.json({
    valid: true,
    userId: req.userId,
  });
});

export default router;
