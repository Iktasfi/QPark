"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

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
}

interface ParkingContextType {
  // App state
  currentScreen: string
  setCurrentScreen: (screen: string) => void
  isAuthenticated: boolean
  setIsAuthenticated: (auth: boolean) => void
  
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

// Demo user data
const demoUser: User = {
  id: "user-1",
  phone: "+7 777 123 4567",
  name: "Alikhan Serikov",
  balance: 2500,
  bonusPoints: 25,
  noShowCount: 1,
  isBanned: false,
  cars: [
    { id: "car-1", brand: "Toyota", model: "Camry", plateNumber: "123 ABC 01" },
    { id: "car-2", brand: "Hyundai", model: "Tucson", plateNumber: "456 DEF 01" },
  ],
  transactions: [
    { id: "t1", type: "topup_stripe", amount: 3000, description: "Wallet top-up", date: new Date(Date.now() - 86400000 * 2) },
    { id: "t2", type: "parking_charge", amount: -330, description: "Parking SP-07, 2 hours", date: new Date(Date.now() - 86400000) },
    { id: "t3", type: "bonus_credit", amount: 3, description: "Bonus points earned", date: new Date(Date.now() - 86400000) },
    { id: "t4", type: "topup_stripe", amount: 1000, description: "Wallet top-up", date: new Date(Date.now() - 3600000 * 5) },
  ],
  promoCode: "FIRST",
}

export function ParkingProvider({ children }: { children: ReactNode }) {
  const [currentScreen, setCurrentScreen] = useState("home")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<User | null>(demoUser)
  const [spots, setSpots] = useState<ParkingSpot[]>(generateInitialSpots())
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null)
  const [isAdminMode, setIsAdminMode] = useState(false)
  
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
