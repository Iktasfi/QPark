"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Car, Phone, ArrowRight, Check } from "lucide-react"

export function LoginScreen() {
  const { setIsAuthenticated, setCurrentScreen } = useParking()
  const [step, setStep] = useState<"phone" | "otp" | "verifying">("phone")
  const [phone, setPhone] = useState("+7 ")
  const [otp, setOtp] = useState("")
  
  const handleSendOtp = () => {
    if (phone.length < 10) return
    setStep("otp")
  }
  
  const handleVerifyOtp = () => {
    setStep("verifying")
    
    // Simulate OTP verification
    setTimeout(() => {
      setIsAuthenticated(true)
      setCurrentScreen("home")
    }, 1500)
  }
  
  return (
    <div className="flex h-full flex-col bg-primary p-6">
      {/* Logo Area */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary-foreground/20">
          <Car className="h-14 w-14 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-primary-foreground">Smart Parking</h1>
        <p className="mt-2 text-primary-foreground/80">Kazakhstan</p>
        <p className="mt-4 text-center text-sm text-primary-foreground/60">
          Automated parking booking system<br />
          Astana, 24/7 without personnel
        </p>
      </div>
      
      {/* Login Form */}
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          {step === "phone" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Welcome</h2>
                <p className="text-sm text-muted-foreground">Enter your phone number to continue</p>
              </div>
              
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="+7 XXX XXX XXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10 text-lg"
                />
              </div>
              
              <Button 
                className="w-full gap-2" 
                size="lg"
                onClick={handleSendOtp}
                disabled={phone.length < 10}
              >
                Continue
                <ArrowRight className="h-5 w-5" />
              </Button>
              
              <p className="text-center text-xs text-muted-foreground">
                By continuing, you agree to our Terms of Service
              </p>
            </div>
          )}
          
          {step === "otp" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Enter Code</h2>
                <p className="text-sm text-muted-foreground">
                  We sent a 4-digit code to {phone}
                </p>
              </div>
              
              <div className="flex justify-center gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <Input
                    key={i}
                    type="text"
                    maxLength={1}
                    className="h-14 w-14 text-center text-2xl font-bold"
                    value={otp[i] || ""}
                    onChange={(e) => {
                      const newOtp = otp.split("")
                      newOtp[i] = e.target.value
                      setOtp(newOtp.join(""))
                      
                      // Auto-focus next input
                      if (e.target.value && i < 3) {
                        const nextInput = e.target.parentElement?.nextElementSibling?.querySelector("input")
                        nextInput?.focus()
                      }
                    }}
                  />
                ))}
              </div>
              
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleVerifyOtp}
                disabled={otp.length < 4}
              >
                Verify
              </Button>
              
              <Button variant="ghost" className="w-full text-sm" onClick={() => setStep("phone")}>
                Change phone number
              </Button>
            </div>
          )}
          
          {step === "verifying" && (
            <div className="flex flex-col items-center py-8">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[oklch(var(--status-free)/0.15)]">
                <Check className="h-8 w-8 text-[oklch(var(--status-free))]" />
              </div>
              <p className="text-lg font-medium text-foreground">Verifying...</p>
              <p className="text-sm text-muted-foreground">Please wait</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Demo Skip Button */}
      <Button 
        variant="ghost" 
        className="mt-4 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10"
        onClick={() => {
          setIsAuthenticated(true)
          setCurrentScreen("home")
        }}
      >
        Skip for Demo
      </Button>
    </div>
  )
}
