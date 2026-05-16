"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import { getSocket, disconnectSocket } from "./socket"

export type Language = "en" | "kk" | "ru"

const translations = {
  en: {
    home: "Home", map: "Map", booking: "Booking", wallet: "Wallet", profile: "Profile",
    settings: "Settings", appearance: "Appearance", darkMode: "Dark Mode", language: "Language",
    notifications: "Notifications", pushNotifications: "Push Notifications",
    securityPrivacy: "Security & Privacy", privacyPolicy: "Privacy Policy",
    termsOfService: "Terms of Service", about: "About", appVersion: "App Version",
    build: "Build", deleteAccount: "Delete Account", selectLanguage: "Select Language",
    balance: "Balance", bonus: "Bonus Points", noShowCounter: "No-Show Counter",
    myCars: "My Cars", add: "Add", cancel: "Cancel", noCarsRegistered: "No cars registered",
    contactSupport: "Contact support:", signOut: "Sign Out",
    manageBalance: "Manage your balance", currentBalance: "Current Balance",
    bonusPoints: "Bonus Points", topUpBalance: "Top Up Balance",
    promoCodeAvailable: "Promo Code Available",
    promoDescription: "FIRST - 150₸ off your first parking",
    active: "Active", transactionHistory: "Transaction History",
    selectAmount: "Select Amount", payWithStripe: "Pay with Stripe",
    poweredByStripe: "Powered by Stripe (Test Mode)", walletTopUp: "Wallet Top-Up",
  },
  kk: {
    home: "Басты", map: "Карта", booking: "Брондау", wallet: "Әмиян", profile: "Профиль",
    settings: "Параметрлер", appearance: "Сыртқы вид", darkMode: "Қараңғы режим",
    language: "Тіл", notifications: "Хабарландырулар", pushNotifications: "Push хабарландырулар",
    securityPrivacy: "Қауіпсіздік және құпиялылық", privacyPolicy: "Құпиялылық саясаты",
    termsOfService: "Қызмет көрсету шарттары", about: "Қосымша туралы",
    appVersion: "Нұсқасы", build: "Жинақ", deleteAccount: "Аккаунтты жою",
    selectLanguage: "Тілді таңдаңыз", balance: "Баланс", bonus: "Бонус ұпайлар",
    noShowCounter: "Келмеу санауышы", myCars: "Менің көліктерім", add: "Қосу",
    cancel: "Болдырмау", noCarsRegistered: "Тіркелген көлік жоқ",
    contactSupport: "Қолдау қызметіне хабарласу:", signOut: "Шығу",
    manageBalance: "Балансты басқару", currentBalance: "Ағымдағы баланс",
    bonusPoints: "Бонус ұпайлар", topUpBalance: "Балансты толтыру",
    promoCodeAvailable: "Промокод қол жетімді",
    promoDescription: "FIRST - алғашқы тұрақ үшін 150₸ жеңілдік",
    active: "Белсенді", transactionHistory: "Транзакция тарихы",
    selectAmount: "Сумманы таңдаңыз", payWithStripe: "Stripe арқылы төлеу",
    poweredByStripe: "Stripe (Тест режимі)", walletTopUp: "Әмиянды толтыру",
  },
  ru: {
    home: "Главная", map: "Карта", booking: "Бронирование", wallet: "Кошелёк", profile: "Профиль",
    settings: "Настройки", appearance: "Внешний вид", darkMode: "Тёмный режим",
    language: "Язык", notifications: "Уведомления", pushNotifications: "Push-уведомления",
    securityPrivacy: "Безопасность и конфиденциальность", privacyPolicy: "Политика конфиденциальности",
    termsOfService: "Условия использования", about: "О приложении",
    appVersion: "Версия", build: "Сборка", deleteAccount: "Удалить аккаунт",
    selectLanguage: "Выбрать язык", balance: "Баланс", bonus: "Бонусные баллы",
    noShowCounter: "Счётчик неявок", myCars: "Мои автомобили", add: "Добавить",
    cancel: "Отмена", noCarsRegistered: "Нет зарегистрированных авто",
    contactSupport: "Связаться с поддержкой:", signOut: "Выйти",
    manageBalance: "Управление балансом", currentBalance: "Текущий баланс",
    bonusPoints: "Бонусные баллы", topUpBalance: "Пополнить баланс",
    promoCodeAvailable: "Промокод доступен",
    promoDescription: "FIRST - скидка 150₸ на первую парковку",
    active: "Активен", transactionHistory: "История транзакций",
    selectAmount: "Выберите сумму", payWithStripe: "Оплатить через Stripe",
    poweredByStripe: "Работает на Stripe (Тестовый режим)", walletTopUp: "Пополнение кошелька",
  },
}

