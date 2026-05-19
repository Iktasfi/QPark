"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ArrowLeft, Car, Check, Clock, AlertCircle, Wrench,
  Loader2, RefreshCw, Wifi, WifiOff, Activity
} from "lucide-react"
import { getSocket } from "@/lib/socket"

interface ParkingSpot {
  spotNumber: string
  icon: string
  status: string
  carPlate: string
  type: string
}

interface ParkingData {
  title: string
  lastUpdated: string
  legend: Record<string, string>
  statistics: {
    total: number
    shortTerm: { total: number; free: number; booked: number; occupied: number; repair: number }
    longTerm: { total: number; free: number; booked: number; occupied: number; repair: number }
  }
  tables: {
    shortTerm: { title: string; table: ParkingSpot[][] }
    longTerm: { title: string; table: ParkingSpot[][] }
  }
}

interface LiveEvent {
  id: string
  type: "booking-created" | "booking-completed" | "booking-cancelled" | "booking-extended" | "rental-created" | "payment-completed"
  spotId?: string
  plateNumber?: string
  timestamp: Date
}

const statusConfig: Record<string, { color: string; bg: string; icon: React.ComponentType<{ className?: string }>; label: string; emoji: string; englishKey: string }> = {
  "Свободно":     { color: "text-green-600",  bg: "bg-green-100",  icon: Check,       label: "Свободно",     emoji: "🟢", englishKey: "FREE" },
  "Забронировано":{ color: "text-yellow-600", bg: "bg-yellow-100", icon: Clock,       label: "Забронировано",emoji: "🟡", englishKey: "BOOKED" },
  "Занято":       { color: "text-red-600",    bg: "bg-red-100",    icon: Car,         label: "Занято",       emoji: "🔴", englishKey: "OCCUPIED" },
  "Резерв":       { color: "text-purple-600", bg: "bg-purple-100", icon: AlertCircle, label: "Резерв",       emoji: "🟣", englishKey: "RESERVED" },
  "Ремонт":       { color: "text-orange-600", bg: "bg-orange-100", icon: Wrench,      label: "Ремонт",       emoji: "🔧", englishKey: "REPAIR" },
  FREE:      { color: "text-green-600",  bg: "bg-green-100",  icon: Check,       label: "Свободно",     emoji: "🟢", englishKey: "FREE" },
  BOOKED:    { color: "text-yellow-600", bg: "bg-yellow-100", icon: Clock,       label: "Забронировано",emoji: "🟡", englishKey: "BOOKED" },
  OCCUPIED:  { color: "text-red-600",    bg: "bg-red-100",    icon: Car,         label: "Занято",       emoji: "🔴", englishKey: "OCCUPIED" },
  RESERVED:  { color: "text-purple-600", bg: "bg-purple-100", icon: AlertCircle, label: "Резерв",       emoji: "🟣", englishKey: "RESERVED" },
  REPAIR:    { color: "text-orange-600", bg: "bg-orange-100", icon: Wrench,      label: "Ремонт",       emoji: "🔧", englishKey: "REPAIR" },
}

const liveEventLabels: Record<string, { label: string; color: string; emoji: string }> = {
  "booking-created":   { label: "Новое бронирование",  color: "text-yellow-600", emoji: "🟡" },
  "booking-completed": { label: "Парковка завершена",   color: "text-green-600",  emoji: "✅" },
  "booking-cancelled": { label: "Бронь отменена",       color: "text-red-600",    emoji: "❌" },
  "booking-extended":  { label: "Бронь продлена",       color: "text-blue-600",   emoji: "⏰" },
  "rental-created":    { label: "Долгосрочная аренда",  color: "text-purple-600", emoji: "🟣" },
  "payment-completed": { label: "Оплата прошла",        color: "text-green-600",  emoji: "💳" },
}

interface DbUser { id: string; phoneNumber: string; firstName: string | null; lastName: string | null; walletBalance: number; isBanned: boolean; cars: { plateNumber: string; brand: string; model: string }[] }
interface DbBooking { id: string; spotNumber: string; plateNumber: string; userName: string; status: string; startTime: string; totalCost: number }
interface DbRental { id: string; spotNumber: string; plateNumber: string; userName: string; rentalDays: number; totalCost: number; status: string; endDate: string }
interface DbTransaction { id: string; amount: number; type: string; description: string | null; balanceBefore: number; balanceAfter: number; stripePaymentIntentId: string | null; createdAt: string; user: { phoneNumber: string; firstName: string | null; lastName: string | null } }

