/**
 * DB reset script — clears all test bookings/rentals and resets every spot to FREE.
 * Run with:  npx ts-node reset-db.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Resetting test data...');

  await prisma.booking.updateMany({
    where: { status: { in: ['PENDING', 'CONFIRMED'] } },
    data: { status: 'CANCELLED', actualEndTime: new Date() },
  });
  console.log('  ✅ Active bookings cancelled');

  await prisma.longTermRental.updateMany({
    where: { status: 'ACTIVE' },
    data: { status: 'CANCELLED' },
  });
  console.log('  ✅ Active rentals cancelled');

  await prisma.parkingSpot.updateMany({
    data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
  });
  console.log('  ✅ All spots reset to FREE');

  console.log('✅ Done. Restart the backend now.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
