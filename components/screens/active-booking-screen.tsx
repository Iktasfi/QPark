"use client"

import { useState, useEffect } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { MapPin, Car, Clock, AlertTriangle, CreditCard, Camera, Calendar, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

const extendOptions = [
  { days: 1, price: 700, perDay: 700 },
  { days: 3, price: 1800, perDay: 600 },
  { days: 5, price: 2700, perDay: 540 },
  { days: 7, price: 3500, perDay: 500 },
  { days: 14, price: 6000, perDay: 429 },
]

export function ActiveBookingScreen() {
  const { activeBooking, selectedSpot: _selectedSpot, spots, user, setCurrentScreen, setActiveBooking, updateSpot, setUser } = useParking()

  // Use live spot from spots array (updated via socket) instead of snapshot
  const selectedSpot = activeBooking
    ? (spots.find(s => s.id === activeBooking.spotId) ?? _selectedSpot)
    : _selectedSpot

  const [timer, setTimer] = useState(15 * 60) // 15 minutes in seconds
  const [isArrived, setIsArrived] = useState(false)
  const [parkingDuration, setParkingDuration] = useState(0)
  const [isPaying, setIsPaying] = useState(false)
  const [showExtend, setShowExtend] = useState(false)
  const [selectedExtendDays, setSelectedExtendDays] = useState<number | null>(null)
  const [isExtending, setIsExtending] = useState(false)
  
  const selectedCar = user?.cars.find(c => c.plateNumber === activeBooking?.plateNumber)
  const isLongTerm = selectedSpot?.type === "long-term"
  
  // Countdown timer for arrival
  useEffect(() => {
    if (!isArrived && !isLongTerm && timer > 0) {
      const interval = setInterval(() => {
        setTimer(prev => prev - 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [timer, isArrived, isLongTerm])
  
  // Parking duration timer
  useEffect(() => {
    if (isArrived && !isLongTerm) {
      const interval = setInterval(() => {
        setParkingDuration(prev => prev + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isArrived, isLongTerm])
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  
  const calculateCost = () => {
    if (isLongTerm) return 0 // Already paid
    const minutes = Math.ceil(parkingDuration / 60)
    if (minutes <= 60) return 150 // First hour minimum
    const extraMinutes = minutes - 60
    return 150 + (extraMinutes * 3)
  }
  
  // Auto-detect arrival: when LPR opens barrier → socket updates spot to OCCUPIED
  useEffect(() => {
    if (!isArrived && selectedSpot?.status === "OCCUPIED") {
      setIsArrived(true)
    }
  }, [selectedSpot?.status])

  const handlePayAndExit = () => {
    if (!user) return

    setIsPaying(true)
    const cost = calculateCost()

    setTimeout(() => {
      setUser({
        ...user,
        balance: user.balance - cost,
        transactions: [
          {
            id: `t-${Date.now()}`,
            type: "parking_charge",
            amount: -cost,
            description: `Parking ${activeBooking?.spotId}`,
            date: new Date(),
          },
          ...user.transactions,
        ],
      })

      if (selectedSpot) {
        updateSpot(selectedSpot.id, { status: "FREE", bookedBy: undefined, plateNumber: undefined })
        // Tell backend: car exited
        fetch("/backend/parking/simulate-exit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spotNumber: selectedSpot.id, carPlate: activeBooking?.plateNumber ?? "" }),
        }).catch(() => {})
      }

      setActiveBooking(null)
      setCurrentScreen("home")
      setIsPaying(false)
    }, 1500)
  }

  const handleExtendRental = () => {
    if (!selectedExtendDays || !activeBooking || !user) return
    setIsExtending(true)
    const option = extendOptions.find(o => o.days === selectedExtendDays)!
    setTimeout(() => {
      setActiveBooking({ ...activeBooking, rentalDays: (activeBooking.rentalDays ?? 0) + selectedExtendDays })
      setUser({
        ...user,
        balance: user.balance - option.price,
        transactions: [
          {
            id: `t-${Date.now()}`,
            type: "longterm_charge",
            amount: -option.price,
            description: `Extended rental ${activeBooking.spotId} by ${selectedExtendDays} day${selectedExtendDays > 1 ? "s" : ""}`,
            date: new Date(),
          },
          ...user.transactions,
        ],
      })
      setIsExtending(false)
      setShowExtend(false)
      setSelectedExtendDays(null)
    }, 800)
  }

  const handleCancelBooking = () => {
    if (selectedSpot) {
      updateSpot(selectedSpot.id, { status: "FREE", bookedBy: undefined, plateNumber: undefined })
      // Tell backend: booking cancelled
      fetch("/backend/parking/set-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotNumber: selectedSpot.id, status: "FREE" }),
      }).catch(() => {})
    }
    setActiveBooking(null)
    setCurrentScreen("home")
  }
  
  if (!activeBooking) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Car className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">No active booking</p>
        <Button onClick={() => setCurrentScreen("map")} className="bg-[#354469] hover:bg-[#354469]/90">Find Parking</Button>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="w-16" /> {/* Left spacer */}
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-foreground">Active Booking</h1>
          <p className="text-sm text-muted-foreground">
            {isLongTerm ? "Long-term reservation" : "Short-term parking"}
          </p>
        </div>
        <div className="w-16 flex justify-end">
          <Badge 
            variant={isArrived ? "default" : "secondary"}
            className={isArrived ? "bg-[oklch(var(--status-occupied))]" : ""}
          >
            {isArrived ? "Parked" : "En Route"}
          </Badge>
        </div>
      </div>
      
      {/* Timer Card — countdown until car must arrive via LPR */}
      {!isLongTerm && !isArrived && (
        <Card className={timer < 300 ? "border-destructive bg-destructive/5" : "border-red-200 bg-red-50"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {timer < 300 ? (
                <AlertTriangle className="h-8 w-8 text-destructive" />
              ) : (
                <Clock className="h-8 w-8 text-red-600" />
              )}
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Time to arrive</p>
                <p className="text-3xl font-bold text-foreground">{formatTime(timer)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Drive up to</p>
                <p className="text-sm font-semibold text-foreground">{activeBooking?.spotId}</p>
                <p className="text-xs text-muted-foreground">LPR will detect you</p>
              </div>
            </div>
            {timer < 300 && (
              <p className="mt-2 text-sm text-destructive">
                Hurry! Your booking will expire soon.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Parking Duration (when arrived) */}
      {!isLongTerm && isArrived && (
        <Card className="border-[#36549B] bg-[#36549B]/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-[#36549B]" />
                <div>
                  <p className="text-sm text-muted-foreground">Parking Duration</p>
                  <p className="text-3xl font-bold text-foreground">{formatTime(parkingDuration)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Current Cost</p>
                <p className="text-2xl font-bold text-[#36549B]">{calculateCost()} &#8376;</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Long-term Rental Info */}
      {isLongTerm && (
        <>
          <Card className="border-[oklch(var(--status-reserved))] bg-[oklch(var(--status-reserved)/0.05)]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-8 w-8 text-[oklch(var(--status-reserved))]" />
                  <div>
                    <p className="text-sm text-muted-foreground">Rental Period</p>
                    <p className="text-xl font-bold text-foreground">{activeBooking.rentalDays} days remaining</p>
                  </div>
                </div>
                <Badge variant="outline">Paid</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Car status — in/out indicator driven by live spot status */}
          <Card className={selectedSpot?.status === "OCCUPIED"
            ? "border-green-300 bg-green-50"
            : "border-purple-200 bg-purple-50"
          }>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${selectedSpot?.status === "OCCUPIED" ? "bg-green-500" : "bg-purple-400"}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedSpot?.status === "OCCUPIED" ? "Car is parked" : "Spot reserved — car outside"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSpot?.status === "OCCUPIED"
                        ? "Drive to exit — LPR will open the barrier"
                        : "Drive in — LPR will detect your plate"}
                    </p>
                  </div>
                </div>
                <Car className={`h-6 w-6 ${selectedSpot?.status === "OCCUPIED" ? "text-green-600" : "text-purple-400"}`} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
      
      {/* Booking Details */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <MapPin className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Parking Spot</p>
              <p className="text-lg font-bold text-foreground">{activeBooking.spotId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <Car className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vehicle</p>
              <p className="font-medium text-foreground">
                {selectedCar?.brand} {selectedCar?.model}
              </p>
              <p className="text-sm text-muted-foreground">{activeBooking.plateNumber}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <Camera className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Entry Method</p>
              <p className="font-medium text-foreground">LPR Camera</p>
              <p className="text-xs text-muted-foreground">Automatic plate recognition</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Cost Summary (Short-term) */}
      {!isLongTerm && isArrived && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-medium text-foreground">Cost Breakdown</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">First hour (minimum)</span>
                <span className="text-foreground">150 &#8376;</span>
              </div>
              {parkingDuration > 3600 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Extra time ({Math.ceil((parkingDuration - 3600) / 60)} min)</span>
                  <span className="text-foreground">{Math.ceil((parkingDuration - 3600) / 60) * 3} &#8376;</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-medium">
                <span className="text-foreground">Total</span>
                <span className="text-[#36549B]">{calculateCost()} &#8376;</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Actions */}
      <div className="space-y-2 mt-2">
        {isArrived && !isLongTerm && (
          <Button 
            size="lg" 
            className="w-full gap-2 bg-[#354469] hover:bg-[#354469]/90"
            onClick={handlePayAndExit}
            disabled={isPaying}
          >
            <CreditCard className="h-5 w-5" />
            {isPaying ? "Processing..." : `Pay ${calculateCost()} ₸ & Exit`}
          </Button>
        )}
        
        {!isArrived && !isLongTerm && (
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full hover:bg-[#36549B]/10 hover:border-[#36549B] hover:text-[#36549B]"
            onClick={handleCancelBooking}
          >
            Cancel Booking
          </Button>
        )}
        
        {isLongTerm && (
          <Button
            variant="outline"
            size="lg"
            className="w-full hover:bg-[#36549B]/10 hover:border-[#36549B] hover:text-[#36549B]"
            onClick={() => setShowExtend(true)}
          >
            <Calendar className="h-5 w-5 mr-2" />
            Extend Rental
          </Button>
        )}
      </div>
      
      {/* Extend Rental Bottom Sheet */}
      {showExtend && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowExtend(false); setSelectedExtendDays(null) }}
          />
          {/* Sheet */}
          <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-28">
            {/* Handle bar */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#36549B]" />
                <h2 className="text-lg font-bold text-gray-900">Extend Rental</h2>
              </div>
              <button
                onClick={() => { setShowExtend(false); setSelectedExtendDays(null) }}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Current: <span className="font-semibold text-gray-800">{activeBooking?.rentalDays ?? 0} day{(activeBooking?.rentalDays ?? 0) !== 1 ? "s" : ""}</span> · Add more days below
            </p>

            <div className="space-y-2 mb-5">
              {extendOptions.map((option) => (
                <button
                  key={option.days}
                  onClick={() => setSelectedExtendDays(option.days)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border-2 p-3 transition-all",
                    selectedExtendDays === option.days
                      ? "border-[#354469] bg-[#354469]/5"
                      : "border-gray-200 hover:border-[#354469]/40"
                  )}
                >
                  <div className="text-left">
                    <p className="font-semibold text-gray-900">
                      +{option.days} {option.days === 1 ? "day" : "days"}
                    </p>
                    <p className="text-xs text-gray-500">{option.perDay} ₸/day</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#36549B]">{option.price.toLocaleString()} ₸</p>
                    {selectedExtendDays === option.days && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#354469]">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {selectedExtendDays && (
              <div className="flex justify-between text-sm mb-4 px-1">
                <span className="text-gray-500">New total period</span>
                <span className="font-semibold text-gray-900">
                  {(activeBooking?.rentalDays ?? 0) + selectedExtendDays} days
                </span>
              </div>
            )}

            <Button
              size="lg"
              className="w-full bg-[#354469] hover:bg-[#354469]/90"
              disabled={!selectedExtendDays || isExtending}
              onClick={handleExtendRental}
            >
              {isExtending
                ? "Processing..."
                : selectedExtendDays
                  ? `Confirm +${selectedExtendDays} day${selectedExtendDays > 1 ? "s" : ""} · ${extendOptions.find(o => o.days === selectedExtendDays)!.price.toLocaleString()} ₸`
                  : "Select a period"}
            </Button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-300 z-50 shadow-lg" style={{ borderTop: '1px solid #D1D5DB' }}>
        <div className="flex justify-around items-center h-full px-4">
          {[
            { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: "Home", active: false },
            { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: "Map", active: false },
            { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: "Booking", active: true },
            { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", label: "Wallet", active: false },
            { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", label: "Profile", active: false },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              className="flex flex-col items-center justify-center gap-0.5 p-3 transition-all hover:bg-gray-100 rounded-xl active:scale-95"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <img 
                  src={item.active ? item.activeIcon : item.icon} 
                  alt={item.label} 
                  width={28}
                  height={28}
                  className={item.active ? "opacity-100" : "opacity-80"}
                />
              </div>
              <span className={`text-xs font-medium ${item.active ? "text-[#36549B] drop-shadow-sm" : "text-gray-900 drop-shadow-sm"}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
