import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma';
import { logger } from '../server';
import { redisConnection } from './queues';

export function startReservingWorker(io: SocketIOServer) {
  return new Worker(
    'reserving-cleanup',
    async (job) => {
      const { spotId } = job.data as { spotId: string };
      const spot = await prisma.parkingSpot.findUnique({ where: { id: spotId } });
      if (!spot || spot.status !== 'RESERVING') return;

      await prisma.parkingSpot.update({
        where: { id: spotId },
        data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
      });

      io.emit('spot-status-changed', { spotNumber: spot.spotNumber, status: 'FREE', carPlate: null });
      logger.info(`🧹 Reserving timeout: spot ${spot.spotNumber} reset to FREE`);
    },
    { connection: redisConnection },
  );
}
