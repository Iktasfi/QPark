import { Router, Request, Response } from 'express';
import parkingService from '../services/parking.service';
import { logger } from '../server';

const router = Router();

/**
 * GET /parking/spots
 * Получить все места парковки (красивый табличный формат)
 */
router.get('/spots', async (req: Request, res: Response) => {
  try {
    const spots = await parkingService.getAllSpots();
    
    // Создаем табличный формат
    const createTable = (spotsList: any[], type: string) => {
      const table = [];
      const statusIcons = {
        'FREE': '🟢',
        'BOOKED': '🟡', 
        'OCCUPIED': '🔴',
        'RESERVED': '🟠',
        'REPAIR': '🔧'
      };
      
      const statusText = {
        'FREE': 'Свободно',
        'BOOKED': 'Забронировано',
        'OCCUPIED': 'Занято',
        'RESERVED': 'Резерв',
        'REPAIR': 'Ремонт'
      };
      
      for (let i = 0; i < spotsList.length; i += 5) {
        const row = [];
        for (let j = 0; j < 5 && i + j < spotsList.length; j++) {
          const spot = spotsList[i + j];
          row.push({
            spotNumber: spot.spotNumber,
            icon: statusIcons[spot.status as keyof typeof statusIcons] || '⚪',
            status: statusText[spot.status as keyof typeof statusText] || 'Неизвестно',
            carPlate: spot.currentUserPlate || '-',
            type: type
          });
        }
        table.push(row);
      }
      return table;
    };
    
    const shortTermSpots = spots.filter(s => s.type === 'SHORT_TERM').sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));
    const longTermSpots = spots.filter(s => s.type === 'LONG_TERM').sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));
    
    const shortTermTable = createTable(shortTermSpots, 'SHORT_TERM');
    const longTermTable = createTable(longTermSpots, 'LONG_TERM');
    
    // Статистика
    const stats = {
      total: spots.length,
      shortTerm: {
        total: shortTermSpots.length,
        free: shortTermSpots.filter(s => s.status === 'FREE').length,
        booked: shortTermSpots.filter(s => s.status === 'BOOKED').length,
        occupied: shortTermSpots.filter(s => s.status === 'OCCUPIED').length,
        repair: shortTermSpots.filter(s => s.status === 'REPAIR').length
      },
      longTerm: {
        total: longTermSpots.length,
        free: longTermSpots.filter(s => s.status === 'FREE').length,
        booked: longTermSpots.filter(s => s.status === 'BOOKED').length,
        occupied: longTermSpots.filter(s => s.status === 'OCCUPIED').length,
        repair: longTermSpots.filter(s => s.status === 'REPAIR').length
      }
    };
    
    const result = {
      title: '🚗 Парковка QPark - Текущий статус',
      lastUpdated: new Date().toLocaleString('ru-RU'),
      legend: {
        '🟢': 'Свободно',
        '🟡': 'Забронировано',
        '🔴': 'Занято',
        '🟠': 'Резерв',
        '🔧': 'Ремонт'
      },
      statistics: stats,
      tables: {
        shortTerm: {
          title: '🅿️ Краткосрочная парковка',
          table: shortTermTable
        },
        longTerm: {
          title: '🅿️ Долгосрочная парковка',
          table: longTermTable
        }
      }
    };
    
    res.json(result);
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
 * POST /parking/simulate-entry
 * Удобный endpoint для симуляции въезда
 */
router.post('/simulate-entry', async (req: Request, res: Response) => {
  try {
    const { spotNumber, carPlate } = req.body;
    
    if (!spotNumber || !carPlate) {
      return res.status(400).json({ 
        error: 'spotNumber and carPlate are required',
        example: {
          spotNumber: "SP-02",
          carPlate: "KZ777ABC01"
        }
      });
    }
    
    const result = await parkingService.handleLPREntry(carPlate, spotNumber);
    res.json({
      success: true,
      message: `Car ${carPlate} entered spot ${spotNumber}`,
      data: result
    });
  } catch (error) {
    logger.error('❌ Error simulating entry:', error);
    res.status(500).json({ error: 'Failed to simulate entry' });
  }
});

/**
 * POST /parking/set-status
 * Установить статус места (для тестирования)
 */
router.post('/set-status', async (req: Request, res: Response) => {
  try {
    const { spotNumber, status } = req.body;
    
    if (!spotNumber || !status) {
      return res.status(400).json({ 
        error: 'spotNumber and status are required',
        example: {
          spotNumber: "SP-03",
          status: "REPAIR"
        },
        availableStatuses: ['FREE', 'BOOKED', 'OCCUPIED', 'RESERVED', 'REPAIR']
      });
    }
    
    const validStatuses = ['FREE', 'BOOKED', 'OCCUPIED', 'RESERVED', 'REPAIR'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        availableStatuses: validStatuses
      });
    }
    
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    const updatedSpot = await prisma.parkingSpot.update({
      where: { spotNumber },
      data: { 
        status,
        currentUserPlate: status === 'FREE' ? null : undefined,
        currentUserId: status === 'FREE' ? null : undefined
      }
    });
    
    res.json({
      success: true,
      message: `Spot ${spotNumber} status set to ${status}`,
      spot: {
        spotNumber: updatedSpot.spotNumber,
        status: updatedSpot.status,
        currentUserPlate: updatedSpot.currentUserPlate
      }
    });
  } catch (error) {
    logger.error('❌ Error setting spot status:', error);
    res.status(500).json({ error: 'Failed to set spot status' });
  }
});

