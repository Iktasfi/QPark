"use client"

import { useState, useEffect } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { MapPin, Car, Clock, AlertTriangle, CreditCard, Camera } from "lucide-react"

export function ActiveBookingScreen() {
  const { activeBooking, selectedSpot, user, setCurrentScreen, setActiveBooking, updateSpot, setUser } = useParking()
  const [timer, setTimer] = useState(15 * 60) // 15 minutes in seconds
  const [isArrived, setIsArrived] = useState(false)
  const [parkingDuration, setParkingDuration] = useState(0)
  const [isPaying, setIsPaying] = useState(false)
  
  const selectedCar = user?.cars.find(c => c.plateNumber === activeBooking?.plateNumber)
  const isLongTerm = selectedSpot?.type === "long-term"
  
  // Countdown timer for arrival
  useEffect(() => {
    if (!isArrived && !isLongTerm && timer > 0) {
      const interval = setInterval(() => {
        setTimer(prev => prev - 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [timer, isArrived, isLongTerm])
  
  // Parking duration timer
  useEffect(() => {
    if (isArrived && !isLongTerm) {
      const interval = setInterval(() => {
        setParkingDuration(prev => prev + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isArrived, isLongTerm])
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  
  const calculateCost = () => {
    if (isLongTerm) return 0 // Already paid
    const minutes = Math.ceil(parkingDuration / 60)
    if (minutes <= 60) return 150 // First hour minimum
    const extraMinutes = minutes - 60
    return 150 + (extraMinutes * 3)
  }
  
  const simulateArrival = () => {
    setIsArrived(true)
    if (selectedSpot) {
      updateSpot(selectedSpot.id, { status: "OCCUPIED" })
    }
  }
  
  const handlePayAndExit = () => {
    if (!user) return
    
    setIsPaying(true)
    const cost = calculateCost()
    
    setTimeout(() => {
      // Update user balance
      setUser({
        ...user,
        balance: user.balance - cost,
        transactions: [
          { 
            id: `t-${Date.now()}`, 
            type: "parking_charge", 
            amount: -cost, 
            description: `Parking ${activeBooking?.spotId}`, 
            date: new Date() 
          },
          ...user.transactions
        ]
      })
      
      // Clear booking
      if (selectedSpot) {
        updateSpot(selectedSpot.id, { status: "FREE", bookedBy: undefined, plateNumber: undefined })
      }
      setActiveBooking(null)
      setCurrentScreen("home")
      setIsPaying(false)
    }, 1500)
  }
  
  const handleCancelBooking = () => {
    if (selectedSpot) {
      updateSpot(selectedSpot.id, { status: "FREE", bookedBy: undefined, plateNumber: undefined })
    }
    setActiveBooking(null)
    setCurrentScreen("home")
  }
  
  if (!activeBooking) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Car className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">No active booking</p>
        <Button onClick={() => setCurrentScreen("map")} className="bg-[#354469] hover:bg-[#354469]/90">Find Parking</Button>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="w-16" /> {/* Left spacer */}
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-foreground">Active Booking</h1>
          <p className="text-sm text-muted-foreground">
            {isLongTerm ? "Long-term reservation" : "Short-term parking"}
          </p>
        </div>
        <div className="w-16 flex justify-end">
          <Badge 
            variant={isArrived ? "default" : "secondary"}
            className={isArrived ? "bg-[oklch(var(--status-occupied))]" : ""}
          >
            {isArrived ? "Parked" : "En Route"}
          </Badge>
        </div>
      </div>
      
      {/* Timer Card */}
      {!isLongTerm && !isArrived && (
        <Card className={timer < 300 ? "border-destructive bg-destructive/5" : "border-red-200 bg-red-50"}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {timer < 300 ? (
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                ) : (
                  <Clock className="h-8 w-8 text-red-600" />
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Time to arrive</p>
                  <p className="text-3xl font-bold text-foreground">{formatTime(timer)}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="hover:bg-[#36549B]/10 hover:border-[#36549B] hover:text-[#36549B]" onClick={simulateArrival}>
                Simulate Arrival
              </Button>
            </div>
            {timer < 300 && (
              <p className="mt-2 text-sm text-destructive">
                Hurry! Your booking will expire soon.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Parking Duration (when arrived) */}
      {!isLongTerm && isArrived && (
        <Card className="border-[#36549B] bg-[#36549B]/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-[#36549B]" />
                <div>
                  <p className="text-sm text-muted-foreground">Parking Duration</p>
                  <p className="text-3xl font-bold text-foreground">{formatTime(parkingDuration)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Current Cost</p>
                <p className="text-2xl font-bold text-[#36549B]">{calculateCost()} &#8376;</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Long-term Rental Info */}
      {isLongTerm && (
        <Card className="border-[oklch(var(--status-reserved))] bg-[oklch(var(--status-reserved)/0.05)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-[oklch(var(--status-reserved))]" />
                <div>
                  <p className="text-sm text-muted-foreground">Rental Period</p>
                  <p className="text-xl font-bold text-foreground">{activeBooking.rentalDays} days remaining</p>
                </div>
              </div>
              <Badge variant="outline">Paid</Badge>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Booking Details */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <MapPin className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Parking Spot</p>
              <p className="text-lg font-bold text-foreground">{activeBooking.spotId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <Car className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vehicle</p>
              <p className="font-medium text-foreground">
                {selectedCar?.brand} {selectedCar?.model}
              </p>
              <p className="text-sm text-muted-foreground">{activeBooking.plateNumber}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <Camera className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Entry Method</p>
              <p className="font-medium text-foreground">LPR Camera</p>
              <p className="text-xs text-muted-foreground">Automatic plate recognition</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Cost Summary (Short-term) */}
      {!isLongTerm && isArrived && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-medium text-foreground">Cost Breakdown</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">First hour (minimum)</span>
                <span className="text-foreground">150 &#8376;</span>
              </div>
              {parkingDuration > 3600 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Extra time ({Math.ceil((parkingDuration - 3600) / 60)} min)</span>
                  <span className="text-foreground">{Math.ceil((parkingDuration - 3600) / 60) * 3} &#8376;</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-medium">
                <span className="text-foreground">Total</span>
                <span className="text-[#36549B]">{calculateCost()} &#8376;</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Actions */}
      <div className="space-y-2 mt-2">
        {isArrived && !isLongTerm && (
          <Button 
            size="lg" 
            className="w-full gap-2 bg-[#354469] hover:bg-[#354469]/90"
            onClick={handlePayAndExit}
            disabled={isPaying}
          >
            <CreditCard className="h-5 w-5" />
            {isPaying ? "Processing..." : `Pay ${calculateCost()} ₸ & Exit`}
          </Button>
        )}
        
        {!isArrived && !isLongTerm && (
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full hover:bg-[#36549B]/10 hover:border-[#36549B] hover:text-[#36549B]"
            onClick={handleCancelBooking}
          >
            Cancel Booking
          </Button>
        )}
        
        {isLongTerm && (
          <Button variant="outline" size="lg" className="w-full hover:bg-[#36549B]/10 hover:border-[#36549B] hover:text-[#36549B]">
            Extend Rental
          </Button>
        )}
      </div>
      
      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-300 z-50 shadow-lg" style={{ borderTop: '1px solid #D1D5DB' }}>
        <div className="flex justify-around items-center h-full px-4">
          {[
            { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: "Home", active: false },
            { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: "Map", active: false },
            { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: "Booking", active: true },
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
