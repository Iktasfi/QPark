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
  const [armAngle, setArmAngle] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const socket = getSocket()

    const onGateOpen = (data: { carPlate: string; spotNumber: string; type?: "entry" | "exit" }) => {
      openGate({ type: data.type ?? "entry", carPlate: data.carPlate, spotNumber: data.spotNumber, status: "opening" })
    }
    const onGateDenied = (data: { carPlate: string; spotNumber?: string; reason?: string }) => {
      denyGate({ type: "entry", carPlate: data.carPlate, spotNumber: data.spotNumber ?? "—", status: "denied", message: data.reason })
    }

    socket.on("lpr-gate-open",   onGateOpen)
    socket.on("lpr-gate-denied", onGateDenied)

    return () => {
      socket.off("lpr-gate-open",   onGateOpen)
      socket.off("lpr-gate-denied", onGateDenied)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (animRef.current)  clearInterval(animRef.current)
    }
  }, [])

  const animateArm = (target: number, onDone?: () => void) => {
    if (animRef.current) clearInterval(animRef.current)
    animRef.current = setInterval(() => {
      setArmAngle(prev => {
        const step = 6
        const next = target > prev ? Math.min(prev + step, target) : Math.max(prev - step, target)
        if (next === target) {
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
    setTimeout(() => setGateEvent(null), 3000)
  }

  const STATUS_COLOR: Record<string, string> = {
    opening: "#22c55e",
    open:    "#22c55e",
    closing: "#f59e0b",
    closed:  "#6b7280",
    denied:  "#ef4444",
  }
  const STATUS_LABEL: Record<string, string> = {
    opening: "ОТКРЫВАЕТСЯ",
    open:    "ОТКРЫТО",
    closing: "ЗАКРЫВАЕТСЯ",
    closed:  "ЗАКРЫТО",
    denied:  "ОТКАЗАНО",
  }

  const color = gateEvent ? STATUS_COLOR[gateEvent.status] : "#6b7280"

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center select-none"
      style={{ background: "linear-gradient(135deg, #0f1623 0%, #1a2540 50%, #0f1623 100%)" }}
    >
      {/* Title */}
      <p className="text-white/40 text-xs font-mono uppercase tracking-widest mb-1">QPARK LPR SYSTEM</p>
      <h1 className="text-white text-2xl font-bold mb-12">Шлагбаум — Въезд / Выезд</h1>

      {/* Gate animation */}
      <div className="relative flex flex-col items-start mb-10" style={{ width: 280, height: 200 }}>
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

        {/* Arm */}
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
                : "linear-gradient(to right, #f59e0b, #d97706)",
            boxShadow: isOpen
              ? "0 0 20px rgba(34,197,94,0.7)"
              : gateEvent?.status === "denied"
                ? "0 0 20px rgba(239,68,68,0.7)"
                : "0 0 10px rgba(245,158,11,0.4)",
            transition: "background 0.3s",
          }}>
            {[25, 70, 115, 160].map(x => (
              <div key={x} style={{ position: "absolute", left: x, top: 0, width: 8, height: "100%", background: "rgba(0,0,0,0.2)", borderRadius: 2 }} />
            ))}
          </div>
          <div className="w-4 h-4 rounded-full z-10" style={{ background: "#9ca3af" }} />
        </div>
      </div>

      {/* Status card */}
      <div
        className="rounded-2xl px-10 py-6 text-center transition-all duration-500"
        style={{
          background: gateEvent ? `${color}15` : "rgba(255,255,255,0.04)",
          border: `1.5px solid ${gateEvent ? color : "rgba(255,255,255,0.08)"}`,
          boxShadow: gateEvent ? `0 0 40px ${color}30` : "none",
          minWidth: 300,
        }}
      >
        {gateEvent ? (
          <>
            <p className="text-white/40 text-xs font-mono uppercase tracking-widest mb-2">
              {gateEvent.type === "entry" ? "▼ ВЪЕЗД" : "▲ ВЫЕЗД"} · {gateEvent.spotNumber}
            </p>
            <p className="text-4xl font-black font-mono tracking-widest mb-3"
               style={{ color, textShadow: `0 0 20px ${color}80` }}>
              {gateEvent.carPlate}
            </p>
            <p className="text-sm font-bold" style={{ color }}>
              {STATUS_LABEL[gateEvent.status]}
            </p>
            {gateEvent.message && (
              <p className="text-red-400 text-xs mt-1">{gateEvent.message}</p>
            )}
          </>
        ) : (
          <>
            <p className="text-white font-bold text-lg uppercase tracking-widest mb-1">ОЖИДАНИЕ</p>
            <p className="text-white/40 text-sm mb-3">Система готова к работе</p>
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-white/20"
                  style={{ animation: `pulse 1.5s ease-in-out ${i * 0.4}s infinite` }} />
              ))}
            </div>
          </>
        )}
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
