"use client"

interface MobileShellProps {
  children: React.ReactNode
}

export function MobileShell({ children }: MobileShellProps) {
  return (
    <div
      className="bg-background"
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        /* iPhone 13 Pro: 390×844, iPhone 15 Pro Max: 430×932 — both fill naturally */
      }}
    >
      {children}
    </div>
  )
}
