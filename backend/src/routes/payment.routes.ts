import { Router, Request, Response } from 'express';
import paymentService from '../services/payment.service';
import promoCodeService from '../services/promocode.service';
import { verifyToken } from '../middleware/auth';
import { validateWalletTopup, validatePromoCode } from '../middleware/validation.middleware';
import { logger } from '../server';

const router = Router();

// Все маршруты требуют авторизации
router.use(verifyToken);

/**
 * POST /payments/stripe/intent
 * Создать платежный intent для пополнения через Stripe
 */
router.post('/stripe/intent', validateWalletTopup, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const userId = req.userId!;

    const paymentIntent = await paymentService.createStripePaymentIntent(userId, amount);
    
    res.json({
      ...paymentIntent,
      message: '✅ Payment intent created',
    });
  } catch (error) {
    logger.error('❌ Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

/**
 * POST /payments/stripe/confirm
 * Подтвердить платеж Stripe (webhook)
 */
router.post('/stripe/confirm', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    const result = await paymentService.confirmStripePayment(paymentIntentId);
    
    res.json({
      ...result,
      message: '✅ Payment confirmed',
    });
  } catch (error) {
    logger.error('❌ Error confirming payment:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

/**
 * GET /payments/transactions
 * Получить историю транзакций пользователя
 */
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { limit = 50 } = req.query;

    const transactions = await paymentService.getUserTransactions(userId, Number(limit));
    
    res.json(transactions);
  } catch (error) {
    logger.error('❌ Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * POST /payments/promo/apply
 * Применить промокод
 */
router.post('/promo/apply', validatePromoCode, async (req: Request, res: Response) => {
  try {
    const { code, amount } = req.body;
    const userId = req.userId!;

    const result = await promoCodeService.applyPromoCode(userId, code, amount);
    
    res.json({
      ...result,
      message: '✅ Promo code applied',
    });
  } catch (error) {
    logger.error('❌ Error applying promo code:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to apply promo code' });
  }
});

/**
 * GET /payments/promo/codes
 * Получить активные промокоды
 */
router.get('/promo/codes', async (req: Request, res: Response) => {
  try {
    const promoCodes = await promoCodeService.getActivePromoCodes();
    
    res.json(promoCodes);
  } catch (error) {
    logger.error('❌ Error fetching promo codes:', error);
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});

/**
 * POST /payments/wallet/debit
 * Списать с кошелька (внутренний метод)
 */
router.post('/wallet/debit', async (req: Request, res: Response) => {
  try {
    const { amount, description } = req.body;
    const userId = req.userId!;

    if (!amount || !description) {
      return res.status(400).json({ error: 'Amount and description are required' });
    }

    const result = await paymentService.debitWallet(userId, amount, description);
    
    res.json({
      ...result,
      message: '✅ Wallet debited',
    });
  } catch (error) {
    logger.error('❌ Error debiting wallet:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to debit wallet' });
  }
});

export default router;
