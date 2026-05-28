
export const PRICING = {
  SHORT_TERM: {
    MIN_FEE: 150,
    RATE_PER_MIN: 3,
  },
  LONG_TERM: {
    1: 900,
    3: 2400,
    5: 3000,
    7: 3500,
    14: 6000,
  },
  // 30 min arrival window (in seconds)
  FREE_BOOKING_DURATION: parseInt(process.env.FREE_BOOKING_DURATION || '1800'),
  NOSHOW_SHORT_TERM_REFUND_PERCENT: 50,
  NOSHOW_LONG_TERM_KEEP: 900,
  CASHBACK_PERCENTAGE: 1,
};

export function calculateShortTermCost(minutes: number): number {
  if (minutes < 60) return minutes * PRICING.SHORT_TERM.RATE_PER_MIN;
  return 150 + (minutes - 60) * PRICING.SHORT_TERM.RATE_PER_MIN;
}

export function getLongTermPrice(days: number): number {
  const price = PRICING.LONG_TERM[days as keyof typeof PRICING.LONG_TERM];
  if (!price) {
    throw new Error(`Invalid rental period: ${days} days`);
  }
  return price;
}

export function calculateCashback(amount: number): number {
  return Math.floor(amount * (PRICING.CASHBACK_PERCENTAGE / 100));
}

export function hasFreeTravelTime(startTime: Date, currentTime: Date = new Date()): boolean {
  const diffMs = currentTime.getTime() - startTime.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  return diffSeconds < PRICING.FREE_BOOKING_DURATION;
}

export function getFreeTravelTimeRemaining(startTime: Date, currentTime: Date = new Date()): number {
  const diffMs = currentTime.getTime() - startTime.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const remaining = PRICING.FREE_BOOKING_DURATION - diffSeconds;
  return Math.max(0, remaining);
}

// kept for backwards compat if anything imports it
export function getExtendBookingCost(): number { return 0; }
export function getExtendBookingDuration(): number { return 0; }
