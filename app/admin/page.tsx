'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Car, Wrench, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface ParkingSpot {
  spotNumber: string;
  icon: string;
  status: string;
  carPlate: string;
  type: string;
}

interface ParkingData {
  title: string;
  lastUpdated: string;
  legend: Record<string, string>;
  statistics: {
    total: number;
    shortTerm: { total: number; free: number; booked: number; occupied: number; repair: number };
    longTerm: { total: number; free: number; booked: number; occupied: number; repair: number };
  };
  tables: {
    shortTerm: { title: string; table: ParkingSpot[][] };
    longTerm: { title: string; table: ParkingSpot[][] };
  };
}

const statusConfig = {
  'FREE': { icon: '🟢', label: 'Свободно', color: 'bg-green-100 text-green-800', iconComponent: CheckCircle },
  'BOOKED': { icon: '🟡', label: 'Забронировано', color: 'bg-yellow-100 text-yellow-800', iconComponent: Clock },
  'OCCUPIED': { icon: '🔴', label: 'Занято', color: 'bg-red-100 text-red-800', iconComponent: Car },
  'RESERVED': { icon: '🟣', label: 'Резерв', color: 'bg-purple-100 text-purple-800', iconComponent: AlertCircle },
  'REPAIR': { icon: '🔧', label: 'Ремонт', color: 'bg-orange-100 text-orange-800', iconComponent: Wrench }
};

export default function AdminDashboard() {
  const [parkingData, setParkingData] = useState<ParkingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [carPlate, setCarPlate] = useState('KZ777ABC01');

  useEffect(() => {
    fetchParkingData();
    const interval = setInterval(fetchParkingData, 10000); // Обновлять каждые 10 секунд
    return () => clearInterval(interval);
  }, []);

  const fetchParkingData = async () => {
    try {
      const response = await fetch('/backend/parking/spots');
      if (!response.ok) throw new Error('Ошибка загрузки данных');
      const data = await response.json();
      setParkingData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const simulateAction = async (action: 'entry' | 'exit', spotNumber: string) => {
    setActionLoading(`${action}-${spotNumber}`);
    try {
      const response = await fetch('/backend/parking/simulate-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotNumber,
          carPlate: action === 'entry' ? carPlate : 'KZ777ABC01'
        })
      });
      
      if (!response.ok) throw new Error('Ошибка выполнения действия');
      
      await fetchParkingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка симуляции');
    } finally {
      setActionLoading(null);
    }
  };

  const setSpotStatus = async (spotNumber: string, status: string) => {
    setActionLoading(`status-${spotNumber}`);
    try {
      const response = await fetch('/backend/parking/set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotNumber, status })
      });
      
      if (!response.ok) throw new Error('Ошибка изменения статуса');
      
      await fetchParkingData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка изменения статуса');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Загрузка данных парковки...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!parkingData) return null;

  const renderSpotCard = (spot: ParkingSpot) => {
    const config = statusConfig[spot.status as keyof typeof statusConfig];
    const IconComponent = config.iconComponent;

    return (
      <Card key={spot.spotNumber} className="relative hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-lg">{spot.spotNumber}</span>
            <Badge className={config.color}>
              <IconComponent className="w-3 h-3 mr-1" />
              {config.label}
            </Badge>
          </div>
          
          <div className="text-sm text-gray-600 mb-3">
            <span className="inline-block w-2 h-2 rounded-full mr-1" 
                  style={{ backgroundColor: spot.type === 'SHORT_TERM' ? '#3B82F6' : '#10B981' }} />
            {spot.type === 'SHORT_TERM' ? 'Краткосрочная' : 'Долгосрочная'}
          </div>

          {spot.carPlate !== '-' && (
            <div className="text-sm font-mono bg-gray-100 p-1 rounded mb-3">
              {spot.carPlate}
            </div>
          )}

          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={actionLoading === `entry-${spot.spotNumber}`}
              onClick={() => simulateAction('entry', spot.spotNumber)}
              className="flex-1"
            >
              {actionLoading === `entry-${spot.spotNumber}` ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                '🚗 Въезд'
              )}
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              disabled={actionLoading === `exit-${spot.spotNumber}`}
              onClick={() => simulateAction('exit', spot.spotNumber)}
              className="flex-1"
            >
              {actionLoading === `exit-${spot.spotNumber}` ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                '🚙 Выезд'
              )}
            </Button>
          </div>

          <div className="flex gap-1 mt-2">
            <select
              className="text-xs border rounded px-1 py-0.5"
              value={spot.status}
              onChange={(e) => setSpotStatus(spot.spotNumber, e.target.value)}
              disabled={actionLoading === `status-${spot.spotNumber}`}
            >
              <option value="FREE">🟢 Свободно</option>
              <option value="BOOKED">🟡 Бронь</option>
              <option value="OCCUPIED">🔴 Занято</option>
              <option value="RESERVED">🟣 Резерв</option>
              <option value="REPAIR">🔧 Ремонт</option>
            </select>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderParkingSection = (title: string, table: ParkingSpot[][]) => (
    <div className="mb-8">
      <h3 className="text-xl font-bold mb-4">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {table.map((row, rowIndex) =>
          row.map((spot) => renderSpotCard(spot))
        )}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{parkingData.title}</h1>
        <p className="text-gray-600">Последнее обновление: {parkingData.lastUpdated}</p>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-600 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Свободно</p>
                <p className="text-2xl font-bold">
                  {parkingData.statistics.shortTerm.free + parkingData.statistics.longTerm.free}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-600 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Забронировано</p>
                <p className="text-2xl font-bold">
                  {parkingData.statistics.shortTerm.booked + parkingData.statistics.longTerm.booked}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Car className="h-8 w-8 text-red-600 mr-2" />
              <div>
                <p className="text-sm text-gray-600">Занято</p>
                <p className="text-2xl font-bold">
                  {parkingData.statistics.shortTerm.occupied + parkingData.statistics.longTerm.occupied}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Wrench className="h-8 w-8 text-orange-600 mr-2" />
              <div>
                <p className="text-sm text-gray-600">На ремонте</p>
                <p className="text-2xl font-bold">
                  {parkingData.statistics.shortTerm.repair + parkingData.statistics.longTerm.repair}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Управление симуляцией</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input
              placeholder="Номер машины (например: KZ777ABC01)"
              value={carPlate}
              onChange={(e) => setCarPlate(e.target.value)}
              className="max-w-xs"
            />
            <Button onClick={fetchParkingData} variant="outline">
              🔄 Обновить данные
            </Button>
          </div>
        </CardContent>
      </Card>


      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Легенда статусов</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {Object.entries(statusConfig).map(([status, config]) => (
              <div key={status} className="flex items-center gap-2">
                <span className="text-2xl">{config.icon}</span>
                <span className="text-sm">{config.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>


      {renderParkingSection(parkingData.tables.shortTerm.title, parkingData.tables.shortTerm.table)}
      {renderParkingSection(parkingData.tables.longTerm.title, parkingData.tables.longTerm.table)}
    </div>
  );
}
