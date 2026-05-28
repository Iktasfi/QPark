"use client"

import { useState, useEffect, useRef } from "react"
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
    if (socket.connected) setSocketConnected(true)

    const onSpotStatusChanged = () => fetchParkingData()
    const onBookingCreated = (data: Record<string, unknown>) => { addLiveEvent("booking-created", data); fetchParkingData() }
    const onBookingCompleted = (data: Record<string, unknown>) => { addLiveEvent("booking-completed", data); fetchParkingData() }
    const onBookingCancelled = (data: Record<string, unknown>) => { addLiveEvent("booking-cancelled", data); fetchParkingData() }
    const onBookingExtended = (data: Record<string, unknown>) => { addLiveEvent("booking-extended", data) }
    const onRentalCreated = (data: Record<string, unknown>) => { addLiveEvent("rental-created", data); fetchParkingData() }
    const onPaymentCompleted = (data: Record<string, unknown>) => { addLiveEvent("payment-completed", data) }

    socket.on("spot-status-changed", onSpotStatusChanged)
    socket.on("booking-created", onBookingCreated)
    socket.on("booking-completed", onBookingCompleted)
    socket.on("booking-cancelled", onBookingCancelled)
    socket.on("booking-extended", onBookingExtended)
    socket.on("rental-created", onRentalCreated)
    socket.on("payment-completed", onPaymentCompleted)
    const fallback = setInterval(fetchParkingData, 30000)

    return () => {
      socket.off("connect"); socket.off("disconnect")
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
        const txRes = await fetch("/backend/payments/admin/transactions", { headers: { Authorization: `Bearer ${token}` } })
        if (txRes.ok) setDbTransactions(await txRes.json())
        const promoRes = await fetch("/backend/payments/promo/all", { headers: { Authorization: `Bearer ${token}` } })
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
        body: JSON.stringify({ spotNumber, carPlate }),
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

  const handleRefresh = () => { setRefreshing(true); fetchParkingData() }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f0f3f8]">
        <Loader2 className="h-8 w-8 animate-spin text-[#354469]" />
        <span className="ml-2 text-gray-600">Загрузка данных парковки...</span>
      </div>
    )
  }

  if (!parkingData) return null

  const freeSpots     = parkingData.statistics.shortTerm.free     + parkingData.statistics.longTerm.free
  const occupiedSpots = parkingData.statistics.shortTerm.occupied + parkingData.statistics.longTerm.occupied
  const bookedSpots   = parkingData.statistics.shortTerm.booked   + parkingData.statistics.longTerm.booked
  const repairSpots   = parkingData.statistics.shortTerm.repair   + parkingData.statistics.longTerm.repair

  const renderSpotCard = (spot: ParkingSpot) => {
    const config = statusConfig[spot.status] ?? statusConfig["Свободно"]
    const IconComponent = config.icon
    return (
      <div key={spot.spotNumber} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-base text-gray-900">{spot.spotNumber}</span>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${config.bg}`}>
            <IconComponent className={`w-3 h-3 ${config.color}`} />
            <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: spot.type === "SHORT_TERM" ? "#3B82F6" : "#10B981" }} />
          <span className="text-xs text-gray-400">{spot.type === "SHORT_TERM" ? "Краткосрочная" : "Долгосрочная"}</span>
        </div>
        {spot.carPlate !== "-" && (
          <div className="text-xs font-mono bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg mb-2 text-gray-700">{spot.carPlate}</div>
        )}
        <div className="flex gap-1 mb-1.5">
          <button disabled={!!actionLoading} onClick={() => simulateAction("entry", spot.spotNumber)}
            className="flex-1 py-1 text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50">
            {actionLoading === `entry-${spot.spotNumber}` ? "..." : "🚗 Въезд"}
          </button>
          <button disabled={!!actionLoading} onClick={() => simulateAction("exit", spot.spotNumber)}
            className="flex-1 py-1 text-[10px] font-medium bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">
            {actionLoading === `exit-${spot.spotNumber}` ? "..." : "🚙 Выезд"}
          </button>
          <button disabled={!!actionLoading} onClick={() => setSpotStatus(spot.spotNumber, "FREE")}
            className="px-2 py-1 text-[10px] bg-green-50 text-green-600 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50" title="Сбросить в FREE">
            🔄
          </button>
        </div>
        <select className="text-[10px] border border-gray-200 rounded-lg px-2 py-1 w-full bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#354469]"
          value={spot.status} onChange={(e) => setSpotStatus(spot.spotNumber, e.target.value)} disabled={!!actionLoading}>
          <option value="Свободно">✓ Свободно</option>
          <option value="Забронировано">⏱ Забронировано</option>
          <option value="Занято">🚗 Занято</option>
          <option value="Резерв">⚠ Резерв</option>
          <option value="Ремонт">🔧 Ремонт</option>
        </select>
      </div>
    )
  }

  const renderParkingSection = (title: string, table: ParkingSpot[][]) => (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3 px-1">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {table.map((row) => row.map((spot) => renderSpotCard(spot)))}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f0f3f8]">
      {/* Header */}
      <div className="bg-[#354469] text-white px-6 py-5 shadow-lg">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => (window.location.href = "/")} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                  <span className="text-white font-black text-xs">Q</span>
                </div>
                <h1 className="text-xl font-bold">QPark Admin</h1>
              </div>
              <p className="text-white/60 text-xs mt-0.5">Последнее обновление: {parkingData.lastUpdated}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${socketConnected ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/50"}`}>
              {socketConnected ? <><Wifi className="h-3 w-3" />Live</> : <><WifiOff className="h-3 w-3" />Offline</>}
            </div>
            <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        {error && (
          <div className="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl px-4 py-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Свободно",      value: freeSpots,     icon: Check,  color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
            { label: "Забронировано", value: bookedSpots,   icon: Clock,  color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
            { label: "Занято",        value: occupiedSpots, icon: Car,    color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200" },
            { label: "На ремонте",    value: repairSpots,   icon: Wrench, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
          ].map(({ label, value, icon: Icon, color, bg, border }) => (
            <div key={label} className={`${bg} border ${border} rounded-2xl p-4`}>
              <div className={`w-10 h-10 rounded-xl ${bg} border ${border} flex items-center justify-center mb-3`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{value}</p>
              <p className={`text-xs font-medium ${color} mt-0.5`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Live feed + Legend */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#354469]" />
                <h3 className="font-semibold text-gray-800 text-sm">Живая лента</h3>
              </div>
              {socketConnected && <span className="text-[10px] font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full">● В реальном времени</span>}
            </div>
            {liveEvents.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Activity className="h-7 w-7 mx-auto mb-2 opacity-20" />
                <p className="text-xs">Ожидание событий...</p>
                <p className="text-[10px] mt-0.5">{socketConnected ? "Подключено" : "Нет подключения"}</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {liveEvents.map((evt) => {
                  const meta = liveEventLabels[evt.type] ?? { label: evt.type, color: "text-gray-600", emoji: "📌" }
                  return (
                    <div key={evt.id} className="flex items-center justify-between py-1.5 border-b last:border-0 border-gray-50">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{meta.emoji}</span>
                        <div>
                          <p className={`text-xs font-medium ${meta.color}`}>{meta.label}</p>
                          <p className="text-[10px] text-gray-400">{evt.spotId ? `${evt.spotId}` : ""}{evt.plateNumber ? ` · ${evt.plateNumber}` : ""}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400">{evt.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-3">Легенда и управление</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { icon: Check, label: "Свободно", color: "text-green-600", bg: "bg-green-100" },
                { icon: Clock, label: "Забронировано", color: "text-blue-600", bg: "bg-blue-100" },
                { icon: Car, label: "Занято", color: "text-red-600", bg: "bg-red-100" },
                { icon: AlertCircle, label: "Резерв", color: "text-purple-600", bg: "bg-purple-100" },
                { icon: Wrench, label: "Ремонт", color: "text-orange-600", bg: "bg-orange-100" },
              ].map(({ icon: Icon, label, color, bg }) => (
                <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bg}`}>
                  <Icon className={`w-3 h-3 ${color}`} />
                  <span className={`text-xs font-medium ${color}`}>{label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input placeholder="Номер машины" value={carPlate} onChange={(e) => setCarPlate(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]/30 focus:border-[#354469]" />
              <button onClick={handleRefresh}
                className="px-3 py-2 bg-[#354469] text-white rounded-xl text-xs font-medium hover:bg-[#2a3654] transition-colors whitespace-nowrap">
                🔄 Обновить
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {(["spots", "users", "bookings", "transactions", "promo"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === tab ? "bg-[#354469] text-white shadow-md" : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"}`}>
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-4">Зарегистрированные пользователи</h3>
            {dbUsers.length === 0 ? (
              <p className="text-gray-400 text-center py-10 text-sm">Нет пользователей в базе данных</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                      <th className="pb-2 pr-4 font-medium">Телефон</th>
                      <th className="pb-2 pr-4 font-medium">Имя</th>
                      <th className="pb-2 pr-4 font-medium">Баланс</th>
                      <th className="pb-2 pr-4 font-medium">Машины</th>
                      <th className="pb-2 font-medium">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbUsers.map(u => (
                      <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 pr-4 font-mono text-xs text-gray-600">{u.phoneNumber}</td>
                        <td className="py-3 pr-4 font-medium text-gray-800">{u.firstName ?? "-"} {u.lastName ?? ""}</td>
                        <td className="py-3 pr-4 font-semibold text-[#354469]">{u.walletBalance.toLocaleString()} ₸</td>
                        <td className="py-3 pr-4">
                          {u.cars.length === 0 ? <span className="text-gray-300">—</span> : u.cars.map(c => (
                            <span key={c.plateNumber} className="inline-block bg-gray-100 rounded-lg px-2 py-0.5 text-xs mr-1 font-mono">{c.brand} {c.model} · {c.plateNumber}</span>
                          ))}
                        </td>
                        <td className="py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${u.isBanned ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                            {u.isBanned ? "Забанен" : "Активен"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "bookings" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Краткосрочные бронирования</h3>
              {dbBookings.length === 0 ? <p className="text-gray-400 text-center py-8 text-sm">Нет бронирований</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 pr-4 font-medium">Место</th>
                        <th className="pb-2 pr-4 font-medium">Номер авто</th>
                        <th className="pb-2 pr-4 font-medium">Пользователь</th>
                        <th className="pb-2 pr-4 font-medium">Статус</th>
                        <th className="pb-2 font-medium">Стоимость</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbBookings.map(b => (
                        <tr key={b.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 pr-4 font-bold text-[#354469]">{b.spotNumber}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-gray-600">{b.plateNumber}</td>
                          <td className="py-3 pr-4 text-gray-800">{b.userName}</td>
                          <td className="py-3 pr-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              b.status === "ACTIVE" ? "bg-blue-100 text-blue-700"
                              : b.status === "COMPLETED" ? "bg-green-100 text-green-700"
                              : b.status === "CANCELLED" ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                            }`}>{b.status}</span>
                          </td>
                          <td className="py-3 font-semibold text-gray-800">{b.totalCost.toLocaleString()} ₸</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Долгосрочная аренда</h3>
              {dbRentals.length === 0 ? <p className="text-gray-400 text-center py-8 text-sm">Нет аренды</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 pr-4 font-medium">Место</th>
                        <th className="pb-2 pr-4 font-medium">Номер авто</th>
                        <th className="pb-2 pr-4 font-medium">Пользователь</th>
                        <th className="pb-2 pr-4 font-medium">Дней</th>
                        <th className="pb-2 pr-4 font-medium">До</th>
                        <th className="pb-2 font-medium">Стоимость</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbRentals.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 pr-4 font-bold text-[#354469]">{r.spotNumber}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-gray-600">{r.plateNumber}</td>
                          <td className="py-3 pr-4 text-gray-800">{r.userName}</td>
                          <td className="py-3 pr-4"><span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg text-xs font-medium">{r.rentalDays} дн.</span></td>
                          <td className="py-3 pr-4 text-xs text-gray-500">{new Date(r.endDate).toLocaleDateString("ru-RU")}</td>
                          <td className="py-3 font-semibold text-gray-800">{r.totalCost.toLocaleString()} ₸</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-800 text-sm mb-4">История транзакций</h3>
            {dbTransactions.length === 0 ? (
              <p className="text-gray-400 text-center py-10 text-sm">Нет транзакций в базе данных</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                      <th className="pb-2 pr-3 font-medium">Дата</th>
                      <th className="pb-2 pr-3 font-medium">Пользователь</th>
                      <th className="pb-2 pr-3 font-medium">Тип</th>
                      <th className="pb-2 pr-3 font-medium">Описание</th>
                      <th className="pb-2 pr-3 text-right font-medium">Сумма</th>
                      <th className="pb-2 text-right font-medium">Баланс после</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbTransactions.map(tx => (
                      <tr key={tx.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 pr-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          <div className="font-medium text-gray-800">{tx.user.firstName ?? ""} {tx.user.lastName ?? ""}</div>
                          <div className="text-gray-400 font-mono">{tx.user.phoneNumber}</div>
                        </td>
                        <td className="py-3 pr-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            tx.type === "DEPOSIT" ? "bg-green-100 text-green-700"
                            : tx.type === "PAYMENT" ? "bg-orange-100 text-orange-700"
                            : tx.type === "REFUND" ? "bg-blue-100 text-blue-700"
                            : tx.type === "CASHBACK" ? "bg-purple-100 text-purple-700"
                            : "bg-gray-100 text-gray-600"
                          }`}>{tx.type}</span>
                          {tx.stripePaymentIntentId && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-lg text-xs bg-indigo-50 text-indigo-500 font-mono">Stripe</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-xs text-gray-500 max-w-[160px] truncate">{tx.description ?? "—"}</td>
                        <td className={`py-3 pr-3 font-semibold text-right whitespace-nowrap ${tx.amount > 0 ? "text-green-600" : "text-gray-800"}`}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} ₸
                        </td>
                        <td className="py-3 text-right font-mono text-xs text-gray-500">{tx.balanceAfter.toLocaleString()} ₸</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "promo" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Создать промокод</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Код</label>
                  <input value={newPromo.code} onChange={e => setNewPromo({...newPromo, code: e.target.value.toUpperCase()})}
                    placeholder="SUMMER20" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]/30 focus:border-[#354469]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Скидка</label>
                  <input value={newPromo.discount} onChange={e => setNewPromo({...newPromo, discount: e.target.value})}
                    placeholder="100" type="number" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]/30 focus:border-[#354469]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Тип</label>
                  <select value={newPromo.type} onChange={e => setNewPromo({...newPromo, type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#354469]/30 focus:border-[#354469]">
                    <option value="FIXED">Фиксированная (₸)</option>
                    <option value="PERCENTAGE">Процент (%)</option>
                    <option value="FIRST_RIDE">Первая поездка</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Макс. использований</label>
                  <input value={newPromo.maxUses} onChange={e => setNewPromo({...newPromo, maxUses: e.target.value})}
                    placeholder="Без лимита" type="number" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]/30 focus:border-[#354469]" />
                </div>
              </div>
              {promoError && <p className="text-red-500 text-xs mb-2">{promoError}</p>}
              <button disabled={promoLoading || !newPromo.code || !newPromo.discount}
                onClick={async () => {
                  setPromoLoading(true); setPromoError("")
                  try {
                    const token = localStorage.getItem("qpark_token")
                    const res = await fetch("/backend/payments/promo/create", {
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
                className="w-full py-2.5 bg-[#354469] hover:bg-[#2a3654] text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50">
                {promoLoading ? "Создание..." : "Создать промокод"}
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Все промокоды ({promoCodes.length})</h3>
              {promoCodes.length === 0 ? (
                <p className="text-gray-400 text-center py-10 text-sm">Промокодов пока нет</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="pb-2 pr-3 font-medium">Код</th>
                        <th className="pb-2 pr-3 font-medium">Скидка</th>
                        <th className="pb-2 pr-3 font-medium">Тип</th>
                        <th className="pb-2 pr-3 font-medium">Использован</th>
                        <th className="pb-2 font-medium">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promoCodes.map(p => (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 pr-3 font-mono font-bold text-[#354469]">{p.code}</td>
                          <td className="py-3 pr-3 font-semibold text-gray-800">{p.discount}{p.type === "PERCENTAGE" ? "%" : " ₸"}</td>
                          <td className="py-3 pr-3">
                            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                              p.type === "PERCENTAGE" ? "bg-purple-100 text-purple-700"
                              : p.type === "FIRST_RIDE" ? "bg-blue-100 text-blue-700"
                              : "bg-orange-100 text-orange-700"
                            }`}>{p.type}</span>
                          </td>
                          <td className="py-3 pr-3 text-xs text-gray-500">{p.usedCount}{p.maxUses ? `/${p.maxUses}` : ""}</td>
                          <td className="py-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${p.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {p.isActive ? "Активен" : "Неактивен"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