export type SpotStatus = "FREE" | "BOOKED" | "OCCUPIED" | "RESERVED" | "REPAIR"

export interface ParkingSpot {
  id: string
  number: number
  status: SpotStatus
  type: "short-term" | "long-term"
  bookedBy?: string
  plateNumber?: string
  bookedAt?: Date
  expiresAt?: Date
}

export interface Car {
  id: string
  brand: string
  model: string
  plateNumber: string
}

export interface Transaction {
  id: string
  type: "topup_stripe" | "parking_charge" | "longterm_charge" | "waiting_fee" | "bonus_credit" | "promo_discount"
  amount: number
  description: string
  date: Date
}

export interface User {
  id: string
  phone: string
  name: string
  balance: number
  bonusPoints: number
  noShowCount: number
  isBanned: boolean
  bannedUntil?: Date
  cars: Car[]
  transactions: Transaction[]
  promoCode?: string
}

export interface Booking {
  id: string
  spotId: string
  userId: string
  plateNumber: string
  type: "short-term" | "long-term"
  status: "active" | "completed" | "cancelled"
  startTime: Date
  endTime?: Date
  totalAmount?: number
  isPaid: boolean
  waitingFee: number
  rentalDays?: number
  arrivedAt?: Date
}

interface ParkingContextType {
  // App state
  currentScreen: string
  setCurrentScreen: (screen: string) => void
  isAuthenticated: boolean
  setIsAuthenticated: (auth: boolean) => void
  isNewUser: boolean
  setIsNewUser: (v: boolean) => void
  isRestoringSession: boolean

  // User
  user: User | null
  setUser: (user: User | null) => void

  // Parking spots
  spots: ParkingSpot[]
  setSpots: (spots: ParkingSpot[]) => void
  updateSpot: (spotId: string, updates: Partial<ParkingSpot>) => void

  // Bookings
  activeBooking: Booking | null
  setActiveBooking: (booking: Booking | null) => void
  bookings: Booking[]
  setBookings: (bookings: Booking[]) => void

  // Selected spot for booking
  selectedSpot: ParkingSpot | null
  setSelectedSpot: (spot: ParkingSpot | null) => void

  // Admin mode
  isAdminMode: boolean
  setIsAdminMode: (admin: boolean) => void

  // UI settings
  darkMode: boolean
  setDarkMode: (dark: boolean) => void
  language: Language
  setLanguage: (lang: Language) => void
  t: typeof translations['en']
}

const ParkingContext = createContext<ParkingContextType | undefined>(undefined)

// Generate initial parking spots
const generateInitialSpots = (): ParkingSpot[] => {
  const spots: ParkingSpot[] = []
  
  // Short-term spots (SP-01 to SP-15)
  for (let i = 1; i <= 15; i++) {
    const status: SpotStatus = Math.random() > 0.6 ? "FREE" : 
                               Math.random() > 0.5 ? "OCCUPIED" : 
                               Math.random() > 0.5 ? "BOOKED" : "FREE"
    spots.push({
      id: `SP-${String(i).padStart(2, "0")}`,
      number: i,
      status,
      type: "short-term",
    })
  }
  
  // Long-term spots (SP-16 to SP-30)
  for (let i = 16; i <= 30; i++) {
    const status: SpotStatus = Math.random() > 0.7 ? "FREE" : 
                               Math.random() > 0.5 ? "RESERVED" : 
                               Math.random() > 0.3 ? "OCCUPIED" : "FREE"
    spots.push({
      id: `SP-${String(i).padStart(2, "0")}`,
      number: i,
      status: i === 22 ? "REPAIR" : status,
      type: "long-term",
    })
  }
  
  return spots
}

