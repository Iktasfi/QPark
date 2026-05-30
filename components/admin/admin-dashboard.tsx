"use client"

const RAILWAY = 'https://qpark-production.up.railway.app'

import { useState, useEffect, useRef } from "react"
import {
  ArrowLeft, Car, Check, Clock, AlertCircle, Wrench,
  Loader2, RefreshCw, Wifi, WifiOff, Activity, TrendingUp
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

const statusConfig: Record<string, { dot: string; badge: string; badgeText: string; label: string; englishKey: string }> = {
  "Свободно":      { dot: "#22c55e", badge: "rgba(34,197,94,0.15)",   badgeText: "#22c55e", label: "Свободно",      englishKey: "FREE" },
  "Забронировано": { dot: "#f59e0b", badge: "rgba(245,158,11,0.15)",  badgeText: "#f59e0b", label: "Забронировано", englishKey: "BOOKED" },
  "Занято":        { dot: "#ef4444", badge: "rgba(239,68,68,0.15)",   badgeText: "#ef4444", label: "Занято",        englishKey: "OCCUPIED" },
  "Резерв":        { dot: "#a855f7", badge: "rgba(168,85,247,0.15)",  badgeText: "#a855f7", label: "Резерв",        englishKey: "RESERVED" },
  "Ремонт":        { dot: "#f97316", badge: "rgba(249,115,22,0.15)",  badgeText: "#f97316", label: "Ремонт",        englishKey: "REPAIR" },
  FREE:      { dot: "#22c55e", badge: "rgba(34,197,94,0.15)",   badgeText: "#22c55e", label: "Свободно",      englishKey: "FREE" },
  BOOKED:    { dot: "#f59e0b", badge: "rgba(245,158,11,0.15)",  badgeText: "#f59e0b", label: "Забронировано", englishKey: "BOOKED" },
  OCCUPIED:  { dot: "#ef4444", badge: "rgba(239,68,68,0.15)",   badgeText: "#ef4444", label: "Занято",        englishKey: "OCCUPIED" },
  RESERVED:  { dot: "#a855f7", badge: "rgba(168,85,247,0.15)",  badgeText: "#a855f7", label: "Резерв",        englishKey: "RESERVED" },
  REPAIR:    { dot: "#f97316", badge: "rgba(249,115,22,0.15)",  badgeText: "#f97316", label: "Ремонт",        englishKey: "REPAIR" },
}

const liveEventMeta: Record<string, { label: string; color: string; emoji: string }> = {
  "booking-created":   { label: "Новое бронирование",  color: "#f59e0b", emoji: "🟡" },
  "booking-completed": { label: "Парковка завершена",   color: "#22c55e", emoji: "✅" },
  "booking-cancelled": { label: "Бронь отменена",       color: "#ef4444", emoji: "❌" },
  "booking-extended":  { label: "Бронь продлена",       color: "#60a5fa", emoji: "⏰" },
  "rental-created":    { label: "Долгосрочная аренда",  color: "#a855f7", emoji: "🟣" },
  "payment-completed": { label: "Оплата прошла",        color: "#22c55e", emoji: "💳" },
}

interface DbUser { id: string; phoneNumber: string; firstName: string | null; lastName: string | null; walletBalance: number; isBanned: boolean; cars: { plateNumber: string; brand: string; model: string }[] }
interface DbBooking { id: string; spotNumber: string; plateNumber: string; userName: string; status: string; startTime: string; totalCost: number }
interface DbRental { id: string; spotNumber: string; plateNumber: string; userName: string; rentalDays: number; totalCost: number; status: string; endDate: string }
interface DbTransaction { id: string; amount: number; type: string; description: string | null; balanceBefore: number; balanceAfter: number; stripePaymentIntentId: string | null; createdAt: string; user: { phoneNumber: string; firstName: string | null; lastName: string | null } }

const CARD = "rounded-2xl border border-white/10 p-5"
const CARD_BG = { background: "rgba(255,255,255,0.04)" }

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
  const [activeTab, setActiveTab] = useState<"spots" | "users" | "bookings" | "transactions" | "promo" | "locations" | "photos" | "complaints" | "applications">("spots")
  const [pendingPhotos, setPendingPhotos] = useState<{id: string; type: string; photoUrl: string | null; photoUploadedAt: string | null; spotNumber: string; plateNumber: string; userName: string}[]>([])
  const [complaints, setComplaints] = useState<{id: string; spotId: string; reason: string; photoUrl: string | null; status: string; createdAt: string; detectedPlate: string | null; violatorUserId: string | null; user: {firstName: string | null; phoneNumber: string}}[]>([])
  const [applications, setApplications] = useState<{id: string; companyName: string; ownerName: string; phone: string; email: string | null; address: string; city: string; spotsCount: number; description: string | null; status: string; adminNote: string | null; createdAt: string}[]>([])
  const [showAddLocation, setShowAddLocation] = useState(false)
  const [showB2BForm, setShowB2BForm] = useState(false)
  const [locationForm, setLocationForm] = useState({ name: "", address: "", spots: "" })
  const [b2bForm, setB2bForm] = useState({ companyName: "", ownerName: "", phone: "", address: "", spots: "", docs: "" })
  const [locationAdded, setLocationAdded] = useState(false)
  const [b2bSent, setB2bSent] = useState(false)
  const mockLocations = [
    { id: 1, name: "Парковка №1", address: "Улы Дала, 1", spots: 30, free: 12, status: "Активна", spotRange: [1, 30] },
    { id: 2, name: "Парковка №2", address: "Сыганак, 5",  spots: 25, free: 8,  status: "Активна", spotRange: [1, 25] },
    { id: 3, name: "Парковка №3", address: "Кабанбай батыр, 12", spots: 20, free: 5, status: "Активна", spotRange: [1, 20] },
  ]
  const [selectedLocationId, setSelectedLocationId] = useState(1)
  const selectedLocation = mockLocations.find(l => l.id === selectedLocationId)!

  const filterSpotsByLocation = (table: ParkingSpot[][]) => {
    const [min, max] = selectedLocation.spotRange
    return table.map(row =>
      row.filter(spot => {
        const num = parseInt(spot.spotNumber.replace("SP-", ""))
        return num >= min && num <= max
      })
    ).filter(row => row.length > 0)
  }
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

    const onSpotStatusChanged = () => { fetchParkingData() }
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
        fetch(`${RAILWAY}/parking/spots`),
        fetch(`${RAILWAY}/admin/dashboard`),
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
        const txRes = await fetch(`${RAILWAY}/payments/admin/transactions`, { headers: { Authorization: `Bearer ${token}` } })
        if (txRes.ok) setDbTransactions(await txRes.json())
      }
      if (token) {
        const promoRes = await fetch(`${RAILWAY}/payments/promo/all`, { headers: { Authorization: `Bearer ${token}` } })
        if (promoRes.ok) setPromoCodes(await promoRes.json())
      }
      if (token) {
        const photosRes = await fetch(`${RAILWAY}/bookings/admin/pending-photos`, { headers: { Authorization: `Bearer ${token}` } })
        if (photosRes.ok) setPendingPhotos(await photosRes.json())
        const complaintsRes = await fetch(`${RAILWAY}/admin/complaints`, { headers: { Authorization: `Bearer ${token}` } })
        if (complaintsRes.ok) setComplaints(await complaintsRes.json())
        const appsRes = await fetch(`${RAILWAY}/admin/applications`, { headers: { Authorization: `Bearer ${token}` } })
        if (appsRes.ok) setApplications(await appsRes.json())
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
      const response = await fetch(`${RAILWAY}/parking/set-status`, {
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
      <div className="flex flex-col items-center justify-center min-h-screen gap-3" style={{ background: "linear-gradient(135deg, #0f1623 0%, #1a2540 100%)" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#354469" }}>
          <span className="text-white text-xl font-black">Q</span>
        </div>
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        <span className="text-white/40 text-sm">Загрузка данных...</span>
      </div>
    )
  }

  if (!parkingData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: "linear-gradient(135deg, #0f1623 0%, #1a2540 100%)" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#354469" }}>
          <span className="text-white text-xl font-black">Q</span>
        </div>
        <WifiOff className="h-8 w-8 text-red-400" />
        <p className="text-white text-lg font-semibold">Бэкенд недоступен</p>
        <p className="text-white/50 text-sm text-center max-w-xs">
          {error || "Не удалось подключиться к Railway. Проверьте что сервер запущен."}
        </p>
        <button
          onClick={() => { setLoading(true); fetchParkingData() }}
          className="mt-2 px-4 py-2 rounded-xl text-sm font-medium text-white border border-white/20 hover:bg-white/10 transition-colors"
        >
          Повторить
        </button>
      </div>
    )
  }

  const freeSpots     = parkingData.statistics.shortTerm.free     + parkingData.statistics.longTerm.free
  const occupiedSpots = parkingData.statistics.shortTerm.occupied + parkingData.statistics.longTerm.occupied
  const bookedSpots   = parkingData.statistics.shortTerm.booked   + parkingData.statistics.longTerm.booked
  const repairSpots   = parkingData.statistics.shortTerm.repair   + parkingData.statistics.longTerm.repair
  const total         = parkingData.statistics.total
  const occupancy     = total > 0 ? Math.round(((occupiedSpots + bookedSpots) / total) * 100) : 0

  const renderSpotCard = (spot: ParkingSpot) => {
    const cfg = statusConfig[spot.status] ?? statusConfig["Свободно"]
    return (
      <div key={spot.spotNumber} className="rounded-2xl p-3 border border-white/10 hover:border-white/20 transition-all"
        style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm text-white">{spot.spotNumber}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.badge, color: cfg.badgeText }}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: spot.type === "SHORT_TERM" ? "#60a5fa" : "#34d399" }} />
          <span className="text-[10px] text-white/40">{spot.type === "SHORT_TERM" ? "Краткосрочная" : "Долгосрочная"}</span>
        </div>
        {spot.carPlate !== "-" && (
          <div className="text-xs font-mono px-2 py-1 rounded-lg mb-2 text-white/70 border border-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
            {spot.carPlate}
          </div>
        )}
        <div className="flex gap-1 mb-1.5">
          <button disabled={!!actionLoading} onClick={() => simulateAction("entry", spot.spotNumber)}
            className="flex-1 py-1 text-[10px] font-medium rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40">
            {actionLoading === `entry-${spot.spotNumber}` ? "..." : "↓ Въезд"}
          </button>
          <button disabled={!!actionLoading} onClick={() => simulateAction("exit", spot.spotNumber)}
            className="flex-1 py-1 text-[10px] font-medium rounded-lg border border-white/10 text-white/50 hover:bg-white/5 transition-colors disabled:opacity-40">
            {actionLoading === `exit-${spot.spotNumber}` ? "..." : "↑ Выезд"}
          </button>
          <button disabled={!!actionLoading} onClick={() => setSpotStatus(spot.spotNumber, "FREE")}
            className="px-2 py-1 text-[10px] rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-40" title="Сбросить">
            ↺
          </button>
        </div>
        <select className="text-[10px] border border-white/10 rounded-lg px-2 py-1 w-full text-white/60 focus:outline-none focus:border-white/30"
          style={{ background: "#1e2d4a", colorScheme: "dark" }}
          value={spot.status} onChange={(e) => setSpotStatus(spot.spotNumber, e.target.value)} disabled={!!actionLoading}>
          <option value="Свободно"  style={{ background: "#1e2d4a", color: "#fff" }}>Свободно</option>
          <option value="Забронировано" style={{ background: "#1e2d4a", color: "#fff" }}>Забронировано</option>
          <option value="Занято"    style={{ background: "#1e2d4a", color: "#fff" }}>Занято</option>
          <option value="Резерв"    style={{ background: "#1e2d4a", color: "#fff" }}>Резерв</option>
          <option value="Ремонт"    style={{ background: "#1e2d4a", color: "#fff" }}>Ремонт</option>
        </select>
      </div>
    )
  }

  const renderParkingSection = (title: string, table: ParkingSpot[][]) => (
    <div className="mb-6">
      <p className="text-white/50 text-xs font-mono uppercase tracking-widest mb-3">{title}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {table.map((row) => row.map((spot) => renderSpotCard(spot)))}
      </div>
    </div>
  )

  const tabs: { id: typeof activeTab; label: string; count: number }[] = [
    { id: "spots",        label: "Места",        count: total },
    { id: "users",        label: "Пользователи", count: dbUsers.length },
    { id: "bookings",     label: "Бронирования", count: dbBookings.length + dbRentals.length },
    { id: "transactions", label: "Транзакции",   count: dbTransactions.length },
    { id: "promo",        label: "Промокоды",    count: promoCodes.length },
    { id: "complaints",   label: "⚠️ Жалобы",    count: complaints.filter(c => c.status === "PENDING").length },
    { id: "applications", label: "📋 Заявки",    count: applications.filter(a => a.status === "NEW").length },
    { id: "locations",    label: "Локации",      count: mockLocations.length },
  ]

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #0f1623 0%, #1a2540 50%, #0f1623 100%)" }}>

      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4" style={{ background: "rgba(53,68,105,0.6)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => (window.location.href = "/")}
              className="p-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#354469" }}>
                <span className="text-white font-black text-sm">Q</span>
              </div>
              <div>
                <h1 className="text-white font-bold text-base">QPark Admin</h1>
                <p className="text-white/40 text-xs">Обновлено: {parkingData.lastUpdated}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${socketConnected ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40"}`}>
              {socketConnected ? <><Wifi className="h-3 w-3" /> Live</> : <><WifiOff className="h-3 w-3" /> Офлайн</>}
            </div>
            <button onClick={handleRefresh} disabled={refreshing}
              className="p-2 rounded-xl border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-colors">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">

        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl px-4 py-3 border border-red-500/30 text-red-400"
            style={{ background: "rgba(239,68,68,0.1)" }}>
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: "Свободно",      value: freeSpots,     color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
            { label: "Забронировано", value: bookedSpots,   color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
            { label: "Занято",        value: occupiedSpots, color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
            { label: "Ремонт",        value: repairSpots,   color: "#f97316", bg: "rgba(249,115,22,0.12)" },
            { label: "Загрузка",      value: `${occupancy}%`, color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="rounded-2xl p-4 border border-white/10" style={{ background: bg }}>
              <p className="text-3xl font-black" style={{ color }}>{value}</p>
              <p className="text-white/50 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Live feed + controls */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className={CARD} style={CARD_BG}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-white/40" />
                <p className="text-white/70 text-sm font-semibold">Живая лента</p>
              </div>
              {socketConnected && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-green-400" style={{ background: "rgba(34,197,94,0.15)" }}>
                  ● В реальном времени
                </span>
              )}
            </div>
            {liveEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <TrendingUp className="h-8 w-8 text-white/10 mb-2" />
                <p className="text-white/30 text-sm">Ожидание событий...</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {liveEvents.map((evt) => {
                  const meta = liveEventMeta[evt.type] ?? { label: evt.type, color: "#9ca3af", emoji: "📌" }
                  return (
                    <div key={evt.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{meta.emoji}</span>
                        <div>
                          <p className="text-xs font-medium" style={{ color: meta.color }}>{meta.label}</p>
                          <p className="text-[10px] text-white/30">{evt.spotId ?? ""}{evt.plateNumber ? ` · ${evt.plateNumber}` : ""}</p>
                        </div>
                      </div>
                      <span className="text-[10px] text-white/30 font-mono">
                        {evt.timestamp.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className={CARD} style={CARD_BG}>
            <p className="text-white/70 text-sm font-semibold mb-4">Управление симуляцией</p>
            <div className="flex gap-2 mb-4">
              <input placeholder="Номер машины" value={carPlate} onChange={(e) => setCarPlate(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/20"
                style={{ background: "rgba(255,255,255,0.06)" }} />
              <button onClick={handleRefresh}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ background: "#354469" }}>
                Обновить
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { dot: "#22c55e", label: "Свободно" },
                { dot: "#f59e0b", label: "Забронировано" },
                { dot: "#ef4444", label: "Занято" },
                { dot: "#a855f7", label: "Резерв" },
                { dot: "#f97316", label: "Ремонт" },
              ].map(({ dot, label }) => (
                <div key={label} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-white/10"
                  style={{ background: "rgba(255,255,255,0.04)" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
                  <span className="text-xs text-white/50">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2 rounded-xl font-medium text-sm transition-all"
              style={activeTab === tab.id
                ? { background: "#354469", color: "#ffffff" }
                : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
              {tab.label}
              <span className="ml-2 text-xs opacity-60">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "spots" && (
          <>
            {/* Location selector */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-white/40 text-sm shrink-0">Локация:</span>
              <select
                value={selectedLocationId}
                onChange={e => setSelectedLocationId(Number(e.target.value))}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white border border-white/10 focus:outline-none focus:border-white/30"
                style={{ background: "#354469" }}>
                {mockLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} — {loc.address}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const allSpots = [
                ...parkingData.tables.shortTerm.table.flat(),
                ...parkingData.tables.longTerm.table.flat(),
              ]
              const filtered = filterSpotsByLocation([allSpots])
              return (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filtered.flat().map(spot => renderSpotCard(spot))}
                </div>
              )
            })()}
          </>
        )}

        {activeTab === "users" && (
          <div className={CARD} style={CARD_BG}>
            <p className="text-white/70 text-sm font-semibold mb-4">Зарегистрированные пользователи</p>
            {dbUsers.length === 0 ? (
              <p className="text-white/30 text-center py-10 text-sm">Нет пользователей</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-white/30 border-b border-white/10">
                      <th className="pb-3 pr-4 font-medium">Телефон</th>
                      <th className="pb-3 pr-4 font-medium">Имя</th>
                      <th className="pb-3 pr-4 font-medium">Баланс</th>
                      <th className="pb-3 pr-4 font-medium">Машины</th>
                      <th className="pb-3 font-medium">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbUsers.map(u => (
                      <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 pr-4 font-mono text-xs text-white/50">{u.phoneNumber}</td>
                        <td className="py-3 pr-4 font-medium text-white/80">{u.firstName ?? "-"} {u.lastName ?? ""}</td>
                        <td className="py-3 pr-4 font-semibold text-blue-400">{u.walletBalance.toLocaleString()} ₸</td>
                        <td className="py-3 pr-4">
                          {u.cars.length === 0 ? <span className="text-white/20">—</span> : u.cars.map(c => (
                            <span key={c.plateNumber} className="inline-block rounded-lg px-2 py-0.5 text-xs mr-1 font-mono text-white/60 border border-white/10"
                              style={{ background: "rgba(255,255,255,0.05)" }}>
                              {c.brand} {c.model} · {c.plateNumber}
                            </span>
                          ))}
                        </td>
                        <td className="py-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium"
                            style={u.isBanned
                              ? { background: "rgba(239,68,68,0.15)", color: "#ef4444" }
                              : { background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
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
            <div className={CARD} style={CARD_BG}>
              <p className="text-white/70 text-sm font-semibold mb-4">Краткосрочные бронирования</p>
              {dbBookings.length === 0 ? <p className="text-white/30 text-center py-8 text-sm">Нет бронирований</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-white/30 border-b border-white/10">
                        <th className="pb-3 pr-4 font-medium">Место</th>
                        <th className="pb-3 pr-4 font-medium">Номер авто</th>
                        <th className="pb-3 pr-4 font-medium">Пользователь</th>
                        <th className="pb-3 pr-4 font-medium">Статус</th>
                        <th className="pb-3 font-medium">Стоимость</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbBookings.map(b => (
                        <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 pr-4 font-bold text-blue-400">{b.spotNumber}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-white/50">{b.plateNumber}</td>
                          <td className="py-3 pr-4 text-white/70">{b.userName}</td>
                          <td className="py-3 pr-4">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium"
                              style={b.status === "ACTIVE"
                                ? { background: "rgba(96,165,250,0.15)", color: "#60a5fa" }
                                : b.status === "COMPLETED"
                                  ? { background: "rgba(34,197,94,0.15)", color: "#22c55e" }
                                  : b.status === "CANCELLED"
                                    ? { background: "rgba(239,68,68,0.15)", color: "#ef4444" }
                                    : { background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
                              {b.status}
                            </span>
                          </td>
                          <td className="py-3 font-semibold text-white/80">{b.totalCost.toLocaleString()} ₸</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={CARD} style={CARD_BG}>
              <p className="text-white/70 text-sm font-semibold mb-4">Долгосрочная аренда</p>
              {dbRentals.length === 0 ? <p className="text-white/30 text-center py-8 text-sm">Нет аренды</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-white/30 border-b border-white/10">
                        <th className="pb-3 pr-4 font-medium">Место</th>
                        <th className="pb-3 pr-4 font-medium">Номер авто</th>
                        <th className="pb-3 pr-4 font-medium">Пользователь</th>
                        <th className="pb-3 pr-4 font-medium">Дней</th>
                        <th className="pb-3 pr-4 font-medium">До</th>
                        <th className="pb-3 font-medium">Стоимость</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbRentals.map(r => (
                        <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 pr-4 font-bold text-blue-400">{r.spotNumber}</td>
                          <td className="py-3 pr-4 font-mono text-xs text-white/50">{r.plateNumber}</td>
                          <td className="py-3 pr-4 text-white/70">{r.userName}</td>
                          <td className="py-3 pr-4">
                            <span className="px-2 py-0.5 rounded-lg text-xs font-medium" style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
                              {r.rentalDays} дн.
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-xs text-white/40">{new Date(r.endDate).toLocaleDateString("ru-RU")}</td>
                          <td className="py-3 font-semibold text-white/80">{r.totalCost.toLocaleString()} ₸</td>
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
          <div className={CARD} style={CARD_BG}>
            <p className="text-white/70 text-sm font-semibold mb-4">История транзакций</p>
            {dbTransactions.length === 0 ? (
              <p className="text-white/30 text-center py-10 text-sm">Нет транзакций</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-white/30 border-b border-white/10">
                      <th className="pb-3 pr-3 font-medium">Дата</th>
                      <th className="pb-3 pr-3 font-medium">Пользователь</th>
                      <th className="pb-3 pr-3 font-medium">Тип</th>
                      <th className="pb-3 pr-3 font-medium">Описание</th>
                      <th className="pb-3 pr-3 text-right font-medium">Сумма</th>
                      <th className="pb-3 text-right font-medium">Баланс после</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbTransactions.map(tx => (
                      <tr key={tx.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 pr-3 text-xs text-white/30 whitespace-nowrap font-mono">
                          {new Date(tx.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          <div className="font-medium text-white/70">{tx.user.firstName ?? ""} {tx.user.lastName ?? ""}</div>
                          <div className="text-white/30 font-mono">{tx.user.phoneNumber}</div>
                        </td>
                        <td className="py-3 pr-3">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium"
                            style={tx.type === "DEPOSIT"  ? { background: "rgba(34,197,94,0.15)",  color: "#22c55e" }
                              : tx.type === "PAYMENT"  ? { background: "rgba(249,115,22,0.15)", color: "#f97316" }
                              : tx.type === "REFUND"   ? { background: "rgba(96,165,250,0.15)", color: "#60a5fa" }
                              : tx.type === "CASHBACK" ? { background: "rgba(168,85,247,0.15)", color: "#a855f7" }
                              :                         { background: "rgba(255,255,255,0.08)",  color: "#9ca3af" }}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-xs text-white/30 max-w-[160px] truncate">{tx.description ?? "—"}</td>
                        <td className={`py-3 pr-3 font-semibold text-right whitespace-nowrap ${tx.amount > 0 ? "text-green-400" : "text-white/70"}`}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} ₸
                        </td>
                        <td className="py-3 text-right font-mono text-xs text-white/30">{tx.balanceAfter.toLocaleString()} ₸</td>
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
            <div className={CARD} style={CARD_BG}>
              <p className="text-white/70 text-sm font-semibold mb-4">Создать промокод</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {[
                  { label: "Код", field: "code", placeholder: "SUMMER20", type: "text", transform: (v: string) => v.toUpperCase() },
                  { label: "Скидка", field: "discount", placeholder: "100", type: "number", transform: (v: string) => v },
                ].map(({ label, field, placeholder, type, transform }) => (
                  <div key={field}>
                    <label className="text-xs text-white/30 mb-1.5 block">{label}</label>
                    <input value={newPromo[field as "code" | "discount"]}
                      onChange={e => setNewPromo({ ...newPromo, [field]: transform(e.target.value) })}
                      placeholder={placeholder} type={type}
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-white border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/20"
                      style={{ background: "rgba(255,255,255,0.06)" }} />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-white/30 mb-1.5 block">Тип</label>
                  <select value={newPromo.type} onChange={e => setNewPromo({ ...newPromo, type: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white border border-white/10 focus:outline-none focus:border-white/30"
                    style={{ background: "#1e2d4a", colorScheme: "dark" }}>
                    <option value="FIXED" style={{ background: "#1e2d4a", color: "#fff" }}>Фиксированная (₸)</option>
                    <option value="PERCENTAGE" style={{ background: "#1e2d4a", color: "#fff" }}>Процент (%)</option>
                    <option value="FIRST_RIDE" style={{ background: "#1e2d4a", color: "#fff" }}>Первая поездка</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/30 mb-1.5 block">Макс. использований</label>
                  <input value={newPromo.maxUses} onChange={e => setNewPromo({ ...newPromo, maxUses: e.target.value })}
                    placeholder="Без лимита" type="number"
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/20"
                    style={{ background: "rgba(255,255,255,0.06)" }} />
                </div>
              </div>
              {promoError && <p className="text-red-400 text-xs mb-2">{promoError}</p>}
              <button disabled={promoLoading || !newPromo.code || !newPromo.discount}
                onClick={async () => {
                  setPromoLoading(true); setPromoError("")
                  try {
                    const token = localStorage.getItem("qpark_token")
                    const res = await fetch(`${RAILWAY}/payments/promo/create`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-40"
                style={{ background: "#354469" }}>
                {promoLoading ? "Создание..." : "Создать промокод"}
              </button>
            </div>

            <div className={CARD} style={CARD_BG}>
              <p className="text-white/70 text-sm font-semibold mb-4">Все промокоды ({promoCodes.length})</p>
              {promoCodes.length === 0 ? (
                <p className="text-white/30 text-center py-10 text-sm">Промокодов пока нет</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-white/30 border-b border-white/10">
                        <th className="pb-3 pr-3 font-medium">Код</th>
                        <th className="pb-3 pr-3 font-medium">Скидка</th>
                        <th className="pb-3 pr-3 font-medium">Тип</th>
                        <th className="pb-3 pr-3 font-medium">Использован</th>
                        <th className="pb-3 font-medium">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promoCodes.map(p => (
                        <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 pr-3 font-mono font-bold text-blue-400">{p.code}</td>
                          <td className="py-3 pr-3 font-semibold text-white/80">{p.discount}{p.type === "PERCENTAGE" ? "%" : " ₸"}</td>
                          <td className="py-3 pr-3">
                            <span className="px-2 py-0.5 rounded-lg text-xs font-medium"
                              style={p.type === "PERCENTAGE" ? { background: "rgba(168,85,247,0.15)", color: "#a855f7" }
                                : p.type === "FIRST_RIDE"   ? { background: "rgba(96,165,250,0.15)",  color: "#60a5fa" }
                                :                             { background: "rgba(249,115,22,0.15)",   color: "#f97316" }}>
                              {p.type}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-xs text-white/40">{p.usedCount}{p.maxUses ? `/${p.maxUses}` : ""}</td>
                          <td className="py-3">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium"
                              style={p.isActive
                                ? { background: "rgba(34,197,94,0.15)", color: "#22c55e" }
                                : { background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
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

        {activeTab === "photos" && (
          <div className="space-y-4">
            <div className={CARD} style={CARD_BG}>
              <p className="text-white/70 text-sm font-semibold mb-4">Ожидают подтверждения фото ({pendingPhotos.length})</p>
              {pendingPhotos.length === 0 ? (
                <p className="text-white/30 text-center py-10 text-sm">Новых фото нет</p>
              ) : (
                <div className="space-y-4">
                  {pendingPhotos.map(p => (
                    <div key={p.id} className="rounded-xl border border-white/10 p-4 space-y-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-semibold text-sm">{p.spotNumber} · {p.plateNumber}</p>
                          <p className="text-white/40 text-xs">{p.userName} · {p.photoUploadedAt ? new Date(p.photoUploadedAt).toLocaleString("ru-RU") : "—"}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium text-yellow-300 bg-yellow-500/20">
                          {p.type === "rental" ? "Долгосроч." : "Краткосроч."}
                        </span>
                      </div>
                      {p.photoUrl && (
                        <img
                          src={p.photoUrl}
                          alt="Фото машины"
                          className="w-full rounded-xl object-cover max-h-56"
                        />
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const token = localStorage.getItem("qpark_token")
                            const res = await fetch(`${RAILWAY}/bookings/${p.id}/photo/confirm`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ type: p.type }),
                            })
                            if (res.ok) setPendingPhotos(prev => prev.filter(x => x.id !== p.id))
                          }}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors">
                          ✓ Подтвердить место
                        </button>
                        <button
                          onClick={async () => {
                            const token = localStorage.getItem("qpark_token")
                            const res = await fetch(`${RAILWAY}/bookings/${p.id}/photo/wrong-spot`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ type: p.type }),
                            })
                            if (res.ok) setPendingPhotos(prev => prev.filter(x => x.id !== p.id))
                          }}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                          ✗ Неверное место (−200₸)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "complaints" && (
          <div className="space-y-4">
            <div className={CARD} style={CARD_BG}>
              <p className="text-white/70 text-sm font-semibold mb-4">Жалобы пользователей ({complaints.length})</p>
              {complaints.length === 0 ? (
                <p className="text-white/50 text-sm text-center py-8">Жалоб нет</p>
              ) : (
                <div className="space-y-3">
                  {complaints.map(c => (
                    <div key={c.id} className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${c.status === "PENDING" ? "bg-orange-500/20 text-orange-300" : c.status === "REASSIGNED" ? "bg-green-500/20 text-green-300" : c.status === "REFUNDED" ? "bg-blue-500/20 text-blue-300" : "bg-gray-500/20 text-gray-300"}`}>
                              {c.status}
                            </span>
                            <span className="text-white/60 text-xs">Место: <span className="text-white font-bold">{c.spotId}</span></span>
                            <span className="text-white/40 text-xs">{new Date(c.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p className="text-white/50 text-xs">{c.user.firstName ?? c.user.phoneNumber}</p>
                          <p className="text-white/80 text-sm mt-1">{c.reason}</p>
                        </div>
                        {c.photoUrl && (
                          <img src={c.photoUrl} alt="complaint" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                        )}
                      </div>
                      {/* OCR detected plate block */}
                      {c.detectedPlate && (
                        <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }}>
                          <div>
                            <p className="text-yellow-300 text-xs font-semibold mb-0.5">🔍 OCR обнаружил номер</p>
                            <p className="text-white font-bold text-lg tracking-widest">{c.detectedPlate}</p>
                            <p className="text-white/50 text-xs">{c.violatorUserId ? "✅ Пользователь найден в системе" : "⚠️ Пользователь не найден в БД"}</p>
                          </div>
                          {c.violatorUserId && c.status === "PENDING" && (
                            <button
                              onClick={async () => {
                                const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                                await fetch(`${RAILWAY}/admin/complaints/${c.id}/fine`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ violatorUserId: c.violatorUserId, amount: 500 }),
                                })
                                setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, status: "RESOLVED" } : x))
                                alert(`✅ Штраф 500₸ выписан нарушителю автоматически`)
                              }}
                              className="px-4 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-80 shrink-0"
                              style={{ background: "rgba(220,38,38,0.7)" }}
                            >
                              ⚡ Штраф 500₸
                            </button>
                          )}
                        </div>
                      )}

                      {c.status === "PENDING" && (
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                              const res = await fetch(`${RAILWAY}/admin/complaints/${c.id}/reassign`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              })
                              const data = await res.json()
                              if (data.action === "reassigned") {
                                setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, status: "REASSIGNED" } : x))
                                alert(`✅ Пользователь перенесён на ${data.newSpotId}`)
                              } else if (data.action === "refunded") {
                                setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, status: "REFUNDED" } : x))
                                alert(`💸 Нет свободных мест. Возврат ${data.refundAmount}₸`)
                              }
                            }}
                            className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-80"
                            style={{ background: "#354469" }}
                          >
                            🔄 Найти новое место
                          </button>
                          {!c.violatorUserId && (
                            <button
                              onClick={async () => {
                                const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                                await fetch(`${RAILWAY}/admin/complaints/${c.id}/fine`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ amount: 500 }),
                                })
                                setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, status: "RESOLVED" } : x))
                                alert("✅ Штраф выписан вручную")
                              }}
                              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600/70 hover:bg-red-600 transition-all"
                            >
                              ⚡ Штраф вручную
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "applications" && (
          <div className="space-y-4">
            <div className={CARD} style={CARD_BG}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-white/70 text-sm font-semibold">Заявки от арендодателей ({applications.length})</p>
                <a href="/apply" target="_blank"
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white hover:opacity-80 transition-all"
                  style={{ background: "#354469" }}>
                  🔗 Ссылка для арендодателей
                </a>
              </div>
              {applications.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-white/40 text-sm mb-2">Заявок пока нет</p>
                  <p className="text-white/30 text-xs">Поделитесь ссылкой <span className="text-white/50">/apply</span> с арендодателями</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {applications.map(app => (
                    <div key={app.id} className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                              app.status === "NEW" ? "bg-blue-500/20 text-blue-300" :
                              app.status === "IN_REVIEW" ? "bg-yellow-500/20 text-yellow-300" :
                              app.status === "APPROVED" ? "bg-green-500/20 text-green-300" :
                              "bg-red-500/20 text-red-300"
                            }`}>
                              {app.status === "NEW" ? "🆕 Новая" : app.status === "IN_REVIEW" ? "🔍 На рассмотрении" : app.status === "APPROVED" ? "✅ Одобрена" : "❌ Отклонена"}
                            </span>
                            <span className="text-white/40 text-xs">{new Date(app.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p className="text-white font-bold text-base">{app.companyName}</p>
                          <p className="text-white/60 text-sm">{app.ownerName}</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                            <p className="text-white/50 text-xs">📍 {app.city}, {app.address}</p>
                            <p className="text-white/50 text-xs">🅿️ {app.spotsCount} мест</p>
                            <p className="text-white/50 text-xs">📞 {app.phone}</p>
                            {app.email && <p className="text-white/50 text-xs">✉️ {app.email}</p>}
                          </div>
                          {app.description && (
                            <p className="text-white/50 text-xs mt-2 italic">"{app.description}"</p>
                          )}
                          {app.adminNote && (
                            <div className="mt-2 px-3 py-2 rounded-xl bg-white/5 text-white/60 text-xs">
                              📝 Заметка: {app.adminNote}
                            </div>
                          )}
                        </div>
                      </div>
                      {(app.status === "NEW" || app.status === "IN_REVIEW") && (
                        <div className="flex gap-2 flex-wrap">
                          {app.status === "NEW" && (
                            <button
                              onClick={async () => {
                                const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                                await fetch(`${RAILWAY}/admin/applications/${app.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ status: "IN_REVIEW" }),
                                })
                                setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: "IN_REVIEW" } : a))
                              }}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-yellow-600/70 hover:bg-yellow-600 transition-all"
                            >
                              🔍 Взять на рассмотрение
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                              const note = prompt("Заметка для одобрения (необязательно):")
                              await fetch(`${RAILWAY}/admin/applications/${app.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ status: "APPROVED", ...(note ? { adminNote: note } : {}) }),
                              })
                              setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: "APPROVED", adminNote: note ?? a.adminNote } : a))
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-green-600/70 hover:bg-green-600 transition-all"
                          >
                            ✅ Одобрить
                          </button>
                          <button
                            onClick={async () => {
                              const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                              const note = prompt("Причина отказа:")
                              await fetch(`${RAILWAY}/admin/applications/${app.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ status: "REJECTED", ...(note ? { adminNote: note } : {}) }),
                              })
                              setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: "REJECTED", adminNote: note ?? a.adminNote } : a))
                            }}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-700/70 hover:bg-red-700 transition-all"
                          >
                            ❌ Отклонить
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "locations" && (
          <div className="space-y-4">

            {/* Existing locations */}
            <div className={CARD} style={CARD_BG}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-white/70 text-sm font-semibold">Парковочные локации ({mockLocations.length})</p>
                <button onClick={() => { setShowAddLocation(true); setLocationAdded(false) }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-80"
                  style={{ background: "#354469" }}>
                  + Добавить локацию
                </button>
              </div>
              <div className="space-y-3">
                {mockLocations.map(loc => (
                  <div key={loc.id} className="flex items-center justify-between p-4 rounded-xl border border-white/10"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div>
                      <p className="text-white font-semibold text-sm">{loc.name}</p>
                      <p className="text-white/40 text-xs mt-0.5">{loc.address}</p>
                      <p className="text-white/30 text-xs mt-0.5">{loc.spots} мест · {loc.free} свободно</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-medium"
                      style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                      {loc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Add location form */}
            {showAddLocation && (
              <div className={CARD} style={CARD_BG}>
                <p className="text-white/70 text-sm font-semibold mb-4">Новая локация</p>
                {locationAdded ? (
                  <div className="text-center py-6">
                    <p className="text-green-400 font-semibold">✅ Локация добавлена!</p>
                    <button onClick={() => { setShowAddLocation(false); setLocationForm({ name: "", address: "", spots: "" }) }}
                      className="mt-3 text-white/40 text-sm hover:text-white/70">Закрыть</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[
                      { label: "Название", field: "name", placeholder: "Парковка №4" },
                      { label: "Адрес", field: "address", placeholder: "ул. Достык, 12" },
                      { label: "Количество мест", field: "spots", placeholder: "20" },
                    ].map(({ label, field, placeholder }) => (
                      <div key={field}>
                        <label className="text-xs text-white/30 mb-1.5 block">{label}</label>
                        <input value={locationForm[field as keyof typeof locationForm]}
                          onChange={e => setLocationForm({ ...locationForm, [field]: e.target.value })}
                          placeholder={placeholder}
                          className="w-full px-3 py-2.5 rounded-xl text-sm text-white border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/20"
                          style={{ background: "rgba(255,255,255,0.06)" }} />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setShowAddLocation(false)}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-white/50 border border-white/10 hover:bg-white/5">
                        Отмена
                      </button>
                      <button disabled={!locationForm.name || !locationForm.address || !locationForm.spots}
                        onClick={() => setLocationAdded(true)}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 hover:opacity-80"
                        style={{ background: "#354469" }}>
                        Добавить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* B2B landlord stub */}
            <div className={CARD} style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-purple-400 text-lg">🏢</span>
                <p className="text-purple-300 text-sm font-semibold">Для арендодателей</p>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium ml-auto"
                  style={{ background: "rgba(168,85,247,0.2)", color: "#a855f7" }}>Future Work</span>
              </div>
              <p className="text-white/40 text-xs mb-4">
                Владельцы парковок смогут добавлять свои объекты и зарабатывать через платформу QPark
              </p>
              <button onClick={() => { setShowB2BForm(!showB2BForm); setB2bSent(false) }}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                style={{ background: "rgba(168,85,247,0.15)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)" }}>
                {showB2BForm ? "Скрыть форму" : "Подать заявку на размещение"}
              </button>

              {showB2BForm && (
                <div className="mt-4 space-y-3">
                  {b2bSent ? (
                    <div className="text-center py-4">
                      <p className="text-purple-400 font-semibold">✅ Заявка отправлена!</p>
                      <p className="text-white/40 text-xs mt-1">Мы свяжемся с вами в течение 1-2 рабочих дней</p>
                    </div>
                  ) : (
                    <>
                      {[
                        { label: "Название компании / ИП", field: "companyName", placeholder: "ТОО QPark Partner" },
                        { label: "Имя владельца", field: "ownerName", placeholder: "Иван Иванов" },
                        { label: "Номер телефона", field: "phone", placeholder: "+7 700 000 0000" },
                        { label: "Адрес парковки", field: "address", placeholder: "ул. Сыганак, 5, Астана" },
                        { label: "Количество мест", field: "spots", placeholder: "50" },
                      ].map(({ label, field, placeholder }) => (
                        <div key={field}>
                          <label className="text-xs text-white/30 mb-1.5 block">{label}</label>
                          <input value={b2bForm[field as keyof typeof b2bForm]}
                            onChange={e => setB2bForm({ ...b2bForm, [field]: e.target.value })}
                            placeholder={placeholder}
                            className="w-full px-3 py-2.5 rounded-xl text-sm text-white border border-white/10 focus:outline-none focus:border-white/30 placeholder-white/20"
                            style={{ background: "rgba(255,255,255,0.06)" }} />
                        </div>
                      ))}
                      <div>
                        <label className="text-xs text-white/30 mb-1.5 block">
                          Документы правообладателя <span className="text-purple-400/60">(правоустанавливающий документ, план объекта)</span>
                        </label>
                        <div className="w-full px-3 py-4 rounded-xl border border-dashed border-white/20 text-center cursor-pointer hover:border-purple-400/40 transition-colors"
                          style={{ background: "rgba(255,255,255,0.03)" }}>
                          <p className="text-white/30 text-sm">📎 Прикрепить файлы</p>
                          <p className="text-white/20 text-xs mt-1">PDF, JPG, PNG — макс. 10 МБ</p>
                        </div>
                      </div>
                      <button onClick={() => setB2bSent(true)}
                        disabled={!b2bForm.companyName || !b2bForm.phone || !b2bForm.address}
                        className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 hover:opacity-80 transition-all"
                        style={{ background: "rgba(168,85,247,0.4)" }}>
                        Отправить заявку
                      </button>
                      <p className="text-white/20 text-xs text-center">
                        После проверки документов администратор свяжется с вами
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
