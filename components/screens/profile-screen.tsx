"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { User, Car, Phone, AlertTriangle, Plus, Trash2, Shield, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProfileScreen() {
  const { user, setUser, setIsAdminMode, setCurrentScreen } = useParking()
  const [isAddingCar, setIsAddingCar] = useState(false)
  const [newCar, setNewCar] = useState({ brand: "", model: "", plateNumber: "" })
  
  const handleAddCar = () => {
    if (!user || !newCar.brand || !newCar.model || !newCar.plateNumber) return
    
    setUser({
      ...user,
      cars: [
        ...user.cars,
        {
          id: `car-${Date.now()}`,
          brand: newCar.brand,
          model: newCar.model,
          plateNumber: newCar.plateNumber,
        }
      ]
    })
    
    setNewCar({ brand: "", model: "", plateNumber: "" })
    setIsAddingCar(false)
  }
  
  const handleRemoveCar = (carId: string) => {
    if (!user) return
    setUser({
      ...user,
      cars: user.cars.filter(c => c.id !== carId)
    })
  }
  
  const handleAdminMode = () => {
    setIsAdminMode(true)
    setCurrentScreen("admin")
  }
  
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account</p>
      </div>
      
      {/* User Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <span className="text-2xl font-bold">{user?.name?.charAt(0) || "G"}</span>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{user?.name || "Guest"}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span>{user?.phone || "Not set"}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* No-Show Counter */}
      <Card className={cn(
        user?.noShowCount && user.noShowCount >= 4 ? "border-destructive bg-destructive/5" : ""
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                user?.noShowCount && user.noShowCount >= 4 ? "bg-destructive/20" : "bg-secondary"
              )}>
                <AlertTriangle className={cn(
                  "h-5 w-5",
                  user?.noShowCount && user.noShowCount >= 4 ? "text-destructive" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className="font-medium text-foreground">No-Show Counter</p>
                <p className="text-sm text-muted-foreground">
                  {user?.noShowCount || 0} of 6 (ban at 6)
                </p>
              </div>
            </div>
            <Badge variant={user?.noShowCount && user.noShowCount >= 4 ? "destructive" : "secondary"}>
              {user?.noShowCount || 0}/6
            </Badge>
          </div>
          {user?.noShowCount && user.noShowCount >= 4 && (
            <p className="mt-2 text-sm text-destructive">
              Warning: {6 - user.noShowCount} more no-shows will result in a 3-day ban
            </p>
          )}
        </CardContent>
      </Card>
      
      {/* Vehicles */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-5 w-5" />
              My Vehicles
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsAddingCar(true)}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {user?.cars.map((car, index) => (
            <div key={car.id}>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-foreground">{car.brand} {car.model}</p>
                  <p className="text-sm text-muted-foreground">{car.plateNumber}</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => handleRemoveCar(car.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {index < user.cars.length - 1 && <Separator />}
            </div>
          ))}
          
          {/* Add Car Form */}
          {isAddingCar && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <Input
                placeholder="Brand (e.g., Toyota)"
                value={newCar.brand}
                onChange={(e) => setNewCar({ ...newCar, brand: e.target.value })}
              />
              <Input
                placeholder="Model (e.g., Camry)"
                value={newCar.model}
                onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
              />
              <Input
                placeholder="Plate Number (e.g., 123 ABC 01)"
                value={newCar.plateNumber}
                onChange={(e) => setNewCar({ ...newCar, plateNumber: e.target.value })}
              />
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setIsAddingCar(false)
                    setNewCar({ brand: "", model: "", plateNumber: "" })
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleAddCar}
                  disabled={!newCar.brand || !newCar.model || !newCar.plateNumber}
                >
                  Add Vehicle
                </Button>
              </div>
            </div>
          )}
          
          {(!user?.cars || user.cars.length === 0) && !isAddingCar && (
            <p className="py-4 text-center text-muted-foreground">No vehicles registered</p>
          )}
        </CardContent>
      </Card>
      
      {/* Admin Access (for demo) */}
      <Card className="bg-secondary/50">
        <CardContent className="p-4">
          <Button 
            variant="outline" 
            className="w-full gap-2"
            onClick={handleAdminMode}
          >
            <Shield className="h-5 w-5" />
            Open Admin Dashboard
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            For diploma demonstration only
          </p>
        </CardContent>
      </Card>
      
      {/* Logout */}
      <Button variant="outline" className="gap-2 text-destructive hover:text-destructive">
        <LogOut className="h-5 w-5" />
        Sign Out
      </Button>
    </div>
  )
}
