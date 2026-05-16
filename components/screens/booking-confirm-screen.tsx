"use client"

import { useParking } from "@/lib/parking-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, MapPin, Car, Clock, Camera } from "lucide-react"

export function BookingConfirmScreen() {
  const { activeBooking, selectedSpot, user, setCurrentScreen, t } = useParking()

  const selectedCar = user?.cars.find(c => c.plateNumber === activeBooking?.plateNumber)
  const isLongTerm = selectedSpot?.type === "long-term"

  const navItems = [
    { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: t.home, active: false },
    { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: t.map, active: true },
    { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: t.booking, active: false },
    { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", label: t.wallet, active: false },
    { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", label: t.profile, active: false },
  ]

  return (
    <div className="flex flex-col items-center gap-6 p-4 pt-8 pb-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[oklch(var(--status-free)/0.15)]">
        <CheckCircle2 className="h-12 w-12 text-[oklch(var(--status-free))]" />
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {isLongTerm ? t.reservationConfirmed : t.bookingConfirmed}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {isLongTerm ? t.spotNowReserved : t.have15Minutes}
        </p>
      </div>

      <Card className="w-full">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#354469]/10">
              <MapPin className="h-6 w-6 text-[#354469]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.parkingSpot}</p>
              <p className="text-lg font-bold text-foreground">{activeBooking?.spotId}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#354469]/10">
              <Car className="h-6 w-6 text-[#354469]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.vehicle}</p>
              <p className="font-medium text-foreground">
                {selectedCar?.brand} {selectedCar?.model}
              </p>
              <p className="text-sm text-muted-foreground">{activeBooking?.plateNumber}</p>
            </div>
          </div>

          {!isLongTerm && (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                <Clock className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t.arrivalDeadline}</p>
                <p className="font-medium text-foreground">15:00 remaining</p>
                <p className="text-xs text-muted-foreground">{t.arriveWithin15}</p>
              </div>
            </div>
          )}

          {isLongTerm && activeBooking?.rentalDays && (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[oklch(var(--status-reserved)/0.15)]">
                <Clock className="h-6 w-6 text-[oklch(var(--status-reserved))]" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t.rentalPeriod}</p>
                <p className="font-medium text-foreground">{activeBooking.rentalDays} {activeBooking.rentalDays === 1 ? t.day : t.days}</p>
                <p className="text-xs text-muted-foreground">{t.unlimitedEntries}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="w-full bg-secondary/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Camera className="h-6 w-6 text-[#354469]" />
            <div>
              <p className="font-medium text-foreground">{t.lprEntry}</p>
              <p className="text-sm text-muted-foreground">{t.lprEntryDesc}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="w-full space-y-2">
        <Button
          className="w-full bg-[#354469] hover:bg-[#354469]/90"
          size="lg"
          onClick={() => setCurrentScreen("booking")}
        >
          {t.viewActiveBooking}
        </Button>
        <Button
          variant="outline"
          className="w-full hover:bg-[#354469]/10 hover:border-[#354469] hover:text-[#354469]"
          size="lg"
          onClick={() => setCurrentScreen("home")}
        >
          {t.backToHome}
        </Button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 z-50 shadow-lg">
        <div className="flex justify-around items-center h-full px-4">
          {navItems.map((item) => (
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
