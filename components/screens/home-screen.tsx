"use client"

import { useState, useEffect } from "react"
import { useParking, mapDbUser } from "@/lib/parking-context"
import Image from "next/image"

export function HomeScreen() {
  const { setCurrentScreen, user, setUser, activeBooking, t, spots, notifications, markAllRead, unreadCount } = useParking()

  const freeSpots = spots.filter(s => s.status === "FREE").length
  const bookedSpots = spots.filter(s => s.status === "BOOKED" || s.status === "OCCUPIED" || s.status === "RESERVED").length
  const freeShortTerm = freeSpots
  const freeLongTerm = bookedSpots
  const [activeTab, setActiveTab] = useState("home")
  const [showNotifications, setShowNotifications] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem("qpark_token")
    if (!token) return
    fetch("/backend/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(mapDbUser(data)) })
      .catch(() => {})
  }, [])

  const navItems = [
    { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: t.home, active: true },
    { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: t.map, active: false },
    { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: t.booking, active: false },
    { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", label: t.wallet, active: false },
    { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", label: t.profile, active: false },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="px-6 pt-2 pb-4 content-bottom-pad">
        <div className="bg-[#495E8E] rounded-b-[20px] p-4 pt-5 pb-6 mb-6 shadow-md flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center overflow-hidden">
                <Image src="/icon_light.svg" alt="Logo" width={80} height={80} className="object-contain" style={{ transform: 'scale(1.3) translateY(4px) translateX(4px)' }} />
              </div>
              <div>
                <p className="text-gray-200 text-sm">{t.welcomeBack}</p>
                <p className="text-white text-xl font-extrabold">{user?.name || "User"}</p>
              </div>
            </div>
            <button onClick={() => { setShowNotifications(true); markAllRead() }} className="relative flex items-center gap-4 hover:bg-white/10 rounded-lg p-2 transition-colors">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Image src="/bell.svg" alt="Notifications" width={32} height={32} className="object-contain" />
              </div>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">{unreadCount}</span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between bg-[#354469] rounded-xl p-3">
            <div>
              <p className="text-gray-300 text-sm">{t.bonusPointsLabel}</p>
              <p className="text-white text-lg font-bold">{user?.bonusPoints ?? 0}</p>
            </div>
            <button onClick={() => setCurrentScreen("wallet")} className="hover:bg-white/10 rounded-lg p-2 transition-colors">
              <Image src="/gift.svg" alt="Gift" width={24} height={24} className="object-contain" />
            </button>
          </div>
        </div>

        {activeBooking && (
          <div className="bg-[#F0EDED] dark:bg-gray-800 rounded-[20px] p-5 mb-8" style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Image src="/clock.svg" alt="Clock" width={48} height={48} className="object-contain dark:invert" />
                <div>
                  <h3 className="text-[#333333] dark:text-white font-extrabold text-lg drop-shadow-md">{t.activeBooking}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">
                    Spot {activeBooking.spotId} • {activeBooking.type === "long-term" ? t.longTerm : t.shortTerm}
                  </p>
                </div>
              </div>
              <button onClick={() => setCurrentScreen("booking")} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                <Image src="/Arrow_right.svg" alt="Arrow" width={32} height={32} className="object-contain dark:invert" />
              </button>
            </div>
          </div>
        )}

        <div className="mb-8">
          <div className="grid grid-cols-2 gap-6">
            <button onClick={() => setCurrentScreen("map")} className="bg-[#F0EDED] dark:bg-gray-800 rounded-[20px] p-5 text-left hover:bg-[#E5DCDC] dark:hover:bg-gray-700 transition-colors" style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}>
              <h4 className="text-[#333333] dark:text-white font-extrabold text-sm leading-tight mb-3">{t.spotsAvailable}</h4>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{freeSpots} {t.spotsAvailable}</p>
              <div className="flex gap-2">
                {[1,2,3].map(i => <div key={i} className="w-3 h-3 bg-green-500 rounded-full" />)}
              </div>
            </button>
            <button onClick={() => setCurrentScreen("map")} className="bg-[#F0EDED] dark:bg-gray-800 rounded-[20px] p-5 text-left hover:bg-[#E5DCDC] dark:hover:bg-gray-700 transition-colors" style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}>
              <h4 className="text-[#333333] dark:text-white font-extrabold text-sm leading-tight mb-3">{t.statusOccupied}</h4>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{bookedSpots} {t.takenShort}</p>
              <div className="flex gap-2">
                {[1,2].map(i => <div key={i} className="w-3 h-3 bg-orange-400 rounded-full" />)}
              </div>
            </button>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-[#333333] dark:text-white font-extrabold text-lg mb-6">{t.quickActions}</h3>
          <div className="space-y-6">
            <div onClick={() => setCurrentScreen("map")} className="w-full bg-[#4A5E8E] rounded-[20px] p-5 cursor-pointer hover:bg-[#3A4D7C] transition-colors" style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Image src="/location.svg" alt="Location" width={40} height={40} className="object-contain filter brightness-0 invert" />
                  <div className="text-left">
                    <span className="text-white font-bold text-xl drop-shadow-md">{t.bookNow}</span>
                    <p className="text-white/70 text-sm">{t.findParking}</p>
                  </div>
                </div>
                <Image src="/Arrow_right.svg" alt="Arrow" width={36} height={36} className="object-contain filter brightness-0 invert" />
              </div>
            </div>
            <div onClick={() => setCurrentScreen("profile")} className="w-full bg-[#9A56AD] rounded-[20px] p-5 cursor-pointer hover:bg-[#8A4D9D] transition-colors" style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Image src="/car.svg" alt="Car" width={40} height={40} className="object-contain filter brightness-0 invert" />
                  <div className="text-left">
                    <span className="text-white font-bold text-xl drop-shadow-md">{t.myCars}</span>
                    <p className="text-white/70 text-sm">{user?.cars.length ?? 0} {t.registered}</p>
                  </div>
                </div>
                <Image src="/Arrow_right.svg" alt="Arrow" width={36} height={36} className="object-contain filter brightness-0 invert" />
              </div>
            </div>
          </div>
        </div>

        <div onClick={() => setCurrentScreen("wallet")} className="w-full bg-[#FFB380] rounded-[20px] p-5 mb-24 cursor-pointer hover:bg-[#FFA34D] transition-colors" style={{boxShadow: '0 10px 20px rgba(0,0,0,0.08)'}}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <Image src="/gift.svg" alt="Gift" width={32} height={32} className="object-contain filter brightness-0 invert" />
            </div>
            <div className="text-left">
              <h3 className="text-white font-extrabold text-lg">{t.specialOffer}</h3>
              <p className="text-orange-100 text-sm">{t.firstBookingOffer}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notification panel */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setShowNotifications(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="font-bold text-base text-gray-900 dark:text-white">{t.notifications}</h2>
              <button onClick={() => setShowNotifications(false)} className="text-gray-400 text-xl font-light">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <span className="text-4xl mb-3">🔔</span>
                  <p className="text-sm">{t.noNotifications}</p>
                </div>
              ) : notifications.map(n => (
                <div key={n.id} className="flex gap-3 px-5 py-4 border-b border-gray-50 dark:border-gray-800">
                  <span className="text-xl mt-0.5">
                    {n.type === 'fine' ? '⚠️' : n.type === 'spot' ? '📍' : '✅'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{n.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                      {n.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bottom-nav bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 z-50 shadow-lg">
        <div className="flex justify-around items-center px-4" style={{height: '64px'}}>
          {navItems.map((item) => (
            <button key={item.id} onClick={() => setCurrentScreen(item.id)} className="flex flex-col items-center justify-center gap-0.5 p-3 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl active:scale-95">
              <div className="w-8 h-8 flex items-center justify-center">
                <img src={item.active ? item.activeIcon : item.icon} alt={item.label} width={28} height={28} className={item.active ? "opacity-100" : "opacity-80 dark:invert"} />
              </div>
              <span className={`text-xs font-medium ${item.active ? "text-[#36549B] dark:text-[#7B9FD4]" : "text-gray-900 dark:text-gray-300"} drop-shadow-sm`}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
