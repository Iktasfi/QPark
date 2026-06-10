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
  carPlate: string | null
  currentUserId: string | null
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

interface DbUser { id: string; phoneNumber: string; firstName: string | null; lastName: string | null; walletBalance: number; cars: { id: string; plateNumber: string; brand: string; model: string }[] }
interface DbBooking { id: string; spotNumber: string; plateNumber: string; userName: string; status: string; startTime: string; totalCost: number; exitRequestedAt?: string | null }
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
  const [spotModal, setSpotModal] = useState<{ spot: ParkingSpot; booking?: DbBooking; rental?: DbRental } | null>(null)
  type ViolatorInfo = { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; walletBalance: number; car: { plateNumber: string; brand: string; model: string }; bookings: { id: string; spotNumber: string; status: string; startTime: string; totalCost: number; isPaid: boolean }[]; fines: { id: string; amount: number; reason: string; isPaid: boolean; createdAt: string }[] }
  const [plateInputs, setPlateInputs] = useState<Record<string, string>>({})
  const [violatorLookup, setViolatorLookup] = useState<Record<string, ViolatorInfo | null | "loading">>({})
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<"spots" | "users" | "bookings" | "transactions" | "promo" | "locations" | "photos" | "complaints" | "applications" | "support">("spots")
  const [pendingPhotos, setPendingPhotos] = useState<{id: string; type: string; photoUrl: string | null; photoUploadedAt: string | null; spotNumber: string; plateNumber: string; userName: string}[]>([])
  const [complaints, setComplaints] = useState<{id: string; spotId: string; reason: string; photoUrl: string | null; status: string; createdAt: string; detectedPlate: string | null; violatorUserId: string | null; user: {firstName: string | null; phoneNumber: string}}[]>([])
  const [applications, setApplications] = useState<{id: string; companyName: string; ownerName: string; phone: string; email: string | null; address: string; city: string; spotsCount: number; description: string | null; status: string; adminNote: string | null; createdAt: string}[]>([])
  const [supportConversations, setSupportConversations] = useState<{userId: string; userName: string; phoneNumber: string; lastMessage: string; lastMessageAt: string; fromAdmin: boolean; unreadCount: number}[]>([])
  const [selectedSupportUser, setSelectedSupportUser] = useState<string | null>(null)
  const [supportMessages, setSupportMessages] = useState<{id: string; text: string; fromAdmin: boolean; createdAt: string}[]>([])
  const [supportReply, setSupportReply] = useState("")
  const [supportSending, setSupportSending] = useState(false)
  const mockLocations = [
    { id: 1,  name: "Парковка №1",  address: "Улы Дала, 1",              spots: 30, free: 12, status: "Активна", prefix: "SP"  },
    { id: 2,  name: "Парковка №2",  address: "Сыганак, 5",               spots: 25, free: 8,  status: "Активна", prefix: "P2"  },
    { id: 3,  name: "Парковка №3",  address: "Кабанбай батыр, 12",       spots: 20, free: 5,  status: "Активна", prefix: "P3"  },
    { id: 4,  name: "Парковка №4",  address: "Туран, 24",                spots: 19, free: 19, status: "Активна", prefix: "P4"  },
    { id: 5,  name: "Парковка №5",  address: "пр. Республики, 9",        spots: 22, free: 22, status: "Активна", prefix: "P5"  },
    { id: 6,  name: "Парковка №6",  address: "Достық, 13",               spots: 14, free: 14, status: "Активна", prefix: "P6"  },
    { id: 7,  name: "Парковка №7",  address: "Сарыарқа, 7",              spots: 17, free: 17, status: "Активна", prefix: "P7"  },
    { id: 8,  name: "Парковка №8",  address: "Бейбітшілік, 17",          spots: 16, free: 16, status: "Активна", prefix: "P8"  },
    { id: 9,  name: "Парковка №9",  address: "Иманов, 21",               spots: 21, free: 21, status: "Активна", prefix: "P9"  },
    { id: 10, name: "Парковка №10", address: "Хан Шатыр, пр. Туран, 3", spots: 18, free: 18, status: "Активна", prefix: "P10" },
    { id: 11, name: "Парковка №11", address: "пр. Мәңгілік Ел, 55",     spots: 20, free: 20, status: "Активна", prefix: "P11" },
    { id: 12, name: "Парковка №12", address: "Орынбор, 2 (у EXPO)",      spots: 16, free: 16, status: "Активна", prefix: "P12" },
    { id: 13, name: "Парковка №13", address: "пр. Туран, 37",             spots: 18, free: 18, status: "Активна", prefix: "P13" },
    { id: 14, name: "Парковка №14", address: "Нуржол бул., 5 (Байтерек)",  spots: 14, free: 14, status: "Активна", prefix: "P14" },
    { id: 15, name: "Парковка №15", address: "Сыганак, 43 (ЖК Нурсай)",   spots: 18, free: 18, status: "Активна", prefix: "P15" },
    { id: 16, name: "Парковка №16", address: "Кабанбай батыр, 17 (ЖК Байтерек)", spots: 17, free: 17, status: "Активна", prefix: "P16" },
    { id: 17, name: "Парковка №17", address: "Орынбор, 48 (ЖК Авиатор)",  spots: 15, free: 15, status: "Активна", prefix: "P17" },
    { id: 18, name: "Парковка №18", address: "Улы Дала, 8 (ЖК Думан)",    spots: 16, free: 16, status: "Активна", prefix: "P18" },
    { id: 19, name: "Парковка №19", address: "Иманова, 14 (ЖК Комфорт)",  spots: 17, free: 17, status: "Активна", prefix: "P19" },
  ]
  const [selectedLocationId, setSelectedLocationId] = useState(1)
  const selectedLocation = mockLocations.find(l => l.id === selectedLocationId)!

  const filterSpotsByLocation = (table: ParkingSpot[][]) => {
    const prefix = selectedLocation.prefix
    return table.map(row =>
      row.filter(spot => spot.spotNumber.startsWith(prefix + "-"))
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

    // Обновляем место МГНОВЕННО из Socket события (без ожидания HTTP refetch)
    // Точно так же как делает карта — иначе дашборд отстаёт на 1-2 секунды
    const onSpotStatusChanged = (data: { spotNumber?: string; status?: string; carPlate?: string | null }) => {
      if (data.spotNumber && data.status) {
        setParkingData(prev => {
          if (!prev) return prev
          const updateTable = (table: ParkingSpot[][]) =>
            table.map(row => row.map(s =>
              s.spotNumber === data.spotNumber
                ? { ...s, status: data.status!, carPlate: data.carPlate ?? '-' }
                : s
            ))
          return {
            ...prev,
            statistics: {
              ...prev.statistics,
              shortTerm: {
                ...prev.statistics.shortTerm,
                free:     prev.tables.shortTerm.table.flat().filter(s => s.spotNumber !== data.spotNumber ? s.status === 'FREE' : data.status === 'FREE').length,
                booked:   prev.tables.shortTerm.table.flat().filter(s => s.spotNumber !== data.spotNumber ? s.status === 'BOOKED' : data.status === 'BOOKED').length,
                occupied: prev.tables.shortTerm.table.flat().filter(s => s.spotNumber !== data.spotNumber ? s.status === 'OCCUPIED' : data.status === 'OCCUPIED').length,
                repair:   prev.tables.shortTerm.table.flat().filter(s => s.spotNumber !== data.spotNumber ? s.status === 'REPAIR' : data.status === 'REPAIR').length,
              },
              longTerm: {
                ...prev.statistics.longTerm,
                free:     prev.tables.longTerm.table.flat().filter(s => s.spotNumber !== data.spotNumber ? s.status === 'FREE' : data.status === 'FREE').length,
                booked:   prev.tables.longTerm.table.flat().filter(s => s.spotNumber !== data.spotNumber ? s.status === 'BOOKED' : data.status === 'BOOKED').length,
                occupied: prev.tables.longTerm.table.flat().filter(s => s.spotNumber !== data.spotNumber ? s.status === 'OCCUPIED' : data.status === 'OCCUPIED').length,
                repair:   prev.tables.longTerm.table.flat().filter(s => s.spotNumber !== data.spotNumber ? s.status === 'REPAIR' : data.status === 'REPAIR').length,
              },
            },
            tables: {
              shortTerm: { ...prev.tables.shortTerm, table: updateTable(prev.tables.shortTerm.table) },
              longTerm:  { ...prev.tables.longTerm,  table: updateTable(prev.tables.longTerm.table) },
            },
          }
        })
      }
      // Обновляем Бронирования и Пользователи в фоне
      fetchParkingData()
    }
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

    // Support chat: new message from user
    const onSupportMessage = (data: { userId: string; text: string; userName: string; createdAt: string }) => {
      setSupportConversations(prev => {
        const existing = prev.find(c => c.userId === data.userId)
        if (existing) {
          return prev.map(c => c.userId === data.userId
            ? { ...c, lastMessage: data.text, lastMessageAt: data.createdAt, fromAdmin: false, unreadCount: c.unreadCount + 1 }
            : c)
        }
        return [{ userId: data.userId, userName: data.userName, phoneNumber: "", lastMessage: data.text, lastMessageAt: data.createdAt, fromAdmin: false, unreadCount: 1 }, ...prev]
      })
      // If this conversation is open, append the message
      setSelectedSupportUser(cur => {
        if (cur === data.userId) {
          setSupportMessages(p => [...p, { id: `tmp-${Date.now()}`, text: data.text, fromAdmin: false, createdAt: data.createdAt }])
        }
        return cur
      })
    }
    socket.on("support-new-message", onSupportMessage)
    // Instant refresh after a complaint swap — bookings/rentals change spots
    socket.on("bookings-updated", fetchParkingData)

    const fallback = setInterval(fetchParkingData, 5000)

    return () => {
      socket.off("connect"); socket.off("disconnect")
      socket.off("spot-status-changed", onSpotStatusChanged)
      socket.off("booking-created", onBookingCreated)
      socket.off("booking-completed", onBookingCompleted)
      socket.off("booking-cancelled", onBookingCancelled)
      socket.off("booking-extended", onBookingExtended)
      socket.off("rental-created", onRentalCreated)
      socket.off("payment-completed", onPaymentCompleted)
      socket.off("support-new-message", onSupportMessage)
      socket.off("bookings-updated", fetchParkingData)
      clearInterval(fallback)
    }
  }, [])

  // Auto-load violator info when complaint has violatorUserId already set
  useEffect(() => {
    const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
    complaints.forEach(c => {
      if (c.violatorUserId && !violatorLookup[c.id]) {
        setViolatorLookup(prev => ({ ...prev, [c.id]: "loading" }))
        fetch(`${RAILWAY}/admin/users/${c.violatorUserId}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
          .then(data => setViolatorLookup(prev => ({ ...prev, [c.id]: data })))
          .catch(() => setViolatorLookup(prev => ({ ...prev, [c.id]: null })))
      }
    })
  }, [complaints])

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
        const supportRes = await fetch(`${RAILWAY}/support/admin/conversations`)
        if (supportRes.ok) setSupportConversations(await supportRes.json())
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
      const endpoint = action === "entry" ? "/backend/parking/simulate-entry" : "/backend/parking/simulate-exit"
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
    const isActive = spot.status === "Забронировано" || spot.status === "BOOKED" || spot.status === "Занято" || spot.status === "OCCUPIED" || spot.status === "Резерв" || spot.status === "RESERVED"
    const bookingType = (spot.status === "Резерв" || spot.status === "RESERVED") ? "Долгосрочная" : (spot.status === "Забронировано" || spot.status === "BOOKED") ? "Краткосрочная" : null

    const openModal = () => {
      if (!isActive) return
      const booking = dbBookings.find(b => b.spotNumber === spot.spotNumber && (b.status === "PENDING" || b.status === "CONFIRMED" || b.status === "ACTIVE"))
      const rental = dbRentals.find(r => r.spotNumber === spot.spotNumber && r.status === "ACTIVE")
      setSpotModal({ spot, booking, rental })
    }

    return (
      <div key={spot.spotNumber} className="rounded-2xl p-3 border border-white/10 hover:border-white/20 transition-all"
        style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={openModal} className={`font-bold text-sm text-left ${isActive ? "text-white hover:text-blue-300 cursor-pointer underline-offset-2 hover:underline" : "text-white/70 cursor-default"}`}>
            {spot.spotNumber}
          </button>
          <div className="flex items-center gap-1">
            {bookingType && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: bookingType === "Долгосрочная" ? "rgba(52,211,153,0.15)" : "rgba(96,165,250,0.15)", color: bookingType === "Долгосрочная" ? "#34d399" : "#60a5fa" }}>
                {bookingType === "Долгосрочная" ? "Аренда" : "Бронь"}
              </span>
            )}
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.badge, color: cfg.badgeText }}>
              {cfg.label}
            </span>
          </div>
        </div>
        {spot.carPlate && spot.carPlate !== "-" && (
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

  const SpotModal = () => {
    if (!spotModal) return null
    const { spot, booking, rental } = spotModal
    // Look up user: try by booking/rental plate, then by currentUserId directly
    const user = booking
      ? (dbUsers.find(u => u.cars.some(c => c.plateNumber === booking.plateNumber)) ?? dbUsers.find(u => u.id === spot.currentUserId))
      : rental
        ? (dbUsers.find(u => u.cars.some(c => c.plateNumber === rental.plateNumber)) ?? dbUsers.find(u => u.id === spot.currentUserId))
        : dbUsers.find(u => u.id === spot.currentUserId)
    const plate = booking?.plateNumber || rental?.plateNumber || spot.carPlate || user?.cars[0]?.plateNumber
    const car = user?.cars.find(c => c.plateNumber === plate) ?? user?.cars[0]
    const isLong = !!rental
    const startTime = booking?.startTime ? new Date(booking.startTime) : null
    const endDate = rental?.endDate ? new Date(rental.endDate) : null
    const daysLeft = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000)) : null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSpotModal(null)}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm rounded-3xl p-6 border border-white/15 shadow-2xl" style={{ background: "linear-gradient(135deg, #1a2540 0%, #0f1623 100%)" }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setSpotModal(null)} className="absolute top-4 right-4 text-white/40 hover:text-white/80 text-lg">✕</button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-lg" style={{ background: "#354469" }}>
              {spot.spotNumber.replace(/[^0-9]/g, "")}
            </div>
            <div>
              <p className="text-white font-bold text-lg">{spot.spotNumber}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: isLong ? "rgba(52,211,153,0.15)" : "rgba(96,165,250,0.15)", color: isLong ? "#34d399" : "#60a5fa" }}>
                  {isLong ? "Долгосрочная аренда" : "Краткосрочное бронирование"}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* Car plate */}
            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Номер машины</p>
              <p className="text-white font-mono font-bold text-lg tracking-widest">{plate || "—"}</p>
              {car && <p className="text-white/50 text-xs mt-0.5">{car.brand} {car.model}</p>}
            </div>

            {/* User */}
            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Пользователь</p>
              <p className="text-white font-semibold text-sm">
                {user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || booking?.userName || rental?.userName || "—"
                  : booking?.userName ?? rental?.userName ?? "—"}
              </p>
              {user && <p className="text-white/50 text-xs">{user.phoneNumber}</p>}
            </div>

            {/* Duration / time */}
            {isLong && rental ? (
              <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Аренда</p>
                <p className="text-white font-semibold text-sm">{rental.rentalDays} дней · {rental.totalCost.toLocaleString()} ₸</p>
                {endDate && <p className="text-white/50 text-xs mt-0.5">До {endDate.toLocaleDateString("ru-RU")} · осталось {daysLeft} дн.</p>}
              </div>
            ) : booking ? (
              <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Бронирование</p>
                <div className="space-y-0.5">
                  {startTime && (
                    <p className="text-white text-sm font-semibold">
                      С {startTime.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                  {startTime && (
                    <p className="text-white/50 text-xs">
                      {Math.round((Date.now() - startTime.getTime()) / 60000)} мин назад · {booking.status}
                    </p>
                  )}
                  <p className="text-white/70 text-xs">Стоимость: <span className="text-white font-semibold">{booking.totalCost.toLocaleString()} ₸</span></p>
                </div>
              </div>
            ) : null}

            {/* Admin actions */}
            <div className="space-y-2 pt-1">
              {/* Открыть шлагбаум вручную — если OCR не прочитал номер */}
              {(spot.status === "BOOKED" || spot.status === "RESERVED" || spot.status === "OCCUPIED") && (
                <button
                  onClick={async () => {
                    const token = localStorage.getItem("qpark_token")
                    const res = await fetch(`${RAILWAY}/admin/open-gate`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ spotNumber: spot.spotNumber, carPlate: plate }),
                    })
                    if (res.ok) { fetchParkingData(); setSpotModal(null) }
                    else alert("Ошибка при открытии шлагбаума")
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                  style={{ background: "rgba(96,165,250,0.2)", border: "1px solid rgba(96,165,250,0.3)" }}
                >
                  🔓 Открыть шлагбаум вручную
                </button>
              )}

              {/* Подтвердить выезд — если Finish нажат но OCR не прочитал номер на выезде */}
              {spot.status === "OCCUPIED" && booking && (
                <button
                  onClick={async () => {
                    if (!confirm(`Подтвердить выезд для бронирования ${booking.id}?`)) return
                    const token = localStorage.getItem("qpark_token")
                    const res = await fetch(`${RAILWAY}/admin/confirm-exit/${booking.id}`, {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                    })
                    if (res.ok) { fetchParkingData(); setSpotModal(null) }
                    else alert("Ошибка при подтверждении выезда")
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                  style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.25)" }}
                >
                  ✓ Подтвердить выезд вручную
                  {booking.exitRequestedAt && (
                    <span className="block text-xs font-normal opacity-60 mt-0.5">
                      Finish нажат в {new Date(booking.exitRequestedAt).toLocaleTimeString("ru-RU")}
                    </span>
                  )}
                </button>
              )}

              <div className="rounded-xl px-4 py-2.5 text-xs text-yellow-300/70" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)" }}>
                💡 Нажмите ↺ на карточке чтобы освободить место
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const tabs: { id: typeof activeTab; label: string; count: number }[] = [
    { id: "spots",        label: "Места",        count: total },
    { id: "users",        label: "Пользователи", count: dbUsers.length },
    { id: "bookings",     label: "Бронирования", count: dbBookings.length + dbRentals.length },
    { id: "transactions", label: "Транзакции",   count: dbTransactions.length },
    { id: "promo",        label: "Промокоды",    count: promoCodes.length },
    { id: "complaints",   label: "⚠️ Жалобы",    count: complaints.filter(c => c.status === "PENDING" || c.status === "OPEN").length },
    { id: "applications", label: "📋 Заявки",    count: applications.filter(a => a.status === "NEW").length },
    { id: "support",      label: "💬 Чат",       count: supportConversations.reduce((s, c) => s + c.unreadCount, 0) },
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
                            style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                            Активен
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
                          ✗ Неверное место (−900₸)
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
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Всего жалоб", value: complaints.length, color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
                { label: "Ожидают решения", value: complaints.filter(c => c.status === "PENDING" || c.status === "OPEN").length, color: "#fb923c", bg: "rgba(251,146,60,0.1)" },
                { label: "Решено", value: complaints.filter(c => c.status === "RESOLVED" || c.status === "CLOSED" || c.status === "REASSIGNED" || c.status === "REFUNDED").length, color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
              ].map(s => (
                <div key={s.label} className="rounded-2xl p-4 border border-white/10" style={{ background: s.bg }}>
                  <p className="text-3xl font-black" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-white/50 text-xs mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            <div className={CARD} style={CARD_BG}>
              <p className="text-white/70 text-sm font-semibold mb-4">Жалобы пользователей</p>
              {complaints.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <p className="text-4xl mb-3">✅</p>
                  <p className="text-white/50 text-sm">Жалоб нет — всё спокойно</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {complaints.map(c => {
                    const statusMeta: Record<string, { label: string; color: string; bg: string }> = {
                      PENDING:    { label: "⏳ Ожидает",    color: "#fb923c", bg: "rgba(251,146,60,0.15)" },
                      OPEN:       { label: "⏳ Ожидает",    color: "#fb923c", bg: "rgba(251,146,60,0.15)" },
                      REASSIGNED: { label: "🔄 Переназначен", color: "#34d399", bg: "rgba(52,211,153,0.15)" },
                      REFUNDED:   { label: "💸 Возврат",    color: "#60a5fa", bg: "rgba(96,165,250,0.15)" },
                      RESOLVED:   { label: "✅ Решено",     color: "#a3a3a3", bg: "rgba(163,163,163,0.1)" },
                      CLOSED:     { label: "✅ Решено",     color: "#a3a3a3", bg: "rgba(163,163,163,0.1)" },
                    }
                    // PENDING with no detected plate = OCR failed, refund issued, needs manual review
                    const needsManualReview = c.status === "PENDING" && !c.detectedPlate
                    const meta = needsManualReview
                      ? { label: "🔍 Ручная проверка", color: "#f87171", bg: "rgba(248,113,113,0.15)" }
                      : (statusMeta[c.status] ?? statusMeta.CLOSED)
                    return (
                      <div key={c.id} className="rounded-2xl overflow-hidden border border-white/10" style={{ background: "rgba(255,255,255,0.04)" }}>
                        {/* Card header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8" style={{ background: "rgba(255,255,255,0.03)" }}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                            <span className="text-white font-bold text-sm">Место {c.spotId}</span>
                          </div>
                          <span className="text-white/30 text-xs">{new Date(c.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>

                        <div className="p-4 space-y-3">
                          {/* Complainant */}
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "#354469" }}>
                              {(c.user.firstName ?? c.user.phoneNumber).charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white/40 text-[10px] uppercase tracking-wider">Подал жалобу</p>
                              <p className="text-white text-sm font-medium">{c.user.firstName ?? c.user.phoneNumber}</p>
                              <p className="text-white/60 text-xs mt-0.5 leading-relaxed">"{c.reason}"</p>
                            </div>
                            {c.photoUrl && (
                              <img src={c.photoUrl} alt="фото" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-white/10" />
                            )}
                          </div>

                          {/* Violator search block */}
                          {(() => {
                            const initPlate = c.detectedPlate ?? ""
                            const inputVal = plateInputs[c.id] ?? initPlate
                            const found = violatorLookup[c.id]
                            const isLoading = found === "loading"
                            const info = (found && found !== "loading") ? found as ViolatorInfo : null
                            const notFound = found === null

                            const lookupPlate = async (plate: string) => {
                              if (!plate.trim()) return
                              setViolatorLookup(prev => ({ ...prev, [c.id]: "loading" }))
                              const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                              const res = await fetch(`${RAILWAY}/admin/users/find-by-plate?plate=${encodeURIComponent(plate)}`, { headers: { Authorization: `Bearer ${token}` } })
                              const data = res.ok ? await res.json() : null
                              setViolatorLookup(prev => ({ ...prev, [c.id]: data }))
                              if (data) {
                                setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, detectedPlate: plate, violatorUserId: data.id } : x))
                                // Persist violatorUserId to DB so /reassign can use it
                                await fetch(`${RAILWAY}/admin/complaints/${c.id}/set-violator`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ plateNumber: plate }),
                                }).catch(() => {})
                              }
                            }

                            const issueFine = async (userId: string, name: string) => {
                              if (!confirm(`Выписать штраф 900₸ пользователю ${name}?`)) return
                              const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                              const res = await fetch(`${RAILWAY}/admin/complaints/${c.id}/fine`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ violatorUserId: userId, amount: 900 }),
                              })
                              if (res.ok) setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, status: "CLOSED" } : x))
                              else alert("❌ Ошибка")
                            }

                            return (
                              <div className="rounded-xl overflow-hidden border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
                                {/* Plate search */}
                                <div className="px-3 py-2.5 border-b border-white/8">
                                  <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">Номер нарушителя</p>
                                  <div className="flex gap-2">
                                    <input
                                      value={inputVal}
                                      onChange={e => setPlateInputs(prev => ({ ...prev, [c.id]: e.target.value.toUpperCase() }))}
                                      onKeyDown={e => e.key === "Enter" && lookupPlate(inputVal)}
                                      placeholder="Введите номер авто..."
                                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white font-mono text-sm tracking-wider focus:outline-none focus:border-white/30 placeholder-white/20"
                                    />
                                    {/* Auto-detect via EasyOCR */}
                                    {c.photoUrl && (
                                      <button
                                        onClick={async () => {
                                          setViolatorLookup(prev => ({ ...prev, [c.id]: "loading" }))
                                          const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                                          const res = await fetch(`${RAILWAY}/admin/complaints/${c.id}/detect-plate`, {
                                            method: "POST",
                                            headers: { Authorization: `Bearer ${token}` },
                                          })
                                          setViolatorLookup(prev => ({ ...prev, [c.id]: undefined as any }))
                                          if (res.ok) {
                                            const data = await res.json()
                                            if (data.plate) {
                                              setPlateInputs(prev => ({ ...prev, [c.id]: data.plate }))
                                              setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, detectedPlate: data.plate, violatorUserId: data.userId } : x))
                                              if (data.plate) lookupPlate(data.plate)
                                            } else {
                                              alert("🤷 EasyOCR не нашёл номер на фото")
                                            }
                                          } else {
                                            const err = await res.json()
                                            alert(`OCR: ${err.error}`)
                                          }
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-80 whitespace-nowrap"
                                        style={{ background: "#7c3aed" }}
                                        title="Распознать номер через EasyOCR"
                                      >
                                        📷 OCR
                                      </button>
                                    )}
                                    <button
                                      onClick={() => lookupPlate(inputVal)}
                                      disabled={isLoading}
                                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-80 disabled:opacity-40"
                                      style={{ background: "#354469" }}
                                    >
                                      {isLoading ? "⏳" : "🔍 Найти"}
                                    </button>
                                  </div>
                                  {c.detectedPlate && (
                                    <p className="text-[10px] text-yellow-400/70 mt-1">📷 EasyOCR: <span className="font-mono font-bold">{c.detectedPlate}</span></p>
                                  )}
                                </div>

                                {/* Result */}
                                {info && (
                                  <div className="p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-center gap-2">
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0" style={{ background: "linear-gradient(135deg,#dc2626,#7f1d1d)" }}>
                                          {(info.firstName ?? info.phoneNumber).charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                          <p className="text-white font-semibold text-sm">{info.firstName ?? "—"} {info.lastName ?? ""}</p>
                                          <p className="text-white/50 text-xs">{info.phoneNumber}</p>
                                          <p className="text-white/40 text-xs">{info.car.brand} {info.car.model} · <span className="font-mono">{info.car.plateNumber}</span></p>
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="text-[10px] text-white/30">Баланс</p>
                                        <p className={`font-bold text-sm ${info.walletBalance >= 900 ? "text-green-400" : "text-red-400"}`}>{info.walletBalance.toLocaleString()} ₸</p>
                                        {info.walletBalance < 900 && <p className="text-[10px] text-red-400/70">Не хватает</p>}
                                      </div>
                                    </div>

                                    {/* Stats row */}
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {[
                                        { label: "Броней", val: info.bookings.length },
                                        { label: "Штрафов", val: info.fines.length },
                                        { label: "Штрафы оплачены", val: `${info.fines.filter(f => f.isPaid).length}/${info.fines.length}` },
                                      ].map(s => (
                                        <div key={s.label} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(255,255,255,0.05)" }}>
                                          <p className="text-white font-bold text-sm">{s.val}</p>
                                          <p className="text-white/30 text-[9px]">{s.label}</p>
                                        </div>
                                      ))}
                                    </div>

                                    {/* History toggle */}
                                    <button onClick={() => setShowHistory(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                                      className="text-[10px] text-white/40 hover:text-white/60 transition-colors w-full text-left">
                                      {showHistory[c.id] ? "▲ Скрыть историю" : "▼ Показать историю бронирований"}
                                    </button>
                                    {showHistory[c.id] && (
                                      <div className="space-y-1 max-h-32 overflow-y-auto">
                                        {info.bookings.map(b => (
                                          <div key={b.id} className="flex items-center justify-between px-2 py-1 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.04)" }}>
                                            <span className="text-white/60">{b.spotNumber} · {new Date(b.startTime).toLocaleDateString("ru-RU")}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${b.status === "COMPLETED" ? "bg-green-500/20 text-green-400" : b.status === "CANCELLED" ? "bg-gray-500/20 text-gray-400" : "bg-blue-500/20 text-blue-400"}`}>{b.status}</span>
                                            <span className="text-white/40">{b.totalCost} ₸</span>
                                          </div>
                                        ))}
                                        {info.bookings.length === 0 && <p className="text-white/20 text-xs text-center py-2">Нет броней</p>}
                                      </div>
                                    )}

                                    {/* Fine + Swap button — works for PENDING/OPEN; swap-only for CLOSED */}
                                    {(c.status === "PENDING" || c.status === "OPEN" || c.status === "CLOSED") && (
                                      <button
                                        onClick={async () => {
                                          const alreadyFined = c.status === "CLOSED"
                                          const label = alreadyFined
                                            ? `Поменять места?\nШтраф уже выписан. Только обменяем бронирования.\n${info.firstName ?? info.phoneNumber} (${info.car.plateNumber})`
                                            : `Выписать штраф 900₸ и поменять места?\n${info.firstName ?? info.phoneNumber} (${info.car.plateNumber})`
                                          if (!confirm(label)) return
                                          const token = localStorage.getItem("admin_token") || localStorage.getItem("qpark_token")
                                          await fetch(`${RAILWAY}/admin/complaints/${c.id}/set-violator`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                            body: JSON.stringify({ plateNumber: info.car.plateNumber }),
                                          }).catch(() => {})
                                          const res = await fetch(`${RAILWAY}/admin/complaints/${c.id}/reassign`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                          })
                                          const data = await res.json()
                                          if (res.ok && data.action === "swapped") {
                                            setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, status: "REASSIGNED" } : x))
                                            alert(`✅ ${alreadyFined ? "Места поменяны!" : "Штраф 900₸ выписан!"}\n🔄 Места поменяны:\n• Жертва → ${data.victimNewSpot}\n• Нарушитель → ${data.violatorNewSpot}\nОба пользователя получили уведомления.`)
                                          } else if (res.ok && data.action === "reassigned") {
                                            setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, status: "REASSIGNED" } : x))
                                            alert(`✅ Жертва перенесена на ${data.newSpotId}`)
                                          } else {
                                            alert(`❌ ${data.error ?? "Ошибка"}`)
                                          }
                                        }}
                                        className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90 active:scale-98"
                                        style={{ background: c.status === "CLOSED" ? "linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)" : "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)" }}
                                      >
                                        {c.status === "CLOSED" ? "🔄 Поменять места (штраф уже выписан)" : "⚡ Штраф 900₸ + Поменять места"}
                                      </button>
                                    )}
                                  </div>
                                )}
                                {notFound && (
                                  <div className="px-3 py-2.5 text-xs text-white/30">⚠️ Пользователь с таким номером не найден в системе</div>
                                )}
                              </div>
                            )
                          })()}

                          {/* Fallback: no violator identified — just find free spot */}
                          {(c.status === "PENDING" || c.status === "OPEN") && !c.violatorUserId && (
                            <div className="flex gap-2 pt-1">
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
                                    alert(`✅ Жертва перенесена на ${data.newSpotId}`)
                                  } else if (data.action === "refunded") {
                                    setComplaints(prev => prev.map(x => x.id === c.id ? { ...x, status: "REFUNDED" } : x))
                                    alert(`💸 Нет свободных мест. Возврат ${data.refundAmount}₸`)
                                  }
                                }}
                                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-80"
                                style={{ background: "#354469" }}
                              >
                                🔄 Найти свободное место для жертвы
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
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

        {activeTab === "support" && (
          <div className="space-y-4">
            {selectedSupportUser ? (
              /* ── Chat thread ── */
              <div className={CARD} style={CARD_BG}>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => { setSelectedSupportUser(null); setSupportMessages([]) }}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >← Назад</button>
                  <p className="text-white font-semibold">
                    {supportConversations.find(c => c.userId === selectedSupportUser)?.userName ?? selectedSupportUser}
                  </p>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto mb-4 pr-1">
                  {supportMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.fromAdmin ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${msg.fromAdmin ? "bg-[#495E8E] text-white" : "bg-white/10 text-gray-200"}`}>
                        {!msg.fromAdmin && <p className="text-xs text-gray-400 mb-1">Пользователь</p>}
                        <p>{msg.text}</p>
                        <p className="text-xs mt-1 opacity-50 text-right">{new Date(msg.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>
                  ))}
                  {supportMessages.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Нет сообщений</p>}
                </div>
                <div className="flex gap-2">
                  <input
                    value={supportReply}
                    onChange={e => setSupportReply(e.target.value)}
                    onKeyDown={async e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!supportReply.trim() || supportSending) return; setSupportSending(true); const text = supportReply.trim(); setSupportReply(""); const res = await fetch(`${RAILWAY}/support/admin/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selectedSupportUser, text }) }); if (res.ok) { const msg = await res.json(); setSupportMessages(p => [...p, msg]) } setSupportSending(false) }}}
                    placeholder="Написать ответ..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-400 text-sm focus:outline-none focus:border-white/40"
                  />
                  <button
                    disabled={!supportReply.trim() || supportSending}
                    onClick={async () => {
                      if (!supportReply.trim() || supportSending) return
                      setSupportSending(true)
                      const text = supportReply.trim()
                      setSupportReply("")
                      const res = await fetch(`${RAILWAY}/support/admin/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selectedSupportUser, text }) })
                      if (res.ok) { const msg = await res.json(); setSupportMessages(p => [...p, msg]) }
                      setSupportSending(false)
                    }}
                    className="px-4 py-2.5 bg-[#495E8E] text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-[#3d4c73] transition-colors"
                  >
                    {supportSending ? "..." : "Отправить"}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Conversations list ── */
              <div className={CARD} style={CARD_BG}>
                <h3 className="text-white font-semibold mb-4">💬 Обращения в поддержку</h3>
                {supportConversations.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">Обращений пока нет</p>
                ) : (
                  <div className="space-y-2">
                    {supportConversations.map(conv => (
                      <button
                        key={conv.userId}
                        onClick={async () => {
                          setSelectedSupportUser(conv.userId)
                          const res = await fetch(`${RAILWAY}/support/admin/messages/${conv.userId}`)
                          if (res.ok) setSupportMessages(await res.json())
                          setSupportConversations(p => p.map(c => c.userId === conv.userId ? { ...c, unreadCount: 0 } : c))
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-colors text-left"
                      >
                        <div className="w-10 h-10 rounded-full bg-[#495E8E]/40 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">{(conv.userName ?? "?")[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-white font-medium text-sm">{conv.userName}</p>
                            <p className="text-gray-400 text-xs">{new Date(conv.lastMessageAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          <p className="text-gray-400 text-xs truncate">{conv.fromAdmin ? "Вы: " : ""}{conv.lastMessage}</p>
                        </div>
                        {conv.unreadCount > 0 && (
                          <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">{conv.unreadCount}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
      <SpotModal />
    </div>
  )
}
