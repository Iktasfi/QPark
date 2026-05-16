"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { MapPin, Car, Clock, AlertTriangle, CreditCard, Camera, Calendar, Check, X, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

const extendOptions = [
  { days: 1, price: 700, perDay: 700 },
  { days: 3, price: 1800, perDay: 600 },
  { days: 5, price: 2700, perDay: 540 },
  { days: 7, price: 3500, perDay: 500 },
  { days: 14, price: 6000, perDay: 429 },
]

export function ActiveBookingScreen() {
  const { activeBooking, selectedSpot: _selectedSpot, spots, user, setCurrentScreen, setActiveBooking, updateSpot, setUser, t } = useParking()

  const selectedSpot = activeBooking
    ? (spots.find(s => s.id === activeBooking.spotId) ?? _selectedSpot)
    : _selectedSpot

  const [now, setNow] = useState(() => Date.now())
  const [extraWaitSeconds, setExtraWaitSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const isLongTerm = selectedSpot?.type === "long-term" || activeBooking?.type === "long-term"
  const isArrived = !isLongTerm && selectedSpot?.status === "OCCUPIED"
  const elapsedSec = activeBooking ? Math.floor((now - new Date(activeBooking.startTime).getTime()) / 1000) : 0
  const timer = Math.max(0, 15 * 60 + extraWaitSeconds - elapsedSec)

  const arrivedAtLocalRef = useRef<number | null>(null)
  useEffect(() => {
    if (isArrived && !arrivedAtLocalRef.current) {
      arrivedAtLocalRef.current = activeBooking?.arrivedAt
        ? new Date(activeBooking.arrivedAt).getTime()
        : Date.now()
    }
  }, [isArrived])

  const parkingDuration = isArrived && arrivedAtLocalRef.current
    ? Math.floor((now - arrivedAtLocalRef.current) / 1000)
    : 0
  const [isPaying, setIsPaying] = useState(false)
  const [showGateOpened, setShowGateOpened] = useState(false)
  const [insufficientBalance, setInsufficientBalance] = useState<{ need: number; have: number } | null>(null)
  const [showExtend, setShowExtend] = useState(false)
  const [selectedExtendDays, setSelectedExtendDays] = useState<number | null>(null)
  const [isExtending, setIsExtending] = useState(false)
  const [isTerminating, setIsTerminating] = useState(false)
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false)

  const selectedCar = user?.cars.find(c => c.plateNumber === activeBooking?.plateNumber)
  
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
  
  const handlePayAndExit = async () => {
    if (!user || !activeBooking) return

    setIsPaying(true)
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/bookings/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ spotNumber: activeBooking.spotId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Checkout failed")

      setUser({
        ...user,
        balance: data.walletBalance,
        bonusPoints: data.bonusPoints,
        transactions: [
          {
            id: `t-${Date.now()}`,
            type: "parking_charge",
            amount: -data.netCharge,
            description: `Parking ${activeBooking.spotId}`,
            date: new Date(),
          },
          ...user.transactions,
        ],
      })
      setActiveBooking(null)
      setShowGateOpened(true)
      setTimeout(() => {
        setShowGateOpened(false)
        setCurrentScreen("home")
      }, 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed"
      const match = msg.match(/need (\d+)₸.*have (\d+)₸/)
      if (match) {
        setInsufficientBalance({ need: parseInt(match[1]), have: parseInt(match[2]) })
      } else {
        alert(msg)
      }
    } finally {
      setIsPaying(false)
    }
  }

  const [isExtendingWaiting, setIsExtendingWaiting] = useState(false)

  const handleExtendWaiting = async () => {
    if (!user || !activeBooking) return
    setIsExtendingWaiting(true)
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/bookings/extend-waiting", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ spotNumber: activeBooking.spotId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to extend waiting")

      setUser({ ...user, balance: data.walletBalance })
      setExtraWaitSeconds(prev => prev + 30 * 60)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to extend waiting"
      const match = msg.match(/need (\d+)₸.*have (\d+)₸/)
      if (match) {
        setInsufficientBalance({ need: parseInt(match[1]), have: parseInt(match[2]) })
      } else {
        alert(msg)
      }
    } finally {
      setIsExtendingWaiting(false)
    }
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

  const handleCancelBooking = useCallback(async () => {
    if (selectedSpot) {
      updateSpot(selectedSpot.id, { status: "FREE", bookedBy: undefined, plateNumber: undefined })
    }
    setActiveBooking(null)
    setCurrentScreen("home")
    const token = localStorage.getItem("qpark_token")
    try {
      await fetch("/backend/bookings/cancel-by-spot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ spotNumber: activeBooking?.spotId }),
      })
    } catch { /* ignore — UI already cleared */ }
  }, [selectedSpot, activeBooking, updateSpot, setActiveBooking, setCurrentScreen])

  const handleTerminateRental = useCallback(async () => {
    if (!activeBooking || !user) return
    setIsTerminating(true)
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/rentals/terminate-by-spot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ spotNumber: activeBooking.spotId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to terminate rental")
      }
      if (selectedSpot) {
        updateSpot(selectedSpot.id, { status: "FREE", bookedBy: undefined, plateNumber: undefined })
      }
      setActiveBooking(null)
      setCurrentScreen("home")
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to terminate rental")
    } finally {
      setIsTerminating(false)
      setShowTerminateConfirm(false)
    }
  }, [activeBooking, user, selectedSpot, updateSpot, setActiveBooking, setCurrentScreen])
  
  const [history, setHistory] = useState<{id: string; spotId: string; plateNumber: string; status: string; startTime: string; totalCost: number; type: string}[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!activeBooking) {
      setHistoryLoading(true)
      const token = localStorage.getItem("qpark_token")
      fetch("/backend/bookings/history", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.ok ? r.json() : [])
        .then(data => setHistory(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setHistoryLoading(false))
    }
  }, [activeBooking])

  if (!activeBooking) {
    return (
      <div className="flex flex-col h-full pb-4">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-xl font-bold text-foreground">{t.myBookings}</h1>
          <p className="text-sm text-muted-foreground">{t.noActiveBooking}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-3">
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Car className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">{t.noBookingHistory}</p>
              <Button onClick={() => setCurrentScreen("map")} className="bg-[#354469] hover:bg-[#354469]/90">{t.findParkingBtn}</Button>
            </div>
          ) : (
            history.map(b => (
              <div key={b.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-1 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{b.spotId}</span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    b.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  )}>
                    {b.status === "COMPLETED" ? t.completed : t.cancelled}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{b.plateNumber} · {b.type === "long-term" ? t.longTerm : t.shortTerm}</p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{new Date(b.startTime).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {b.totalCost > 0 && <span className="font-medium text-foreground">{b.totalCost.toLocaleString()} ₸</span>}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-4 pt-2">
          <Button onClick={() => setCurrentScreen("map")} className="w-full bg-[#354469] hover:bg-[#354469]/90">{t.findParkingBtn}</Button>
        </div>
      </div>
    )
  }
  
  if (showGateOpened) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
          <svg className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">{t.paymentSuccessful}</h2>
          <p className="text-gray-500 text-sm">{t.driveToExitMsg}</p>
        </div>
        <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <div className="w-16" />
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-foreground">{t.activeBooking}</h1>
          <p className="text-sm text-muted-foreground">
            {isLongTerm ? t.longTermReservation : t.shortTermParking}
          </p>
        </div>
        <div className="w-16 flex justify-end">
          <Badge 
            variant={isArrived ? "default" : "secondary"}
            className={isArrived ? "bg-[oklch(var(--status-occupied))]" : ""}
          >
            {isArrived ? t.parked : t.enRoute}
          </Badge>
        </div>
      </div>
      
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
                <p className="text-sm text-muted-foreground">{t.timeToArrive}</p>
                <p className="text-3xl font-bold text-foreground">{formatTime(timer)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t.driveUpTo}</p>
                <p className="text-sm font-semibold text-foreground">{activeBooking?.spotId}</p>
                <p className="text-xs text-muted-foreground">{t.lprDetect}</p>
              </div>
            </div>
            {timer < 300 && (
              <p className="mt-2 text-sm text-destructive">{t.hurryExpire}</p>
            )}
          </CardContent>
        </Card>
      )}
      
      {!isLongTerm && isArrived && (
        <Card className="border-[#36549B] bg-[#36549B]/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-[#36549B]" />
                <div>
                  <p className="text-sm text-muted-foreground">{t.parkingDuration}</p>
                  <p className="text-3xl font-bold text-foreground">{formatTime(parkingDuration)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{t.currentCost}</p>
                <p className="text-2xl font-bold text-[#36549B]">{calculateCost()} &#8376;</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {isLongTerm && (
        <>
          <Card className="border-[oklch(var(--status-reserved))] bg-[oklch(var(--status-reserved)/0.05)]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-8 w-8 text-[oklch(var(--status-reserved))]" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t.rentalPeriod}</p>
                    <p className="text-xl font-bold text-foreground">{activeBooking.rentalDays} {t.daysRemaining}</p>
                  </div>
                </div>
                <Badge variant="outline">{t.paid}</Badge>
              </div>
            </CardContent>
          </Card>

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
                      {selectedSpot?.status === "OCCUPIED" ? t.carParked : t.spotReservedOutside}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSpot?.status === "OCCUPIED" ? t.driveToExitLpr : t.driveInLpr}
                    </p>
                  </div>
                </div>
                <Car className={`h-6 w-6 ${selectedSpot?.status === "OCCUPIED" ? "text-green-600" : "text-purple-400"}`} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
      
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <MapPin className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.parkingSpot}</p>
              <p className="text-lg font-bold text-foreground">{activeBooking.spotId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <Car className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.vehicle}</p>
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
              <p className="text-sm text-muted-foreground">{t.entryMethod}</p>
              <p className="font-medium text-foreground">{t.lprCamera}</p>
              <p className="text-xs text-muted-foreground">{t.autoPlate}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {!isLongTerm && isArrived && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-medium text-foreground">{t.costBreakdown}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.firstHourMin}</span>
                <span className="text-foreground">150 &#8376;</span>
              </div>
              {parkingDuration > 3600 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.extraTime} ({Math.ceil((parkingDuration - 3600) / 60)} min)</span>
                  <span className="text-foreground">{Math.ceil((parkingDuration - 3600) / 60) * 3} &#8376;</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-medium">
                <span className="text-foreground">{t.total}</span>
                <span className="text-[#36549B]">{calculateCost()} &#8376;</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="space-y-2 mt-2">
        {isArrived && !isLongTerm && (
          <Button 
            size="lg" 
            className="w-full gap-2 bg-[#354469] hover:bg-[#354469]/90"
            onClick={handlePayAndExit}
            disabled={isPaying}
          >
            <CreditCard className="h-5 w-5" />
            {isPaying ? t.processing : `${calculateCost()} ₸ ${t.payAndExit}`}
          </Button>
        )}
        
        {!isArrived && !isLongTerm && timer < 300 && (
          <Button
            variant="outline"
            size="lg"
            className="w-full hover:bg-orange-50 hover:border-orange-400 hover:text-orange-600 border-orange-300 text-orange-600"
            onClick={handleExtendWaiting}
            disabled={isExtendingWaiting}
          >
            <Clock className="h-5 w-5 mr-2" />
            {isExtendingWaiting ? t.processing : t.extendWaiting}
          </Button>
        )}

        {!isArrived && !isLongTerm && (
          <Button
            variant="outline"
            size="lg"
            className="w-full hover:bg-[#36549B]/10 hover:border-[#36549B] hover:text-[#36549B]"
            onClick={handleCancelBooking}
          >
            {t.cancelBooking}
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
            {t.extendRental}
          </Button>
        )}

        {isLongTerm && (
          <Button
            variant="outline"
            size="lg"
            className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
            onClick={() => setShowTerminateConfirm(true)}
          >
            <X className="h-5 w-5 mr-2" />
            {t.terminateRental}
          </Button>
        )}
      </div>
      
      {showExtend && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowExtend(false); setSelectedExtendDays(null) }}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-28">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#36549B]" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.extendRental}</h2>
              </div>
              <button
                onClick={() => { setShowExtend(false); setSelectedExtendDays(null) }}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t.currentPeriod} <span className="font-semibold text-gray-800 dark:text-gray-200">{activeBooking?.rentalDays ?? 0} day{(activeBooking?.rentalDays ?? 0) !== 1 ? "s" : ""}</span> · {t.addMoreDays}
            </p>

            <div className="space-y-2 mb-5">
              {extendOptions.map((option) => (
                <button
                  key={option.days}
                  onClick={() => setSelectedExtendDays(option.days)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border-2 p-3 transition-all",
                    selectedExtendDays === option.days
                      ? "border-[#354469] bg-[#354469]/5 dark:bg-[#354469]/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-[#354469]/40"
                  )}
                >
                  <div className="text-left">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      +{option.days} {option.days === 1 ? "day" : "days"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{option.perDay} ₸/day</p>
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
                <span className="text-gray-500 dark:text-gray-400">{t.newTotalPeriod}</span>
                <span className="font-semibold text-gray-900 dark:text-white">
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
                ? t.processing
                : selectedExtendDays
                  ? `${t.confirmExtend} +${selectedExtendDays} day${selectedExtendDays > 1 ? "s" : ""} · ${extendOptions.find(o => o.days === selectedExtendDays)!.price.toLocaleString()} ₸`
                  : t.selectPeriod}
            </Button>
          </div>
        </div>
      )}

      {showTerminateConfirm && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTerminateConfirm(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">{t.terminateRentalTitle}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {t.terminateRentalMsg} <span className="font-semibold text-gray-800 dark:text-gray-200">{activeBooking.spotId}</span> {t.terminateRentalMsg2}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowTerminateConfirm(false)}>
                {t.cancel}
              </Button>
              <Button
                size="lg"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleTerminateRental}
                disabled={isTerminating}
              >
                {isTerminating ? t.terminating : t.terminate}
              </Button>
            </div>
          </div>
        </div>
      )}

      {insufficientBalance && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setInsufficientBalance(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
                <Wallet className="h-7 w-7 text-[#b94a4a]" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">{t.insufficientBalance}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {t.insufficientMsg1} <span className="font-semibold text-gray-800 dark:text-gray-200">{insufficientBalance.need}₸</span> {t.insufficientMsg2} <span className="font-semibold text-gray-800 dark:text-gray-200">{insufficientBalance.have}₸</span>. {t.insufficientMsg3}
              </p>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t.shortfall}</span>
                <span className="font-bold text-[#b94a4a]">−{insufficientBalance.need - insufficientBalance.have}₸</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setInsufficientBalance(null)}>{t.back}</Button>
              <Button size="lg" className="flex-1 bg-[#354469] hover:bg-[#354469]/90" onClick={() => { setInsufficientBalance(null); setCurrentScreen("wallet") }}>{t.topUpWallet}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 z-50 shadow-lg">
        <div className="flex justify-around items-center h-full px-4">
          {[
            { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: t.home, active: false },
            { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: t.map, active: false },
            { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: t.booking, active: true },
            { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", label: t.wallet, active: false },
            { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", label: t.profile, active: false },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              className="flex flex-col items-center justify-center gap-0.5 p-3 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl active:scale-95"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <img
                  src={item.active ? item.activeIcon : item.icon}
                  alt={item.label}
                  width={28}
                  height={28}
                  className={item.active ? "opacity-100" : "opacity-80 dark:invert"}
                />
              </div>
              <span className={`text-xs font-medium ${item.active ? "text-[#36549B] dark:text-[#7B9FD4]" : "text-gray-900 dark:text-gray-300"} drop-shadow-sm`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
