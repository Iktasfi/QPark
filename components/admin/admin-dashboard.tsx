"use client"

import { useState } from "react"
import { useParking, type SpotStatus } from "@/lib/parking-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { 
  Map, Users, CreditCard, Settings, ArrowLeft, Car, 
  Check, Clock, AlertCircle, Wrench, LogIn, LogOut,
  DollarSign, TrendingUp, Activity
} from "lucide-react"
import { cn } from "@/lib/utils"

const statusConfig: Record<SpotStatus, { color: string; bg: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
  FREE: { color: "text-[oklch(var(--status-free))]", bg: "bg-[oklch(var(--status-free))]", icon: Check, label: "Free" },
  BOOKED: { color: "text-[oklch(var(--status-booked))]", bg: "bg-[oklch(var(--status-booked))]", icon: Clock, label: "Booked" },
  OCCUPIED: { color: "text-[oklch(var(--status-occupied))]", bg: "bg-[oklch(var(--status-occupied))]", icon: Car, label: "Occupied" },
  RESERVED: { color: "text-[oklch(var(--status-reserved))]", bg: "bg-[oklch(var(--status-reserved))]", icon: AlertCircle, label: "Reserved" },
  REPAIR: { color: "text-[oklch(var(--status-repair))]", bg: "bg-[oklch(var(--status-repair))]", icon: Wrench, label: "Repair" },
}

