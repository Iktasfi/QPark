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
    <div className="flex flex-col items-center gap-6 p-4 pt-8">
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
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Parking Spot</p>
              <p className="text-lg font-bold text-foreground">{activeBooking?.spotId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Car className="h-6 w-6 text-primary" />
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
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                <Clock className="h-6 w-6 text-accent" />
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
            <Camera className="h-6 w-6 text-primary" />
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
          className="w-full" 
          size="lg"
          onClick={() => setCurrentScreen("active-booking")}
        >
          View Active Booking
        </Button>
        <Button 
          variant="outline" 
          className="w-full" 
          size="lg"
          onClick={() => setCurrentScreen("home")}
        >
          Back to Home
        </Button>
      </div>
    </div>
  )
}
