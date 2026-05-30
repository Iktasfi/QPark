import { Router, Request, Response } from 'express';
import { logger } from '../server';
import { prisma } from '../lib/prisma';

const router = Router();

// POST /applications — public, no auth required
router.post('/', async (req: Request, res: Response) => {
  try {
    const { companyName, ownerName, phone, email, address, city, spotsCount, description } = req.body;

    if (!companyName || !ownerName || !phone || !address || !city || !spotsCount) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const application = await prisma.application.create({
      data: { companyName, ownerName, phone, email: email ?? null, address, city, spotsCount: Number(spotsCount), description: description ?? null },
    });

    const { io } = await import('../server');
    io.emit('new-application', { id: application.id, companyName, city });

    logger.info(`📋 New landlord application: ${companyName} (${city}), ${spotsCount} spots`);
    res.status(201).json({ success: true, id: application.id });
  } catch (error) {
    logger.error('❌ Error creating application:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

export default router;
