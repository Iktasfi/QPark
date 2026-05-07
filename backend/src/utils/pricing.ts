// Parking calculation utilities

export const PRICING = {
  SHORT_TERM: {
    MIN_FEE: parseInt(process.env.SHORT_TERM_MIN_FEE || '150'), // 150 тенге (1 час)
    RATE_PER_MIN: parseInt(process.env.SHORT_TERM_RATE_PER_MIN || '3'), // 3 тенге за минуту свыше часа
  },
  LONG_TERM: {
    1: 700,
    3: 1800,
    5: 2700,
    7: 3500,
    14: 6000,
  },
  EXTEND_BOOKING: {
    COST: parseInt(process.env.EXTEND_BOOKING_COST || '75'), // 75 тенге
    DURATION: parseInt(process.env.EXTEND_BOOKING_DURATION || '1800'), // 30 минут в секундах
  },
  FREE_BOOKING_DURATION: parseInt(process.env.FREE_BOOKING_DURATION || '900'), // 15 минут в секундах
  CASHBACK_PERCENTAGE: 1, // 1% кэшбэк
};

/**
 * Рассчитать стоимость парковки по минутам
 * @param minutes - количество минут парковки
 * @returns стоимость в тенге
 */
export function calculateShortTermCost(minutes: number): number {
  // Минимум 150 за первый час
  if (minutes <= 60) {
    return PRICING.SHORT_TERM.MIN_FEE;
  }

  // Сверх часа 3 тенге за минуту
  const extraMinutes = minutes - 60;
  const extraCost = extraMinutes * PRICING.SHORT_TERM.RATE_PER_MIN;
  
  return PRICING.SHORT_TERM.MIN_FEE + extraCost;
}

/**
 * Получить цену долгосрочной аренды
 * @param days - количество дней (1, 3, 5, 7, 14)
 * @returns стоимость в тенге
 */
export function getLongTermPrice(days: number): number {
  const price = PRICING.LONG_TERM[days as keyof typeof PRICING.LONG_TERM];
  if (!price) {
    throw new Error(`Invalid rental period: ${days} days`);
  }
  return price;
}

/**
 * Рассчитать кэшбэк от платежа
 * @param amount - сумма платежа в тенге
 * @returns размер кэшбэка в тенге
 */
export function calculateCashback(amount: number): number {
  return Math.floor(amount * (PRICING.CASHBACK_PERCENTAGE / 100));
}

/**
 * Проверить, есть ли свободное время для бесплатного подъезда
 * @param startTime - время начала брони
 * @param currentTime - текущее время
 * @returns осталось ли время
 */
export function hasFreeTravelTime(startTime: Date, currentTime: Date = new Date()): boolean {
  const diffMs = currentTime.getTime() - startTime.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  return diffSeconds < PRICING.FREE_BOOKING_DURATION;
}

/**
 * Получить оставшееся время свободного подъезда
 * @param startTime - время начала брони
 * @returns оставшееся время в секундах
 */
export function getFreeTravelTimeRemaining(startTime: Date, currentTime: Date = new Date()): number {
  const diffMs = currentTime.getTime() - startTime.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const remaining = PRICING.FREE_BOOKING_DURATION - diffSeconds;
  return Math.max(0, remaining);
}

/**
 * Рассчитать стоимость продления брони
 * @returns стоимость в тенге
 */
export function getExtendBookingCost(): number {
  return PRICING.EXTEND_BOOKING.COST;
}

/**
 * Получить длительность продления брони
 * @returns длительность в секундах
 */
export function getExtendBookingDuration(): number {
  return PRICING.EXTEND_BOOKING.DURATION;
}
