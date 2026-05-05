"use client"

import { useParking } from "@/lib/parking-context"
import { Map, Wallet, User, Clock, Home } from "lucide-react"
import { cn } from "@/lib/utils"

interface MobileShellProps {
  children: React.ReactNode
}

export function MobileShell({ children }: MobileShellProps) {
  const { currentScreen, setCurrentScreen, activeBooking } = useParking()
  
  const navItems = [
    { id: "home", icon: Home, label: "Home" },
    { id: "map", icon: Map, label: "Map" },
    { id: "booking", icon: Clock, label: "Booking", badge: activeBooking ? true : false },
    { id: "wallet", icon: Wallet, label: "Wallet" },
    { id: "profile", icon: User, label: "Profile" },
  ]
  
  return (
    <div className="relative mx-auto h-[844px] w-[390px] overflow-hidden rounded-[3rem] border-[12px] border-foreground/90 bg-background shadow-2xl">
      {/* Status bar */}
      <div className="flex h-12 items-center justify-between bg-card px-6 text-sm">
        <span className="font-medium">9:41</span>
        <div className="absolute left-1/2 top-3 h-6 w-28 -translate-x-1/2 rounded-full bg-foreground/90" />
        <div className="flex items-center gap-1">
          <div className="h-3 w-4 rounded-sm border border-foreground/70">
            <div className="ml-0.5 mt-0.5 h-2 w-2.5 rounded-sm bg-foreground/70" />
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="h-[calc(100%-48px-80px)] overflow-y-auto bg-background">
        {children}
      </div>
      
      {/* Bottom navigation */}
      <div className="absolute bottom-0 left-0 right-0 flex h-20 items-center justify-around border-t border-border bg-card px-2 pb-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentScreen === item.id || 
            (item.id === "map" && (currentScreen === "spot-details" || currentScreen === "booking-confirm")) ||
            (item.id === "booking" && currentScreen === "active-booking")
          
          return (
            <button
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-xl px-4 py-2 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-medium">{item.label}</span>
              {item.badge && (
                <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-accent" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
