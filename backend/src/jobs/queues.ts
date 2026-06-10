import { Queue } from 'bullmq';

// Support both REDIS_URL (Railway/Upstash) and individual REDIS_HOST/PORT/PASSWORD vars
function buildRedisConnection() {
  const url = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL;
  if (url) {
    // Parse redis://:password@host:port or rediss://... (TLS)
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379'),
        password: parsed.password || undefined,
        tls: parsed.protocol === 'rediss:' ? {} : undefined,
      };
    } catch {
      // fallback below
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

export const redisConnection = buildRedisConnection();

// No-show grace-period queue: delayed jobs fire 30 min after booking creation
export const noShowQueue = new Queue('noshow', { connection: redisConnection });

// Rental expiry queue: delayed job fires when the paid rental period ends
export const rentalExpiryQueue = new Queue('rental-expiry', { connection: redisConnection });

// Overstay queue: fires at booking estimatedEndTime / rental endDate
export const overstayQueue = new Queue('overstay', { connection: redisConnection });

// Reserving cleanup: resets spot from RESERVING → FREE after 15s if booking didn't complete
export const reservingCleanupQueue = new Queue('reserving-cleanup', { connection: redisConnection });

// Long-term no-show: fires 30 min after rental creation if user never physically arrived
export const longTermNoShowQueue = new Queue('longterm-noshow', { connection: redisConnection });
