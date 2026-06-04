import { Router, Request, Response } from 'express';
import { verifyToken } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logger } from '../server';

const router = Router();

// ─── USER: get own messages ───────────────────────────────────
router.get('/messages', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const messages = await prisma.supportMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    // Mark admin messages as read
    await prisma.supportMessage.updateMany({
      where: { userId, fromAdmin: true, isRead: false },
      data: { isRead: true },
    });

    res.json(messages);
  } catch (error) {
    logger.error('❌ Error fetching support messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ─── USER: send message ───────────────────────────────────────
router.post('/messages', verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const message = await prisma.supportMessage.create({
      data: { userId, text: text.trim(), fromAdmin: false },
      include: { user: { select: { firstName: true, phoneNumber: true } } },
    });

    const { io } = await import('../server');
    io.emit('support-new-message', {
      messageId: message.id,
      userId,
      text: message.text,
      createdAt: message.createdAt,
      userName: message.user.firstName ?? message.user.phoneNumber,
    });

    logger.info(`💬 Support message from ${userId}: ${text.substring(0, 50)}`);
    res.status(201).json(message);
  } catch (error) {
    logger.error('❌ Error sending support message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ─── ADMIN: get all conversations ────────────────────────────
router.get('/admin/conversations', async (req: Request, res: Response) => {
  try {
    // Get latest message per user
    const messages = await prisma.supportMessage.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, phoneNumber: true } } },
      distinct: ['userId'],
    });

    const conversations = await Promise.all(messages.map(async (m) => {
      const unread = await prisma.supportMessage.count({
        where: { userId: m.userId, fromAdmin: false, isRead: false },
      });
      return {
        userId: m.userId,
        userName: m.user.firstName ?? m.user.phoneNumber,
        phoneNumber: m.user.phoneNumber,
        lastMessage: m.text,
        lastMessageAt: m.createdAt,
        fromAdmin: m.fromAdmin,
        unreadCount: unread,
      };
    }));

    res.json(conversations);
  } catch (error) {
    logger.error('❌ Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// ─── ADMIN: get messages for a specific user ──────────────────
router.get('/admin/messages/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const messages = await prisma.supportMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    // Mark user messages as read
    await prisma.supportMessage.updateMany({
      where: { userId, fromAdmin: false, isRead: false },
      data: { isRead: true },
    });

    res.json(messages);
  } catch (error) {
    logger.error('❌ Error fetching user messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ─── ADMIN: reply to user ─────────────────────────────────────
router.post('/admin/reply', async (req: Request, res: Response) => {
  try {
    const { userId, text } = req.body;
    if (!userId || !text?.trim()) {
      return res.status(400).json({ error: 'userId and text are required' });
    }

    const message = await prisma.supportMessage.create({
      data: { userId, text: text.trim(), fromAdmin: true },
    });

    const { io } = await import('../server');
    // Notify the specific user's socket room
    io.to(`support-${userId}`).emit('support-reply', {
      id: message.id,
      text: message.text,
      fromAdmin: true,
      createdAt: message.createdAt,
    });
    // Also notify admin dashboard to update conversation
    io.emit('support-reply-sent', { userId, messageId: message.id });

    logger.info(`💬 Admin replied to ${userId}: ${text.substring(0, 50)}`);
    res.status(201).json(message);
  } catch (error) {
    logger.error('❌ Error sending admin reply:', error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

export default router;