export function AdminDashboard() {
  const [parkingData, setParkingData] = useState<ParkingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [carPlate, setCarPlate] = useState("KZ777ABC01")
  const [refreshing, setRefreshing] = useState(false)
  const [socketConnected, setSocketConnected] = useState(false)
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const liveEventsRef = useRef(liveEvents)
  liveEventsRef.current = liveEvents
  const [dbUsers, setDbUsers] = useState<DbUser[]>([])
  const [dbBookings, setDbBookings] = useState<DbBooking[]>([])
  const [dbRentals, setDbRentals] = useState<DbRental[]>([])
  const [dbTransactions, setDbTransactions] = useState<DbTransaction[]>([])
  const [activeTab, setActiveTab] = useState<"spots" | "users" | "bookings" | "transactions" | "promo">("spots")
  const [promoCodes, setPromoCodes] = useState<{id: string; code: string; discount: number; type: string; usedCount: number; maxUses: number | null; isActive: boolean; expiresAt: string | null}[]>([])
  const [newPromo, setNewPromo] = useState({ code: "", discount: "", type: "FIXED", maxUses: "" })
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState("")

  const addLiveEvent = (type: LiveEvent["type"], data: Record<string, unknown>) => {
    const event: LiveEvent = {
      id: `evt-${Date.now()}-${Math.random()}`,
      type,
      spotId: (data.spot as { spotNumber?: string } | undefined)?.spotNumber ?? (data.spotId as string | undefined) ?? (data.spotNumber as string | undefined),
      plateNumber: data.plateNumber as string | undefined,
      timestamp: new Date(),
    }
    setLiveEvents(prev => [event, ...prev].slice(0, 50))
  }

  useEffect(() => {
    fetchParkingData()
    const socket = getSocket()

    socket.on("connect", () => setSocketConnected(true))
    socket.on("disconnect", () => setSocketConnected(false))

    const onSpotStatusChanged = (data: Record<string, unknown>) => {
      fetchParkingData()
    }

    const onBookingCreated = (data: Record<string, unknown>) => {
      addLiveEvent("booking-created", data)
      fetchParkingData()
    }
    const onBookingCompleted = (data: Record<string, unknown>) => {
      addLiveEvent("booking-completed", data)
      fetchParkingData()
    }
    const onBookingCancelled = (data: Record<string, unknown>) => {
      addLiveEvent("booking-cancelled", data)
      fetchParkingData()
    }
    const onBookingExtended = (data: Record<string, unknown>) => {
      addLiveEvent("booking-extended", data)
    }
    const onRentalCreated = (data: Record<string, unknown>) => {
      addLiveEvent("rental-created", data)
      fetchParkingData()
    }
    const onPaymentCompleted = (data: Record<string, unknown>) => {
      addLiveEvent("payment-completed", data)
    }

    socket.on("spot-status-changed", onSpotStatusChanged)
    socket.on("booking-created", onBookingCreated)
    socket.on("booking-completed", onBookingCompleted)
    socket.on("booking-cancelled", onBookingCancelled)
    socket.on("booking-extended", onBookingExtended)
    socket.on("rental-created", onRentalCreated)
    socket.on("payment-completed", onPaymentCompleted)

    const fallback = setInterval(fetchParkingData, 30000)

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("spot-status-changed", onSpotStatusChanged)
      socket.off("booking-created", onBookingCreated)
      socket.off("booking-completed", onBookingCompleted)
      socket.off("booking-cancelled", onBookingCancelled)
      socket.off("booking-extended", onBookingExtended)
      socket.off("rental-created", onRentalCreated)
      socket.off("payment-completed", onPaymentCompleted)
      clearInterval(fallback)
    }
  }, [])

  const fetchParkingData = async () => {
    try {
      const [spotsRes, dbRes] = await Promise.all([
        fetch("/backend/parking/spots"),
        fetch("/backend/admin/dashboard"),
      ])
      if (!spotsRes.ok) throw new Error("Ошибка загрузки данных")
      const data = await spotsRes.json()
      setParkingData(data)
      if (dbRes.ok) {
        const db = await dbRes.json()
        setDbUsers(db.users ?? [])
        setDbBookings(db.bookings ?? [])
        setDbRentals(db.rentals ?? [])
      }
      const token = typeof window !== "undefined" ? localStorage.getItem("qpark_token") : null
      if (token) {
        const txRes = await fetch("/backend/payments/admin/transactions", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (txRes.ok) setDbTransactions(await txRes.json())
      }
      const token2 = typeof window !== "undefined" ? localStorage.getItem("qpark_token") : null
      if (token2) {
        const promoRes = await fetch("/backend/payment/promo/all", { headers: { Authorization: `Bearer ${token2}` } })
        if (promoRes.ok) setPromoCodes(await promoRes.json())
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const simulateAction = async (action: "entry" | "exit", spotNumber: string) => {
    setActionLoading(`${action}-${spotNumber}`)
    try {
      const endpoint = action === "entry" ? "/backend/parking/simulate-entry" : "/backend/parking/lpr/exit"
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotNumber, carPlate: action === "entry" ? carPlate : carPlate }),
      })
      if (!response.ok) throw new Error("Ошибка выполнения действия")
      await fetchParkingData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка симуляции")
    } finally {
      setActionLoading(null)
    }
  }

  const setSpotStatus = async (spotNumber: string, russianStatus: string) => {
    const englishStatus = statusConfig[russianStatus]?.englishKey ?? russianStatus
    setActionLoading(`status-${spotNumber}`)
    try {
      const response = await fetch("/backend/parking/set-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotNumber, status: englishStatus }),
      })
      if (!response.ok) throw new Error("Ошибка изменения статуса")
      await fetchParkingData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка изменения статуса")
    } finally {
      setActionLoading(null)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchParkingData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Загрузка данных парковки...</span>
      </div>
    )
  }

  if (error && !parkingData) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={fetchParkingData} className="mt-4">Попробовать снова</Button>
      </div>
    )
  }

  if (!parkingData) return null

  const allSpots = [
    ...parkingData.tables.shortTerm.table.flat(),
    ...parkingData.tables.longTerm.table.flat(),
  ]
  const freeSpots = parkingData.statistics.shortTerm.free + parkingData.statistics.longTerm.free
  const occupiedSpots = parkingData.statistics.shortTerm.occupied + parkingData.statistics.longTerm.occupied
  const bookedSpots = parkingData.statistics.shortTerm.booked + parkingData.statistics.longTerm.booked
  const repairSpots = parkingData.statistics.shortTerm.repair + parkingData.statistics.longTerm.repair

  const renderSpotCard = (spot: ParkingSpot) => {
    const config = statusConfig[spot.status] ?? statusConfig["Свободно"]
    const IconComponent = config.icon

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
            <span
              className="inline-block w-2 h-2 rounded-full mr-1"
              style={{ backgroundColor: spot.type === "SHORT_TERM" ? "#3B82F6" : "#10B981" }}
            />
            {spot.type === "SHORT_TERM" ? "Краткосрочная" : "Долгосрочная"}
          </div>

          {spot.carPlate !== "-" && (
            <div className="text-sm font-mono bg-gray-100 p-1 rounded mb-3">{spot.carPlate}</div>
          )}

          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!!actionLoading}
              onClick={() => simulateAction("entry", spot.spotNumber)}
              className="flex-1"
            >
              {actionLoading === `entry-${spot.spotNumber}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "🚗 Въезд"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!actionLoading}
              onClick={() => simulateAction("exit", spot.spotNumber)}
              className="flex-1"
            >
              {actionLoading === `exit-${spot.spotNumber}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "🚙 Выезд"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!!actionLoading}
              onClick={() => setSpotStatus(spot.spotNumber, "FREE")}
              className="text-green-600 border-green-300 hover:bg-green-50"
              title="Сбросить в FREE"
            >
              🔄
            </Button>
          </div>

          <div className="flex gap-1 mt-2">
            <select
              className="text-xs border rounded px-1 py-0.5 w-full"
              value={spot.status}
              onChange={(e) => setSpotStatus(spot.spotNumber, e.target.value)}
              disabled={!!actionLoading}
            >
              <option value="Свободно">✓ Свободно</option>
              <option value="Забронировано">⏱ Забронировано</option>
              <option value="Занято">🚗 Занято</option>
              <option value="Резерв">⚠ Резерв</option>
              <option value="Ремонт">🔧 Ремонт</option>
            </select>
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderParkingSection = (title: string, table: ParkingSpot[][]) => (
    <div className="mb-8">
      <h3 className="text-xl font-bold mb-4">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {table.map((row) => row.map((spot) => renderSpotCard(spot)))}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => (window.location.href = "/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{parkingData.title}</h1>
              <p className="text-gray-600">Последнее обновление: {parkingData.lastUpdated}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm">
              {socketConnected ? (
                <><Wifi className="h-4 w-4 text-green-500" /><span className="text-green-600 font-medium">Live</span></>
              ) : (
                <><WifiOff className="h-4 w-4 text-gray-400" /><span className="text-gray-500">Offline</span></>
              )}
            </div>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 flex items-center">
              <Check className="h-8 w-8 text-green-600 mr-2" />
              <div><p className="text-sm text-gray-600">Свободно</p><p className="text-2xl font-bold">{freeSpots}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center">
              <Clock className="h-8 w-8 text-yellow-600 mr-2" />
              <div><p className="text-sm text-gray-600">Забронировано</p><p className="text-2xl font-bold">{bookedSpots}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center">
              <Car className="h-8 w-8 text-red-600 mr-2" />
              <div><p className="text-sm text-gray-600">Занято</p><p className="text-2xl font-bold">{occupiedSpots}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center">
              <Wrench className="h-8 w-8 text-orange-600 mr-2" />
              <div><p className="text-sm text-gray-600">На ремонте</p><p className="text-2xl font-bold">{repairSpots}</p></div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8 border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Живая лента бронирований
              {socketConnected && (
                <span className="text-xs font-normal text-green-600 bg-green-100 px-2 py-0.5 rounded-full">● В реальном времени</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {liveEvents.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Ожидание событий бронирования...</p>
                <p className="text-xs mt-1">{socketConnected ? "Подключено к серверу" : "Нет подключения к серверу"}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {liveEvents.map((evt) => {
                  const meta = liveEventLabels[evt.type] ?? { label: evt.type, color: "text-gray-600", emoji: "📌" }
                  return (
                    <div key={evt.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{meta.emoji}</span>
                        <div>
                          <p className={`text-sm font-medium ${meta.color}`}>{meta.label}</p>
                          <p className="text-xs text-gray-500">
                            {evt.spotId ? `Место: ${evt.spotId}` : ""}
                            {evt.plateNumber ? ` · ${evt.plateNumber}` : ""}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">
                        {evt.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

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
              <Button onClick={handleRefresh} variant="outline">
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
            <div className="flex flex-wrap gap-3">
              {[
                { icon: Check,       label: "Свободно",      color: "text-green-600",  bg: "bg-green-100" },
                { icon: Clock,       label: "Забронировано", color: "text-yellow-600", bg: "bg-yellow-100" },
                { icon: Car,         label: "Занято",        color: "text-red-600",    bg: "bg-red-100" },
                { icon: AlertCircle, label: "Резерв",        color: "text-purple-600", bg: "bg-purple-100" },
                { icon: Wrench,      label: "Ремонт",        color: "text-orange-600", bg: "bg-orange-100" },
              ].map(({ icon: Icon, label, color, bg }) => (
                <div key={label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${bg} border-transparent`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className={`text-sm font-medium ${color}`}>{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2 mb-6">
          {(["spots", "users", "bookings", "transactions", "promo"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${activeTab === tab ? "bg-[#354469] text-white" : "bg-white text-gray-600 hover:bg-gray-100 border"}`}>
              {tab === "spots"        ? `Места (${parkingData.statistics.total})`
               : tab === "users"     ? `Пользователи (${dbUsers.length})`
               : tab === "bookings"  ? `Бронирования (${dbBookings.length + dbRentals.length})`
               : tab === "promo"     ? `Промокоды (${promoCodes.length})`
               :                      `Транзакции (${dbTransactions.length})`}
            </button>
          ))}
        </div>

        {activeTab === "spots" && (
          <>
            {renderParkingSection(parkingData.tables.shortTerm.title, parkingData.tables.shortTerm.table)}
            {renderParkingSection(parkingData.tables.longTerm.title, parkingData.tables.longTerm.table)}
          </>
        )}

        {activeTab === "users" && (
          <Card>
            <CardHeader><CardTitle>Зарегистрированные пользователи</CardTitle></CardHeader>
            <CardContent>
              {dbUsers.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Нет пользователей в базе данных</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4">Телефон</th>
                      <th className="pb-2 pr-4">Имя</th>
                      <th className="pb-2 pr-4">Баланс</th>
                      <th className="pb-2 pr-4">Машины</th>
                      <th className="pb-2">Статус</th>
                    </tr></thead>
                    <tbody>
                      {dbUsers.map(u => (
                        <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 pr-4 font-mono text-xs">{u.phoneNumber}</td>
                          <td className="py-2 pr-4">{u.firstName ?? "-"} {u.lastName ?? ""}</td>
                          <td className="py-2 pr-4 font-medium">{u.walletBalance.toLocaleString()} ₸</td>
                          <td className="py-2 pr-4">
                            {u.cars.length === 0 ? <span className="text-gray-400">—</span> : u.cars.map(c => (
                              <span key={c.plateNumber} className="inline-block bg-gray-100 rounded px-2 py-0.5 text-xs mr-1">{c.brand} {c.model} · {c.plateNumber}</span>
                            ))}
                          </td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${u.isBanned ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                              {u.isBanned ? "Забанен" : "Активен"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "bookings" && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Краткосрочные бронирования</CardTitle></CardHeader>
              <CardContent>
                {dbBookings.length === 0 ? <p className="text-gray-400 text-center py-4">Нет бронирований</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-gray-500">
                        <th className="pb-2 pr-4">Место</th><th className="pb-2 pr-4">Номер авто</th>
                        <th className="pb-2 pr-4">Пользователь</th><th className="pb-2 pr-4">Статус</th><th className="pb-2">Стоимость</th>
                      </tr></thead>
                      <tbody>
                        {dbBookings.map(b => (
                          <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2 pr-4 font-bold">{b.spotNumber}</td>
                            <td className="py-2 pr-4 font-mono text-xs">{b.plateNumber}</td>
                            <td className="py-2 pr-4">{b.userName}</td>
                            <td className="py-2 pr-4"><span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">{b.status}</span></td>
                            <td className="py-2">{b.totalCost} ₸</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Долгосрочная аренда</CardTitle></CardHeader>
              <CardContent>
                {dbRentals.length === 0 ? <p className="text-gray-400 text-center py-4">Нет аренды</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left text-gray-500">
                        <th className="pb-2 pr-4">Место</th><th className="pb-2 pr-4">Номер авто</th>
                        <th className="pb-2 pr-4">Пользователь</th><th className="pb-2 pr-4">Дней</th>
                        <th className="pb-2 pr-4">До</th><th className="pb-2">Стоимость</th>
                      </tr></thead>
                      <tbody>
                        {dbRentals.map(r => (
                          <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2 pr-4 font-bold">{r.spotNumber}</td>
                            <td className="py-2 pr-4 font-mono text-xs">{r.plateNumber}</td>
                            <td className="py-2 pr-4">{r.userName}</td>
                            <td className="py-2 pr-4">{r.rentalDays} дн.</td>
                            <td className="py-2 pr-4 text-xs text-gray-500">{new Date(r.endDate).toLocaleDateString("ru-RU")}</td>
                            <td className="py-2">{r.totalCost.toLocaleString()} ₸</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "transactions" && (
          <Card>
            <CardHeader>
              <CardTitle>История транзакций</CardTitle>
            </CardHeader>
            <CardContent>
              {dbTransactions.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Нет транзакций в базе данных</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-2 pr-3">Дата</th>
                        <th className="pb-2 pr-3">Пользователь</th>
                        <th className="pb-2 pr-3">Тип</th>
                        <th className="pb-2 pr-3">Описание</th>
                        <th className="pb-2 pr-3 text-right">Сумма</th>
                        <th className="pb-2 text-right">Баланс после</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbTransactions.map(tx => (
                        <tr key={tx.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            <div>{tx.user.firstName ?? ""} {tx.user.lastName ?? ""}</div>
                            <div className="text-gray-400 font-mono">{tx.user.phoneNumber}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              tx.type === "DEPOSIT" ? "bg-green-100 text-green-700"
                              : tx.type === "PAYMENT" ? "bg-orange-100 text-orange-700"
                              : tx.type === "REFUND" ? "bg-blue-100 text-blue-700"
                              : tx.type === "CASHBACK" ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-600"
                            }`}>
                              {tx.type}
                            </span>
                            {tx.stripePaymentIntentId && (
                              <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-indigo-50 text-indigo-500 font-mono">Stripe</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-600 max-w-[160px] truncate">{tx.description ?? "—"}</td>
                          <td className={`py-2 pr-3 font-semibold text-right whitespace-nowrap ${tx.amount > 0 ? "text-green-600" : "text-gray-900"}`}>
                            {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} ₸
                          </td>
                          <td className="py-2 text-right font-mono text-xs">{tx.balanceAfter.toLocaleString()} ₸</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "promo" && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Создать промокод</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Код</label>
                    <input value={newPromo.code} onChange={e => setNewPromo({...newPromo, code: e.target.value.toUpperCase()})}
                      placeholder="SUMMER20" className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Скидка</label>
                    <input value={newPromo.discount} onChange={e => setNewPromo({...newPromo, discount: e.target.value})}
                      placeholder="100" type="number" className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Тип</label>
                    <select value={newPromo.type} onChange={e => setNewPromo({...newPromo, type: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]">
                      <option value="FIXED">Фиксированная (₸)</option>
                      <option value="PERCENTAGE">Процент (%)</option>
                      <option value="FIRST_RIDE">Первая поездка</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Макс. использований</label>
                    <input value={newPromo.maxUses} onChange={e => setNewPromo({...newPromo, maxUses: e.target.value})}
                      placeholder="Без лимита" type="number" className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
                  </div>
                </div>
                {promoError && <p className="text-red-500 text-sm">{promoError}</p>}
                <button
                  disabled={promoLoading || !newPromo.code || !newPromo.discount}
                  onClick={async () => {
                    setPromoLoading(true); setPromoError("")
                    try {
                      const token = localStorage.getItem("qpark_token")
                      const res = await fetch("/backend/payment/promo/create", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ code: newPromo.code, discount: Number(newPromo.discount), type: newPromo.type, maxUses: newPromo.maxUses ? Number(newPromo.maxUses) : undefined }),
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error)
                      setPromoCodes(prev => [data, ...prev])
                      setNewPromo({ code: "", discount: "", type: "FIXED", maxUses: "" })
                    } catch (err) {
                      setPromoError(err instanceof Error ? err.message : "Ошибка")
                    } finally { setPromoLoading(false) }
                  }}
                  className="w-full py-2 bg-[#354469] text-white rounded-lg font-medium text-sm disabled:opacity-50"
                >
                  {promoLoading ? "Создание..." : "Создать промокод"}
                </button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Все промокоды ({promoCodes.length})</CardTitle></CardHeader>
              <CardContent>
                {promoCodes.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">Промокодов пока нет</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="pb-2 pr-3">Код</th>
                          <th className="pb-2 pr-3">Скидка</th>
                          <th className="pb-2 pr-3">Тип</th>
                          <th className="pb-2 pr-3">Использован</th>
                          <th className="pb-2">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {promoCodes.map(p => (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-2 pr-3 font-mono font-bold">{p.code}</td>
                            <td className="py-2 pr-3">{p.discount}{p.type === "PERCENTAGE" ? "%" : "₸"}</td>
                            <td className="py-2 pr-3 text-xs text-gray-500">{p.type}</td>
                            <td className="py-2 pr-3 text-xs">{p.usedCount}{p.maxUses ? `/${p.maxUses}` : ""}</td>
                            <td className="py-2">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {p.isActive ? "Активен" : "Неактивен"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
