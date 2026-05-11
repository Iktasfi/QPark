import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

// Общий обработчик ошибок валидации
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

// Валидация для регистрации
export const validateRegister = [
  body('phoneNumber')
    .isString()
    .trim()
    .matches(/^\+\d{1,15}$/)
    .withMessage('Invalid phone number format'),
  body('firstName').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('lastName').optional().isString().trim().isLength({ min: 1, max: 50 }),
  handleValidationErrors,
];

// Валидация для входа
export const validateLogin = [
  body('phoneNumber')
    .isString()
    .trim()
    .matches(/^\+\d{1,15}$/)
    .withMessage('Invalid phone number format'),
  handleValidationErrors,
];

// Валидация для обновления профиля
export const validateProfileUpdate = [
  body('firstName').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('lastName').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('carPlate').optional().isString().trim().isLength({ min: 3, max: 10 }),
  handleValidationErrors,
];

// Валидация для создания бронирования
export const validateBooking = [
  body('spotId').isString().notEmpty().withMessage('Spot ID is required'),
  handleValidationErrors,
];

// Валидация для долгосрочной аренды
export const validateLongTermRental = [
  body('spotId').isString().notEmpty().withMessage('Spot ID is required'),
  body('rentalDays')
    .isInt({ min: 1, max: 14 })
    .isIn([1, 3, 5, 7, 14])
    .withMessage('Rental days must be 1, 3, 5, 7, or 14'),
  handleValidationErrors,
];

// Валидация для промокода
export const validatePromoCode = [
  body('code').isString().trim().isLength({ min: 3, max: 20 }).withMessage('Invalid promo code'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be positive'),
  handleValidationErrors,
];

// Валидация для создания промокода (админ)
export const validatePromoCodeCreate = [
  body('code').isString().trim().isLength({ min: 3, max: 20 }).withMessage('Invalid promo code'),
  body('discount').isFloat({ min: 0 }).withMessage('Discount must be positive'),
  body('type').isIn(['PERCENTAGE', 'FIXED', 'FIRST_RIDE']).withMessage('Invalid promo type'),
  body('maxUses').optional().isInt({ min: 1 }).withMessage('Max uses must be positive'),
  body('expiresAt').optional().isISO8601().toDate().withMessage('Invalid expiration date'),
  handleValidationErrors,
];

// Валидация для пополнения кошелька
export const validateWalletTopup = [
  body('amount').isFloat({ min: 100 }).withMessage('Minimum amount is 100₸'),
  handleValidationErrors,
];

// Валидация для LPR событий
export const validateLPREvent = [
  body('carPlate').isString().trim().isLength({ min: 3, max: 10 }).withMessage('Invalid car plate'),
  body('spotNumber').isString().trim().isLength({ min: 3, max: 10 }).withMessage('Invalid spot number'),
  body('eventType').isIn(['ENTRY', 'EXIT']).withMessage('Invalid event type'),
  handleValidationErrors,
];
