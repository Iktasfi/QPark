"use client"

import { useState } from "react"
import { useParking, type SpotStatus } from "@/lib/parking-context"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Car, Wrench, Clock, Check, AlertCircle, ArrowLeft, Search, MapPin } from "lucide-react"

const locations = [
  { id: 1, name: "Парковка №1", address: "Улы Дала, 1, Астана",       spots: 30, range: [1, 30] },
  { id: 2, name: "Парковка №2", address: "Сыганак, 5, Астана",         spots: 25, range: [1, 25] },
  { id: 3, name: "Парковка №3", address: "Кабанбай батыр, 12, Астана", spots: 20, range: [1, 20] },
]

export function MapScreen() {
  const { spots, setSelectedSpot, setCurrentScreen, t } = useParking()
  const [searchQuery, setSearchQuery]         = useState("")
  const [selectedLocation, setSelectedLocation] = useState(locations[0])
  const [showDropdown, setShowDropdown]       = useState(false)

  const statusConfig = {
    FREE:     { color: "text-green-600",  icon: Check,        label: t.statusFree },
    BOOKED:   { color: "text-blue-600",   icon: Clock,        label: t.statusBooked },
    OCCUPIED: { color: "text-gray-600 dark:text-gray-400", icon: Car, label: t.statusOccupied },
    RESERVED: { color: "text-orange-600", icon: AlertCircle,  label: t.statusReserved },
    REPAIR:   { color: "text-red-600",    icon: Wrench,       label: t.statusRepair },
  } as const

  const filtered = locations.filter(
    l => l.name.toLowerCase().includes(searchQuery.toLowerCase())
      || l.address.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const [min, max] = selectedLocation.range
  const visibleSpots = spots.filter(s => {
    const num = parseInt(s.number)
    return num >= min && num <= max
  })

  const handleSpotClick = (spotId: string) => {
    const spot = spots.find(s => s.id === spotId)
    if (spot && spot.status === "FREE") {
      setSelectedSpot(spot)
      setCurrentScreen("spot-details")
    }
  }

  const navItems = [
    { id: "home",    icon: "/Home_light.svg",        activeIcon: "/Home_light_active.svg",        label: t.home,    active: false },
    { id: "map",     icon: "/Map_light.svg",          activeIcon: "/Map_light_active.svg",          label: t.map,     active: true  },
    { id: "booking", icon: "/Component.svg",          activeIcon: "/Component_active.svg",          label: t.booking, active: false },
    { id: "wallet",  icon: "/wallet.svg",             activeIcon: "/wallet_active.svg",             label: t.wallet,  active: false },
    { id: "profile", icon: "/User_cicrle_light.svg",  activeIcon: "/User_cicrle_light_active.svg",  label: t.profile, active: false },
  ]

  return (
    <div className="relative mx-auto max-w-md h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCurrentScreen("home")} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-200" />
          </button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t.parkingMap}</h1>
          <div className="w-9" />
        </div>

        {/* Location search */}
        <div className="relative">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 cursor-pointer"
            onClick={() => setShowDropdown(!showDropdown)}>
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true) }}
              onClick={e => { e.stopPropagation(); setShowDropdown(true) }}
              placeholder="Поиск по адресу..."
              className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
            />
            {selectedLocation && !showDropdown && (
              <span className="text-xs text-[#36549B] font-medium shrink-0">{selectedLocation.name}</span>
            )}
          </div>

          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setShowDropdown(false); setSearchQuery("") }} />
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-600 shadow-lg z-20 overflow-hidden">
                {filtered.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Ничего не найдено</p>
                ) : filtered.map(loc => (
                  <button key={loc.id} onClick={() => { setSelectedLocation(loc); setShowDropdown(false); setSearchQuery("") }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0",
                      selectedLocation.id === loc.id && "bg-blue-50 dark:bg-blue-900/20"
                    )}>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                      style={{ background: selectedLocation.id === loc.id ? "rgba(54,84,155,0.15)" : "rgba(0,0,0,0.05)" }}>
                      <MapPin className="h-4 w-4 text-[#36549B]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{loc.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{loc.address} · {loc.spots} мест</p>
                    </div>
                    {selectedLocation.id === loc.id && (
                      <Check className="h-4 w-4 text-[#36549B] ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Selected location info */}
        <div className="flex items-center gap-1.5 mt-2">
          <MapPin className="h-3.5 w-3.5 text-[#36549B]" />
          <span className="text-xs text-gray-500 dark:text-gray-400">{selectedLocation.address}</span>
          <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{selectedLocation.spots} мест</span>
        </div>
      </div>

      {/* Legend */}
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

      {/* All spots — one grid */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">{selectedLocation.name}</h2>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {visibleSpots.filter(s => s.status === "FREE").length} свободно
            </span>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {visibleSpots.map((spot) => {
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

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 z-50 shadow-lg" style={{ height: "64px" }}>
        <div className="flex justify-around items-center px-4 h-full">
          {navItems.map((item) => (
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
    </div>
  )
}
