"use client"

import dynamic from "next/dynamic"
import { useState, useEffect, useMemo } from "react"
import { useParking, type SpotStatus } from "@/lib/parking-context"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Car, Wrench, Clock, Check, AlertCircle, Search, MapPin } from "lucide-react"
import type { MapLocation } from "@/components/ParkingMapGL"

const ParkingMapGL = dynamic(() => import("@/components/ParkingMapGL"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-[#354469] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-gray-400">Загрузка карты...</span>
      </div>
    </div>
  ),
})

const locations: MapLocation[] = [
  { id: 1,  name: "Парковка №1",  address: "Улы Дала, 1, Астана",              spots: 30, prefix: "SP",  lat: 51.1830, lng: 71.4470 },
  { id: 2,  name: "Парковка №2",  address: "Сыганак, 5, Астана",               spots: 25, prefix: "P2",  lat: 51.1694, lng: 71.4131 },
  { id: 3,  name: "Парковка №3",  address: "Кабанбай батыр, 12, Астана",       spots: 20, prefix: "P3",  lat: 51.1778, lng: 71.4422 },
  { id: 4,  name: "Парковка №4",  address: "Туран, 24, Астана",                spots: 19, prefix: "P4",  lat: 51.1675, lng: 71.4340 },
  { id: 5,  name: "Парковка №5",  address: "пр. Республики, 9, Астана",        spots: 22, prefix: "P5",  lat: 51.1608, lng: 71.4710 },
  { id: 6,  name: "Парковка №6",  address: "Достық, 13, Астана",               spots: 14, prefix: "P6",  lat: 51.1651, lng: 71.4289 },
  { id: 7,  name: "Парковка №7",  address: "Сарыарқа, 7, Астана",              spots: 17, prefix: "P7",  lat: 51.1554, lng: 71.4234 },
  { id: 8,  name: "Парковка №8",  address: "Бейбітшілік, 17, Астана",          spots: 16, prefix: "P8",  lat: 51.1724, lng: 71.4392 },
  { id: 9,  name: "Парковка №9",  address: "Иманов, 21, Астана",               spots: 21, prefix: "P9",  lat: 51.1685, lng: 71.4545 },
  { id: 10, name: "Парковка №10", address: "Хан Шатыр, пр. Туран, 3, Астана", spots: 18, prefix: "P10", lat: 51.1298, lng: 71.4044 },
]