export function AdminDashboard() {
  const { spots, updateSpot, setIsAdminMode, setCurrentScreen } = useParking()
  const [simulatePlate, setSimulatePlate] = useState("")
  const [selectedSpotForAction, setSelectedSpotForAction] = useState<string | null>(null)
  
  const freeSpots = spots.filter(s => s.status === "FREE").length
  const occupiedSpots = spots.filter(s => s.status === "OCCUPIED").length
  const bookedSpots = spots.filter(s => s.status === "BOOKED").length
  const reservedSpots = spots.filter(s => s.status === "RESERVED").length
  
  const handleSimulateEntry = () => {
    if (!simulatePlate) return
    
    // Find a booked or reserved spot with this plate
    const spot = spots.find(s => 
      s.plateNumber === simulatePlate && 
      (s.status === "BOOKED" || s.status === "RESERVED")
    )
    
    if (spot) {
      updateSpot(spot.id, { status: "OCCUPIED" })
      alert(`Entry simulated for ${simulatePlate} at spot ${spot.id}`)
    } else {
      alert("No booking found for this plate number")
    }
    setSimulatePlate("")
  }
  
  const handleSimulateExit = () => {
    if (!simulatePlate) return
    
    const spot = spots.find(s => 
      s.plateNumber === simulatePlate && 
      s.status === "OCCUPIED"
    )
    
    if (spot) {
      const newStatus = spot.type === "long-term" ? "RESERVED" : "FREE"
      updateSpot(spot.id, { 
        status: newStatus as SpotStatus,
        ...(newStatus === "FREE" ? { plateNumber: undefined, bookedBy: undefined } : {})
      })
      alert(`Exit simulated for ${simulatePlate} from spot ${spot.id}`)
    } else {
      alert("No occupied spot found for this plate number")
    }
    setSimulatePlate("")
  }
  
  const handleChangeStatus = (spotId: string, newStatus: SpotStatus) => {
    updateSpot(spotId, { 
      status: newStatus,
      ...(newStatus === "FREE" ? { plateNumber: undefined, bookedBy: undefined } : {})
    })
    setSelectedSpotForAction(null)
  }
  
  const handleBackToApp = () => {
    setIsAdminMode(false)
    setCurrentScreen("home")
  }
  
  return (
    <div className="min-h-screen bg-sidebar p-4 text-sidebar-foreground lg:p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleBackToApp}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-sidebar-foreground/60">Smart Parking Kazakhstan - Management Panel</p>
            </div>
          </div>
          <Badge variant="outline" className="border-sidebar-border">
            Demo Mode
          </Badge>
        </div>
        
        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="bg-sidebar-accent border-sidebar-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-sidebar-foreground/60">Free Spots</p>
                  <p className="text-3xl font-bold text-[oklch(var(--status-free))]">{freeSpots}</p>
                </div>
                <Check className="h-8 w-8 text-[oklch(var(--status-free))]" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-sidebar-accent border-sidebar-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-sidebar-foreground/60">Occupied</p>
                  <p className="text-3xl font-bold text-[oklch(var(--status-occupied))]">{occupiedSpots}</p>
                </div>
                <Car className="h-8 w-8 text-[oklch(var(--status-occupied))]" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-sidebar-accent border-sidebar-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-sidebar-foreground/60">Booked</p>
                  <p className="text-3xl font-bold text-[oklch(var(--status-booked))]">{bookedSpots}</p>
                </div>
                <Clock className="h-8 w-8 text-[oklch(var(--status-booked))]" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-sidebar-accent border-sidebar-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-sidebar-foreground/60">Reserved</p>
                  <p className="text-3xl font-bold text-[oklch(var(--status-reserved))]">{reservedSpots}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-[oklch(var(--status-reserved))]" />
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Main Content */}
        <Tabs defaultValue="map" className="space-y-4">
          <TabsList className="bg-sidebar-accent">
            <TabsTrigger value="map" className="gap-2 data-[state=active]:bg-sidebar-primary data-[state=active]:text-sidebar-primary-foreground">
              <Map className="h-4 w-4" />
              Parking Map
            </TabsTrigger>
            <TabsTrigger value="lpr" className="gap-2 data-[state=active]:bg-sidebar-primary data-[state=active]:text-sidebar-primary-foreground">
              <Car className="h-4 w-4" />
              LPR Simulation
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2 data-[state=active]:bg-sidebar-primary data-[state=active]:text-sidebar-primary-foreground">
              <TrendingUp className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-sidebar-primary data-[state=active]:text-sidebar-primary-foreground">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
          </TabsList>
          
          {/* Parking Map Tab */}
          <TabsContent value="map" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Short-term */}
              <Card className="bg-sidebar-accent border-sidebar-border">
                <CardHeader>
                  <CardTitle className="text-sidebar-foreground">Short-term Spots (SP-01 to SP-15)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2">
                    {spots.filter(s => s.type === "short-term").map((spot) => {
                      const config = statusConfig[spot.status]
                      const Icon = config.icon
                      
                      return (
                        <button
                          key={spot.id}
                          onClick={() => setSelectedSpotForAction(selectedSpotForAction === spot.id ? null : spot.id)}
                          className={cn(
                            "relative flex h-16 flex-col items-center justify-center rounded-lg border-2 transition-all",
                            selectedSpotForAction === spot.id && "ring-2 ring-sidebar-primary",
                            spot.status === "FREE" && "border-[oklch(var(--status-free))] bg-[oklch(var(--status-free)/0.1)]",
                            spot.status === "BOOKED" && "border-[oklch(var(--status-booked))] bg-[oklch(var(--status-booked)/0.1)]",
                            spot.status === "OCCUPIED" && "border-[oklch(var(--status-occupied))] bg-[oklch(var(--status-occupied)/0.1)]",
                            spot.status === "RESERVED" && "border-[oklch(var(--status-reserved))] bg-[oklch(var(--status-reserved)/0.1)]",
                            spot.status === "REPAIR" && "border-[oklch(var(--status-repair))] bg-[oklch(var(--status-repair)/0.1)]"
                          )}
                        >
                          <Icon className={cn("h-5 w-5", config.color)} />
                          <span className="mt-0.5 text-xs font-medium text-sidebar-foreground">{spot.number}</span>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
              
              {/* Long-term */}
              <Card className="bg-sidebar-accent border-sidebar-border">
                <CardHeader>
                  <CardTitle className="text-sidebar-foreground">Long-term Spots (SP-16 to SP-30)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2">
                    {spots.filter(s => s.type === "long-term").map((spot) => {
                      const config = statusConfig[spot.status]
                      const Icon = config.icon
                      
                      return (
                        <button
                          key={spot.id}
                          onClick={() => setSelectedSpotForAction(selectedSpotForAction === spot.id ? null : spot.id)}
                          className={cn(
                            "relative flex h-16 flex-col items-center justify-center rounded-lg border-2 transition-all",
                            selectedSpotForAction === spot.id && "ring-2 ring-sidebar-primary",
                            spot.status === "FREE" && "border-[oklch(var(--status-free))] bg-[oklch(var(--status-free)/0.1)]",
                            spot.status === "BOOKED" && "border-[oklch(var(--status-booked))] bg-[oklch(var(--status-booked)/0.1)]",
                            spot.status === "OCCUPIED" && "border-[oklch(var(--status-occupied))] bg-[oklch(var(--status-occupied)/0.1)]",
                            spot.status === "RESERVED" && "border-[oklch(var(--status-reserved))] bg-[oklch(var(--status-reserved)/0.1)]",
                            spot.status === "REPAIR" && "border-[oklch(var(--status-repair))] bg-[oklch(var(--status-repair)/0.1)]"
                          )}
                        >
                          <Icon className={cn("h-5 w-5", config.color)} />
                          <span className="mt-0.5 text-xs font-medium text-sidebar-foreground">{spot.number}</span>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Status Change Actions */}
            {selectedSpotForAction && (
              <Card className="bg-sidebar-accent border-sidebar-border">
                <CardHeader>
                  <CardTitle className="text-sidebar-foreground">
                    Change Status for {selectedSpotForAction}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(statusConfig) as SpotStatus[]).map((status) => {
                      const config = statusConfig[status]
                      return (
                        <Button
                          key={status}
                          variant="outline"
                          className={cn("gap-2 border-sidebar-border", config.color)}
                          onClick={() => handleChangeStatus(selectedSpotForAction, status)}
                        >
                          <span className={cn("h-2 w-2 rounded-full", config.bg)} />
                          {config.label}
                        </Button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Legend */}
            <div className="flex flex-wrap gap-4">
              {Object.entries(statusConfig).map(([status, config]) => (
                <div key={status} className="flex items-center gap-2">
                  <span className={cn("h-3 w-3 rounded-full", config.bg)} />
                  <span className="text-sm text-sidebar-foreground/70">{config.label}</span>
                </div>
              ))}
            </div>
          </TabsContent>
          
          {/* LPR Simulation Tab */}
          <TabsContent value="lpr" className="space-y-4">
            <Card className="bg-sidebar-accent border-sidebar-border">
              <CardHeader>
                <CardTitle className="text-sidebar-foreground">LPR Camera Simulation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-sidebar-foreground/60">
                  Simulate vehicle entry/exit by entering a license plate number. 
                  For diploma demonstration purposes.
                </p>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter plate number (e.g., 123 ABC 01)"
                    value={simulatePlate}
                    onChange={(e) => setSimulatePlate(e.target.value)}
                    className="bg-sidebar border-sidebar-border text-sidebar-foreground"
                  />
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    className="flex-1 gap-2"
                    onClick={handleSimulateEntry}
                    disabled={!simulatePlate}
                  >
                    <LogIn className="h-4 w-4" />
                    Simulate Entry
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 gap-2 border-sidebar-border"
                    onClick={handleSimulateExit}
                    disabled={!simulatePlate}
                  >
                    <LogOut className="h-4 w-4" />
                    Simulate Exit
                  </Button>
                </div>
                
                <Separator className="bg-sidebar-border" />
                
                <div>
                  <h4 className="mb-2 font-medium text-sidebar-foreground">Currently Parked Vehicles</h4>
                  <div className="space-y-2">
                    {spots.filter(s => s.status === "OCCUPIED" && s.plateNumber).map((spot) => (
                      <div 
                        key={spot.id}
                        className="flex items-center justify-between rounded-lg bg-sidebar p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Car className="h-5 w-5 text-sidebar-foreground/60" />
                          <div>
                            <p className="font-medium text-sidebar-foreground">{spot.plateNumber}</p>
                            <p className="text-xs text-sidebar-foreground/60">Spot {spot.id}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="border-sidebar-border">
                          {spot.type === "long-term" ? "Long-term" : "Short-term"}
                        </Badge>
                      </div>
                    ))}
                    {spots.filter(s => s.status === "OCCUPIED" && s.plateNumber).length === 0 && (
                      <p className="text-sm text-sidebar-foreground/60">No vehicles currently parked</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="bg-sidebar-accent border-sidebar-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(var(--status-free)/0.2)]">
                      <DollarSign className="h-6 w-6 text-[oklch(var(--status-free))]" />
                    </div>
                    <div>
                      <p className="text-sm text-sidebar-foreground/60">Today&apos;s Revenue</p>
                      <p className="text-2xl font-bold text-sidebar-foreground">12,450 &#8376;</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-sidebar-accent border-sidebar-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-primary/20">
                      <TrendingUp className="h-6 w-6 text-sidebar-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-sidebar-foreground/60">Weekly Revenue</p>
                      <p className="text-2xl font-bold text-sidebar-foreground">87,320 &#8376;</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-sidebar-accent border-sidebar-border">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[oklch(var(--status-booked)/0.2)]">
                      <Activity className="h-6 w-6 text-[oklch(var(--status-booked))]" />
                    </div>
                    <div>
                      <p className="text-sm text-sidebar-foreground/60">Avg. Occupancy</p>
                      <p className="text-2xl font-bold text-sidebar-foreground">73%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <Card className="bg-sidebar-accent border-sidebar-border">
              <CardHeader>
                <CardTitle className="text-sidebar-foreground">Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-sidebar-foreground/60">Short-term parking</span>
                      <span className="font-medium text-sidebar-foreground">65,240 &#8376;</span>
                    </div>
                    <div className="h-2 rounded-full bg-sidebar">
                      <div className="h-full w-3/4 rounded-full bg-[oklch(var(--status-occupied))]" />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-sidebar-foreground/60">Long-term rentals</span>
                      <span className="font-medium text-sidebar-foreground">22,080 &#8376;</span>
                    </div>
                    <div className="h-2 rounded-full bg-sidebar">
                      <div className="h-full w-1/4 rounded-full bg-[oklch(var(--status-reserved))]" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card className="bg-sidebar-accent border-sidebar-border">
              <CardHeader>
                <CardTitle className="text-sidebar-foreground">User Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Demo user */}
                  <div className="rounded-lg bg-sidebar p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                          A
                        </div>
                        <div>
                          <p className="font-medium text-sidebar-foreground">Alikhan Serikov</p>
                          <p className="text-sm text-sidebar-foreground/60">+7 777 123 4567</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="border-sidebar-border">Active</Badge>
                        <p className="mt-1 text-sm text-sidebar-foreground/60">Balance: 2,500 &#8376;</p>
                      </div>
                    </div>
                    <Separator className="my-3 bg-sidebar-border" />
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-sidebar-foreground/60">No-shows: </span>
                        <span className="text-sidebar-foreground">1/6</span>
                      </div>
                      <div>
                        <span className="text-sidebar-foreground/60">Vehicles: </span>
                        <span className="text-sidebar-foreground">2</span>
                      </div>
                      <div>
                        <span className="text-sidebar-foreground/60">Total spent: </span>
                        <span className="text-sidebar-foreground">4,830 &#8376;</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Add more demo users */}
                  <div className="rounded-lg bg-sidebar p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
                          D
                        </div>
                        <div>
                          <p className="font-medium text-sidebar-foreground">Dinara Kazybek</p>
                          <p className="text-sm text-sidebar-foreground/60">+7 777 987 6543</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="destructive">Banned</Badge>
                        <p className="mt-1 text-sm text-sidebar-foreground/60">Until: Mar 28</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
