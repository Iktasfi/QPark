"use client"

import { useEffect, useState, useRef } from "react"
import { getSocket } from "@/lib/socket"

type GateEvent = {
  type: "entry" | "exit"
  carPlate: string
  spotNumber: string
  status: "opening" | "open" | "closing" | "closed" | "denied"
  message?: string
}

type SpotStats = {
  free: number
  occupied: number
  booked: number
  total: number
}

const OPEN_DURATION_MS = 4000

export function BarrierGate() {
  const [gateEvent, setGateEvent] = useState<GateEvent | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [armAngle, setArmAngle] = useState(0)
  const [history, setHistory] = useState<(GateEvent & { time: string })[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [deniedCount, setDeniedCount] = useState(0)
  const [spotStats, setSpotStats] = useState<SpotStats>({ free: 0, occupied: 0, booked: 0, total: 0 })
  const [socketConnected, setSocketConnected] = useState(false)
  const [currentTime, setCurrentTime] = useState("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const fetchSpots = () => {
    fetch("/backend/parking/spots")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.statistics) return
        const s = data.statistics
        setSpotStats({
          free: (s.shortTerm?.free ?? 0) + (s.longTerm?.free ?? 0),
          occupied: (s.shortTerm?.occupied ?? 0) + (s.longTerm?.occupied ?? 0),
          booked: (s.shortTerm?.booked ?? 0) + (s.longTerm?.booked ?? 0),
          total: s.total ?? 0,
        })
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchSpots()
    const socket = getSocket()
    socket.on("connect", () => setSocketConnected(true))
    socket.on("disconnect", () => setSocketConnected(false))
    if (socket.connected) setSocketConnected(true)
    socket.on("spot-status-changed", fetchSpots)

    const onGateOpen = (data: { carPlate: string; spotNumber: string; type?: "entry" | "exit" }) => {
      openGate({ type: data.type ?? "entry", carPlate: data.carPlate, spotNumber: data.spotNumber, status: "opening" })
    }
    const onGateDenied = (data: { carPlate: string; spotNumber?: string; reason?: string }) => {
      denyGate({ type: "entry", carPlate: data.carPlate, spotNumber: data.spotNumber ?? "—", status: "denied", message: data.reason ?? "Бронь не найдена" })
    }
    socket.on("lpr-gate-open", onGateOpen)
    socket.on("lpr-gate-denied", onGateDenied)

    return () => {
      socket.off("connect"); socket.off("disconnect")
      socket.off("spot-status-changed", fetchSpots)
      socket.off("lpr-gate-open", onGateOpen)
      socket.off("lpr-gate-denied", onGateDenied)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (animRef.current) clearInterval(animRef.current)
    }
  }, [])

  const animateArm = (targetAngle: number, onDone?: () => void) => {
    if (animRef.current) clearInterval(animRef.current)
    animRef.current = setInterval(() => {
      setArmAngle(prev => {
        const next = targetAngle > prev ? Math.min(prev + 6, targetAngle) : Math.max(prev - 6, targetAngle)
        if (next === targetAngle) { if (animRef.current) clearInterval(animRef.current); onDone?.() }
        return next
      })
    }, 16)
  }

  const openGate = (evt: GateEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setGateEvent({ ...evt, status: "opening" })
    setIsOpen(true)
    setOpenCount(c => c + 1)
    setHistory(prev => [{ ...evt, status: "open" as const, time: new Date().toLocaleTimeString("ru-RU") }, ...prev].slice(0, 30))
    animateArm(-90, () => {
      setGateEvent(e => e ? { ...e, status: "open" } : e)
      timerRef.current = setTimeout(() => {
        setGateEvent(e => e ? { ...e, status: "closing" } : e)
        animateArm(0, () => {
          setIsOpen(false)
          setGateEvent(e => e ? { ...e, status: "closed" } : e)
          setTimeout(() => setGateEvent(null), 2000)
        })
      }, OPEN_DURATION_MS)
    })
  }

  const denyGate = (evt: GateEvent) => {
    setGateEvent({ ...evt, status: "denied" })
    setDeniedCount(c => c + 1)
    setHistory(prev => [{ ...evt, status: "denied" as const, time: new Date().toLocaleTimeString("ru-RU") }, ...prev].slice(0, 30))
    setTimeout(() => setGateEvent(null), 3000)
  }

  const statusColor: Record<string, string> = {
    opening: "#f59e0b", open: "#22c55e", closing: "#f59e0b", closed: "#9ca3af", denied: "#ef4444",
  }
  const statusLabel: Record<string, string> = {
    opening: "ОТКРЫВАЕТСЯ", open: "ОТКРЫТО", closing: "ЗАКРЫВАЕТСЯ", closed: "ЗАКРЫТО", denied: "ОТКАЗАНО",
  }
  const col = gateEvent ? statusColor[gateEvent.status] : "#9ca3af"

  return (
    <div className="min-h-screen bg-[#f0f3f8] select-none">

      {/* Header */}
      <div className="bg-[#354469] px-6 py-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-sm">Q</span>
            </div>
            <div>
              <p className="text-white font-bold">QPark LPR</p>
              <p className="text-white/60 text-xs">Система въезда / выезда</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-white/70 font-mono text-sm">{currentTime}</p>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${socketConnected ? "bg-green-400/20 text-green-300" : "bg-white/10 text-white/50"}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${socketConnected ? "bg-green-400" : "bg-white/30"}`} />
              {socketConnected ? "Онлайн" : "Офлайн"}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: spot stats */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">Места на парковке</p>
            <div className="space-y-3">
              {[
                { label: "Свободно",      value: spotStats.free,     color: "text-green-600",  bg: "bg-green-50",  border: "border-green-100" },
                { label: "Занято",        value: spotStats.occupied, color: "text-red-600",    bg: "bg-red-50",    border: "border-red-100" },
                { label: "Забронировано", value: spotStats.booked,   color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-100" },
              ].map(({ label, value, color, bg, border }) => (
                <div key={label} className={`flex items-center justify-between rounded-xl px-4 py-3 ${bg} border ${border}`}>
                  <span className="text-gray-600 text-sm font-medium">{label}</span>
                  <span className={`text-2xl font-black ${color}`}>{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl px-4 py-3 bg-gray-50 border border-gray-100">
                <span className="text-gray-400 text-sm">Всего мест</span>
                <span className="text-2xl font-black text-gray-400">{spotStats.total}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">Статистика сессии</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4 text-center bg-green-50 border border-green-100">
                <p className="text-4xl font-black text-green-600">{openCount}</p>
                <p className="text-green-500 text-xs font-medium mt-1">Открытий</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-red-50 border border-red-100">
                <p className="text-4xl font-black text-red-500">{deniedCount}</p>
                <p className="text-red-400 text-xs font-medium mt-1">Отказов</p>
              </div>
            </div>
          </div>
        </div>

        {/* Center: gate + plate */}
        <div className="flex flex-col items-center gap-5">

          {/* Plate display */}
          <div
            className="w-full bg-white rounded-2xl shadow-sm border-2 px-6 py-5 text-center transition-all duration-500"
            style={{
              borderColor: gateEvent ? col : "#e5e7eb",
              boxShadow: gateEvent ? `0 0 30px ${col}30` : "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            {gateEvent ? (
              <>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
                  {gateEvent.type === "entry" ? "▼ ВЪЕЗД" : "▲ ВЫЕЗД"} · Место {gateEvent.spotNumber}
                </p>
                <p className="text-5xl font-black font-mono tracking-widest mb-3" style={{ color: col }}>
                  {gateEvent.carPlate}
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
                  style={{ background: `${col}18`, color: col }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: col }} />
                  {statusLabel[gateEvent.status]}
                </div>
                {gateEvent.message && <p className="text-red-500 text-sm mt-2">{gateEvent.message}</p>}
              </>
            ) : (
              <>
                <p className="text-gray-300 text-xs font-semibold uppercase tracking-widest mb-3">ГОС. НОМЕР</p>
                <p className="text-gray-200 text-5xl font-black font-mono tracking-widest mb-3">—·—·—</p>
                <p className="text-gray-300 text-sm">Ожидание автомобиля...</p>
                <div className="flex justify-center gap-1.5 mt-3">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-200"
                      style={{ animation: `pulse 1.5s ease-in-out ${i * 0.4}s infinite` }} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Gate animation */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 w-full flex justify-center">
            <div className="relative flex flex-col items-start" style={{ width: 280, height: 200 }}>
              {/* Road */}
              <div className="absolute bottom-0 left-0 right-0 h-12 rounded-b-xl overflow-hidden bg-gray-100 flex items-center justify-center gap-4">
                {[...Array(5)].map((_, i) => <div key={i} className="w-8 h-1.5 bg-yellow-300 rounded" />)}
              </div>

              {/* Pole */}
              <div className="absolute rounded-lg"
                style={{ left: 30, bottom: 48, width: 22, height: 85, background: "linear-gradient(to right, #354469, #495E8E)" }} />

              {/* Arm */}
              <div className="absolute" style={{ left: 30, bottom: 48 + 75, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{
                  position: "absolute", left: 22, top: "50%",
                  width: 185, height: 12,
                  transformOrigin: "0 50%",
                  transform: `rotate(${armAngle}deg)`,
                  borderRadius: 6,
                  background: isOpen
                    ? "linear-gradient(to right, #22c55e, #16a34a)"
                    : gateEvent?.status === "denied"
                      ? "linear-gradient(to right, #ef4444, #b91c1c)"
                      : "linear-gradient(to right, #495E8E, #354469)",
                  boxShadow: isOpen ? "0 0 16px rgba(34,197,94,0.5)" : gateEvent?.status === "denied" ? "0 0 16px rgba(239,68,68,0.5)" : "none",
                }}>
                  {[25, 70, 115, 160].map(x => (
                    <div key={x} style={{ position: "absolute", left: x, top: 0, width: 7, height: "100%", background: "rgba(255,255,255,0.2)", borderRadius: 2 }} />
                  ))}
                </div>
                <div className="w-4 h-4 rounded-full bg-white border-2 border-gray-300 z-10" />
              </div>

              {/* LED */}
              <div className="absolute rounded-full" style={{
                left: 38, bottom: 48 + 88,
                width: 8, height: 8,
                background: col,
                boxShadow: gateEvent ? `0 0 10px ${col}` : "none",
              }} />
            </div>
          </div>
        </div>

        {/* Right: log */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">Лог событий</p>
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-3">
                <span className="text-2xl">📋</span>
              </div>
              <p className="text-gray-300 text-sm">Событий пока нет</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {history.map((h, i) => (
                <div key={i}
                  className={`rounded-xl px-3 py-2.5 flex items-center justify-between border ${h.status === "denied" ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{h.status === "denied" ? "✗" : h.type === "entry" ? "▼" : "▲"}</span>
                    <div>
                      <p className={`font-mono font-bold text-sm ${h.status === "denied" ? "text-red-600" : "text-green-700"}`}>
                        {h.carPlate}
                      </p>
                      <p className="text-gray-400 text-xs">{h.type === "entry" ? "Въезд" : "Выезд"} · {h.spotNumber}</p>
                    </div>
                  </div>
                  <span className="text-gray-400 text-xs font-mono">{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}
