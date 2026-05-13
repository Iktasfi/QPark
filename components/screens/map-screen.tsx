"use client"

import { useParking, type SpotStatus } from "@/lib/parking-context"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Car, Wrench, Clock, Check, AlertCircle, ArrowLeft, Home, Map, Wallet, User } from "lucide-react"

const statusConfig: Record<SpotStatus, { 
  color: string; 
  bg: string; 
  icon: React.ComponentType<{ className?: string }>; 
  label: string 
}> = {
  FREE: { color: "text-green-600", bg: "bg-green-500", icon: Check, label: "Free" },
  BOOKED: { color: "text-blue-600", bg: "bg-blue-500", icon: Clock, label: "Booked" },
  OCCUPIED: { color: "text-gray-600", bg: "bg-gray-500", icon: Car, label: "Occupied" },
  RESERVED: { color: "text-orange-600", bg: "bg-orange-500", icon: AlertCircle, label: "Reserved" },
  REPAIR: { color: "text-red-600", bg: "bg-red-500", icon: Wrench, label: "Repair" },
}

export function MapScreen() {
  const { spots, setSelectedSpot, setCurrentScreen } = useParking()
  
  const shortTermSpots = spots.filter(s => s.type === "short-term")
  const longTermSpots = spots.filter(s => s.type === "long-term")
  
  const handleSpotClick = (spotId: string) => {
    const spot = spots.find(s => s.id === spotId)
    if (spot && spot.status === "FREE") {
      setSelectedSpot(spot)
      setCurrentScreen("spot-details")
    }
  }
  
  return (
    <div className="relative mx-auto max-w-md min-h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setCurrentScreen("home")}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900 drop-shadow-sm">Parking Map</h1>
            <p className="text-sm text-gray-600">Astana, Central Location - 30 spots</p>
          </div>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>
      </div>
      
      {/* Legend */}
      <div className="px-4 py-3 bg-white border-b">
        <div className="flex flex-wrap gap-2 justify-center">
          {Object.entries(statusConfig).map(([status, config]) => (
            <Badge 
              key={status} 
              variant="outline" 
              className="gap-1.5 px-3 py-1.5 text-xs border-gray-300 rounded-full"
            >
              <config.icon className="h-3 w-3" />
              <span>{config.label}</span>
            </Badge>
          ))}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="px-4 py-4 pb-24 space-y-6">
        {/* Short-term Section */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Short-term (SP-01 to SP-15)</h2>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">150₸/hr</Badge>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {shortTermSpots.map((spot) => {
              const config = statusConfig[spot.status]
              const Icon = config.icon
              const isClickable = spot.status === "FREE"
              
              return (
                <button
                  key={spot.id}
                  onClick={() => handleSpotClick(spot.id)}
                  disabled={!isClickable}
                  className={cn(
                    "relative flex h-12 flex-col items-center justify-center rounded-lg border transition-all",
                    isClickable && "cursor-pointer hover:scale-105 hover:shadow-md",
                    !isClickable && "cursor-not-allowed opacity-70",
                    spot.status === "FREE" && "border-green-500 bg-green-50",
                    spot.status === "BOOKED" && "border-blue-500 bg-blue-50",
                    spot.status === "OCCUPIED" && "border-gray-500 bg-gray-50",
                    spot.status === "RESERVED" && "border-orange-500 bg-orange-50",
                    spot.status === "REPAIR" && "border-red-500 bg-red-50"
                  )}
                >
                  <Icon className={cn("h-3 w-3", config.color)} />
                  <span className="mt-0.5 text-[9px] font-medium text-gray-800">{spot.number}</span>
                  {spot.status === "FREE" && (
                    <div className="absolute bottom-0.5 w-1 h-1 bg-green-500 rounded-full" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
        
        {/* Long-term Section */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Long-term (SP-16 to SP-30)</h2>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">700₸/day</Badge>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {longTermSpots.map((spot) => {
              const config = statusConfig[spot.status]
              const Icon = config.icon
              const isClickable = spot.status === "FREE"
              
              return (
                <button
                  key={spot.id}
                  onClick={() => handleSpotClick(spot.id)}
                  disabled={!isClickable}
                  className={cn(
                    "relative flex h-12 flex-col items-center justify-center rounded-lg border transition-all",
                    isClickable && "cursor-pointer hover:scale-105 hover:shadow-md",
                    !isClickable && "cursor-not-allowed opacity-70",
                    spot.status === "FREE" && "border-green-500 bg-green-50",
                    spot.status === "BOOKED" && "border-blue-500 bg-blue-50",
                    spot.status === "OCCUPIED" && "border-gray-500 bg-gray-50",
                    spot.status === "RESERVED" && "border-orange-500 bg-orange-50",
                    spot.status === "REPAIR" && "border-red-500 bg-red-50"
                  )}
                >
                  <Icon className={cn("h-3 w-3", config.color)} />
                  <span className="mt-0.5 text-[9px] font-medium text-gray-800">{spot.number}</span>
                  {spot.status === "FREE" && (
                    <div className="absolute bottom-0.5 w-1 h-1 bg-green-500 rounded-full" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      
      {/* Bottom Navigation - ONLY ONE */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-300 z-50 shadow-lg" style={{ borderTop: '1px solid #D1D5DB' }}>
        <div className="flex justify-around items-center h-full px-4">
          {[
            { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: "Home", active: false },
            { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: "Map", active: true },
            { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: "Booking", active: false },
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
