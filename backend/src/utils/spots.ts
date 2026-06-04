import { prisma } from '../lib/prisma';

// Known parking locations in proximity order (adjacent indices = closer)
// SP(1) — P2(2) — P3(3) — P4(4) — P5(5) — P6(6) — P7(7) — P8(8) — P9(9) — P10(10)
const LOCATION_ORDER = ['SP', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];

function extractPrefix(spotNumber: string): string {
  return spotNumber.split('-')[0];
}

function getNearbyPrefixes(currentPrefix: string): string[] {
  const currIdx = LOCATION_ORDER.indexOf(currentPrefix);
  const others = LOCATION_ORDER.filter(p => p !== currentPrefix);

  if (currIdx === -1) return others; // unknown prefix — return all others as-is

  // Sort others by numeric distance so the geographically closest comes first
  return others.sort((a, b) => {
    const aDist = Math.abs(LOCATION_ORDER.indexOf(a) - currIdx);
    const bDist = Math.abs(LOCATION_ORDER.indexOf(b) - currIdx);
    return aDist - bDist;
  });
}

/**
 * Finds the nearest free spot to a given spot:
 *   1. Same parking location (same prefix, e.g. P3-xx)
 *   2. Closest other location by proximity order (P2, then SP)
 *
 * @param excludeSpotNumber - spot number to exclude (the violated/original spot)
 */
export async function findFreeSpotNearby(excludeSpotNumber: string) {
  const prefix = extractPrefix(excludeSpotNumber);

  // 1. Same parking location
  const sameLocation = await prisma.parkingSpot.findFirst({
    where: {
      status: 'FREE',
      spotNumber: {
        startsWith: `${prefix}-`,
        not: excludeSpotNumber,
      },
    },
    orderBy: { spotNumber: 'asc' },
  });
  if (sameLocation) return sameLocation;

  // 2. Nearest other locations
  for (const nearbyPrefix of getNearbyPrefixes(prefix)) {
    const spot = await prisma.parkingSpot.findFirst({
      where: {
        status: 'FREE',
        spotNumber: { startsWith: `${nearbyPrefix}-` },
      },
      orderBy: { spotNumber: 'asc' },
    });
    if (spot) return spot;
  }

  return null;
}
