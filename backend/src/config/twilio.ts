import twilio from 'twilio';
import { logger } from '../server';

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  logger.warn('⚠️  Twilio config incomplete - SMS will not work');
}

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

if (process.env.TWILIO_ACCOUNT_SID) {
  logger.info('✅ Twilio initialized');
}

export default twilioClient;