// Maps backend DB user to frontend User type — shared by login, onboarding, and session restore
export function mapDbUser(dbUser: {
  id: string; phoneNumber: string; firstName?: string | null; lastName?: string | null;
  walletBalance: number; bonusPoints: number; noShowCount: number; isBanned: boolean;
  bannedUntil?: string | Date | null;
  cars?: { id: string; brand: string; model: string; plateNumber: string }[];
  transactions?: { id: string; type: string; amount: number; description?: string | null; createdAt: string | Date }[];
}): User {
  return {
    id: dbUser.id,
    phone: dbUser.phoneNumber,
    name: dbUser.firstName
      ? `${dbUser.firstName}${dbUser.lastName ? " " + dbUser.lastName : ""}`
      : "User",
    balance: dbUser.walletBalance,
    bonusPoints: dbUser.bonusPoints,
    noShowCount: dbUser.noShowCount,
    isBanned: dbUser.isBanned,
    bannedUntil: dbUser.bannedUntil ? new Date(dbUser.bannedUntil) : undefined,
    cars: (dbUser.cars ?? []).map(c => ({ id: c.id, brand: c.brand, model: c.model, plateNumber: c.plateNumber })),
    transactions: (dbUser.transactions ?? []).map(t => ({
      id: t.id,
      type: t.type.toLowerCase() as Transaction["type"],
      amount: t.amount,
      description: t.description ?? "",
      date: new Date(t.createdAt),
    })),
  }
}

// Maps backend spot data to frontend ParkingSpot format
function mapBackendSpot(s: { spotNumber: string; type: string; status: string; carPlate?: string | null }): ParkingSpot {
  const num = parseInt(s.spotNumber.replace("SP-", ""), 10)
  const statusMap: Record<string, SpotStatus> = {
    FREE: "FREE", BOOKED: "BOOKED", OCCUPIED: "OCCUPIED", RESERVED: "RESERVED", REPAIR: "REPAIR",
  }
  return {
    id: s.spotNumber,
    number: num,
    status: statusMap[s.status] ?? "FREE",
    type: s.type === "SHORT_TERM" ? "short-term" : "long-term",
    plateNumber: s.carPlate ?? undefined,
  }
}