/**
 * GET /parking/spots/simple
 * Простой вывод без таблиц
 */
router.get('/spots/simple', async (req: Request, res: Response) => {
  try {
    const spots = await parkingService.getAllSpots();
    const simpleSpots = spots.map(s => ({
      spotNumber: s.spotNumber,
      type: s.type,
      status: s.status,
      carPlate: s.currentUserPlate || '-'
    }));
    res.json(simpleSpots);
  } catch (error) {
    logger.error('❌ Error fetching spots:', error);
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});

/**
 * GET /parking/spots/text
 * Текстовое представление таблицы
 */
router.get('/spots/text', async (req: Request, res: Response) => {
  try {
    const spots = await parkingService.getAllSpots();
    const shortTermSpots = spots.filter(s => s.type === 'SHORT_TERM').sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));
    const longTermSpots = spots.filter(s => s.type === 'LONG_TERM').sort((a, b) => a.spotNumber.localeCompare(b.spotNumber));
    
    const statusIcons = {
      'FREE': '🟢',
      'BOOKED': '🟡', 
      'OCCUPIED': '🔴',
      'RESERVED': '🟠',
      'REPAIR': '🔧'
    };
    
    let textOutput = '\n🚗 ПАРКОВКА QPARK - ТЕКУЩИЙ СТАТУС\n';
    textOutput += '=' .repeat(50) + '\n\n';
    
    // Легенда
    textOutput += '📍 ЛЕГЕНДА:\n';
    Object.entries(statusIcons).forEach(([status, icon]) => {
      const statusText = {
        'FREE': 'Свободно',
        'BOOKED': 'Забронировано',
        'OCCUPIED': 'Занято',
        'RESERVED': 'Резерв',
        'REPAIR': 'Ремонт'
      }[status];
      textOutput += `   ${icon} ${statusText}\n`;
    });
    textOutput += '\n';
    
    // Краткосрочная парковка
    textOutput += '🅿️ КРАТКОСРОЧНАЯ ПАРКОВКА:\n';
    textOutput += '-'.repeat(40) + '\n';
    
    for (let i = 0; i < shortTermSpots.length; i += 5) {
      textOutput += '   ';
      for (let j = 0; j < 5 && i + j < shortTermSpots.length; j++) {
        const spot = shortTermSpots[i + j];
        const icon = statusIcons[spot.status as keyof typeof statusIcons] || '⚪';
        textOutput += `${icon} ${spot.spotNumber.padEnd(8)}`;
      }
      textOutput += '\n';
    }
    textOutput += '\n';
    
    // Долгосрочная парковка
    textOutput += '🅿️ ДОЛГОСРОЧНАЯ ПАРКОВКА:\n';
    textOutput += '-'.repeat(40) + '\n';
    
    for (let i = 0; i < longTermSpots.length; i += 5) {
      textOutput += '   ';
      for (let j = 0; j < 5 && i + j < longTermSpots.length; j++) {
        const spot = longTermSpots[i + j];
        const icon = statusIcons[spot.status as keyof typeof statusIcons] || '⚪';
        textOutput += `${icon} ${spot.spotNumber.padEnd(8)}`;
      }
      textOutput += '\n';
    }
    textOutput += '\n';
    
    // Статистика
    const stats = {
      totalFree: spots.filter(s => s.status === 'FREE').length,
      totalBooked: spots.filter(s => s.status === 'BOOKED').length,
      totalOccupied: spots.filter(s => s.status === 'OCCUPIED').length,
      totalRepair: spots.filter(s => s.status === 'REPAIR').length
    };
    
    textOutput += '📊 СТАТИСТИКА:\n';
    textOutput += '=' .repeat(30) + '\n';
    textOutput += `   🟢 Свободно:     ${stats.totalFree}\n`;
    textOutput += `   🟡 Забронировано: ${stats.totalBooked}\n`;
    textOutput += `   🔴 Занято:       ${stats.totalOccupied}\n`;
    textOutput += `   🔧 На ремонте:   ${stats.totalRepair}\n`;
    textOutput += '\n';
    textOutput += `🕐 Обновлено: ${new Date().toLocaleString('ru-RU')}\n`;
    
    res.json({ 
      title: '🚗 Парковка QPark - Текущий статус',
      textTable: textOutput,
      lastUpdated: new Date().toLocaleString('ru-RU')
    });
  } catch (error) {
    logger.error('❌ Error generating text table:', error);
    res.status(500).json({ error: 'Failed to generate text table' });
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

/**
 * GET /parking/spots/:spotNumber
 * Получить место по номеру (должен быть в конце!)
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

export default router;
