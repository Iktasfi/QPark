import admin from 'firebase-admin';
import { logger } from '../server';

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!firebaseConfig.projectId || !firebaseConfig.privateKey || !firebaseConfig.clientEmail) {
  logger.warn('⚠️  Firebase config incomplete - notifications will not work');
} else {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig as admin.ServiceAccount),
    });
    logger.info('✅ Firebase initialized');
  } catch (error) {
    logger.error('❌ Firebase initialization error:', error);
  }
}

export const messaging = admin.messaging();

export default admin;