export function MapScreen() {
  const { spots, setSelectedSpot, setCurrentScreen, t, fetchSpotsForLocation, activeBooking } = useParking()
  const [searchQuery, setSearchQuery] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)

  const getBookingLocation = () => {
    if (activeBooking?.spotId) {
      const prefix = activeBooking.spotId.split("-")[0]
      const match = locations.find(l => l.prefix === prefix)
      if (match) return match
    }
    return locations[0]
  }

  const [selectedLocation, setSelectedLocation] = useState<MapLocation>(getBookingLocation)

  useEffect(() => {
    if (activeBooking?.spotId) {
      const prefix = activeBooking.spotId.split("-")[0]
      const match = locations.find(l => l.prefix === prefix)
      if (match) setSelectedLocation(match)
    }
  }, [activeBooking?.spotId])

  useEffect(() => {
    fetchSpotsForLocation(selectedLocation.id)
  }, [selectedLocation.id])

  const statusConfig = {
    FREE:     { color: "text-green-600",  icon: Check,       label: t.statusFree },
    BOOKED:   { color: "text-blue-600",   icon: Clock,       label: t.statusBooked },
    OCCUPIED: { color: "text-gray-600 dark:text-gray-400", icon: Car, label: t.statusOccupied },
    RESERVED: { color: "text-orange-600", icon: AlertCircle, label: t.statusReserved },
    REPAIR:   { color: "text-red-600",    icon: Wrench,      label: t.statusRepair },
  } as const

  const filtered = locations.filter(
    l => l.name.toLowerCase().includes(searchQuery.toLowerCase())
      || l.address.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const visibleSpots = spots.filter(s => s.id.startsWith(selectedLocation.prefix + "-"))

  const locationStats = useMemo(() => {
    return locations.reduce((acc, loc) => {
      const ls = spots.filter(s => s.id.startsWith(loc.prefix + "-"))
      acc[loc.id] = { free: ls.filter(s => s.status === "FREE").length, total: ls.length || loc.spots }
      return acc
    }, {} as Record<number, { free: number; total: number }>)
  }, [spots])

  const handleSpotClick = (spotId: string) => {
    const spot = spots.find(s => s.id === spotId)
    if (spot?.status === "FREE") {
      setSelectedSpot(spot)
      setCurrentScreen("spot-details")
    }
  }

  const navItems = [
    { id: "home",    icon: "/Home_light.svg",       activeIcon: "/Home_light_active.svg",       label: t.home,    active: false },
    { id: "map",     icon: "/Map_light.svg",         activeIcon: "/Map_light_active.svg",         label: t.map,     active: true  },
    { id: "booking", icon: "/Component.svg",         activeIcon: "/Component_active.svg",         label: t.booking, active: false },
    { id: "wallet",  icon: "/wallet.svg",            activeIcon: "/wallet_active.svg",            label: t.wallet,  active: false },
    { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", label: t.profile, active: false },
  ]

  const freeCount  = visibleSpots.filter(s => s.status === "FREE").length
  const takenCount = visibleSpots.filter(s => s.status === "OCCUPIED" || s.status === "RESERVED" || s.status === "BOOKED").length

  return (
    <div className="relative mx-auto max-w-md h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">

      {/* ── MAP ── takes upper 52% */}
      <div className="relative flex-shrink-0" style={{ height: "52%" }}>
        <ParkingMapGL
          locations={locations}
          selectedLocationId={selectedLocation.id}
          onSelectLocation={id => {
            const loc = locations.find(l => l.id === id)
            if (loc) { setSelectedLocation(loc) }
          }}
          locationStats={locationStats}
        />
      </div>

      {/* ── BOTTOM PANEL ── */}
      <div className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-gray-900 rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,0.10)] z-10" style={{ marginTop: "-16px" }}>

        {/* Drag handle */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>

        {/* Location search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 cursor-pointer"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true) }}
                onClick={e => { e.stopPropagation(); setShowDropdown(true) }}
                placeholder="Поиск парковки..."
                className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
              />
              {!showDropdown && (
                <span className="text-xs text-[#36549B] font-semibold shrink-0">{selectedLocation.name}</span>
              )}
            </div>

            {showDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setShowDropdown(false); setSearchQuery("") }} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-xl z-20 overflow-hidden max-h-56 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Ничего не найдено</p>
                  ) : filtered.map(loc => {
                    const st = locationStats[loc.id]
                    const freeRatio = st ? st.free / st.total : 0
                    const dotColor = freeRatio > 0.5 ? "bg-green-500" : freeRatio > 0.2 ? "bg-amber-400" : "bg-red-400"
                    return (
                      <button key={loc.id}
                        onClick={() => { setSelectedLocation(loc); setShowDropdown(false); setSearchQuery("") }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0",
                          selectedLocation.id === loc.id && "bg-blue-50 dark:bg-blue-900/20"
                        )}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
                          style={{ background: selectedLocation.id === loc.id ? "rgba(54,84,155,0.15)" : "rgba(0,0,0,0.05)" }}>
                          <MapPin className="h-4 w-4 text-[#36549B]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{loc.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{loc.address}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn("w-2 h-2 rounded-full", dotColor)} />
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                            {st?.free ?? 0} св.
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Location info row */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-[#36549B] shrink-0" />
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">{selectedLocation.address}</span>
            </div>
            <div className="flex items-center gap-3 text-xs shrink-0">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-gray-600 dark:text-gray-400 font-medium">{freeCount} св.</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">{takenCount} занято</span>
              </span>
            </div>
          </div>
        </div>

        {/* Legend strip */}
        <div className="px-4 pb-2 border-b border-gray-100 dark:border-gray-700">
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(statusConfig) as [SpotStatus, (typeof statusConfig)[SpotStatus]][]).map(([status, cfg]) => (
              <Badge key={status} variant="outline" className="gap-1 px-2 py-1 text-[10px] border-gray-200 dark:border-gray-600 dark:text-gray-300 rounded-full">
                <cfg.icon className="h-2.5 w-2.5" />
                {cfg.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Spot grid */}
        <div className="flex-1 overflow-y-auto px-4 py-3 pb-20">
          {visibleSpots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <MapPin className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Загрузка мест...</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {visibleSpots.map(spot => {
                const cfg = statusConfig[spot.status]
                const Icon = cfg.icon
                const isClickable = spot.status === "FREE"
                return (
                  <button key={spot.id} onClick={() => handleSpotClick(spot.id)} disabled={!isClickable}
                    className={cn(
                      "relative flex h-12 flex-col items-center justify-center rounded-xl border-2 transition-all",
                      isClickable ? "cursor-pointer hover:scale-105 hover:shadow-md active:scale-95" : "cursor-not-allowed opacity-60",
                      spot.status === "FREE"     && "border-green-400  bg-green-50   dark:bg-green-900/30",
                      spot.status === "BOOKED"   && "border-blue-400   bg-blue-50    dark:bg-blue-900/30",
                      spot.status === "OCCUPIED" && "border-gray-300   bg-gray-50    dark:bg-gray-700/50",
                      spot.status === "RESERVED" && "border-orange-400 bg-orange-50  dark:bg-orange-900/30",
                      spot.status === "REPAIR"   && "border-red-400    bg-red-50     dark:bg-red-900/30"
                    )}>
                    <Icon className={cn("h-3 w-3", cfg.color)} />
                    <span className="mt-0.5 text-[9px] font-bold text-gray-700 dark:text-gray-200">{spot.number}</span>
                    {spot.status === "FREE" && (
                      <div className="absolute bottom-1 w-1.5 h-1.5 bg-green-500 rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 z-50 shadow-lg" style={{ height: "64px" }}>
        <div className="flex justify-around items-center px-4 h-full">
          {navItems.map(item => (
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
