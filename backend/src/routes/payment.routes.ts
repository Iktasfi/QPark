import { Router, Request, Response } from 'express';
import paymentService from '../services/payment.service';
import promoCodeService from '../services/promocode.service';
import { verifyToken } from '../middleware/auth';
import { validateWalletTopup, validatePromoCode } from '../middleware/validation.middleware';
import { logger } from '../server';

const router = Router();


router.use(verifyToken);


router.post('/topup', validateWalletTopup, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const userId = req.userId!;
    const result = await paymentService.topUpWallet(userId, Number(amount));
    res.json({ ...result, message: '✅ Wallet topped up' });
  } catch (error) {
    logger.error('❌ Error topping up wallet:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Top-up failed' });
  }
});


router.post('/stripe/create-intent', validateWalletTopup, async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const userId = req.userId!;
    const result = await paymentService.createStripeIntent(userId, Number(amount));
    res.json(result);
  } catch (error) {
    logger.error('❌ Stripe intent error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create payment intent' });
  }
});


router.post('/stripe/confirm', async (req: Request, res: Response) => {
  try {
    const { paymentIntentId } = req.body;
    const userId = req.userId!;
    if (!paymentIntentId) return res.status(400).json({ error: 'paymentIntentId is required' });
    const result = await paymentService.confirmStripeTopUp(userId, paymentIntentId);
    res.json({ ...result, message: '✅ Payment confirmed, wallet credited' });
  } catch (error) {
    logger.error('❌ Stripe confirm error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Confirmation failed' });
  }
});


router.get('/admin/transactions', async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.query;
    const transactions = await paymentService.getAllTransactions(Number(limit));
    res.json(transactions);
  } catch (error) {
    logger.error('❌ Error fetching all transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});


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


router.post('/promo/apply', async (req: Request, res: Response) => {
  try {
    const { code, amount } = req.body;
    const userId = req.userId!;
    if (!code) return res.status(400).json({ error: 'Promo code is required' });

    const result = await promoCodeService.applyPromoCode(userId, code, Number(amount) || 0);

    res.json({
      ...result,
      message: '✅ Promo code applied',
    });
  } catch (error) {
    logger.error('❌ Error applying promo code:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to apply promo code' });
  }
});


router.get('/promo/codes', async (req: Request, res: Response) => {
  try {
    const promoCodes = await promoCodeService.getActivePromoCodes();
    res.json(promoCodes);
  } catch (error) {
    logger.error('❌ Error fetching promo codes:', error);
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});


router.post('/promo/create', async (req: Request, res: Response) => {
  try {
    const { code, discount, type, maxUses, expiresAt } = req.body;
    if (!code || !discount || !type) {
      return res.status(400).json({ error: 'code, discount and type are required' });
    }
    const promo = await promoCodeService.createPromoCode({
      code,
      discount: Number(discount),
      type,
      maxUses: maxUses ? Number(maxUses) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    res.status(201).json(promo);
  } catch (error) {
    logger.error('❌ Error creating promo code:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create promo code' });
  }
});


router.get('/promo/all', async (req: Request, res: Response) => {
  try {
    const promoCodes = await promoCodeService.getAllPromoCodes();
    res.json(promoCodes);
  } catch (error) {
    logger.error('❌ Error fetching all promo codes:', error);
    res.status(500).json({ error: 'Failed to fetch promo codes' });
  }
});


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
