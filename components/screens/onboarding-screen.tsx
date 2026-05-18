"use client"

import { useState } from "react"
import { useParking, mapDbUser } from "@/lib/parking-context"
import { User, Car, Plus, Trash2, Check, ChevronRight } from "lucide-react"

type Step = "profile" | "cars"

interface CarEntry {
  id: string
  brand: string
  model: string
  plateNumber: string
}

export function OnboardingScreen() {
  const { user, setUser, setCurrentScreen, darkMode, t } = useParking()
  const [step, setStep] = useState<Step>("profile")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [cars, setCars] = useState<CarEntry[]>([])
  const [carBrand, setCarBrand] = useState("")
  const [carModel, setCarModel] = useState("")
  const [carPlate, setCarPlate] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const token = typeof window !== "undefined" ? localStorage.getItem("qpark_token") : null

  const handleSaveProfile = async () => {
    if (!firstName.trim()) { setError(t.firstNameLabel); return }
    setError("")
    setIsSaving(true)
    try {
      await fetch("/backend/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      })
      setStep("cars")
    } catch {
      setStep("cars")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddCar = async () => {
    if (!carBrand.trim() || !carModel.trim() || !carPlate.trim()) {
      setError(t.noCarsAddFirst)
      return
    }
    setError("")
    setIsSaving(true)
    try {
      const currentToken = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/auth/cars", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({ brand: carBrand.trim(), model: carModel.trim(), plateNumber: carPlate.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || data.errors?.[0]?.msg || "Failed to add car")
        return
      }
      setCars(prev => [...prev, { id: data.car.id, brand: carBrand.trim(), model: carModel.trim(), plateNumber: carPlate.trim().toUpperCase() }])
      setCarBrand(""); setCarModel(""); setCarPlate("")
    } catch {
      setError("Cannot connect to server. Please restart the backend.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinish = async () => {
    if (!user) return
    try {
      const currentToken = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` },
      })
      if (res.ok) {
        setUser(mapDbUser(await res.json()))
      } else {
        setUser({
          ...user,
          name: `${firstName} ${lastName}`.trim() || "User",
          cars: cars.map(c => ({ id: c.id, brand: c.brand, model: c.model, plateNumber: c.plateNumber })),
        })
      }
    } catch {
      setUser({
        ...user,
        name: `${firstName} ${lastName}`.trim() || "User",
        cars: cars.map(c => ({ id: c.id, brand: c.brand, model: c.model, plateNumber: c.plateNumber })),
      })
    }
    setCurrentScreen("home")
  }

  return (
    <div className={`flex flex-col h-full ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className={`${darkMode ? "bg-gray-800" : "bg-white"} px-6 pt-8 pb-6 shadow-sm`}>
        <div className="flex gap-2 mb-4">
          {(["profile", "cars"] as Step[]).map((s) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${step === "cars" || s === "profile" ? "bg-[#354469]" : "bg-gray-200"}`} />
          ))}
        </div>
        <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>
          {step === "profile" ? t.yourProfile : t.yourCars}
        </h1>
        <p className={`text-sm mt-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          {step === "profile" ? t.tellUsName : t.addYourCars}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">

        {step === "profile" && (
          <>
            <div className={`${darkMode ? "bg-gray-800" : "bg-white"} rounded-2xl p-5 shadow-sm space-y-4`}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-full ${darkMode ? "bg-[#354469]/30" : "bg-[#354469]/10"} flex items-center justify-center`}>
                  <User className="w-5 h-5 text-[#354469]" />
                </div>
                <span className={`font-semibold ${darkMode ? "text-white" : "text-gray-800"}`}>{t.personalInfo}</span>
              </div>

              <div>
                <label className={`text-xs font-medium uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{t.firstNameLabel} *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => { setFirstName(e.target.value); setError("") }}
                  placeholder="Alikhan"
                  className={`mt-1 w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#354469] ${darkMode ? "bg-gray-700 text-white placeholder-gray-500" : "bg-gray-100 text-gray-900"}`}
                />
              </div>
              <div>
                <label className={`text-xs font-medium uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{t.lastNameLabel}</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Serikov"
                  className={`mt-1 w-full px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#354469] ${darkMode ? "bg-gray-700 text-white placeholder-gray-500" : "bg-gray-100 text-gray-900"}`}
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button
              onClick={handleSaveProfile}
              disabled={isSaving || !firstName.trim()}
              className="w-full bg-[#354469] text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {t.continueBtn} <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {step === "cars" && (
          <>
            {cars.length > 0 && (
              <div className="space-y-2">
                {cars.map((c, i) => (
                  <div key={i} className={`${darkMode ? "bg-gray-800" : "bg-white"} rounded-2xl p-4 shadow-sm flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className={`font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>{c.brand} {c.model}</p>
                        <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{c.plateNumber}</p>
                      </div>
                    </div>
                    <button onClick={() => setCars(prev => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={`${darkMode ? "bg-gray-800" : "bg-white"} rounded-2xl p-5 shadow-sm space-y-3`}>
              <div className="flex items-center gap-3 mb-1">
                <div className={`w-10 h-10 rounded-full ${darkMode ? "bg-[#354469]/30" : "bg-[#354469]/10"} flex items-center justify-center`}>
                  <Car className="w-5 h-5 text-[#354469]" />
                </div>
                <span className={`font-semibold ${darkMode ? "text-white" : "text-gray-800"}`}>{t.addCar}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-medium uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{t.brandLabel}</label>
                  <input
                    value={carBrand}
                    onChange={e => { setCarBrand(e.target.value); setError("") }}
                    placeholder="Toyota"
                    className={`mt-1 w-full px-3 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#354469] text-sm ${darkMode ? "bg-gray-700 text-white placeholder-gray-500" : "bg-gray-100 text-gray-900"}`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-medium uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{t.modelLabel}</label>
                  <input
                    value={carModel}
                    onChange={e => setCarModel(e.target.value)}
                    placeholder="Camry"
                    className={`mt-1 w-full px-3 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#354469] text-sm ${darkMode ? "bg-gray-700 text-white placeholder-gray-500" : "bg-gray-100 text-gray-900"}`}
                  />
                </div>
              </div>

              <div>
                <label className={`text-xs font-medium uppercase tracking-wide ${darkMode ? "text-gray-400" : "text-gray-500"}`}>{t.plateLabel}</label>
                <input
                  value={carPlate}
                  onChange={e => setCarPlate(e.target.value.toUpperCase())}
                  placeholder="123 ABC 01"
                  className={`mt-1 w-full px-3 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#354469] text-sm font-mono ${darkMode ? "bg-gray-700 text-white placeholder-gray-500" : "bg-gray-100 text-gray-900"}`}
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                onClick={handleAddCar}
                disabled={isSaving}
                className={`w-full border-2 border-dashed py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 ${darkMode ? "border-[#354469]/60 text-[#7B9FD4] hover:bg-[#354469]/10" : "border-[#354469]/40 text-[#354469] hover:bg-[#354469]/5"}`}
              >
                <Plus className="w-4 h-4" /> {t.add}
              </button>
            </div>

            <button
              onClick={handleFinish}
              className="w-full bg-[#354469] text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-2"
            >
              {cars.length === 0 ? t.skipAndContinue : t.done + " →"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
