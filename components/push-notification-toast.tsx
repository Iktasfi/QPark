"use client"

import { useEffect, useState } from "react"

interface Toast {
  id: number
  title: string
  body: string
}

export function PushNotificationToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    let unsub: (() => void) | undefined
    import("@/lib/firebase").then(({ onForegroundMessage }) => {
      onForegroundMessage((title, body) => {
        const id = Date.now()
        setToasts(prev => [...prev, { id, title, body }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000)
      }).then(fn => { unsub = fn })
    })
    return () => unsub?.()
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[90vw] max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className="bg-gray-900 text-white rounded-xl px-4 py-3 shadow-lg flex flex-col gap-0.5 animate-in slide-in-from-top-2"
          onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
        >
          <p className="font-semibold text-sm">{t.title}</p>
          <p className="text-xs text-gray-300">{t.body}</p>
        </div>
      ))}
    </div>
  )
}
