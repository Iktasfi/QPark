"use client"

import { useEffect, useState } from "react"
import { useParking } from "@/lib/parking-context"
import { Map, Wallet, User, Clock, Home } from "lucide-react"
import { cn } from "@/lib/utils"

interface MobileShellProps {
  children: React.ReactNode
}

export function MobileShell({ children }: MobileShellProps) {
  const { currentScreen, setCurrentScreen, activeBooking } = useParking()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const touch = navigator.maxTouchPoints > 0
    const small = window.innerWidth <= 480
    setIsMobile(touch && small)
  }, [])

  const navItems = [
    { id: "home", icon: Home, label: "Home" },
    { id: "map", icon: Map, label: "Map" },
    { id: "booking", icon: Clock, label: "Booking", badge: activeBooking ? true : false },
    { id: "wallet", icon: Wallet, label: "Wallet" },
    { id: "profile", icon: User, label: "Profile" },
  ]

  if (isMobile) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-background">
        {children}
      </div>
    )
  }

  return (
    <div className="relative mx-auto h-[844px] w-[390px] overflow-hidden rounded-[3rem] border-[12px] border-foreground/90 bg-background shadow-2xl">
      <div className="flex h-12 items-center justify-between bg-card px-6 text-sm">
        <span className="font-medium">9:41</span>
        <div className="absolute left-1/2 top-3 h-6 w-28 -translate-x-1/2 rounded-full bg-foreground/90" />
        <div className="flex items-center gap-1">
          <div className="h-3 w-4 rounded-sm border border-foreground/70">
            <div className="ml-0.5 mt-0.5 h-2 w-2.5 rounded-sm bg-foreground/70" />
          </div>
        </div>
      </div>

      <div className="h-[calc(100%-48px)] overflow-y-auto bg-background">
        {children}
      </div>
    </div>
  )
}
