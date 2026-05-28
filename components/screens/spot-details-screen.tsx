"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, MapPin, Clock, Calendar, Car, Check, AlertTriangle, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

const calcShortTermPrice = (minutes: number) => {
  if (minutes <= 60) return 150
  return 150 + Math.ceil((minutes - 60) * 3)
}

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} мин`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

const rentalOptions = [
  { days: 1,  price: 900,  perDay: 900 },
  { days: 3,  price: 2400, perDay: 800 },
  { days: 5,  price: 3000, perDay: 600 },
  { days: 7,  price: 3500, perDay: 500 },
  { days: 14, price: 6000, perDay: 429 },
]

export function SpotDetailsScreen() {
  const { selectedSpot, user, setUser, setCurrentScreen, setActiveBooking, updateSpot, activeBooking, t } = useParking()
  const [selectedCar, setSelectedCar]           = useState(user?.cars[0]?.id || "")
  const [bookingType, setBookingType]           = useState<"short-term" | "long-term" | null>(null)
  const [selectedDuration, setSelectedDuration] = useState<number>(60)
  const [selectedRentalDays, setSelectedRentalDays] = useState<number | null>(null)
  const [isBooking, setIsBooking]               = useState(false)
  const [bookingError, setBookingError]         = useState("")
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [insufficientBalance, setInsufficientBalance] = useState<{ need: number; have: number } | null>(null)
  const [promoCode, setPromoCode]               = useState("")
  const [promoApplied, setPromoApplied]         = useState<{ discount: number; code: string } | null>(null)
  const [promoError, setPromoError]             = useState("")
  const [promoLoading, setPromoLoading]         = useState(false)

  if (!selectedSpot) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-muted-foreground">No spot selected</p>
      </div>
    )
  }

  const isLongTerm      = bookingType === "long-term"
  const selectedCarData = user?.cars.find(c => c.id === selectedCar)

  const getBasePrice = () => {
    if (bookingType === "long-term") return rentalOptions.find(o => o.days === selectedRentalDays)?.price || 0
    if (bookingType === "short-term") return calcShortTermPrice(selectedDuration)
    return 150
  }
  const getPrice = () => Math.max(0, getBasePrice() - (promoApplied?.discount || 0))

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return
    setPromoLoading(true)
    setPromoError("")
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/payments/promo/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: promoCode.trim(), amount: getBasePrice() }),
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
    if (!selectedCarData || !user || !bookingType) return

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
        type: bookingType,
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

  const canBook = !!selectedCar && !!bookingType
    && (bookingType === "short-term" ? selectedDuration > 0 : !!selectedRentalDays)
    && !isBooking && !!user?.cars?.length

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-4 p-4 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setCurrentScreen("map")} className="h-10 w-10 hover:bg-[#354469]/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-foreground">Место {selectedSpot.id}</h1>
          <p className="text-sm text-muted-foreground">
            {bookingType === "short-term" ? "Краткосрочная парковка"
              : bookingType === "long-term" ? "Долгосрочная аренда"
              : "Выберите тип бронирования"}
          </p>
        </div>
        <div className="w-10" />
      </div>

      {/* Spot info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[oklch(var(--status-free)/0.15)]">
                <MapPin className="h-7 w-7 text-[oklch(var(--status-free))]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{selectedSpot.id}</p>
                <Badge variant="secondary">Свободно</Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">от</p>
              <p className="text-xl font-bold text-[#36549B]">150 ₸</p>
              <p className="text-xs text-muted-foreground">мин. 1 час</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Booking type selector */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-foreground mb-3">Тип бронирования</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setBookingType("short-term"); setSelectedRentalDays(null) }}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all",
                bookingType === "short-term"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <Clock className="h-6 w-6 text-[#36549B]" />
              <span className="text-sm font-semibold text-foreground">Краткосрочная</span>
              <span className="text-xs text-muted-foreground">от 150 ₸/час</span>
              {bookingType === "short-term" && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>

            <button
              onClick={() => { setBookingType("long-term"); setSelectedDuration(null) }}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all",
                bookingType === "long-term"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <Calendar className="h-6 w-6 text-[#36549B]" />
              <span className="text-sm font-semibold text-foreground">Долгосрочная</span>
              <span className="text-xs text-muted-foreground">от 700 ₸/день</span>
              {bookingType === "long-term" && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Car selector */}
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
            <p className="text-sm text-muted-foreground text-center py-2">{t.noCarsAddFirst}</p>
          )}
        </CardContent>
      </Card>

      {/* Short-term: duration */}
      {bookingType === "short-term" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5" />
              Длительность
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Custom time picker */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setSelectedDuration(Math.max(15, selectedDuration - 15))}
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border text-xl font-bold text-foreground hover:border-primary hover:bg-primary/5 transition-all">
                −
              </button>
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">{formatDuration(selectedDuration)}</p>
                <p className="text-sm font-semibold text-[#36549B] mt-1">{calcShortTermPrice(selectedDuration)} ₸</p>
              </div>
              <button
                onClick={() => setSelectedDuration(Math.min(480, selectedDuration + 15))}
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border text-xl font-bold text-foreground hover:border-primary hover:bg-primary/5 transition-all">
                +
              </button>
            </div>
            {/* Quick picks */}
            <div className="flex gap-2 mb-3">
              {[30, 60, 90, 120].map(m => (
                <button key={m} onClick={() => setSelectedDuration(m)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    selectedDuration === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}>
                  {formatDuration(m)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Первый час — 150 ₸ · После: 3 ₸/мин · 15 мин на подъезд бесплатно
            </p>
          </CardContent>
        </Card>
      )}

      {/* Long-term: rental days */}
      {bookingType === "long-term" && (
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
                  <p className="text-sm text-muted-foreground">{option.perDay} ₸/{t.perDay}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-[#36549B]">{option.price.toLocaleString()} ₸</p>
                  {selectedRentalDays === option.days && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {bookingType && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Место</span>
                <span className="font-medium text-foreground">{selectedSpot.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Машина</span>
                <span className="font-medium text-foreground">{selectedCarData?.plateNumber || "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Тип</span>
                <span className="font-medium text-foreground">
                  {bookingType === "short-term" ? "Краткосрочная" : "Долгосрочная"}
                </span>
              </div>
              {bookingType === "short-term" && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Время</span>
                  <span className="font-medium text-foreground">{formatDuration(selectedDuration)}</span>
                </div>
              )}
              {bookingType === "long-term" && selectedRentalDays && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Период</span>
                  <span className="font-medium text-foreground">
                    {selectedRentalDays} {selectedRentalDays === 1 ? t.day : t.days}
                  </span>
                </div>
              )}
              <Separator className="my-2" />
              {promoApplied && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Сумма</span>
                    <span className="text-muted-foreground line-through">{getBasePrice().toLocaleString()} ₸</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 font-medium">Промокод {promoApplied.code}</span>
                    <span className="text-green-600 font-medium">−{promoApplied.discount} ₸</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="font-medium text-foreground">Итого</span>
                <span className="text-lg font-bold text-[#36549B]">{getPrice().toLocaleString()} ₸</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Promo code */}
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
        disabled={!canBook}
      >
        {isBooking ? t.bookingLabel : t.bookNowBtn}
      </Button>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 h-20 bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 z-50 shadow-lg">
        <div className="flex justify-around items-center h-full px-4">
          {[
            { id: "home",    icon: "/Home_light.svg",           activeIcon: "/Home_light_active.svg",           label: t.home,    active: false },
            { id: "map",     icon: "/Map_light.svg",            activeIcon: "/Map_light_active.svg",            label: t.map,     active: true  },
            { id: "booking", icon: "/Component.svg",            activeIcon: "/Component_active.svg",            label: t.booking, active: false },
            { id: "wallet",  icon: "/wallet.svg",               activeIcon: "/wallet_active.svg",               label: t.wallet,  active: false },
            { id: "profile", icon: "/User_cicrle_light.svg",    activeIcon: "/User_cicrle_light_active.svg",    label: t.profile, active: false },
          ].map((item) => (
            <button key={item.id} onClick={() => setCurrentScreen(item.id)}
              className="flex flex-col items-center justify-center gap-0.5 p-3 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl active:scale-95">
              <div className="w-8 h-8 flex items-center justify-center">
                <img src={item.active ? item.activeIcon : item.icon} alt={item.label} width={28} height={28}
                  className={item.active ? "opacity-100" : "opacity-80 dark:invert"} />
              </div>
              <span className={`text-xs font-medium ${item.active ? "text-[#36549B] dark:text-[#7B9FD4]" : "text-gray-900 dark:text-gray-300"} drop-shadow-sm`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Conflict modal */}
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
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{t.alreadyBookedComplete}</p>
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
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowConflictModal(false)}>{t.back}</Button>
              <Button size="lg" className="flex-1 bg-[#354469] hover:bg-[#354469]/90"
                onClick={() => { setShowConflictModal(false); setCurrentScreen("booking") }}>
                {t.viewMyBooking}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient balance modal */}
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
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setInsufficientBalance(null)}>{t.back}</Button>
              <Button size="lg" className="flex-1 bg-[#354469] hover:bg-[#354469]/90"
                onClick={() => { setInsufficientBalance(null); setCurrentScreen("wallet") }}>
                {t.topUpWallet}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
