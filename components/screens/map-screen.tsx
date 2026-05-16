"use client"

import { useParking, type SpotStatus } from "@/lib/parking-context"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Car, Wrench, Clock, Check, AlertCircle, ArrowLeft } from "lucide-react"

export function MapScreen() {
  const { spots, setSelectedSpot, setCurrentScreen, t } = useParking()

  const statusConfig = {
    FREE:     { color: "text-green-600", icon: Check,        label: t.statusFree },
    BOOKED:   { color: "text-blue-600",  icon: Clock,        label: t.statusBooked },
    OCCUPIED: { color: "text-gray-600 dark:text-gray-400", icon: Car, label: t.statusOccupied },
    RESERVED: { color: "text-orange-600", icon: AlertCircle, label: t.statusReserved },
    REPAIR:   { color: "text-red-600",   icon: Wrench,       label: t.statusRepair },
  } as const

  const shortTermSpots = spots.filter(s => s.type === "short-term")
  const longTermSpots  = spots.filter(s => s.type === "long-term")

  const handleSpotClick = (spotId: string) => {
    const spot = spots.find(s => s.id === spotId)
    if (spot && spot.status === "FREE") {
      setSelectedSpot(spot)
      setCurrentScreen("spot-details")
    }
  }

  const navItems = [
    { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: t.home, active: false },
    { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: t.map, active: true },
    { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: t.booking, active: false },
    { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", label: t.wallet, active: false },
    { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", label: t.profile, active: false },
  ]

  return (
    <div className="relative mx-auto max-w-md min-h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <div className="bg-white dark:bg-gray-800 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentScreen("home")} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-200" />
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white drop-shadow-sm">{t.parkingMap}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t.parkingLocation}</p>
          </div>
          <div className="w-9" />
        </div>
      </div>

      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-2 justify-center">
          {(Object.entries(statusConfig) as [SpotStatus, typeof statusConfig[SpotStatus]][]).map(([status, config]) => (
            <Badge key={status} variant="outline" className="gap-1.5 px-3 py-1.5 text-xs border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded-full">
              <config.icon className="h-3 w-3" />
              <span>{config.label}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 pb-24 space-y-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t.shortTermSection}</h2>
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700">150₸/hr</Badge>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {shortTermSpots.map((spot) => {
              const config = statusConfig[spot.status]
              const Icon = config.icon
              const isClickable = spot.status === "FREE"
              return (
                <button key={spot.id} onClick={() => handleSpotClick(spot.id)} disabled={!isClickable}
                  className={cn(
                    "relative flex h-12 flex-col items-center justify-center rounded-lg border transition-all",
                    isClickable && "cursor-pointer hover:scale-105 hover:shadow-md",
                    !isClickable && "cursor-not-allowed opacity-70",
                    spot.status === "FREE"     && "border-green-500 bg-green-50 dark:bg-green-900/30",
                    spot.status === "BOOKED"   && "border-blue-500 bg-blue-50 dark:bg-blue-900/30",
                    spot.status === "OCCUPIED" && "border-gray-500 bg-gray-50 dark:bg-gray-700/50",
                    spot.status === "RESERVED" && "border-orange-500 bg-orange-50 dark:bg-orange-900/30",
                    spot.status === "REPAIR"   && "border-red-500 bg-red-50 dark:bg-red-900/30"
                  )}>
                  <Icon className={cn("h-3 w-3", config.color)} />
                  <span className="mt-0.5 text-[9px] font-medium text-gray-800 dark:text-gray-200">{spot.number}</span>
                  {spot.status === "FREE" && <div className="absolute bottom-0.5 w-1 h-1 bg-green-500 rounded-full" />}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">{t.longTermSection}</h2>
            <Badge variant="secondary" className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700">700₸/day</Badge>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {longTermSpots.map((spot) => {
              const config = statusConfig[spot.status]
              const Icon = config.icon
              const isClickable = spot.status === "FREE"
              return (
                <button key={spot.id} onClick={() => handleSpotClick(spot.id)} disabled={!isClickable}
                  className={cn(
                    "relative flex h-12 flex-col items-center justify-center rounded-lg border transition-all",
                    isClickable && "cursor-pointer hover:scale-105 hover:shadow-md",
                    !isClickable && "cursor-not-allowed opacity-70",
                    spot.status === "FREE"     && "border-green-500 bg-green-50 dark:bg-green-900/30",
                    spot.status === "BOOKED"   && "border-blue-500 bg-blue-50 dark:bg-blue-900/30",
                    spot.status === "OCCUPIED" && "border-gray-500 bg-gray-50 dark:bg-gray-700/50",
                    spot.status === "RESERVED" && "border-orange-500 bg-orange-50 dark:bg-orange-900/30",
                    spot.status === "REPAIR"   && "border-red-500 bg-red-50 dark:bg-red-900/30"
                  )}>
                  <Icon className={cn("h-3 w-3", config.color)} />
                  <span className="mt-0.5 text-[9px] font-medium text-gray-800 dark:text-gray-200">{spot.number}</span>
                  {spot.status === "FREE" && <div className="absolute bottom-0.5 w-1 h-1 bg-green-500 rounded-full" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 z-50 shadow-lg">
        <div className="flex justify-around items-center h-full px-4">
          {navItems.map((item) => (
            <button key={item.id} onClick={() => setCurrentScreen(item.id)} className="flex flex-col items-center justify-center gap-0.5 p-3 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl active:scale-95">
              <div className="w-8 h-8 flex items-center justify-center">
                <img src={item.active ? item.activeIcon : item.icon} alt={item.label} width={28} height={28} className={item.active ? "opacity-100" : "opacity-80 dark:invert"} />
              </div>
              <span className={`text-xs font-medium ${item.active ? "text-[#36549B] dark:text-[#7B9FD4]" : "text-gray-900 dark:text-gray-300"} drop-shadow-sm`}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
