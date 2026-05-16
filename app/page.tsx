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
import { OnboardingScreen } from "@/components/screens/onboarding-screen"

function AppContent() {
  const { currentScreen, isAuthenticated, isAdminMode, isRestoringSession } = useParking()

  if (isRestoringSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-20 h-20 rounded-2xl bg-[#495E8E] flex items-center justify-center shadow-lg">
          <img src="/app_icon2.svg" alt="QPark" className="w-14 h-14 object-contain" />
        </div>
        <p className="text-[#495E8E] font-bold text-2xl">QPark</p>
        <div className="w-8 h-8 border-4 border-[#495E8E]/30 border-t-[#495E8E] rounded-full animate-spin" />
      </div>
    )
  }

  if (isAdminMode) {
    return <AdminDashboard />
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

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
      case "onboarding":
        return <OnboardingScreen />
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
