import { prisma } from '../lib/prisma';
import { logger } from '../server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let messaging: any = null;

async function getMessaging() {
  if (messaging) return messaging;
  try {
    const admin = await import('../config/firebase');
    messaging = admin.messaging;
    return messaging;
  } catch {
    return null;
  }
}

export async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, string>) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
    if (!user?.fcmToken) return;

    const m = await getMessaging();
    if (!m) return;

    await m.send({
      token: user.fcmToken,
      notification: { title, body },
      data,
      webpush: {
        notification: { title, body, icon: '/icons/icon-192x192.png', badge: '/icons/icon-192x192.png' },
        fcmOptions: { link: '/' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    });

    logger.info(`🔔 Push sent to user ${userId}: ${title}`);
  } catch (err) {
    logger.error(`❌ Push failed for user ${userId}:`, err);
  }
}
