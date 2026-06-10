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

// APNs device tokens are exactly 64 hex chars
function isApnsToken(token: string): boolean {
  return /^[0-9a-f]{64}$/i.test(token);
}

async function sendViaApns(deviceToken: string, title: string, body: string): Promise<void> {
  const keyBase64 = process.env.APNS_KEY_BASE64;
  const keyId     = process.env.APNS_KEY_ID;
  const teamId    = process.env.APNS_TEAM_ID;
  const bundleId  = process.env.APNS_BUNDLE_ID ?? 'com.qpark.app';

  if (!keyBase64 || !keyId || !teamId) {
    logger.warn('⚠️  APNs env vars not set — skipping iOS push');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const apn = require('apn');
  const keyBuffer = Buffer.from(keyBase64, 'base64');

  const provider = new apn.Provider({
    token: { key: keyBuffer, keyId, teamId },
    production: false,   // true after App Store release
  });

  const note = new apn.Notification();
  note.expiry    = Math.floor(Date.now() / 1000) + 3600;
  note.badge     = 1;
  note.sound     = 'default';
  note.alert     = { title, body };
  note.topic     = bundleId;

  const result = await provider.send(note, deviceToken);
  provider.shutdown();

  if (result.failed.length > 0) {
    logger.error('❌ APNs send failed:', result.failed[0].error ?? result.failed[0].response);
  } else {
    logger.info(`🔔 APNs push sent: ${title}`);
  }
}

export async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, string>) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
    if (!user?.fcmToken) return;

    // iOS native token (APNs) → use APNs API
    if (isApnsToken(user.fcmToken)) {
      await sendViaApns(user.fcmToken, title, body);
      return;
    }

    // Web FCM token → use Firebase Admin
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

    logger.info(`🔔 FCM push sent to user ${userId}: ${title}`);
  } catch (err) {
    logger.error(`❌ Push failed for user ${userId}:`, err);
  }
}
