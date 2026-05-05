"use client"

import { ParkingProvider, useParking } from "@/lib/parking-context"
import { MobileShell } from "@/components/mobile-shell"
import { LoginScreen } from "@/components/screens/login-screen"
import { HomeScreen } from "@/components/screens/home-screen"
import { MapScreen } from "@/components/screens/map-screen"
import { SpotDetailsScreen } from "@/components/screens/spot-details-screen"
import { BookingConfirmScreen } from "@/components/screens/booking-confirm-screen"
import { ActiveBookingScreen } from "@/components/screens/active-booking-screen"
import { WalletScreen } from "@/components/screens/wallet-screen"
import { ProfileScreen } from "@/components/screens/profile-screen"
import { AdminDashboard } from "@/components/admin/admin-dashboard"

function AppContent() {
  const { currentScreen, isAuthenticated, isAdminMode } = useParking()
  
  // Admin Dashboard (full screen, no mobile shell)
  if (isAdminMode) {
    return <AdminDashboard />
  }
  
  // Login screen (full mobile shell but different content)
  if (!isAuthenticated) {
    return (
      <MobileShell>
        <LoginScreen />
      </MobileShell>
    )
  }
  
  // Main app screens
  const renderScreen = () => {
    switch (currentScreen) {
      case "home":
        return <HomeScreen />
      case "map":
        return <MapScreen />
      case "spot-details":
        return <SpotDetailsScreen />
      case "booking-confirm":
        return <BookingConfirmScreen />
      case "booking":
      case "active-booking":
        return <ActiveBookingScreen />
      case "wallet":
        return <WalletScreen />
      case "profile":
        return <ProfileScreen />
      default:
        return <HomeScreen />
    }
  }
  
  return (
    <MobileShell>
      {renderScreen()}
    </MobileShell>
  )
}

export default function SmartParkingApp() {
  return (
    <ParkingProvider>
      <main className="flex min-h-screen items-center justify-center bg-foreground/5 p-4">
        <AppContent />
      </main>
    </ParkingProvider>
  )
}
