import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding parking spots...')

  const spots = []

  // SP-01 to SP-15 → SHORT_TERM
  for (let i = 1; i <= 15; i++) {
    spots.push({
      spotNumber: `SP-${String(i).padStart(2, '0')}`,
      type: 'SHORT_TERM' as const,
      status: 'FREE' as const,
    })
  }

  // SP-16 to SP-30 → LONG_TERM
  for (let i = 16; i <= 30; i++) {
    spots.push({
      spotNumber: `SP-${String(i).padStart(2, '0')}`,
      type: 'LONG_TERM' as const,
      status: i === 22 ? 'REPAIR' as const : 'FREE' as const,
    })
  }

  for (const spot of spots) {
    await prisma.parkingSpot.upsert({
      where: { spotNumber: spot.spotNumber },
      update: {},
      create: spot,
    })
  }

  console.log(`✅ Seeded ${spots.length} parking spots`)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
