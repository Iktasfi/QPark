"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import Image from "next/image"

export function HomeScreen() {
  const { setCurrentScreen } = useParking()
  const [activeTab, setActiveTab] = useState("home")

  const navItems = [
    { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: "Home", active: true },
    { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: "Map", active: false },
    { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: "Booking", active: false },
    { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", label: "Wallet", active: false },
    { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", label: "Profile", active: false },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <div className="px-6 py-4 pb-24">
        {/* Blue Header Card */}
        <div className="bg-[#495E8E] rounded-b-[20px] p-4 pb-6 mb-6 shadow-md flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center overflow-hidden">
                <Image 
                  src="/icon_light.svg" 
                  alt="Logo" 
                  width={80}
                  height={80}
                  className="object-contain"
                  style={{ transform: 'scale(1.3) translateY(4px) translateX(4px)' }}
                />
              </div>
              <div>
                <p className="text-gray-200 text-sm">Welcome back,</p>
                <p className="text-white text-xl font-extrabold">User Name</p>
              </div>
            </div>
            <button 
              onClick={() => setCurrentScreen("profile")}
              className="flex items-center gap-4 hover:bg-white/10 rounded-lg p-2 transition-colors"
            >
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Image 
                  src="/bell.svg" 
                  alt="Notifications" 
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
            </button>
          </div>
          <div className="flex items-center justify-between bg-[#354469] rounded-xl p-3">
            <div>
              <p className="text-gray-300 text-sm">Bonus points</p>
              <p className="text-white text-lg font-bold">50</p>
            </div>
            <button 
              onClick={() => setCurrentScreen("wallet")}
              className="hover:bg-white/10 rounded-lg p-2 transition-colors"
            >
              <Image 
                src="/gift.svg" 
                alt="Gift" 
                width={24}
                height={24}
                className="object-contain"
              />
            </button>
          </div>
        </div>

        {/* Active Booking Card */}
        <div className="bg-[#F0EDED] rounded-[20px] p-5 mb-8" style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Image 
                src="/clock.svg" 
                alt="Clock" 
                width={48}
                height={48}
                className="object-contain"
              />
              <div>
                <h3 className="text-[#333333] font-extrabold text-lg drop-shadow-md">Active Booking</h3>
                <p className="text-gray-600 text-sm">Spot A-24 • 2h remaining</p>
              </div>
            </div>
            <button 
              onClick={() => setCurrentScreen("booking")}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Image 
                src="/Arrow_right.svg" 
                alt="Arrow" 
                width={32}
                height={32}
                className="object-contain"
              />
            </button>
          </div>
        </div>

        {/* Parking Spots */}
        <div className="mb-8">
          <div className="grid grid-cols-2 gap-6">
            <button 
              onClick={() => setCurrentScreen("map")}
              className="bg-[#F0EDED] rounded-[20px] p-5 text-left hover:bg-[#E5DCDC] transition-colors" 
              style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}
            >
              <h4 className="text-[#333333] font-extrabold text-lg mb-3">Short-term</h4>
              <p className="text-gray-600 text-sm mb-4">12 spots available</p>
              <div className="flex gap-2">
                {[1,2,3].map(i => (
                  <div key={i} className="w-3 h-3 bg-green-500 rounded-full"></div>
                ))}
              </div>
            </button>
            
            <button 
              onClick={() => setCurrentScreen("map")}
              className="bg-[#F0EDED] rounded-[20px] p-5 text-left hover:bg-[#E5DCDC] transition-colors" 
              style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}
            >
              <h4 className="text-[#333333] font-extrabold text-lg mb-3">Long-term</h4>
              <p className="text-gray-600 text-sm mb-4">8 spots available</p>
              <div className="flex gap-2">
                {[1,2].map(i => (
                  <div key={i} className="w-3 h-3 bg-green-500 rounded-full"></div>
                ))}
              </div>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h3 className="text-[#333333] font-extrabold text-lg mb-6">Quick Actions</h3>
          <div className="space-y-6">
            <div 
              onClick={() => setCurrentScreen("map")}
              className="w-full bg-[#4A5E8E] rounded-[20px] p-5 cursor-pointer hover:bg-[#3A4D7C] transition-colors" 
              style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Image 
                    src="/location.svg" 
                    alt="Location" 
                    width={40}
                    height={40}
                    className="object-contain filter brightness-0 invert"
                  />
                  <div className="text-left">
                    <span className="text-white font-bold text-xl drop-shadow-md">Book now</span>
                    <p className="text-white/70 text-sm">Find available parking</p>
                  </div>
                </div>
                <Image 
                  src="/Arrow_right.svg" 
                  alt="Arrow" 
                  width={36}
                  height={36}
                  className="object-contain filter brightness-0 invert"
                />
              </div>
            </div>
            <div 
              onClick={() => setCurrentScreen("profile")}
              className="w-full bg-[#9A56AD] rounded-[20px] p-5 cursor-pointer hover:bg-[#8A4D9D] transition-colors" 
              style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Image 
                    src="/car.svg" 
                    alt="Car" 
                    width={40}
                    height={40}
                    className="object-contain filter brightness-0 invert"
                  />
                  <div className="text-left">
                    <span className="text-white font-bold text-xl drop-shadow-md">My vehicles</span>
                    <p className="text-white/70 text-sm">1 registered</p>
                  </div>
                </div>
                <Image 
                  src="/Arrow_right.svg" 
                  alt="Arrow" 
                  width={36}
                  height={36}
                  className="object-contain filter brightness-0 invert"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Orange Banner */}
        <div 
          onClick={() => setCurrentScreen("wallet")}
          className="w-full bg-[#FFB380] rounded-[20px] p-5 mb-24 cursor-pointer hover:bg-[#FFA34D] transition-colors" 
          style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <Image 
                src="/gift.svg" 
                alt="Gift" 
                width={32}
                height={32}
                className="object-contain filter brightness-0 invert"
              />
            </div>
            <div className="text-left">
              <h3 className="text-white font-extrabold text-lg">Special Offer!</h3>
              <p className="text-orange-100 text-sm">Get 50% off your first booking</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Navigation */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-white border-t border-gray-300 z-50 shadow-lg" style={{ borderTop: '1px solid #D1D5DB' }}>
        <div className="flex justify-around items-center h-full px-4">
          {navItems.map((item) => (
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
