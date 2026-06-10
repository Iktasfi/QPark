import { Worker } from 'bullmq';
import type { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../lib/prisma';
import { logger } from '../server';
import { redisConnection } from './queues';
import { sendPushToUser } from '../utils/notifications';

export function startRentalExpiryWorker(io: SocketIOServer) {
  const worker = new Worker(
    'rental-expiry',
    async (job) => {
      const { rentalId } = job.data as { rentalId: string };

      const rental = await prisma.longTermRental.findUnique({
        where: { id: rentalId },
        include: { spot: true },
      });

      if (!rental || rental.status !== 'ACTIVE') return;

      if (rental.endDate > new Date()) {
        logger.info(`⏰ Rental expiry skipped: ${rentalId} — endDate still in future`);
        return;
      }

      const spotStatus = rental.spot.status;

      if (spotStatus === 'OCCUPIED') {
        // Car is still physically inside — do NOT free the spot.
        // The overstay BullMQ job (phase: 'warn') already fired and sent the push.
        // User must press "Завершить аренду" in app to pay debt, then LPR will open gate.
        io.emit('rental-expired', { rentalId, spotNumber: rental.spot.spotNumber, userId: rental.userId });
        logger.info(`⏰ Rental expired (car still inside): ${rentalId}, spot ${rental.spot.spotNumber} — waiting for user to pay debt`);
        return;
      }

      // Car is outside (RESERVED) or spot is FREE — safe to complete and free the spot
      await prisma.$transaction([
        prisma.longTermRental.update({
          where: { id: rentalId },
          data: { status: 'COMPLETED' },
        }),
        prisma.parkingSpot.update({
          where: { id: rental.spotId },
          data: { status: 'FREE', currentUserPlate: null, currentUserId: null },
        }),
      ]);

      io.emit('rental-expired', { rentalId, spotNumber: rental.spot.spotNumber, userId: rental.userId });
      io.emit('spot-status-changed', { spotNumber: rental.spot.spotNumber, status: 'FREE', carPlate: null });

      await sendPushToUser(
        rental.userId,
        '📅 Аренда завершена',
        'Ваша долгосрочная аренда истекла. Если вы хотите продолжить пользоваться местом — оформите новую аренду.',
        { type: 'rental-expired' }
      ).catch(() => {});

      logger.info(`✅ Rental expired (car outside): ${rentalId}, spot ${rental.spot.spotNumber} → FREE`);
    },
    { connection: redisConnection },
  );

  worker.on('failed', (job, err) => {
    logger.error(`❌ Rental expiry job failed [${job?.id}]:`, err);
  });

  logger.info('⏰ BullMQ rental-expiry worker started');
  return worker;
}
