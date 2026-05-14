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

const OPEN_DURATION_MS = 4000

export function BarrierGate() {
  const [gateEvent, setGateEvent] = useState<GateEvent | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [armAngle, setArmAngle] = useState(0) // 0 = closed, -90 = open
  const [history, setHistory] = useState<(GateEvent & { time: string })[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const animateArm = (targetAngle: number, onDone?: () => void) => {
    if (animRef.current) clearInterval(animRef.current)
    animRef.current = setInterval(() => {
      setArmAngle(prev => {
        const step = targetAngle > prev ? 6 : -6
        const next = targetAngle > prev
          ? Math.min(prev + Math.abs(step), targetAngle)
          : Math.max(prev - Math.abs(step), targetAngle)
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
    setHistory(prev => [{ ...evt, status: "open" as const, time: new Date().toLocaleTimeString("ru-RU") }, ...prev].slice(0, 20))

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
    setHistory(prev => [{ ...evt, status: "denied" as const, time: new Date().toLocaleTimeString("ru-RU") }, ...prev].slice(0, 20))
    setTimeout(() => setGateEvent(null), 3000)
  }

  useEffect(() => {
    const socket = getSocket()

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
      socket.off("lpr-gate-open", onGateOpen)
      socket.off("lpr-gate-denied", onGateDenied)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (animRef.current) clearInterval(animRef.current)
    }
  }, [])

  const statusColor = {
    opening: "#22c55e",
    open: "#22c55e",
    closing: "#f59e0b",
    closed: "#6b7280",
    denied: "#ef4444",
  }

  const statusLabel = {
    opening: "ОТКРЫВАЕТСЯ",
    open: "ОТКРЫТО",
    closing: "ЗАКРЫВАЕТСЯ",
    closed: "ЗАКРЫТО",
    denied: "ОТКАЗАНО",
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 select-none">

      {/* Header */}
      <div className="mb-8 text-center">
        <p className="text-gray-500 text-sm font-mono uppercase tracking-widest">QPark LPR System</p>
        <h1 className="text-2xl font-bold mt-1">Шлагбаум — Въезд / Выезд</h1>
      </div>

      {/* Gate visual */}
      <div className="relative flex flex-col items-start mb-8" style={{ width: 320, height: 260 }}>

        {/* Road */}
        <div className="absolute bottom-0 left-0 right-0 h-16 rounded-b-xl overflow-hidden">
          <div className="w-full h-full bg-gray-800 flex items-center justify-center gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-10 h-2 bg-yellow-400 rounded opacity-60" />
            ))}
          </div>
        </div>

        {/* Pillar */}
        <div
          className="absolute rounded-lg"
          style={{
            left: 40, bottom: 64, width: 28, height: 100,
            background: "linear-gradient(to right, #374151, #4b5563)",
            boxShadow: "inset -3px 0 6px rgba(0,0,0,0.4)"
          }}
        />

        {/* Arm pivot box */}
        <div
          className="absolute"
          style={{ left: 40, bottom: 64 + 90, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {/* Arm — rotates from this pivot */}
          <div
            style={{
              position: "absolute",
              left: 28,
              top: "50%",
              width: 210,
              height: 14,
              transformOrigin: "0 50%",
              transform: `rotate(${armAngle}deg)`,
              transition: "none",
              borderRadius: 7,
              background: isOpen
                ? "linear-gradient(to right, #22c55e, #16a34a)"
                : gateEvent?.status === "denied"
                  ? "linear-gradient(to right, #ef4444, #b91c1c)"
                  : "linear-gradient(to right, #f59e0b, #d97706)",
              boxShadow: isOpen
                ? "0 0 16px rgba(34,197,94,0.6)"
                : gateEvent?.status === "denied"
                  ? "0 0 16px rgba(239,68,68,0.6)"
                  : "0 0 8px rgba(245,158,11,0.3)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {/* Stripes */}
            {[30, 80, 130, 180].map(x => (
              <div
                key={x}
                style={{
                  position: "absolute",
                  left: x,
                  top: 0,
                  width: 10,
                  height: "100%",
                  background: "rgba(0,0,0,0.25)",
                  borderRadius: 2,
                }}
              />
            ))}
          </div>

          {/* Pivot dot */}
          <div className="w-5 h-5 rounded-full bg-gray-300 z-10" style={{ boxShadow: "0 0 6px rgba(255,255,255,0.3)" }} />
        </div>

        {/* Status light on pillar */}
        <div
          className="absolute rounded-full"
          style={{
            left: 50, bottom: 64 + 105,
            width: 10, height: 10,
            background: gateEvent ? statusColor[gateEvent.status] : "#6b7280",
            boxShadow: gateEvent ? `0 0 10px ${statusColor[gateEvent.status]}` : "none",
          }}
        />
      </div>

      {/* Status card */}
      <div
        className="rounded-2xl border px-8 py-5 text-center mb-8 transition-all duration-300"
        style={{
          minWidth: 300,
          borderColor: gateEvent ? statusColor[gateEvent.status] : "#374151",
          background: gateEvent ? `${statusColor[gateEvent.status]}15` : "#111827",
          boxShadow: gateEvent ? `0 0 30px ${statusColor[gateEvent.status]}30` : "none",
        }}
      >
        {gateEvent ? (
          <>
            <p
              className="text-3xl font-black mb-2 tracking-widest"
              style={{ color: statusColor[gateEvent.status] }}
            >
              {statusLabel[gateEvent.status]}
            </p>
            <p className="text-xl font-mono font-bold text-white mb-1">{gateEvent.carPlate}</p>
            <p className="text-sm text-gray-400">
              {gateEvent.type === "entry" ? "Въезд" : "Выезд"} · Место {gateEvent.spotNumber}
            </p>
            {gateEvent.message && (
              <p className="text-sm text-red-400 mt-1">{gateEvent.message}</p>
            )}
          </>
        ) : (
          <>
            <p className="text-xl font-bold text-gray-500 mb-1">ОЖИДАНИЕ</p>
            <p className="text-sm text-gray-600">Система готова к работе</p>
            <div className="flex justify-center gap-1 mt-3">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-gray-600"
                  style={{ animation: `pulse 1.5s ease-in-out ${i * 0.3}s infinite` }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* History log */}
      {history.length > 0 && (
        <div className="w-full max-w-md">
          <p className="text-xs text-gray-600 font-mono uppercase tracking-widest mb-2">Лог событий</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-xs font-mono bg-gray-900 rounded-lg px-3 py-2">
                <span style={{ color: statusColor[h.status] }}>
                  {h.status === "denied" ? "✗" : "✓"} {h.type === "entry" ? "↓" : "↑"} {h.carPlate}
                </span>
                <span className="text-gray-600">
                  {h.spotNumber} · {h.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}
