"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import { Wallet, ArrowDownLeft, ArrowUpRight, Sparkles, CreditCard } from "lucide-react"
import { StripeTopUp } from "@/components/stripe-topup"

export function WalletScreen() {
  const { user, setUser, setCurrentScreen, darkMode, t } = useParking()
  const [view, setView] = useState<"main" | "topup">("main")
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)

  const topUpAmounts = [500, 1000, 2000, 5000]

  const handleStripeSuccess = (walletBalance: number) => {
    if (!user || !selectedAmount) return
    setUser({
      ...user,
      balance: walletBalance,
      transactions: [
        {
          id: `t-${Date.now()}`,
          type: "topup_stripe" as const,
          amount: selectedAmount,
          description: `${t.stripeTopUpDesc}${selectedAmount}₸`,
          date: new Date(),
        },
        ...user.transactions,
      ],
    })
    setView("main")
    setSelectedAmount(null)
  }

  const navItems = [
    { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", labelKey: "home" as const, active: false },
    { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", labelKey: "map" as const, active: false },
    { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", labelKey: "booking" as const, active: false },
    { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", labelKey: "wallet" as const, active: true },
    { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", labelKey: "profile" as const, active: false },
  ]

  if (view === "topup" && !selectedAmount) {
    return (
      <div className={`relative flex flex-col h-full ${darkMode ? "bg-gray-900" : "bg-[#F8F9FC]"} overflow-hidden`}>
        <div className="text-center pt-6 pb-4">
          <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-[#1a1a2e]"}`}>{t.topUpBalance}</h1>
        </div>
        <div className="flex-1 px-4 space-y-5 overflow-y-auto content-bottom-pad">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className={`w-5 h-5 ${darkMode ? "text-blue-400" : "text-[#495E8E]"}`} />
            <h2 className={`text-lg font-bold ${darkMode ? "text-white" : "text-[#1a1a2e]"}`}>{t.selectAmount}</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {topUpAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => setSelectedAmount(amount)}
                className={`py-5 rounded-2xl border-2 text-xl font-bold transition-all ${
                  darkMode
                    ? "bg-gray-800 text-white border-gray-700 hover:border-[#495E8E]"
                    : "bg-white text-[#1a1a2e] border-gray-200 hover:border-[#495E8E]"
                }`}
              >
                {amount.toLocaleString()}₸
              </button>
            ))}
          </div>
          <button
            onClick={() => setView("main")}
            className={`w-full py-4 rounded-2xl ${darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-700"} font-semibold`}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    )
  }

  if (view === "topup" && selectedAmount) {
    return (
      <div className={`relative flex flex-col h-full ${darkMode ? "bg-gray-900" : "bg-[#F8F9FC]"} overflow-hidden`}>
        <div className="text-center pt-6 pb-4">
          <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-[#1a1a2e]"}`}>{t.payment}</h1>
        </div>
        <div className="flex-1 px-4 overflow-y-auto content-bottom-pad">
          <StripeTopUp
            amount={selectedAmount}
            darkMode={darkMode}
            onSuccess={handleStripeSuccess}
            onCancel={() => setSelectedAmount(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={`relative flex flex-col h-full ${darkMode ? "bg-gray-900" : "bg-[#F8F9FC]"} overflow-hidden`}>
      <div className="text-center pt-6 pb-4">
        <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-[#1a1a2e]"}`}>{t.wallet}</h1>
        <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-400"} mt-1`}>{t.manageBalance}</p>
      </div>

      <div className="flex-1 px-4 space-y-4 overflow-y-auto content-bottom-pad">
        <div className={`relative ${darkMode ? "bg-[#2a3654]" : "bg-[#495E8E]"} rounded-3xl p-5 overflow-hidden`}>
          <div className="relative z-10">
            <p className="text-white/80 text-sm font-medium">{t.currentBalance}</p>
            <p className="text-white text-4xl font-bold mt-1 tracking-tight">
              {user?.balance ?? 1500}<span className="text-3xl">₸</span>
            </p>
            <p className="text-white/70 text-sm mt-2">{user?.bonusPoints ?? 50} {t.bonusPoints.toLowerCase()}</p>
          </div>
          <div className="absolute top-5 right-5">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <button
          onClick={() => setView("topup")}
          className={`w-full ${darkMode ? "bg-[#2a3654]" : "bg-[#495E8E]"} text-white font-semibold py-4 rounded-3xl text-base hover:opacity-90 transition-colors`}
        >
          {t.topUpBalance}
        </button>

        <div className={`${darkMode ? "bg-amber-900/30" : "bg-[#F5EBE0]"} rounded-3xl p-4 flex items-center justify-between`}>
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className={`font-semibold ${darkMode ? "text-white" : "text-[#1a1a2e]"} text-sm`}>{t.promoCodeAvailable}</p>
              <p className={`${darkMode ? "text-gray-400" : "text-gray-500"} text-xs mt-0.5`}>{t.promoDescription}</p>
            </div>
          </div>
          <span className={`${darkMode ? "bg-gray-700 text-gray-300 border-gray-600" : "bg-white text-gray-600 border-gray-200"} text-xs font-medium px-3 py-1 rounded-full border`}>
            {t.active}
          </span>
        </div>

        <div className="mt-2">
          <h2 className={`text-lg font-bold ${darkMode ? "text-white" : "text-[#1a1a2e]"} mb-4`}>{t.transactionHistory}</h2>
          <div className="space-y-3">
            {(user?.transactions ?? []).length === 0 ? (
              <p className={`text-sm text-center py-4 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{t.noTransactionsYet}</p>
            ) : (user?.transactions ?? []).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${darkMode ? "bg-gray-800" : "bg-gray-100"} flex items-center justify-center`}>
                    {tx.amount > 0 ? (
                      <ArrowDownLeft className={`w-4 h-4 ${darkMode ? "text-blue-400" : "text-[#495E8E]"}`} />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-orange-500" />
                    )}
                  </div>
                  <div>
                    <p className={`${darkMode ? "text-white" : "text-[#1a1a2e]"} text-sm font-medium`}>{tx.description}</p>
                    <p className={`${darkMode ? "text-gray-500" : "text-gray-400"} text-xs`}>
                      {new Date(tx.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <p className={`text-sm font-bold ${tx.amount > 0 ? (darkMode ? "text-blue-400" : "text-[#495E8E]") : darkMode ? "text-white" : "text-[#1a1a2e]"}`}>
                  {tx.amount > 0 ? "+" : ""}{Math.abs(tx.amount)}₸
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 bottom-nav ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border-t z-10`}>
        <div className="flex justify-around items-center px-4" style={{height: '64px'}}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 p-3 transition-all ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"} rounded-xl active:scale-95`}
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <img
                  src={item.active ? item.activeIcon : item.icon}
                  alt={t[item.labelKey]}
                  width={28}
                  height={28}
                  className={`${item.active ? "opacity-100" : "opacity-80"} ${darkMode && !item.active ? "brightness-0 invert opacity-70" : ""}`}
                />
              </div>
              <span className={`text-xs font-medium ${item.active ? (darkMode ? "text-blue-400" : "text-[#36549B]") : darkMode ? "text-gray-300" : "text-gray-900"}`}>
                {t[item.labelKey]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
