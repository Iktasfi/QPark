import { Router, Request, Response } from 'express';
import parkingService from '../services/parking.service';
import { logger } from '../server';

const router = Router();

/**
 * GET /parking/spots
 * Получить все места парковки
 */
router.get('/spots', async (req: Request, res: Response) => {
  try {
    const spots = await parkingService.getAllSpots();
    res.json(spots);
  } catch (error) {
    logger.error('❌ Error fetching spots:', error);
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});

/**
 * GET /parking/spots/available
 * Получить свободные места
 */
router.get('/spots/available', async (req: Request, res: Response) => {
  try {
    const { type = 'SHORT_TERM' } = req.query;
    const spots = await parkingService.getAvailableSpots(type as 'SHORT_TERM' | 'LONG_TERM');
    res.json(spots);
  } catch (error) {
    logger.error('❌ Error fetching available spots:', error);
    res.status(500).json({ error: 'Failed to fetch available spots' });
  }
});

/**
 * GET /parking/spots/:spotNumber
 * Получить место по номеру
 */
router.get('/spots/:spotNumber', async (req: Request, res: Response) => {
  try {
    const { spotNumber } = req.params;
    const spot = await parkingService.getSpotByNumber(spotNumber);
    
    if (!spot) {
      return res.status(404).json({ error: 'Spot not found' });
    }
    
    res.json(spot);
  } catch (error) {
    logger.error('❌ Error fetching spot:', error);
    res.status(500).json({ error: 'Failed to fetch spot' });
  }
});

/**
 * POST /parking/lpr/entry
 * Обработка LPR события - въезд
 */
router.post('/lpr/entry', async (req: Request, res: Response) => {
  try {
    const { carPlate, spotNumber } = req.body;
    
    if (!carPlate || !spotNumber) {
      return res.status(400).json({ error: 'carPlate and spotNumber are required' });
    }
    
    const result = await parkingService.handleLPREntry(carPlate, spotNumber);
    res.json(result);
  } catch (error) {
    logger.error('❌ Error handling LPR entry:', error);
    res.status(500).json({ error: 'Failed to process entry' });
  }
});

/**
 * POST /parking/lpr/exit
 * Обработка LPR события - выезд
 */
router.post('/lpr/exit', async (req: Request, res: Response) => {
  try {
    const { carPlate, spotNumber } = req.body;
    
    if (!carPlate || !spotNumber) {
      return res.status(400).json({ error: 'carPlate and spotNumber are required' });
    }
    
    const result = await parkingService.handleLPRExit(carPlate, spotNumber);
    res.json(result);
  } catch (error) {
    logger.error('❌ Error handling LPR exit:', error);
    res.status(500).json({ error: 'Failed to process exit' });
  }
});

/**
 * GET /parking/stats
 * Получить статистику парковки
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await parkingService.getParkingStats();
    res.json(stats);
  } catch (error) {
    logger.error('❌ Error fetching parking stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * POST /parking/initialize
 * Инициализировать места парковки (для разработки)
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    await parkingService.initializeParkingSpots();
    res.json({ message: 'Parking spots initialized successfully' });
  } catch (error) {
    logger.error('❌ Error initializing parking spots:', error);
    res.status(500).json({ error: 'Failed to initialize spots' });
  }
});

export default router;
