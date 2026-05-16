

export const PRICING = {
  SHORT_TERM: {
    MIN_FEE: parseInt(process.env.SHORT_TERM_MIN_FEE || '150'),
    RATE_PER_MIN: parseInt(process.env.SHORT_TERM_RATE_PER_MIN || '3'),
  },
  LONG_TERM: {
    1: 700,
    3: 1800,
    5: 2700,
    7: 3500,
    14: 6000,
  },
  EXTEND_BOOKING: {
    COST: parseInt(process.env.EXTEND_BOOKING_COST || '75'),
    DURATION: parseInt(process.env.EXTEND_BOOKING_DURATION || '1800'),
  },
  FREE_BOOKING_DURATION: parseInt(process.env.FREE_BOOKING_DURATION || '900'),
  CASHBACK_PERCENTAGE: 1,
};


export function calculateShortTermCost(minutes: number): number {

  if (minutes <= 60) {
    return PRICING.SHORT_TERM.MIN_FEE;
  }


  const extraMinutes = minutes - 60;
  const extraCost = extraMinutes * PRICING.SHORT_TERM.RATE_PER_MIN;

  return PRICING.SHORT_TERM.MIN_FEE + extraCost;
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


export function getExtendBookingCost(): number {
  return PRICING.EXTEND_BOOKING.COST;
}


export function getExtendBookingDuration(): number {
  return PRICING.EXTEND_BOOKING.DURATION;
}
