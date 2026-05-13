"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, MapPin, Clock, Calendar, Car, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const rentalOptions = [
  { days: 1, price: 700, perDay: 700 },
  { days: 3, price: 1800, perDay: 600 },
  { days: 5, price: 2700, perDay: 540 },
  { days: 7, price: 3500, perDay: 500 },
  { days: 14, price: 6000, perDay: 429 },
]

export function SpotDetailsScreen() {
  const { selectedSpot, user, setCurrentScreen, setActiveBooking, updateSpot } = useParking()
  const [selectedCar, setSelectedCar] = useState(user?.cars[0]?.id || "")
  const [selectedRentalDays, setSelectedRentalDays] = useState<number | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  
  if (!selectedSpot) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-muted-foreground">No spot selected</p>
      </div>
    )
  }
  
  const isLongTerm = selectedSpot.type === "long-term"
  const selectedCarData = user?.cars.find(c => c.id === selectedCar)
  
  const handleBookNow = () => {
    if (!selectedCarData || !user) return
    
    setIsBooking(true)
    
    // Simulate booking
    setTimeout(() => {
      const booking = {
        id: `booking-${Date.now()}`,
        spotId: selectedSpot.id,
        userId: user.id,
        plateNumber: selectedCarData.plateNumber,
        type: selectedSpot.type,
        status: "active" as const,
        startTime: new Date(),
        isPaid: false,
        waitingFee: 0,
        rentalDays: selectedRentalDays || undefined,
      }
      
      setActiveBooking(booking)
      updateSpot(selectedSpot.id, { 
        status: isLongTerm ? "RESERVED" : "BOOKED",
        bookedBy: user.id,
        plateNumber: selectedCarData.plateNumber,
        bookedAt: new Date(),
      })
      
      setIsBooking(false)
      setCurrentScreen("booking-confirm")
    }, 1500)
  }
  
  const getRentalPrice = () => {
    if (!isLongTerm) return 150 // First hour minimum
    const option = rentalOptions.find(o => o.days === selectedRentalDays)
    return option?.price || 0
  }
  
  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setCurrentScreen("map")}
          className="h-10 w-10 hover:bg-[#354469]/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-foreground">Spot {selectedSpot.id}</h1>
          <p className="text-sm text-muted-foreground">
            {isLongTerm ? "Long-term rental" : "Short-term booking"}
          </p>
        </div>
        <div className="w-10" /> {/* Spacer for centering */}
      </div>
      
      {/* Spot Info Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[oklch(var(--status-free)/0.15)]">
                <MapPin className="h-7 w-7 text-[oklch(var(--status-free))]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{selectedSpot.id}</p>
                <Badge variant="secondary">
                  {isLongTerm ? "Long-term" : "Short-term"}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Starting from</p>
              <p className="text-xl font-bold text-[#36549B]">
                {isLongTerm ? "700" : "150"} &#8376;
              </p>
              <p className="text-xs text-muted-foreground">
                {isLongTerm ? "per day" : "first hour"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Select Vehicle */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="h-5 w-5" />
            Select Vehicle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {user?.cars.map((car) => (
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
          ))}
        </CardContent>
      </Card>
      
      {/* Rental Period (Long-term only) */}
      {isLongTerm && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5" />
              Rental Period
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
                    {option.days} {option.days === 1 ? "day" : "days"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {option.perDay} &#8376;/day
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#36549B]">{option.price.toLocaleString()} &#8376;</p>
                  {selectedRentalDays === option.days && (
                    <Badge variant="outline" className="mt-1">Selected</Badge>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
      
      {/* Short-term Info */}
      {!isLongTerm && (
        <Card className="bg-secondary/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-[#36549B]" />
              <h3 className="font-medium text-foreground">Pricing</h3>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>First hour: 150 &#8376; (minimum)</li>
              <li>After first hour: 3 &#8376;/minute</li>
              <li>15 min arrival window (free)</li>
              <li>Extended waiting: +75 &#8376; for 30 min</li>
            </ul>
          </CardContent>
        </Card>
      )}
      
      {/* Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Spot</span>
              <span className="font-medium text-foreground">{selectedSpot.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vehicle</span>
              <span className="font-medium text-foreground">{selectedCarData?.plateNumber || "-"}</span>
            </div>
            {isLongTerm && selectedRentalDays && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Period</span>
                <span className="font-medium text-foreground">{selectedRentalDays} days</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between">
              <span className="font-medium text-foreground">
                {isLongTerm ? "Total" : "Starting from"}
              </span>
              <span className="text-lg font-bold text-[#36549B]">
                {getRentalPrice().toLocaleString()} &#8376;
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Book Button */}
      <Button 
        size="lg" 
        className="w-full bg-[#354469] hover:bg-[#354469]/90"
        onClick={handleBookNow}
        disabled={!selectedCar || (isLongTerm && !selectedRentalDays) || isBooking}
      >
        {isBooking ? "Booking..." : isLongTerm ? "Reserve & Pay Now" : "Book Now"}
      </Button>
    
    {/* Bottom Navigation */}
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