export function ParkingProvider({ children }: { children: ReactNode }) {
  const [currentScreen, setCurrentScreen] = useState("home")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isNewUser, setIsNewUser] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [spots, setSpots] = useState<ParkingSpot[]>(generateInitialSpots())
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null)
  const activeBookingRef = useRef<Booking | null>(null)
  useEffect(() => { activeBookingRef.current = activeBooking }, [activeBooking])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [language, setLanguage] = useState<Language>("en")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
  }, [darkMode])
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const t = translations[language]
  const spotsRef = useRef(spots)
  spotsRef.current = spots

  // Restore session from JWT token on mount — 3 second timeout so UI never hangs
  useEffect(() => {
    const token = localStorage.getItem("qpark_token")
    if (!token) { setIsRestoringSession(false); return }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    fetch("/backend/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) {
          const dbUser = await res.json()
          setUser(mapDbUser(dbUser))
          setIsAuthenticated(true)
          // Restore active booking/rental so it survives page refresh
          try {
            const br = await fetch("/backend/bookings/restore", {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (br.ok) {
              const restored = await br.json()
              if (restored) setActiveBooking(restored)
            }
          } catch { /* ignore — booking restore is best-effort */ }
        } else {
          localStorage.removeItem("qpark_token")
        }
      })
      .catch(() => { /* backend offline or timeout — show login */ })
      .finally(() => { clearTimeout(timeout); setIsRestoringSession(false) })
  }, [])

  // Fetch real spots from backend and keep Socket.io in sync
  const fetchSpotsFromBackend = async () => {
    try {
      const res = await fetch("/backend/parking/spots/simple")
      if (!res.ok) return
      const data: { spotNumber: string; type: string; status: string; carPlate?: string | null }[] = await res.json()
      setSpots(prev => {
        const updated = [...prev]
        data.forEach(bs => {
          const idx = updated.findIndex(s => s.id === bs.spotNumber)
          const mapped = mapBackendSpot(bs)
          if (idx >= 0) {
            // Preserve bookedBy/bookedAt from local state, update status/plate from backend
            updated[idx] = { ...updated[idx], status: mapped.status, plateNumber: mapped.plateNumber }
          }
        })
        return updated
      })
    } catch {
      // Backend not running — keep local state
    }
  }

  useEffect(() => {
    // Load real spot data on mount
    fetchSpotsFromBackend()

    // Connect Socket.io for real-time updates
    const socket = getSocket()

    // Instant update from parking routes (set-status, simulate-entry/exit)
    const handleSpotStatusChanged = (data: { spotNumber: string; status: string; carPlate?: string | null }) => {
      const statusMap: Record<string, SpotStatus> = {
        FREE: "FREE", BOOKED: "BOOKED", OCCUPIED: "OCCUPIED", RESERVED: "RESERVED", REPAIR: "REPAIR",
      }
      setSpots(prev => prev.map(s =>
        s.id === data.spotNumber
          ? { ...s, status: statusMap[data.status] ?? s.status, plateNumber: data.carPlate ?? undefined }
          : s
      ))
      // Stamp arrival time when car enters (OCCUPIED) — used for parking duration timer
      const ab = activeBookingRef.current
      if (data.status === "OCCUPIED" && ab && ab.spotId === data.spotNumber && !ab.arrivedAt) {
        setActiveBooking({ ...ab, arrivedAt: new Date() })
      }
    }

    // Re-fetch for booking API events (authenticated routes)
    const handleBookingCreated = () => { fetchSpotsFromBackend() }
    const handleBookingCompleted = () => { fetchSpotsFromBackend() }
    const handleBookingCancelled = () => { fetchSpotsFromBackend() }
    const handleRentalCreated = () => { fetchSpotsFromBackend() }
    const handleBookingExtended = () => { fetchSpotsFromBackend() }

    socket.on("spot-status-changed", handleSpotStatusChanged)
    socket.on("booking-created", handleBookingCreated)
    socket.on("booking-completed", handleBookingCompleted)
    socket.on("booking-cancelled", handleBookingCancelled)
    socket.on("rental-created", handleRentalCreated)
    socket.on("booking-extended", handleBookingExtended)

    return () => {
      socket.off("spot-status-changed", handleSpotStatusChanged)
      socket.off("booking-created", handleBookingCreated)
      socket.off("booking-completed", handleBookingCompleted)
      socket.off("booking-cancelled", handleBookingCancelled)
      socket.off("rental-created", handleRentalCreated)
      socket.off("booking-extended", handleBookingExtended)
    }
  }, [])

  const updateSpot = (spotId: string, updates: Partial<ParkingSpot>) => {
    setSpots(prev => prev.map(spot =>
      spot.id === spotId ? { ...spot, ...updates } : spot
    ))
  }
  
  return (
    <ParkingContext.Provider value={{
      currentScreen,
      setCurrentScreen,
      isAuthenticated,
      setIsAuthenticated,
      isNewUser,
      setIsNewUser,
      user,
      setUser,
      spots,
      setSpots,
      updateSpot,
      activeBooking,
      setActiveBooking,
      bookings,
      setBookings,
      selectedSpot,
      setSelectedSpot,
      isAdminMode,
      setIsAdminMode,
      darkMode,
      setDarkMode,
      language,
      setLanguage,
      isRestoringSession,
      t,
    }}>
      {children}
    </ParkingContext.Provider>
  )
}

export function useParking() {
  const context = useContext(ParkingContext)
  if (context === undefined) {
    throw new Error("useParking must be used within a ParkingProvider")
  }
  return context
}
