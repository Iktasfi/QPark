"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, MapPin, Clock, Calendar, Car, Check, AlertTriangle, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

const rentalOptions = [
  { days: 1, price: 700, perDay: 700 },
  { days: 3, price: 1800, perDay: 600 },
  { days: 5, price: 2700, perDay: 540 },
  { days: 7, price: 3500, perDay: 500 },
  { days: 14, price: 6000, perDay: 429 },
]

export function SpotDetailsScreen() {
  const { selectedSpot, user, setUser, setCurrentScreen, setActiveBooking, updateSpot, activeBooking, t } = useParking()
  const [selectedCar, setSelectedCar] = useState(user?.cars[0]?.id || "")
  const [selectedRentalDays, setSelectedRentalDays] = useState<number | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  const [bookingError, setBookingError] = useState("")
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [insufficientBalance, setInsufficientBalance] = useState<{ need: number; have: number } | null>(null)
  const [promoCode, setPromoCode] = useState("")
  const [promoApplied, setPromoApplied] = useState<{ discount: number; code: string } | null>(null)
  const [promoError, setPromoError] = useState("")
  const [promoLoading, setPromoLoading] = useState(false)

  if (!selectedSpot) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-muted-foreground">No spot selected</p>
      </div>
    )
  }

  const isLongTerm = selectedSpot.type === "long-term"
  const selectedCarData = user?.cars.find(c => c.id === selectedCar)

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return
    setPromoLoading(true)
    setPromoError("")
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/payment/promo/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: promoCode.trim(), amount: 150 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPromoApplied({ discount: data.discountAmount, code: promoCode.trim().toUpperCase() })
      setPromoCode("")
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : "Неверный промокод")
    } finally {
      setPromoLoading(false)
    }
  }

  const handleBookNow = async () => {
    if (!selectedCarData || !user) return

    if (activeBooking) {
      setShowConflictModal(true)
      return
    }

    setIsBooking(true)
    setBookingError("")

    const newStatus = isLongTerm ? "RESERVED" : "BOOKED"

    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/parking/set-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          spotNumber: selectedSpot.id,
          status: newStatus,
          carPlate: selectedCarData.plateNumber,
          userId: user.id,
          rentalDays: selectedRentalDays ?? undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to book spot")
      }

      const data = await res.json()

      const booking = {
        id: `booking-${Date.now()}`,
        spotId: selectedSpot.id,
        userId: user.id,
        plateNumber: selectedCarData.plateNumber,
        type: selectedSpot.type,
        status: "active" as const,
        startTime: new Date(),
        isPaid: false,
        waitingFee: 0,
        rentalDays: selectedRentalDays || undefined,
      }

      setActiveBooking(booking)
      updateSpot(selectedSpot.id, {
        status: newStatus,
        bookedBy: user.id,
        plateNumber: selectedCarData.plateNumber,
        bookedAt: new Date(),
      })

      if (isLongTerm && data.newBalance !== undefined) {
        setUser({ ...user, balance: data.newBalance })
      }

      setCurrentScreen("booking-confirm")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to book spot"
      const match = msg.match(/need (\d+)₸.*have (\d+)₸/)
      if (match) {
        setInsufficientBalance({ need: parseInt(match[1]), have: parseInt(match[2]) })
      } else {
        setBookingError(msg)
      }
    } finally {
      setIsBooking(false)
    }
  }

  const getRentalPrice = () => {
    if (!isLongTerm) return 150
    const option = rentalOptions.find(o => o.days === selectedRentalDays)
    return option?.price || 0
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentScreen("map")}
          className="h-10 w-10 hover:bg-[#354469]/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-foreground">Spot {selectedSpot.id}</h1>
          <p className="text-sm text-muted-foreground">
            {isLongTerm ? t.longTermReservation : t.shortTermParking}
          </p>
        </div>
        <div className="w-10" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[oklch(var(--status-free)/0.15)]">
                <MapPin className="h-7 w-7 text-[oklch(var(--status-free))]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{selectedSpot.id}</p>
                <Badge variant="secondary">
                  {isLongTerm ? t.longTerm : t.shortTerm}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">{t.statusFree}</p>
              <p className="text-xl font-bold text-[#36549B]">
                {isLongTerm ? "700" : "150"} &#8376;
              </p>
              <p className="text-xs text-muted-foreground">
                {isLongTerm ? t.perDay : t.firstHourMin}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="h-5 w-5" />
            {t.selectVehicle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {user?.cars && user.cars.length > 0 ? user.cars.map((car) => (
            <button
              key={car.id}
              onClick={() => setSelectedCar(car.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border-2 p-3 transition-all",
                selectedCar === car.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <div className="text-left">
                <p className="font-medium text-foreground">{car.brand} {car.model}</p>
                <p className="text-sm text-muted-foreground">{car.plateNumber}</p>
              </div>
              {selectedCar === car.id && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                  <Check className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </button>
          )) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              {t.noCarsAddFirst}
            </p>
          )}
        </CardContent>
      </Card>

      {isLongTerm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5" />
              {t.selectPeriodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rentalOptions.map((option) => (
              <button
                key={option.days}
                onClick={() => setSelectedRentalDays(option.days)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border-2 p-3 transition-all",
                  selectedRentalDays === option.days
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="text-left">
                  <p className="font-medium text-foreground">
                    {option.days} {option.days === 1 ? t.day : t.days}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {option.perDay} &#8376;/{t.perDay}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#36549B]">{option.price.toLocaleString()} &#8376;</p>
                  {selectedRentalDays === option.days && (
                    <Badge variant="outline" className="mt-1">{t.selected}</Badge>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {!isLongTerm && (
        <Card className="bg-secondary/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-[#36549B]" />
              <h3 className="font-medium text-foreground">{t.pricing}</h3>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>{t.firstHourDetail}</li>
              <li>{t.afterFirstHour}</li>
              <li>{t.arrivalWindow}</li>
              <li>{t.extendedWaitingInfo}</li>
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.spotLabel}</span>
              <span className="font-medium text-foreground">{selectedSpot.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.vehicle}</span>
              <span className="font-medium text-foreground">{selectedCarData?.plateNumber || "-"}</span>
            </div>
            {isLongTerm && selectedRentalDays && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.period}</span>
                <span className="font-medium text-foreground">{selectedRentalDays} {selectedRentalDays === 1 ? t.day : t.days}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between">
              <span className="font-medium text-foreground">
                {isLongTerm ? t.total : t.shortTerm}
              </span>
              <span className="text-lg font-bold text-[#36549B]">
                {getRentalPrice().toLocaleString()} &#8376;
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="w-full space-y-2">
        {promoApplied ? (
          <div className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-700">
            <span className="text-green-700 dark:text-green-400 text-sm font-medium">🎉 {promoApplied.code} — скидка {promoApplied.discount}₸</span>
            <button onClick={() => setPromoApplied(null)} className="text-green-600 text-xs underline">Убрать</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              value={promoCode}
              onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError("") }}
              placeholder="Промокод"
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]"
            />
            <button
              onClick={handleApplyPromo}
              disabled={promoLoading || !promoCode.trim()}
              className="px-4 py-2 bg-[#354469] text-white rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {promoLoading ? "..." : "Применить"}
            </button>
          </div>
        )}
        {promoError && <p className="text-red-500 text-xs">{promoError}</p>}
      </div>

      {bookingError && (
        <p className="text-red-500 text-sm text-center px-2">{bookingError}</p>
      )}

      <Button
        size="lg"
        className="w-full bg-[#354469] hover:bg-[#354469]/90"
        onClick={handleBookNow}
        disabled={!selectedCar || (isLongTerm && !selectedRentalDays) || isBooking || !user?.cars?.length}
      >
        {isBooking ? t.bookingLabel : t.bookNowBtn}
      </Button>

      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 z-50 shadow-lg">
        <div className="flex justify-around items-center h-full px-4">
          {[
            { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: t.home, active: false },
            { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: t.map, active: true },
            { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: t.booking, active: false },
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

      {showConflictModal && activeBooking && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConflictModal(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />

            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <AlertTriangle className="h-7 w-7 text-[#b94a4a]" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">{t.youAlreadyBooked}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {t.alreadyBookedComplete}
              </p>
            </div>

            <div className="bg-[#F0F4FF] rounded-2xl p-4 mb-5 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-[#36549B] shrink-0" />
              <div>
                <p className="font-semibold text-[#36549B]">{activeBooking.spotId}</p>
                <p className="text-xs text-gray-500">
                  {activeBooking.type === "long-term"
                    ? `${t.longTerm} — ${activeBooking.rentalDays ?? 0} ${(activeBooking.rentalDays ?? 0) !== 1 ? t.days : t.day}`
                    : t.shortTerm}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setShowConflictModal(false)}
              >
                {t.back}
              </Button>
              <Button
                size="lg"
                className="flex-1 bg-[#354469] hover:bg-[#354469]/90"
                onClick={() => {
                  setShowConflictModal(false)
                  setCurrentScreen("booking")
                }}
              >
                {t.viewMyBooking}
              </Button>
            </div>
          </div>
        </div>
      )}

      {insufficientBalance && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setInsufficientBalance(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <Wallet className="h-7 w-7 text-[#b94a4a]" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">{t.insufficientBalance}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {t.insufficientMsg1}{" "}
                <span className="font-semibold text-gray-800 dark:text-gray-200">{insufficientBalance.need}₸</span>{" "}
                {t.insufficientMsg2}{" "}
                <span className="font-semibold text-gray-800 dark:text-gray-200">{insufficientBalance.have}₸</span>.{" "}
                {t.insufficientMsg3}
              </p>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t.shortfall}</span>
                <span className="font-bold text-[#b94a4a]">−{insufficientBalance.need - insufficientBalance.have}₸</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setInsufficientBalance(null)}>
                {t.back}
              </Button>
              <Button
                size="lg"
                className="flex-1 bg-[#354469] hover:bg-[#354469]/90"
                onClick={() => { setInsufficientBalance(null); setCurrentScreen("wallet") }}
              >
                {t.topUpWallet}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
