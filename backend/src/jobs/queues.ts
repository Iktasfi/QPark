import { Queue } from 'bullmq';

export const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

// No-show grace-period queue: delayed jobs fire 30 min after booking creation
export const noShowQueue = new Queue('noshow', { connection: redisConnection });

// Rental expiry queue: delayed job fires when the paid rental period ends
export const rentalExpiryQueue = new Queue('rental-expiry', { connection: redisConnection });
