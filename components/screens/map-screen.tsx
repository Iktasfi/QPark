"use client"

import { useParking, type SpotStatus } from "@/lib/parking-context"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Car, Wrench, Clock, Check, AlertCircle } from "lucide-react"

const statusConfig: Record<SpotStatus, { color: string; bg: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  FREE: { color: "text-[oklch(var(--status-free))]", bg: "bg-[oklch(var(--status-free))]", icon: Check, label: "Free" },
  BOOKED: { color: "text-[oklch(var(--status-booked))]", bg: "bg-[oklch(var(--status-booked))]", icon: Clock, label: "Booked" },
  OCCUPIED: { color: "text-[oklch(var(--status-occupied))]", bg: "bg-[oklch(var(--status-occupied))]", icon: Car, label: "Occupied" },
  RESERVED: { color: "text-[oklch(var(--status-reserved))]", bg: "bg-[oklch(var(--status-reserved))]", icon: AlertCircle, label: "Reserved" },
  REPAIR: { color: "text-[oklch(var(--status-repair))]", bg: "bg-[oklch(var(--status-repair))]", icon: Wrench, label: "Repair" },
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
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Parking Map</h1>
        <p className="text-sm text-muted-foreground">Astana, Central Location - 30 spots</p>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusConfig).map(([status, config]) => (
          <Badge key={status} variant="outline" className="gap-1.5 px-2 py-1">
            <span className={cn("h-2 w-2 rounded-full", config.bg)} />
            <span className="text-xs">{config.label}</span>
          </Badge>
        ))}
      </div>
      
      {/* Short-term Section */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Short-term (SP-01 to SP-15)</h2>
            <Badge variant="secondary">150&#8376;/hr</Badge>
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
                    "relative flex h-14 flex-col items-center justify-center rounded-lg border-2 transition-all",
                    isClickable && "cursor-pointer hover:scale-105 hover:shadow-md",
                    !isClickable && "cursor-not-allowed opacity-70",
                    spot.status === "FREE" && "border-[oklch(var(--status-free))] bg-[oklch(var(--status-free)/0.1)]",
                    spot.status === "BOOKED" && "border-[oklch(var(--status-booked))] bg-[oklch(var(--status-booked)/0.1)]",
                    spot.status === "OCCUPIED" && "border-[oklch(var(--status-occupied))] bg-[oklch(var(--status-occupied)/0.1)]",
                    spot.status === "RESERVED" && "border-[oklch(var(--status-reserved))] bg-[oklch(var(--status-reserved)/0.1)]",
                    spot.status === "REPAIR" && "border-[oklch(var(--status-repair))] bg-[oklch(var(--status-repair)/0.1)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4", config.color)} />
                  <span className="mt-0.5 text-[10px] font-medium text-foreground">{spot.number}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
      
      {/* Long-term Section */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Long-term (SP-16 to SP-30)</h2>
            <Badge variant="secondary">700&#8376;/day</Badge>
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
                    "relative flex h-14 flex-col items-center justify-center rounded-lg border-2 transition-all",
                    isClickable && "cursor-pointer hover:scale-105 hover:shadow-md",
                    !isClickable && "cursor-not-allowed opacity-70",
                    spot.status === "FREE" && "border-[oklch(var(--status-free))] bg-[oklch(var(--status-free)/0.1)]",
                    spot.status === "BOOKED" && "border-[oklch(var(--status-booked))] bg-[oklch(var(--status-booked)/0.1)]",
                    spot.status === "OCCUPIED" && "border-[oklch(var(--status-occupied))] bg-[oklch(var(--status-occupied)/0.1)]",
                    spot.status === "RESERVED" && "border-[oklch(var(--status-reserved))] bg-[oklch(var(--status-reserved)/0.1)]",
                    spot.status === "REPAIR" && "border-[oklch(var(--status-repair))] bg-[oklch(var(--status-repair)/0.1)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4", config.color)} />
                  <span className="mt-0.5 text-[10px] font-medium text-foreground">{spot.number}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>
      
      {/* Info Card */}
      <Card className="bg-secondary/50">
        <CardContent className="p-4">
          <h3 className="mb-2 font-medium text-foreground">How it works</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
              <span>Tap a green spot to book</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
              <span>LPR camera reads your plate - no QR codes</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
              <span>Pay from your wallet on exit</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
