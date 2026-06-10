"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParking } from "@/lib/parking-context"
import { getSocket } from "@/lib/socket"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MapPin, Car, Clock, AlertTriangle, Camera, Calendar, Check, X, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

const extendOptions = [
  { days: 1,  price: 900,  perDay: 900 },
  { days: 3,  price: 2400, perDay: 800 },
  { days: 5,  price: 3000, perDay: 600 },
  { days: 7,  price: 3500, perDay: 500 },
  { days: 14, price: 6000, perDay: 429 },
]

export function ActiveBookingScreen() {
  const { activeBooking, selectedSpot: _selectedSpot, spots, user, setCurrentScreen, setActiveBooking, updateSpot, setUser, t, addNotification } = useParking()

  const selectedSpot = activeBooking
    ? (spots.find(s => s.id === activeBooking.spotId) ?? _selectedSpot)
    : _selectedSpot

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const isLongTerm = selectedSpot?.type === "long-term" || activeBooking?.type === "long-term"
  // Use arrivedAt from booking record — reliable across swaps/reassignments
  const isArrived = !isLongTerm && !!activeBooking?.arrivedAt
  const elapsedSec = activeBooking ? Math.floor((now - new Date(activeBooking.startTime).getTime()) / 1000) : 0
  const timer = Math.max(0, 30 * 60 - elapsedSec)

  const GRACE_MS = 7 * 60 * 1000          // arrival grace (LPR entry)
  const OVERSTAY_GRACE_MS = 5 * 60 * 1000 // 5-min buffer after paid time before charges

  // Short-term overstay
  const endTimeMs           = activeBooking?.endTime ? new Date(activeBooking.endTime).getTime() : null
  const overstayGraceEndMs  = endTimeMs ? endTimeMs + OVERSTAY_GRACE_MS : null
  // Grace period: paid time expired but 5-min buffer still running
  const isOverstayGrace     = isArrived && endTimeMs !== null && now > endTimeMs && overstayGraceEndMs !== null && now <= overstayGraceEndMs
  const overstayGraceRemSec = isOverstayGrace && overstayGraceEndMs ? Math.max(0, Math.floor((overstayGraceEndMs - now) / 1000)) : 0
  // Actual overstay: 5-min grace expired
  const isOverstay          = isArrived && overstayGraceEndMs !== null && now > overstayGraceEndMs
  const overstayMinutes     = isOverstay && overstayGraceEndMs ? Math.floor((now - overstayGraceEndMs) / 60000) : 0
  const overtimeCost        = overstayMinutes * 3

  // Long-term overstay: charges start immediately at endDate
  const ltInsideSpot    = isLongTerm && selectedSpot?.status === "OCCUPIED"
  const endDateMs       = activeBooking?.endDate ? new Date(activeBooking.endDate).getTime() : null
  const isLtExpired     = isLongTerm && endDateMs !== null && now > endDateMs

  // Long-term: 30-min arrival grace period countdown (uses server startTime)
  const LT_NOSHOW_MS = 30 * 60 * 1000
  const ltBookingStartMs = isLongTerm && activeBooking?.startTime
    ? new Date(activeBooking.startTime).getTime() : null
  const ltArrivalDeadlineMs = ltBookingStartMs !== null ? ltBookingStartMs + LT_NOSHOW_MS : null
  const ltArrivalSecsLeft = ltArrivalDeadlineMs !== null
    ? Math.max(0, Math.floor((ltArrivalDeadlineMs - now) / 1000)) : 0
  const ltArrivalExpired  = ltArrivalDeadlineMs !== null && now >= ltArrivalDeadlineMs
  const ltArrivalWarning  = !ltArrivalExpired && ltArrivalSecsLeft <= 5 * 60
  const showLtArrivalTimer = isLongTerm && !ltInsideSpot && ltArrivalDeadlineMs !== null
  const isLtOverstay    = ltInsideSpot && isLtExpired
  const ltOverstayMinutes = isLtOverstay && endDateMs ? Math.floor((now - endDateMs) / 60000) : 0
  // Live debt for expired rental (even if car is outside)
  const ltDebtMinutes   = isLtExpired && endDateMs ? Math.floor((now - endDateMs) / 60000) : 0
  const ltDebt          = ltDebtMinutes * 3

  const GRACE_SECONDS = 7 * 60

  // Use server-provided arrivedAt directly — avoids clock skew and ref reset on remount
  const arrivedAtMs = isArrived && activeBooking?.arrivedAt
    ? new Date(activeBooking.arrivedAt).getTime()
    : null

  // User pressed "Start Parking" — persisted to localStorage so it survives navigation/refresh
  const [confirmedParked, setConfirmedParked] = useState(false)
  const [confirmedParkedAt, setConfirmedParkedAt] = useState<number | null>(null)

  // Restore confirmedParkedAt from localStorage on mount
  useEffect(() => {
    if (!activeBooking?.id) return
    const stored = localStorage.getItem(`parkingStarted-${activeBooking.id}`)
    if (stored) {
      setConfirmedParked(true)
      setConfirmedParkedAt(parseInt(stored, 10))
    }
  }, [activeBooking?.id])

  // Schedule iOS notifications from real endTime whenever arrivedAt becomes known.
  // Covers two cases: (a) LPR fires while app is open → booking-updated handler calls this,
  // (b) booking is restored from server with arrivedAt already set → this effect fires once.
  useEffect(() => {
    if (isLongTerm || !activeBooking?.id || !activeBooking.arrivedAt || !activeBooking.endTime) return
    if (notifScheduledForRef.current === activeBooking.id) return
    notifScheduledForRef.current = activeBooking.id
    const endMs = new Date(activeBooking.endTime).getTime()
    if (endMs > Date.now()) {
      import('@/lib/local-notify').then(({ rescheduleBookingNotifications }) => {
        rescheduleBookingNotifications(endMs)
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBooking?.id, activeBooking?.arrivedAt, activeBooking?.endTime])

  const rawElapsed = arrivedAtMs ? Math.floor((now - arrivedAtMs) / 1000) : 0
  const graceRemaining = Math.max(0, GRACE_SECONDS - rawElapsed)
  const isParking = graceRemaining === 0 || confirmedParked

  const parkingStart = confirmedParkedAt ?? (arrivedAtMs ? arrivedAtMs + GRACE_MS : null)
  const parkingDuration = parkingStart
    ? Math.max(0, Math.floor((now - parkingStart) / 1000))
    : 0

  // Booked duration = exactly what user paid for.
  // Prefer the explicit bookedMinutes field (set at booking creation and carried in socket events).
  // Fall back to deriving it from timestamps only when bookedMinutes is unavailable.
  const bookedDurationSec = activeBooking?.bookedMinutes
    ? activeBooking.bookedMinutes * 60
    : (endTimeMs && arrivedAtMs
        ? Math.max(0, Math.floor((endTimeMs - arrivedAtMs - GRACE_MS) / 1000))
        : null)
  // "5 min left" warning: show when ≤5 min remain in booked time
  const timeLeftSec = bookedDurationSec !== null ? Math.max(0, bookedDurationSec - parkingDuration) : null
  const isTimeEndingSoon = isParking && !isOverstay && timeLeftSec !== null && timeLeftSec > 0 && timeLeftSec <= 5 * 60

  // Exit grace: user pressed "Finish" → 7-min window to drive to barrier
  const [exitGraceStarted, setExitGraceStarted] = useState(false)
  const [exitGraceStartedAt, setExitGraceStartedAt] = useState<number | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)
  const [finishOvCharge, setFinishOvCharge] = useState(0)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitGraceElapsed = exitGraceStartedAt ? Math.floor((now - exitGraceStartedAt) / 1000) : 0
  const exitGraceRemaining = Math.max(0, 7 * 60 - exitGraceElapsed)

  const [showGateOpened] = useState(false)
  const notifScheduledForRef = useRef<string | null>(null)
  const [insufficientBalance, setInsufficientBalance] = useState<{ need: number; have: number } | null>(null)
  const [ltFinishing, setLtFinishing] = useState(false)
  const [ltExitRequested, setLtExitRequested] = useState(() => !!activeBooking?.exitRequestedAt)
  const [showExtend, setShowExtend] = useState(false)
  const [selectedExtendDays, setSelectedExtendDays] = useState<number | null>(null)
  const [isExtending, setIsExtending] = useState(false)
  const [showExtendShort, setShowExtendShort] = useState(false)
  const [selectedExtendMins, setSelectedExtendMins] = useState<number | null>(null)
  const [isExtendingShort, setIsExtendingShort] = useState(false)
  const [isTerminating, setIsTerminating] = useState(false)
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false)
  const [showComplaint, setShowComplaint] = useState(false)
  const [complaintReason, setComplaintReason] = useState("")
  const [complaintPhotoUrl, setComplaintPhotoUrl] = useState<string | null>(null)
  const [complaintViolatorPlate, setComplaintViolatorPlate] = useState("")
  const [isSendingComplaint, setIsSendingComplaint] = useState(false)
  const [complaintSent, setComplaintSent] = useState(false)
  const [newSpotOffer, setNewSpotOffer] = useState<{ spotId: string } | null>(null)
  const [noSpotsAvailable, setNoSpotsAvailable] = useState(false)
  const [reassignedAt, setReassignedAt] = useState<number | null>(null)

  const REASSIGN_GRACE = 7 * 60
  const reassignElapsed = reassignedAt ? Math.floor((now - reassignedAt) / 1000) : 0
  const reassignTimer = reassignedAt ? Math.max(0, REASSIGN_GRACE - reassignElapsed) : null

  const selectedCar = user?.cars.find(c => c.plateNumber === activeBooking?.plateNumber)

  // Restore exit grace state on mount/refresh if exitRequestedAt was set
  useEffect(() => {
    if (!activeBooking?.exitRequestedAt || exitGraceStarted) return
    const requestedAt = new Date(activeBooking.exitRequestedAt).getTime()
    const elapsed = Date.now() - requestedAt
    if (elapsed >= 7 * 60 * 1000) {
      // Grace already expired — go home (restore endpoint already cleaned up booking)
      setActiveBooking(null)
      setCurrentScreen("home")
      return
    }
    // Grace still active — resume countdown from where it left off
    setExitGraceStarted(true)
    setExitGraceStartedAt(requestedAt)
    const remaining = 7 * 60 * 1000 - elapsed
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null
      setActiveBooking(null)
      setCurrentScreen("home")
    }, remaining)
    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBooking?.exitRequestedAt])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  


  const handleFinishParking = async () => {
    if (!user || !activeBooking || isFinishing) return
    setIsFinishing(true)
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/bookings/finish-parking", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to finish parking")

      if (data.overstayCharge > 0 && data.newBalance !== null) {
        setFinishOvCharge(data.overstayCharge)
        setUser({ ...user, balance: data.newBalance })
      }

      // Cancel all pending booking notifications since the session is ending
      import('@/lib/local-notify').then(({ cancelBookingNotifications }) => cancelBookingNotifications()).catch(() => {})

      setExitGraceStarted(true)
      setExitGraceStartedAt(Date.now())
      // Persist exitRequestedAt so state survives navigation
      setActiveBooking({ ...activeBooking, exitRequestedAt: new Date() })

      // After 7 min: just navigate home — spot freed only when car exits via LPR/simulate-exit
      exitTimerRef.current = setTimeout(() => {
        exitTimerRef.current = null
        setActiveBooking(null)
        setCurrentScreen("home")
      }, 7 * 60 * 1000)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to finish parking")
    } finally {
      setIsFinishing(false)
    }
  }

  const handleFinishParkingLongterm = async () => {
    if (!user || !activeBooking || ltFinishing) return
    setLtFinishing(true)
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/bookings/finish-parking-longterm", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.status === 402 && data.insufficient) {
        setInsufficientBalance({ need: data.debtAmount, have: data.balance })
        return
      }
      if (!res.ok) throw new Error(data.error || "Failed to finish rental")
      if (data.debtCharged > 0 && user) {
        setUser({ ...user, balance: user.balance - data.debtCharged })
      }
      setLtExitRequested(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to finish rental")
    } finally {
      setLtFinishing(false)
    }
  }

  const shortExtendOptions = [
    { mins: 15, price: 45 },
    { mins: 30, price: 90 },
    { mins: 45, price: 135 },
    { mins: 60, price: 150 },
  ]

  const handleExtendShortBooking = async () => {
    if (!selectedExtendMins || !activeBooking || !user) return
    setIsExtendingShort(true)
    try {
      const token = localStorage.getItem('qpark_token')
      const res = await fetch(`/backend/bookings/${activeBooking.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ additionalMinutes: selectedExtendMins }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to extend')

      // Update local state — extend endTime and bookedMinutes so the timer reflects new duration
      const newEnd = data.newEndTime ? new Date(data.newEndTime) : activeBooking.endTime
      setActiveBooking({
        ...activeBooking,
        endTime: newEnd,
        bookedMinutes: (activeBooking.bookedMinutes ?? 0) + selectedExtendMins,
      })
      setUser({ ...user, balance: data.walletBalance ?? user.balance - (data.extendCost ?? 0) })

      // Reschedule iOS local notifications for the new end time (cancels old ones first)
      if (newEnd) {
        import('@/lib/local-notify').then(({ rescheduleBookingNotifications }) => {
          rescheduleBookingNotifications(new Date(newEnd).getTime())
        }).catch(() => {})
      }

      setShowExtendShort(false)
      setSelectedExtendMins(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка продления')
    } finally {
      setIsExtendingShort(false)
    }
  }

  const handleExtendRental = async () => {
    if (!selectedExtendDays || !activeBooking || !user) return
    setIsExtending(true)
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch(`/backend/rentals/${activeBooking.id}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ additionalDays: selectedExtendDays }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to extend rental")

      setActiveBooking({
        ...activeBooking,
        rentalDays: (activeBooking.rentalDays ?? 0) + selectedExtendDays,
        endDate: data.newEndDate ? new Date(data.newEndDate) : activeBooking.endDate,
      })
      setUser({
        ...user,
        balance: user.balance - (data.extendCost ?? 0),
        transactions: [
          {
            id: `t-${Date.now()}`,
            type: "longterm_charge",
            amount: -(data.extendCost ?? 0),
            description: `Extended rental ${activeBooking.spotId} by ${selectedExtendDays} day${selectedExtendDays > 1 ? "s" : ""}`,
            date: new Date(),
          },
          ...user.transactions,
        ],
      })
      setShowExtend(false)
      setSelectedExtendDays(null)
    } catch (err: any) {
      console.error("Extend rental error:", err)
    } finally {
      setIsExtending(false)
    }
  }

  const handleCancelBooking = useCallback(async () => {
    if (selectedSpot) {
      updateSpot(selectedSpot.id, { status: "FREE", bookedBy: undefined, plateNumber: undefined })
    }
    const token = localStorage.getItem("qpark_token")
    try {
      const res = await fetch("/backend/bookings/cancel-by-spot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ spotNumber: activeBooking?.spotId }),
      })
      if (res.ok && user) {
        const data = await res.json()
        if (data.refundAmount && data.refundAmount > 0) {
          setUser({ ...user, balance: user.balance + data.refundAmount })
        }
      }
    } catch {}
    setActiveBooking(null)
    setCurrentScreen("home")
  }, [selectedSpot, activeBooking, user, setUser, updateSpot, setActiveBooking, setCurrentScreen])

  const handleTerminateRental = useCallback(async () => {
    if (!activeBooking || !user) return
    setIsTerminating(true)
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/rentals/terminate-by-spot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ spotNumber: activeBooking.spotId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to terminate rental")
      }
      if (selectedSpot) {
        updateSpot(selectedSpot.id, { status: "FREE", bookedBy: undefined, plateNumber: undefined })
      }
      setActiveBooking(null)
      setCurrentScreen("home")
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to terminate rental")
    } finally {
      setIsTerminating(false)
      setShowTerminateConfirm(false)
    }
  }, [activeBooking, user, selectedSpot, updateSpot, setActiveBooking, setCurrentScreen])
  
  const handleComplaintPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const MAX = 800
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
        canvas.width = img.width * ratio
        canvas.height = img.height * ratio
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
        setComplaintPhotoUrl(canvas.toDataURL("image/jpeg", 0.7))
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const handleSendComplaint = async () => {
    if (!activeBooking || !user || !complaintReason.trim()) return
    setIsSendingComplaint(true)
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingId: activeBooking.id,
          spotId: activeBooking.spotId,
          reason: complaintReason,
          photoUrl: complaintPhotoUrl,
          violatorPlateManual: complaintViolatorPlate.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Server error ${res.status}`)
      }
      setComplaintSent(true)
      setShowComplaint(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error")
    } finally {
      setIsSendingComplaint(false)
    }
  }

  const [spotMovedNotice, setSpotMovedNotice] = useState<string | null>(null)
  const [gateBlockedReason, setGateBlockedReason] = useState<string | null>(null)

  // Listen for spot reassignment from admin
  useEffect(() => {
    const socket = getSocket()

    // Victim: already physically inside — update spot label, clear "waiting for admin" state, show notice
    const handleReassigned = (data: { userId: string; newSpotId: string }) => {
      if (data.userId === user?.id && activeBooking) {
        setActiveBooking({ ...activeBooking, spotId: data.newSpotId, arrivedAt: activeBooking.arrivedAt ?? new Date() })
        setComplaintSent(false)
        setSpotMovedNotice(data.newSpotId)
        setTimeout(() => setSpotMovedNotice(null), 10000)
        addNotification({ type: 'spot', title: t.newSpotFound, message: `${t.newSpotFoundDesc} ${data.newSpotId}` })
      }
    }

    const handleSpotMoved = (data: { userId: string; newSpotId: string; oldSpotId?: string }) => {
      if (data.userId === user?.id && activeBooking) {
        setActiveBooking({ ...activeBooking, spotId: data.newSpotId, arrivedAt: activeBooking.arrivedAt ?? new Date() })
        setSpotMovedNotice(data.newSpotId)
        setTimeout(() => setSpotMovedNotice(null), 6000)
        addNotification({ type: 'spot', title: t.spotMovedTo, message: data.newSpotId })
      }
    }

    const handleNoSpots = (data: { userId: string; refundAmount: number }) => {
      if (data.userId === user?.id) {
        setNoSpotsAvailable(true)
        if (data.refundAmount && user) {
          setUser({ ...user, balance: user.balance + data.refundAmount })
        }
      }
    }
    const handleOverstayWarning = (data: { userId: string }) => {
      if (data.userId === user?.id) {
        // Firebase push will be added later — for now socket is enough
        // The UI banner already shows via isGracePeriod/isOverstay computed from endTime
      }
    }
    const handleOverstayCharged = (data: { userId: string; minutes: number; cost: number }) => {
      if (data.userId === user?.id && user) {
        setUser({ ...user, balance: user.balance - data.cost })
      }
    }
    const handleBookingExtended = (data: { bookingId: string; endTime: string; additionalMinutes?: number }) => {
      if (activeBooking && data.bookingId === activeBooking.id) {
        setActiveBooking({
          ...activeBooking,
          endTime: new Date(data.endTime),
          ...(data.additionalMinutes ? { bookedMinutes: (activeBooking.bookedMinutes ?? 0) + data.additionalMinutes } : {}),
        })
      }
    }
    // LPR entry: backend recalculates estimatedEndTime based on actual arrival
    const handleBookingUpdated = (data: { bookingId: string; endTime: string; arrivedAt?: string; bookedMinutes?: number }) => {
      if (activeBooking && data.bookingId === activeBooking.id) {
        const wasArrived = !!activeBooking.arrivedAt
        setActiveBooking({
          ...activeBooking,
          endTime: new Date(data.endTime),
          ...(data.arrivedAt ? { arrivedAt: new Date(data.arrivedAt) } : {}),
          ...(data.bookedMinutes ? { bookedMinutes: data.bookedMinutes } : {}),
        })
        // First arrival: reschedule iOS notifications from the real server endTime
        if (data.arrivedAt && !wasArrived && data.endTime) {
          const endMs = new Date(data.endTime).getTime()
          import('@/lib/local-notify').then(({ rescheduleBookingNotifications }) => {
            rescheduleBookingNotifications(endMs)
          }).catch(() => {})
        }
      }
    }
    // LPR (or simulate-exit) confirmed the car physically left → cancel fallback timer and go home
    const handleParkingExitConfirmed = (data: { userId: string; bookingId: string }) => {
      if (data.userId === user?.id) {
        if (exitTimerRef.current) {
          clearTimeout(exitTimerRef.current)
          exitTimerRef.current = null
        }
        if (data.bookingId) localStorage.removeItem(`parkingStarted-${data.bookingId}`)
        import('@/lib/local-notify').then(({ cancelBookingNotifications }) => cancelBookingNotifications()).catch(() => {})
        setActiveBooking(null)
        setCurrentScreen("home")
      }
    }
    // LPR denied at our spot — OCR couldn't read plate or plate mismatch
    const handleGateDenied = (data: { carPlate: string; spotNumber: string; reason: string }) => {
      if (!activeBooking || isArrived) return
      // Match by spot number or by user's car plate
      const ourSpot = data.spotNumber === activeBooking.spotId
      const ourPlate = user?.cars.some(c => c.plateNumber.replace(/\s/g, '').toUpperCase() === data.carPlate.replace(/\s/g, '').toUpperCase())
      if (ourSpot || ourPlate) {
        setGateBlockedReason(data.reason || 'Шлагбаум не открылся')
      }
    }

    socket.on("spot-reassigned", handleReassigned)
    socket.on("spot-moved", handleSpotMoved)
    socket.on("no-spots-available", handleNoSpots)
    socket.on("overstay-warning", handleOverstayWarning)
    socket.on("overstay-charged", handleOverstayCharged)
    socket.on("booking-extended", handleBookingExtended)
    socket.on("booking-updated", handleBookingUpdated)
    socket.on("parking-exit-confirmed", handleParkingExitConfirmed)
    socket.on("lpr-gate-denied", handleGateDenied)
    return () => {
      socket.off("spot-reassigned", handleReassigned)
      socket.off("spot-moved", handleSpotMoved)
      socket.off("no-spots-available", handleNoSpots)
      socket.off("overstay-warning", handleOverstayWarning)
      socket.off("overstay-charged", handleOverstayCharged)
      socket.off("booking-extended", handleBookingExtended)
      socket.off("booking-updated", handleBookingUpdated)
      socket.off("parking-exit-confirmed", handleParkingExitConfirmed)
      socket.off("lpr-gate-denied", handleGateDenied)
    }
  }, [user, activeBooking])

  const handleAcceptNewSpot = async () => {
    if (!newSpotOffer || !activeBooking || !user) return
    const token = localStorage.getItem("qpark_token")
    await fetch("/backend/complaints/accept-reassignment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ oldSpotId: activeBooking.spotId, newSpotId: newSpotOffer.spotId, bookingId: activeBooking.id }),
    }).catch(() => {})
    setActiveBooking({ ...activeBooking, spotId: newSpotOffer.spotId })
    setReassignedAt(Date.now())
    setNewSpotOffer(null)
  }

  const [history, setHistory] = useState<{id: string; spotId: string; plateNumber: string; status: string; startTime: string; totalCost: number; type: string}[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!activeBooking) {
      const token = localStorage.getItem("qpark_token")
      if (!token) return
      // First try to restore active booking — context may have lost it (e.g. socket event or re-mount)
      fetch("/backend/bookings/restore", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(restored => {
          if (restored) {
            setActiveBooking(restored)
          } else {
            setHistoryLoading(true)
            fetch("/backend/bookings/history", { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.json() : [])
              .then(data => setHistory(Array.isArray(data) ? data : []))
              .catch(() => {})
              .finally(() => setHistoryLoading(false))
          }
        })
        .catch(() => {})
    }
  }, [activeBooking])

  if (!activeBooking) {
    return (
      <div className="flex flex-col pb-4" style={{ height: 'calc(100vh - env(safe-area-inset-top) - 8px)' }}>
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-xl font-bold text-foreground">{t.myBookings}</h1>
          <p className="text-sm text-muted-foreground">{t.noActiveBooking}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-3">
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Car className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">{t.noBookingHistory}</p>
              <Button onClick={() => setCurrentScreen("map")} className="bg-[#354469] hover:bg-[#354469]/90">{t.findParkingBtn}</Button>
            </div>
          ) : (
            history.map(b => {
              const isActive = b.status === "ACTIVE"
              const isLT = b.type === "long-term"
              return (
                <div key={b.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-1 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{b.spotId}</span>
                      {isLT && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                          {t.longTerm}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      isActive       ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      b.status === "COMPLETED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    )}>
                      {isActive ? t.active : b.status === "COMPLETED" ? t.completed : t.cancelled}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {b.plateNumber} · {isLT ? t.longTerm : t.shortTerm}
                    {isLT && (b as any).rentalDays ? ` · ${(b as any).rentalDays} ${t.days}` : ""}
                  </p>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{new Date(b.startTime).toLocaleString("ru-RU", { timeZone: "Asia/Almaty", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {b.totalCost > 0 && <span className="font-medium text-foreground">{b.totalCost.toLocaleString()} ₸</span>}
                  </div>
                  {isActive && isLT && (b as any).endDate && (
                    <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                      До {new Date((b as any).endDate).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
        <div className="px-4 pt-2">
          <Button onClick={() => setCurrentScreen("map")} className="w-full bg-[#354469] hover:bg-[#354469]/90">{t.findParkingBtn}</Button>
        </div>
      </div>
    )
  }
  
  if (showGateOpened) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
          <svg className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">{t.paymentSuccessful}</h2>
          <p className="text-gray-500 text-sm">{t.driveToExitMsg}</p>
        </div>
        <div className="w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 content-bottom-pad">
      {spotMovedNotice && (
        <div className="rounded-xl px-4 py-3 text-sm font-medium text-white bg-blue-600 flex items-center gap-2">
          <span>📍</span>
          <span>{t.spotMovedTo} <strong>{spotMovedNotice}</strong></span>
        </div>
      )}

      {/* LPR gate denied — OCR couldn't read plate or mismatch */}
      {gateBlockedReason && (
        <div className="rounded-xl px-4 py-3 bg-red-50 border border-red-300 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Шлагбаум не открылся</p>
            <p className="text-xs text-red-600 mb-2">{gateBlockedReason} — напишите менеджеру, он откроет вручную</p>
            <button
              onClick={() => setCurrentScreen("support")}
              className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-1.5 transition-colors"
            >
              Написать менеджеру →
            </button>
          </div>
          <button onClick={() => setGateBlockedReason(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="w-16" />
        <div className="flex-1 text-center">
          <h1 className="text-xl font-bold text-foreground">{t.activeBooking}</h1>
          <p className="text-sm text-muted-foreground">
            {isLongTerm ? t.longTermReservation : t.shortTermParking}
          </p>
        </div>
        <div className="w-16 flex justify-end">
          <Badge 
            variant={isArrived ? "default" : "secondary"}
            className={isArrived ? "bg-[oklch(var(--status-occupied))]" : ""}
          >
            {isArrived ? t.parked : t.enRoute}
          </Badge>
        </div>
      </div>
      
      {/* Long-term: 30-min arrival countdown — hidden once car is inside (OCCUPIED) */}
      {showLtArrivalTimer && (
        <div className={cn(
          "rounded-xl px-4 py-3 flex items-center gap-3 border",
          ltArrivalExpired
            ? "bg-red-500/10 border-red-500/40"
            : ltArrivalWarning
            ? "bg-yellow-400/10 border-yellow-400/40"
            : "bg-blue-500/10 border-blue-500/20"
        )}>
          <Clock className={cn(
            "h-5 w-5 shrink-0",
            ltArrivalExpired ? "text-red-500" : ltArrivalWarning ? "text-yellow-500" : "text-blue-500"
          )} />
          <div className="flex-1">
            {ltArrivalExpired ? (
              <p className="text-sm font-semibold text-red-600">Time expired. Booking will be cancelled.</p>
            ) : ltArrivalWarning ? (
              <>
                <p className="text-sm font-semibold text-yellow-600">Hurry up! 5 minutes to arrive</p>
                <p className="text-xl font-mono font-bold text-yellow-600">
                  {String(Math.floor(ltArrivalSecsLeft / 60)).padStart(2, '0')}:{String(ltArrivalSecsLeft % 60).padStart(2, '0')}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-blue-500 font-medium">Time to arrive</p>
                <p className="text-2xl font-mono font-bold text-blue-700 dark:text-blue-300">
                  {String(Math.floor(ltArrivalSecsLeft / 60)).padStart(2, '0')}:{String(ltArrivalSecsLeft % 60).padStart(2, '0')}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* 5-min overstay grace: paid time expired, grace countdown running.
          Hidden if exit grace is already started (don't show two timers at once). */}
      {isOverstayGrace && !exitGraceStarted && (
        <div className="rounded-xl px-4 py-3 bg-orange-500/10 border border-orange-500/40 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-600">Время истекло — льготный период</p>
            <p className="text-xs text-orange-500">Через <strong>{Math.floor(overstayGraceRemSec / 60)}:{String(overstayGraceRemSec % 60).padStart(2, '0')}</strong> начнётся списание 3₸/мин</p>
          </div>
        </div>
      )}

      {/* Overstay: 5-min grace expired, charges running */}
      {isOverstay && !exitGraceStarted && (
        <div className="rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/40 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-600">Превышение времени стоянки</p>
            <p className="text-xs text-red-500">Идёт списание <strong>3₸/мин</strong> · уже {overstayMinutes} мин</p>
          </div>
          <p className="text-lg font-bold text-red-600 shrink-0">−{overtimeCost}₸</p>
        </div>
      )}

      {/* Long-term: rental expired — show debt and Finish Parking button */}
      {isLtExpired && !ltExitRequested && (
        <div className="rounded-xl px-4 py-3 bg-red-500/10 border border-red-500/40 space-y-2">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-600">Аренда истекла</p>
              <p className="text-xs text-red-500">
                Идёт списание <strong>3₸/мин</strong> · {ltOverstayMinutes} мин
              </p>
            </div>
            {ltDebt > 0 && <p className="text-lg font-bold text-red-600 shrink-0">−{ltDebt}₸</p>}
          </div>
          {isLtOverstay && (
            <p className="text-xs text-red-500 pl-8">Автомобиль всё ещё на парковке. Долг растёт.</p>
          )}
        </div>
      )}
      {/* Long-term: exit approved — car can now leave */}
      {isLtExpired && ltExitRequested && (
        <div className="rounded-xl px-4 py-3 bg-green-500/10 border border-green-500/40 flex items-center gap-3">
          <Check className="h-5 w-5 text-green-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-700">Долг оплачен — можно выезжать</p>
            <p className="text-xs text-green-600">Подъедьте к шлагбауму — он откроется автоматически</p>
          </div>
        </div>
      )}

      {!isLongTerm && !isArrived && !exitGraceStarted && reassignedAt !== null && (
        <Card className={reassignTimer === 0 ? "border-destructive bg-destructive/5" : "border-orange-400 bg-orange-50"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {reassignTimer === 0 ? (
                <AlertTriangle className="h-8 w-8 text-destructive" />
              ) : (
                <Clock className="h-8 w-8 text-orange-600" />
              )}
              <div className="flex-1">
                <p className="text-sm text-orange-700 font-medium">{t.moveToNewSpot}</p>
                <p className="text-3xl font-bold text-foreground">{formatTime(reassignTimer ?? 0)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Новое место</p>
                <p className="text-sm font-semibold text-foreground">{activeBooking?.spotId}</p>
                <p className="text-xs text-muted-foreground">LPR зафиксирует вас</p>
              </div>
            </div>
            {reassignTimer === 0 && (
              <p className="mt-2 text-sm text-destructive">Время истекло — встаньте на место немедленно</p>
            )}
          </CardContent>
        </Card>
      )}

      {!isLongTerm && !isArrived && !exitGraceStarted && reassignedAt === null && (
        <Card className={timer < 300 ? "border-destructive bg-destructive/5" : "border-red-200 bg-red-50"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {timer < 300 ? (
                <AlertTriangle className="h-8 w-8 text-destructive" />
              ) : (
                <Clock className="h-8 w-8 text-red-600" />
              )}
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{t.timeToArrive}</p>
                <p className="text-3xl font-bold text-foreground">{formatTime(timer)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t.driveUpTo}</p>
                <p className="text-sm font-semibold text-foreground">{activeBooking?.spotId}</p>
                <p className="text-xs text-muted-foreground">{t.lprDetect}</p>
              </div>
            </div>
            {timer < 300 && (
              <p className="mt-2 text-sm text-destructive">{t.hurryExpire}</p>
            )}
            <button
              onClick={() => setCurrentScreen("support")}
              className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Шлагбаум не открывается? Написать менеджеру
            </button>
          </CardContent>
        </Card>
      )}
      
      {/* Exit grace card — shown independently of isArrived (spot already freed) */}
      {!isLongTerm && exitGraceStarted && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-green-700">{t.exitGraceTitle}</p>
                  <p className="text-3xl font-bold text-green-800">{formatTime(exitGraceRemaining)}</p>
                  <p className="text-xs text-green-600">{t.exitGraceDesc}</p>
                  {finishOvCharge > 0 && (
                    <p className="text-xs font-medium text-red-600 mt-0.5">{t.overstayCharged}: −{finishOvCharge} ₸</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-green-700">Exit</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Short-term unified timer — 3 phases: active → grace → overstay.
          Only visible after user presses Start Parking (isParking).
          Before that: "Time to arrive" (30 min) → "Find and park" (7 min) → here. */}
      {!isLongTerm && !exitGraceStarted && endTimeMs !== null && isArrived && isParking && (
        <Card className={cn(
          "overflow-hidden",
          isOverstay
            ? "border-red-500 bg-red-50 dark:bg-red-950/30"
            : isOverstayGrace
              ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30"
              : isTimeEndingSoon
                ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30"
                : "border-[#36549B] bg-[#36549B]/5"
        )}>
          <CardContent className="p-5">
            {isOverstay ? (
              /* ─── Phase 3: Overstay — red cost meter ─── */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                  <p className="text-sm font-bold text-red-600">Сверхурочное время</p>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-5xl font-bold tabular-nums text-red-600">{overtimeCost} ₸</p>
                    <p className="text-sm text-red-500 mt-1">{overstayMinutes} мин × 3 ₸/мин</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-semibold text-red-500 bg-red-100 px-2 py-0.5 rounded-full">Долг растёт</span>
                    <p className="text-xs text-gray-500 text-right">+3 ₸ каждую<br/>минуту</p>
                  </div>
                </div>
                <p className="text-xs text-red-400">Спишется автоматически при завершении парковки</p>
              </div>
            ) : isOverstayGrace ? (
              /* ─── Phase 2: Grace — orange 5-min countdown ─── */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-500 shrink-0" />
                  <p className="text-sm font-bold text-orange-600">Время вышло — льготный период</p>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-5xl font-bold tabular-nums text-orange-700">{formatTime(overstayGraceRemSec)}</p>
                    <p className="text-xs text-orange-500 mt-1">до начала 3 ₸/мин</p>
                  </div>
                  <p className="text-sm text-orange-600 font-medium text-right">Выезжайте<br/>или продлите</p>
                </div>
                <Button
                  size="lg"
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => setShowExtendShort(true)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Продлить аренду
                </Button>
              </div>
            ) : (
              /* ─── Phase 1: Active — countdown with elapsed ─── */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className={`h-5 w-5 ${isTimeEndingSoon ? "text-yellow-600" : "text-[#36549B]"}`} />
                    <p className={`text-sm font-semibold ${isTimeEndingSoon ? "text-yellow-700" : "text-[#36549B]"}`}>
                      {isTimeEndingSoon ? '⚠️ Скоро истекает' : 'Осталось времени'}
                    </p>
                  </div>
                  {activeBooking?.isPaid && (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100">
                      <Check className="h-3 w-3 text-green-600" />
                      <span className="text-xs font-semibold text-green-700">{t.paid}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className={`text-5xl font-bold tabular-nums ${isTimeEndingSoon ? "text-yellow-700" : "text-foreground"}`}>
                      {formatTime(timeLeftSec ?? Math.max(0, Math.floor((endTimeMs - now) / 1000)))}
                    </p>
                    {activeBooking?.endTime && (
                      <p className="text-xs text-muted-foreground mt-1">
                        до {new Date(activeBooking.endTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                  {bookedDurationSec !== null && timeLeftSec !== null && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Прошло</p>
                      <p className="text-2xl font-bold tabular-nums text-gray-700 dark:text-gray-300">{formatTime(bookedDurationSec - timeLeftSec)}</p>
                      <p className="text-xs text-gray-400">из {formatTime(bookedDurationSec)}</p>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="lg"
                  className={cn(
                    "w-full",
                    isTimeEndingSoon
                      ? "border-yellow-500 text-yellow-700 hover:bg-yellow-50"
                      : "border-[#354469] text-[#354469] hover:bg-[#354469] hover:text-white"
                  )}
                  onClick={() => setShowExtendShort(true)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Продлить аренду
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Arrival grace: user entered barrier but hasn't pressed Start Parking yet */}
      {!isLongTerm && isArrived && !exitGraceStarted && !isParking && (
        <Card className="border-green-400 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-green-700 font-medium">{t.findAndParkSpot}</p>
                  <p className="text-3xl font-bold text-green-800">{formatTime(graceRemaining)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-green-600">{t.meterStartsAfter}</p>
                <p className="text-sm font-semibold text-green-700">0 &#8376;</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      
      {isLongTerm && (
        <>
          <Card className="border-[oklch(var(--status-reserved))] bg-[oklch(var(--status-reserved)/0.05)]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-8 w-8 text-[oklch(var(--status-reserved))]" />
                  <div>
                    <p className="text-sm text-muted-foreground">{t.rentalPeriod}</p>
                    <p className="text-xl font-bold text-foreground">{activeBooking.rentalDays} {t.daysRemaining}</p>
                  </div>
                </div>
                <Badge variant="outline">{t.paid}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className={selectedSpot?.status === "OCCUPIED"
            ? "border-green-300 bg-green-50"
            : (reassignedAt !== null || complaintSent || activeBooking?.arrivedAt)
              ? "border-orange-300 bg-orange-50"
              : "border-purple-200 bg-purple-50"
          }>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${selectedSpot?.status === "OCCUPIED" ? "bg-green-500" : (reassignedAt !== null || complaintSent || activeBooking?.arrivedAt) ? "bg-orange-400" : "bg-purple-400"}`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedSpot?.status === "OCCUPIED"
                        ? t.carParked
                        : reassignedAt !== null
                          ? t.moveToNewSpot
                          : complaintSent
                            ? t.insideWaiting
                            : (activeBooking?.arrivedAt && selectedSpot?.status !== "RESERVED")
                              ? `${t.relocateTo} ${activeBooking.spotId}`
                              : t.spotReservedOutside}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSpot?.status === "OCCUPIED"
                        ? t.driveToExitLpr
                        : reassignedAt !== null
                          ? t.moveToNewSpotDesc
                          : complaintSent
                            ? t.adminFindingSpot
                            : (activeBooking?.arrivedAt && selectedSpot?.status !== "RESERVED")
                              ? t.carAlreadyInside
                              : t.driveInLpr}
                    </p>
                  </div>
                </div>
                <Car className={`h-6 w-6 ${selectedSpot?.status === "OCCUPIED" ? "text-green-600" : (reassignedAt !== null || complaintSent || activeBooking?.arrivedAt) ? "text-orange-500" : "text-purple-400"}`} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
      
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <MapPin className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.parkingSpot}</p>
              <p className="text-lg font-bold text-foreground">{activeBooking.spotId}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <Car className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.vehicle}</p>
              <p className="font-medium text-foreground">
                {selectedCar?.brand} {selectedCar?.model}
              </p>
              <p className="text-sm text-muted-foreground">{activeBooking.plateNumber}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#36549B]/10">
              <Camera className="h-6 w-6 text-[#36549B]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.entryMethod}</p>
              <p className="font-medium text-foreground">{t.lprCamera}</p>
              <p className="text-xs text-muted-foreground">{t.autoPlate}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      
      <div className="space-y-2 mt-2">
        {/* "5 min left" warning banner */}
        {isTimeEndingSoon && !exitGraceStarted && (
          <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <p className="text-sm text-orange-700 font-medium">{t.timeEndingSoon}</p>
          </div>
        )}

        {/* "Start Parking" — during arrival grace, user confirms they've parked */}
        {isArrived && !isLongTerm && !isParking && !exitGraceStarted && (
          <Button
            size="lg"
            className="w-full gap-2 bg-[#354469] hover:bg-[#354469]/90"
            onClick={() => {
              const t = Date.now()
              setConfirmedParked(true)
              setConfirmedParkedAt(t)
              if (activeBooking?.id) localStorage.setItem(`parkingStarted-${activeBooking.id}`, String(t))
            }}
          >
            <Check className="h-5 w-5" />
            {t.startParking}
          </Button>
        )}

        {/* "Finish Parking" — always shown during active parking, starts exit grace */}
        {isArrived && !isLongTerm && isParking && !exitGraceStarted && (
          <Button
            size="lg"
            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleFinishParking}
            disabled={isFinishing}
          >
            <Check className="h-5 w-5" />
            {isFinishing ? t.processing : t.finishParking}
          </Button>
        )}

        {!isArrived && !isLongTerm && !exitGraceStarted && (
          <Button
            variant="outline"
            size="lg"
            className="w-full hover:bg-[#36549B]/10 hover:border-[#36549B] hover:text-[#36549B]"
            onClick={handleCancelBooking}
          >
            {t.cancelBooking}
          </Button>
        )}

        {(isArrived || isLongTerm) && !complaintSent && !exitGraceStarted && (
          <Button
            variant="outline"
            size="lg"
            className="w-full border-orange-300 text-orange-600 hover:bg-orange-50 hover:border-orange-400"
            onClick={() => setShowComplaint(true)}
          >
            <AlertTriangle className="h-5 w-5 mr-2" />
            {t.spotTaken}
          </Button>
        )}

        {complaintSent && (
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <Check className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-700">{t.complaintSent}</p>
              <p className="text-xs text-green-600">{t.complaintSentDesc}</p>
            </div>
          </div>
        )}
        
        {isLongTerm && isLtExpired && !ltExitRequested && (
          <Button
            size="lg"
            className="w-full gap-2 bg-red-600 hover:bg-red-700 text-white"
            onClick={handleFinishParkingLongterm}
            disabled={ltFinishing}
          >
            <Check className="h-5 w-5" />
            {ltFinishing
              ? t.processing
              : ltDebt > 0
                ? `Завершить аренду — оплатить ${ltDebt}₸`
                : "Завершить аренду"}
          </Button>
        )}

        {isLongTerm && !isLtExpired && (
          <Button
            variant="outline"
            size="lg"
            className="w-full hover:bg-[#36549B]/10 hover:border-[#36549B] hover:text-[#36549B]"
            onClick={() => setShowExtend(true)}
          >
            <Calendar className="h-5 w-5 mr-2" />
            {t.extendRental}
          </Button>
        )}

        {isLongTerm && (
          <Button
            variant="outline"
            size="lg"
            className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400"
            onClick={() => setShowTerminateConfirm(true)}
          >
            <X className="h-5 w-5 mr-2" />
            {t.terminateRental}
          </Button>
        )}
      </div>
      
      {showExtend && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setShowExtend(false); setSelectedExtendDays(null) }}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-28">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#36549B]" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.extendRental}</h2>
              </div>
              <button
                onClick={() => { setShowExtend(false); setSelectedExtendDays(null) }}
                className="p-1 rounded-full hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t.currentPeriod} <span className="font-semibold text-gray-800 dark:text-gray-200">{activeBooking?.rentalDays ?? 0} day{(activeBooking?.rentalDays ?? 0) !== 1 ? "s" : ""}</span> · {t.addMoreDays}
            </p>

            <div className="space-y-2 mb-5">
              {extendOptions.map((option) => (
                <button
                  key={option.days}
                  onClick={() => setSelectedExtendDays(option.days)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border-2 p-3 transition-all",
                    selectedExtendDays === option.days
                      ? "border-[#354469] bg-[#354469]/5 dark:bg-[#354469]/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-[#354469]/40"
                  )}
                >
                  <div className="text-left">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      +{option.days} {option.days === 1 ? "day" : "days"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{option.perDay} ₸/day</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#36549B]">{option.price.toLocaleString()} ₸</p>
                    {selectedExtendDays === option.days && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#354469]">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {selectedExtendDays && (
              <div className="flex justify-between text-sm mb-4 px-1">
                <span className="text-gray-500 dark:text-gray-400">{t.newTotalPeriod}</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {(activeBooking?.rentalDays ?? 0) + selectedExtendDays} days
                </span>
              </div>
            )}

            <Button
              size="lg"
              className="w-full bg-[#354469] hover:bg-[#354469]/90"
              disabled={!selectedExtendDays || isExtending}
              onClick={handleExtendRental}
            >
              {isExtending
                ? t.processing
                : selectedExtendDays
                  ? `${t.confirmExtend} +${selectedExtendDays} day${selectedExtendDays > 1 ? "s" : ""} · ${extendOptions.find(o => o.days === selectedExtendDays)!.price.toLocaleString()} ₸`
                  : t.selectPeriod}
            </Button>
          </div>
        </div>
      )}

      {/* Short-term extend modal */}
      {showExtendShort && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowExtendShort(false); setSelectedExtendMins(null) }} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="px-5 pt-5 pb-2 flex-shrink-0">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-[#36549B]" />
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Продлить парковку</h2>
                </div>
                <button
                  onClick={() => { setShowExtendShort(false); setSelectedExtendMins(null) }}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Выберите, на сколько минут продлить. Оплата спишется сразу.
              </p>
            </div>

            <div className="overflow-y-auto flex-1 px-5 space-y-2 pb-3">
              {shortExtendOptions.map((option) => (
                <button
                  key={option.mins}
                  onClick={() => setSelectedExtendMins(option.mins)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border-2 p-3 transition-all",
                    selectedExtendMins === option.mins
                      ? "border-[#354469] bg-[#354469]/5 dark:bg-[#354469]/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-[#354469]/40"
                  )}
                >
                  <div className="text-left">
                    <p className="font-semibold text-gray-900 dark:text-white">+{option.mins} мин</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">3 ₸/мин</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#36549B]">{option.price} ₸</p>
                    {selectedExtendMins === option.mins && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#354469]">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="px-5 pt-3 pb-10 flex-shrink-0 border-t border-gray-100 dark:border-gray-800">
              <Button
                size="lg"
                className="w-full bg-[#354469] hover:bg-[#354469]/90"
                disabled={!selectedExtendMins || isExtendingShort}
                onClick={handleExtendShortBooking}
              >
                {isExtendingShort
                  ? "Обработка..."
                  : selectedExtendMins
                    ? `Продлить +${selectedExtendMins} мин · ${shortExtendOptions.find(o => o.mins === selectedExtendMins)!.price} ₸`
                    : "Выберите время"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showTerminateConfirm && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTerminateConfirm(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">{t.terminateRentalTitle}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {t.terminateRentalMsg} <span className="font-semibold text-gray-800 dark:text-gray-200">{activeBooking.spotId}</span> {t.terminateRentalMsg2}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowTerminateConfirm(false)}>
                {t.cancel}
              </Button>
              <Button
                size="lg"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleTerminateRental}
                disabled={isTerminating}
              >
                {isTerminating ? t.terminating : t.terminate}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complaint Modal */}
      {showComplaint && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowComplaint(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t.complaintTitle}</h2>
                <p className="text-sm text-gray-500">{t.spotTakenDesc}</p>
              </div>
            </div>
            <textarea
              value={complaintReason}
              onChange={e => setComplaintReason(e.target.value)}
              placeholder={t.complaintReasonPlaceholder}
              rows={3}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 mb-3"
            />
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1">Номер машины нарушителя <span className="text-gray-400">(если знаете)</span></p>
              <input
                type="text"
                value={complaintViolatorPlate}
                onChange={e => setComplaintViolatorPlate(e.target.value.toUpperCase())}
                placeholder="Например: 125 ABC 01"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono tracking-wider uppercase"
              />
            </div>
            <label className={`flex flex-col items-center justify-center gap-2 w-full py-4 rounded-xl border-2 text-sm font-medium cursor-pointer mb-2 transition-all ${complaintPhotoUrl ? "border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700" : "border-dashed border-orange-300 bg-orange-50/50 text-orange-600 hover:border-orange-400"}`}>
              {complaintPhotoUrl ? (
                <>
                  <Camera className="h-5 w-5 text-green-600" />
                  <span>✓ Фото прикреплено</span>
                  <span className="text-xs text-green-500">OCR прочитает номер машины автоматически</span>
                </>
              ) : (
                <>
                  <Camera className="h-6 w-6" />
                  <span>{t.complaintPhoto} <span className="text-red-500">*</span></span>
                  <span className="text-xs text-orange-500/80">Убедитесь, что видна машина нарушителя и место — система определит номер</span>
                </>
              )}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleComplaintPhotoUpload} />
            </label>
            {!complaintPhotoUrl && (
              <p className="text-xs text-orange-500 text-center mb-3">Фото обязательно — это доказательство нарушения</p>
            )}
            <div className="flex gap-3 mt-1">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setShowComplaint(false)}>{t.back}</Button>
              <Button
                size="lg"
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                disabled={!complaintReason.trim() || !complaintPhotoUrl || isSendingComplaint}
                onClick={handleSendComplaint}
              >
                {isSendingComplaint ? t.complaintSending : t.complaintSend}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Spot Offer Modal */}
      {newSpotOffer && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <MapPin className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center">{t.newSpotFound}</h2>
              <p className="text-gray-500 text-center">
                {t.newSpotFoundDesc}{" "}
                <span className="font-bold text-[#354469] text-lg">{newSpotOffer.spotId}</span>
              </p>
            </div>
            <Button size="lg" className="w-full bg-[#354469] hover:bg-[#354469]/90" onClick={handleAcceptNewSpot}>
              {t.acceptNewSpot} → {newSpotOffer.spotId}
            </Button>
          </div>
        </div>
      )}

      {/* No Spots Modal */}
      {noSpotsAvailable && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNoSpotsAvailable(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <Wallet className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t.noSpotsAvailable}</h2>
              <p className="text-sm text-gray-500 text-center">{t.noSpotsDesc}</p>
            </div>
            <Button size="lg" className="w-full bg-[#354469] hover:bg-[#354469]/90" onClick={() => { setNoSpotsAvailable(false); setActiveBooking(null); setCurrentScreen("home") }}>
              {t.backToHome}
            </Button>
          </div>
        </div>
      )}

      {insufficientBalance && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setInsufficientBalance(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl px-5 pt-5 pb-10">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
                <Wallet className="h-7 w-7 text-[#b94a4a]" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white text-center">{t.insufficientBalance}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {t.insufficientMsg1} <span className="font-semibold text-gray-800 dark:text-gray-200">{insufficientBalance.need}₸</span> {t.insufficientMsg2} <span className="font-semibold text-gray-800 dark:text-gray-200">{insufficientBalance.have}₸</span>. {t.insufficientMsg3}
              </p>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t.shortfall}</span>
                <span className="font-bold text-[#b94a4a]">−{insufficientBalance.need - insufficientBalance.have}₸</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setInsufficientBalance(null)}>{t.back}</Button>
              <Button size="lg" className="flex-1 bg-[#354469] hover:bg-[#354469]/90" onClick={() => { setInsufficientBalance(null); setCurrentScreen("wallet") }}>{t.topUpWallet}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bottom-nav bg-white dark:bg-gray-900 border-t border-gray-300 dark:border-gray-700 z-50 shadow-lg">
        <div className="flex justify-around items-center px-4" style={{height: '64px'}}>
          {[
            { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", label: t.home, active: false },
            { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", label: t.map, active: false },
            { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", label: t.booking, active: true },
            { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", label: t.wallet, active: false },
            { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", label: t.profile, active: false },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              className="flex flex-col items-center justify-center gap-0.5 p-3 transition-all hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl active:scale-95"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <img
                  src={item.active ? item.activeIcon : item.icon}
                  alt={item.label}
                  width={28}
                  height={28}
                  className={item.active ? "opacity-100" : "opacity-80 dark:invert"}
                />
              </div>
              <span className={`text-xs font-medium ${item.active ? "text-[#36549B] dark:text-[#7B9FD4]" : "text-gray-900 dark:text-gray-300"} drop-shadow-sm`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
