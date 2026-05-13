"use client"

import { useParking } from "@/lib/parking-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, MapPin, Car, Clock, Camera } from "lucide-react"

export function BookingConfirmScreen() {
  const { activeBooking, selectedSpot, user, setCurrentScreen } = useParking()
  
  const selectedCar = user?.cars.find(c => c.plateNumber === activeBooking?.plateNumber)
  const isLongTerm = selectedSpot?.type === "long-term"
  
  return (
    <div className="flex flex-col items-center gap-6 p-4 pt-8 pb-24">
      {/* Success Icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[oklch(var(--status-free)/0.15)]">
        <CheckCircle2 className="h-12 w-12 text-[oklch(var(--status-free))]" />
      </div>
      
      {/* Title */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {isLongTerm ? "Reservation Confirmed!" : "Booking Confirmed!"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {isLongTerm 
            ? "Your spot is now reserved" 
            : "You have 15 minutes to arrive"
          }
        </p>
      </div>
      
      {/* Booking Details Card */}
      <Card className="w-full">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#354469]/10">
              <MapPin className="h-6 w-6 text-[#354469]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Parking Spot</p>
              <p className="text-lg font-bold text-foreground">{activeBooking?.spotId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#354469]/10">
              <Car className="h-6 w-6 text-[#354469]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Vehicle</p>
              <p className="font-medium text-foreground">
                {selectedCar?.brand} {selectedCar?.model}
              </p>
              <p className="text-sm text-muted-foreground">{activeBooking?.plateNumber}</p>
            </div>
          </div>
          
          {!isLongTerm && (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                <Clock className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Arrival Deadline</p>
                <p className="font-medium text-foreground">15:00 remaining</p>
                <p className="text-xs text-muted-foreground">Arrive within 15 minutes</p>
              </div>
            </div>
          )}
          
          {isLongTerm && activeBooking?.rentalDays && (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[oklch(var(--status-reserved)/0.15)]">
                <Clock className="h-6 w-6 text-[oklch(var(--status-reserved))]" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rental Period</p>
                <p className="font-medium text-foreground">{activeBooking.rentalDays} days</p>
                <p className="text-xs text-muted-foreground">Unlimited entries & exits</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* LPR Info */}
      <Card className="w-full bg-secondary/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Camera className="h-6 w-6 text-[#354469]" />
            <div>
              <p className="font-medium text-foreground">LPR Entry</p>
              <p className="text-sm text-muted-foreground">
                Drive to the entrance - the camera will read your plate and open the barrier automatically
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Actions */}
      <div className="w-full space-y-2">
        <Button 
          className="w-full bg-[#354469] hover:bg-[#354469]/90" 
          size="lg"
          onClick={() => setCurrentScreen("active-booking")}
        >
          View Active Booking
        </Button>
        <Button 
          variant="outline" 
          className="w-full hover:bg-[#354469]/10 hover:border-[#354469] hover:text-[#354469]" 
          size="lg"
          onClick={() => setCurrentScreen("home")}
        >
          Back to Home
        </Button>
      </div>
      
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
