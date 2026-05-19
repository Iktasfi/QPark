"use client"

import { useParking } from "@/lib/parking-context"

interface MobileShellProps {
  children: React.ReactNode
}

export function MobileShell({ children }: MobileShellProps) {
  const { } = useParking()

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {children}
    </div>
  )
}
