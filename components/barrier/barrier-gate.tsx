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

  useEffect(() => {
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

    const socket = getSocket()
    socket.on("connect", () => setSocketConnected(true))
    socket.on("disconnect", () => setSocketConnected(false))
    if (socket.connected) setSocketConnected(true)

    socket.on("spot-status-changed", () => {
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
    })

    const onGateOpen = (data: { carPlate: string; spotNumber: string; type?: "entry" | "exit" }) => {
      openGate({
        type: data.type ?? "entry",
        carPlate: data.carPlate,
        spotNumber: data.spotNumber,
        status: "opening",
      })
    }

    const onGateDenied = (data: { carPlate: string; spotNumber?: string; reason?: string }) => {
      denyGate({
        type: "entry",
        carPlate: data.carPlate,
        spotNumber: data.spotNumber ?? "—",
        status: "denied",
        message: data.reason ?? "Бронь не найдена",
      })
    }

    socket.on("lpr-gate-open", onGateOpen)
    socket.on("lpr-gate-denied", onGateDenied)

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("spot-status-changed")
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
        const step = 6
        const next = targetAngle > prev
          ? Math.min(prev + step, targetAngle)
          : Math.max(prev - step, targetAngle)
        if (next === targetAngle) {
          if (animRef.current) clearInterval(animRef.current)
          onDone?.()
        }
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
    opening: "#22c55e",
    open: "#22c55e",
    closing: "#f59e0b",
    closed: "#6b7280",
    denied: "#ef4444",
  }

  const statusLabel: Record<string, string> = {
    opening: "ОТКРЫВАЕТСЯ",
    open: "ОТКРЫТО",
    closing: "ЗАКРЫВАЕТСЯ",
    closed: "ЗАКРЫТО",
    denied: "ОТКАЗАНО",
  }

  const currentColor = gateEvent ? statusColor[gateEvent.status] : "#6b7280"

  return (
    <div className="min-h-screen select-none" style={{ background: "linear-gradient(135deg, #0f1623 0%, #1a2540 50%, #0f1623 100%)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#354469" }}>
            <span className="text-white text-xs font-black">Q</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm">QPark LPR</p>
            <p className="text-white/40 text-xs font-mono">Система въезда / выезда</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-white/60 font-mono text-sm">{currentTime}</p>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${socketConnected ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${socketConnected ? "bg-green-400" : "bg-white/30"}`} style={{ animation: socketConnected ? "pulse 2s infinite" : "none" }} />
            {socketConnected ? "Онлайн" : "Офлайн"}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column: stats */}
        <div className="flex flex-col gap-4">
          {/* Spot stats */}
          <div className="rounded-2xl p-5 border border-white/10" style={{ background: "rgba(255,255,255,0.04)" }}>
            <p className="text-white/50 text-xs font-mono uppercase tracking-widest mb-4">Места на парковке</p>
            <div className="space-y-3">
              {[
                { label: "Свободно", value: spotStats.free, color: "#22c55e", bg: "rgba(34,197,94,0.15)" },
                { label: "Занято", value: spotStats.occupied, color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
                { label: "Забронировано", value: spotStats.booked, color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: bg }}>
                  <span className="text-white/70 text-sm">{label}</span>
                  <span className="text-2xl font-black" style={{ color }}>{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl px-4 py-3 border border-white/10">
                <span className="text-white/50 text-sm">Всего мест</span>
                <span className="text-2xl font-black text-white/60">{spotStats.total}</span>
              </div>
            </div>
          </div>

          {/* Barrier stats */}
          <div className="rounded-2xl p-5 border border-white/10" style={{ background: "rgba(255,255,255,0.04)" }}>
            <p className="text-white/50 text-xs font-mono uppercase tracking-widest mb-4">Статистика сессии</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                <p className="text-4xl font-black text-green-400">{openCount}</p>
                <p className="text-white/50 text-xs mt-1">Открытий</p>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(239,68,68,0.15)" }}>
                <p className="text-4xl font-black text-red-400">{deniedCount}</p>
                <p className="text-white/50 text-xs mt-1">Отказов</p>
              </div>
            </div>
          </div>
        </div>

        {/* Center column: gate + plate display */}
        <div className="flex flex-col items-center gap-6">

          {/* Plate display */}
          <div
            className="w-full rounded-2xl border-2 px-6 py-5 text-center transition-all duration-500"
            style={{
              borderColor: currentColor,
              background: gateEvent ? `${currentColor}12` : "rgba(255,255,255,0.03)",
              boxShadow: gateEvent ? `0 0 60px ${currentColor}25` : "none",
            }}
          >
            {gateEvent ? (
              <>
                <p className="text-white/40 text-xs font-mono uppercase tracking-widest mb-2">
                  {gateEvent.type === "entry" ? "▼ ВЪЕЗД" : "▲ ВЫЕЗД"} · Место {gateEvent.spotNumber}
                </p>
                <p
                  className="text-5xl font-black font-mono tracking-widest mb-3 transition-all duration-300"
                  style={{ color: currentColor, textShadow: `0 0 30px ${currentColor}80` }}
                >
                  {gateEvent.carPlate}
                </p>
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
                  style={{ background: `${currentColor}25`, color: currentColor }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: currentColor, animation: "pulse 1s infinite" }} />
                  {statusLabel[gateEvent.status]}
                </div>
                {gateEvent.message && (
                  <p className="text-red-400 text-sm mt-2">{gateEvent.message}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-white/20 text-xs font-mono uppercase tracking-widest mb-3">ГОС. НОМЕР</p>
                <p className="text-white/10 text-5xl font-black font-mono tracking-widest mb-3">— — — — —</p>
                <p className="text-white/20 text-sm">Ожидание автомобиля...</p>
                <div className="flex justify-center gap-1.5 mt-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/20"
                      style={{ animation: `pulse 1.5s ease-in-out ${i * 0.4}s infinite` }} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Gate animation */}
          <div className="relative flex flex-col items-start" style={{ width: 280, height: 220 }}>
            {/* Road */}
            <div className="absolute bottom-0 left-0 right-0 h-14 rounded-b-xl overflow-hidden">
              <div className="w-full h-full flex items-center justify-center gap-5" style={{ background: "#1e2535" }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-8 h-1.5 bg-yellow-400/40 rounded" />
                ))}
              </div>
            </div>

            {/* Pole */}
            <div className="absolute rounded-lg" style={{
              left: 30, bottom: 56, width: 24, height: 90,
              background: "linear-gradient(to right, #354469, #4b5e8e)",
              boxShadow: "inset -3px 0 6px rgba(0,0,0,0.5)"
            }} />

            {/* Arm pivot */}
            <div className="absolute" style={{ left: 30, bottom: 56 + 80, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{
                position: "absolute", left: 24, top: "50%",
                width: 190, height: 12,
                transformOrigin: "0 50%",
                transform: `rotate(${armAngle}deg)`,
                borderRadius: 6,
                background: isOpen
                  ? "linear-gradient(to right, #22c55e, #16a34a)"
                  : gateEvent?.status === "denied"
                    ? "linear-gradient(to right, #ef4444, #b91c1c)"
                    : "linear-gradient(to right, #495E8E, #354469)",
                boxShadow: isOpen
                  ? "0 0 20px rgba(34,197,94,0.7)"
                  : gateEvent?.status === "denied"
                    ? "0 0 20px rgba(239,68,68,0.7)"
                    : "none",
              }}>
                {[25, 70, 115, 160].map(x => (
                  <div key={x} style={{ position: "absolute", left: x, top: 0, width: 8, height: "100%", background: "rgba(0,0,0,0.2)", borderRadius: 2 }} />
                ))}
              </div>
              <div className="w-4 h-4 rounded-full z-10" style={{ background: "#9ca3af", boxShadow: "0 0 6px rgba(255,255,255,0.2)" }} />
            </div>

            {/* Status LED */}
            <div className="absolute rounded-full" style={{
              left: 38, bottom: 56 + 96,
              width: 8, height: 8,
              background: currentColor,
              boxShadow: gateEvent ? `0 0 12px ${currentColor}` : "none",
            }} />
          </div>
        </div>

        {/* Right column: log */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl p-5 border border-white/10 flex-1" style={{ background: "rgba(255,255,255,0.04)" }}>
            <p className="text-white/50 text-xs font-mono uppercase tracking-widest mb-4">Лог событий</p>
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <span className="text-2xl">📋</span>
                </div>
                <p className="text-white/30 text-sm">Событий пока нет</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {history.map((h, i) => (
                  <div key={i} className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                    style={{ background: h.status === "denied" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.08)" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{h.status === "denied" ? "✗" : h.type === "entry" ? "▼" : "▲"}</span>
                      <div>
                        <p className="font-mono font-bold text-sm" style={{ color: h.status === "denied" ? "#ef4444" : "#22c55e" }}>
                          {h.carPlate}
                        </p>
                        <p className="text-white/30 text-xs">
                          {h.type === "entry" ? "Въезд" : "Выезд"} · {h.spotNumber}
                        </p>
                      </div>
                    </div>
                    <span className="text-white/30 text-xs font-mono">{h.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}
