"use client"

import { useParking } from "@/lib/parking-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MapPin, Clock, Sparkles, ChevronRight, Car } from "lucide-react"

export function HomeScreen() {
  const { user, spots, setCurrentScreen, activeBooking } = useParking()
  
  const freeShortTerm = spots.filter(s => s.type === "short-term" && s.status === "FREE").length
  const freeLongTerm = spots.filter(s => s.type === "long-term" && s.status === "FREE").length
  
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-xl font-bold text-foreground">{user?.name || "Guest"}</h1>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <span className="text-sm font-bold">{user?.name?.charAt(0) || "G"}</span>
        </div>
      </div>
      
      {/* Balance Card */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-80">Wallet Balance</p>
              <p className="text-3xl font-bold">{user?.balance?.toLocaleString() || 0} &#8376;</p>
            </div>
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => setCurrentScreen("wallet")}
              className="bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30"
            >
              Top Up
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm opacity-80">
            <Sparkles className="h-4 w-4" />
            <span>{user?.bonusPoints || 0} bonus points</span>
          </div>
        </CardContent>
      </Card>
      
      {/* Active Booking Alert */}
      {activeBooking && (
        <Card 
          className="cursor-pointer border-accent bg-accent/10"
          onClick={() => setCurrentScreen("active-booking")}
        >
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Clock className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Active Booking</p>
              <p className="text-sm text-muted-foreground">Spot {activeBooking.spotId} - Tap to view</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      )}
      
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setCurrentScreen("map")}>
          <CardContent className="p-4">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(var(--status-free)/0.15)]">
              <MapPin className="h-5 w-5 text-[oklch(var(--status-free))]" />
            </div>
            <p className="text-2xl font-bold text-foreground">{freeShortTerm}</p>
            <p className="text-sm text-muted-foreground">Short-term spots</p>
          </CardContent>
        </Card>
        
        <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setCurrentScreen("map")}>
          <CardContent className="p-4">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(var(--status-reserved)/0.15)]">
              <Clock className="h-5 w-5 text-[oklch(var(--status-reserved))]" />
            </div>
            <p className="text-2xl font-bold text-foreground">{freeLongTerm}</p>
            <p className="text-sm text-muted-foreground">Long-term spots</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Quick Actions */}
      <div className="mt-2">
        <h2 className="mb-3 text-lg font-semibold text-foreground">Quick Actions</h2>
        <div className="space-y-2">
          <Card 
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setCurrentScreen("map")}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">Book Now</p>
                <p className="text-sm text-muted-foreground">Find available parking</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
          
          <Card 
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setCurrentScreen("profile")}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                <Car className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">My Vehicles</p>
                <p className="text-sm text-muted-foreground">{user?.cars.length || 0} registered</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Promo Banner */}
      {user?.promoCode && (
        <Card className="mt-2 bg-accent/10 border-accent/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-accent" />
              <div>
                <p className="font-medium text-foreground">First Parking Free!</p>
                <p className="text-sm text-muted-foreground">Use code FIRST for 150&#8376; off</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
