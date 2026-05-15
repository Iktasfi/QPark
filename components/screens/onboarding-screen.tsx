"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import { User, Car, Plus, Trash2, Check, ChevronRight } from "lucide-react"

type Step = "profile" | "cars"

interface CarEntry {
  id: string
  brand: string
  model: string
  plateNumber: string
}

export function OnboardingScreen() {
  const { user, setUser, setCurrentScreen } = useParking()
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
    if (!firstName.trim()) { setError("Please enter your first name"); return }
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
      // continue even if backend is offline
      setStep("cars")
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddCar = async () => {
    if (!carBrand.trim() || !carModel.trim() || !carPlate.trim()) {
      setError("Fill in all car fields")
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
    } catch (e) {
      setError("Cannot connect to server. Please restart the backend.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinish = async () => {
    if (!user) return

    // Fetch fresh user data from DB — ensures profile reflects exactly what's in PostgreSQL
    try {
      const currentToken = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/auth/me", {
        headers: { Authorization: `Bearer ${currentToken}` },
      })
      if (res.ok) {
        const fresh = await res.json()
        setUser({
          id: fresh.id ?? user.id,
          phone: fresh.phoneNumber ?? user.phone,
          name: fresh.firstName
            ? `${fresh.firstName}${fresh.lastName ? " " + fresh.lastName : ""}`.trim()
            : `${firstName} ${lastName}`.trim() || "User",
          balance: fresh.walletBalance ?? user.balance,
          bonusPoints: fresh.bonusPoints ?? user.bonusPoints,
          noShowCount: fresh.noShowCount ?? user.noShowCount,
          isBanned: fresh.isBanned ?? user.isBanned,
          bannedUntil: fresh.bannedUntil ? new Date(fresh.bannedUntil) : undefined,
          cars: fresh.cars?.map((c: { id: string; brand: string; model: string; plateNumber: string }) => ({
            id: c.id,
            brand: c.brand,
            model: c.model,
            plateNumber: c.plateNumber,
          })) ?? cars.map(c => ({ id: c.id, brand: c.brand, model: c.model, plateNumber: c.plateNumber })),
          transactions: user.transactions,
        })
      } else {
        // Backend unreachable — use local state
        setUser({
          ...user,
          name: `${firstName} ${lastName}`.trim() || "User",
          cars: cars.map(c => ({ id: c.id, brand: c.brand, model: c.model, plateNumber: c.plateNumber })),
        })
      }
    } catch {
      // Backend unreachable — use local state
      setUser({
        ...user,
        name: `${firstName} ${lastName}`.trim() || "User",
        cars: cars.map(c => ({ id: c.id, brand: c.brand, model: c.model, plateNumber: c.plateNumber })),
      })
    }

    setCurrentScreen("home")
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white px-6 pt-8 pb-6 shadow-sm">
        <div className="flex gap-2 mb-4">
          {(["profile", "cars"] as Step[]).map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-all ${step === s || (s === "profile") ? "bg-[#354469]" : step === "cars" && s === "cars" ? "bg-[#354469]" : "bg-gray-200"}`} />
          ))}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {step === "profile" ? "Your Profile" : "Your Cars"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {step === "profile" ? "Tell us your name" : "Add your vehicle(s)"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">

        {/* ── STEP 1: Profile ── */}
        {step === "profile" && (
          <>
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-[#354469]/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-[#354469]" />
                </div>
                <span className="font-semibold text-gray-800">Personal Info</span>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">First Name *</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => { setFirstName(e.target.value); setError("") }}
                  placeholder="Alikhan"
                  className="mt-1 w-full px-4 py-3 bg-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#354469]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Serikov"
                  className="mt-1 w-full px-4 py-3 bg-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#354469]"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button
              onClick={handleSaveProfile}
              disabled={isSaving || !firstName.trim()}
              className="w-full bg-[#354469] text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              Continue <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* ── STEP 2: Cars ── */}
        {step === "cars" && (
          <>
            {/* Added cars list */}
            {cars.length > 0 && (
              <div className="space-y-2">
                {cars.map((c, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{c.brand} {c.model}</p>
                        <p className="text-sm text-gray-500">{c.plateNumber}</p>
                      </div>
                    </div>
                    <button onClick={() => setCars(prev => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add car form */}
            <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-[#354469]/10 flex items-center justify-center">
                  <Car className="w-5 h-5 text-[#354469]" />
                </div>
                <span className="font-semibold text-gray-800">Add Vehicle</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Brand</label>
                  <input
                    value={carBrand}
                    onChange={e => { setCarBrand(e.target.value); setError("") }}
                    placeholder="Toyota"
                    className="mt-1 w-full px-3 py-3 bg-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#354469] text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Model</label>
                  <input
                    value={carModel}
                    onChange={e => setCarModel(e.target.value)}
                    placeholder="Camry"
                    className="mt-1 w-full px-3 py-3 bg-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#354469] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Plate Number</label>
                <input
                  value={carPlate}
                  onChange={e => setCarPlate(e.target.value.toUpperCase())}
                  placeholder="123 ABC 01"
                  className="mt-1 w-full px-3 py-3 bg-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#354469] text-sm font-mono"
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                onClick={handleAddCar}
                disabled={isSaving}
                className="w-full border-2 border-dashed border-[#354469]/40 text-[#354469] py-3 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#354469]/5 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Add Car
              </button>
            </div>

            <button
              onClick={handleFinish}
              className="w-full bg-[#354469] text-white py-4 rounded-2xl font-semibold flex items-center justify-center gap-2"
            >
              {cars.length === 0 ? "Skip & Continue" : "Done →"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
