"use client"

import { useState, useEffect } from "react"
import { Capacitor } from "@capacitor/core"
import { useParking, mapDbUser } from "@/lib/parking-context"
import Image from "next/image"
import { auth } from "@/lib/firebase"
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth"

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier
  }
}

const termsEN = [
  { title: "1. Acceptance of Terms", body: "By using QPark, you agree to these Terms of Service. If you do not agree, please do not use our application." },
  { title: "2. Service Description", body: "QPark provides smart parking solutions including finding, reserving, and paying for parking spaces through our mobile application." },
  { title: "3. User Responsibilities", body: "Users must provide accurate information, follow parking regulations, and ensure timely payment for services used." },
  { title: "4. No-Show Policy", body: "Failure to use a reserved parking spot may result in penalties. After 6 no-shows, your account may be suspended." },
  { title: "5. Limitation of Liability", body: "QPark is not responsible for car damage, theft, or any incidents occurring in parking facilities." },
  { title: "6. Contact", body: "For questions, contact us at 231074@astanait.edu.kz or +7 708 239 51 19" },
]

export function LoginScreen() {
  const { setIsAuthenticated, setUser, setCurrentScreen, setIsNewUser } = useParking()
  const [step, setStep] = useState<"phone" | "otp">("phone")
  const [phone, setPhone] = useState("+7")
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState("")
  const [showTerms, setShowTerms] = useState(false)

  useEffect(() => {
    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear()
        window.recaptchaVerifier = undefined
      }
    }
  }, [])

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
        callback: () => {},
      })
    }
    return window.recaptchaVerifier
  }

  const handleSendOtp = async () => {
    if (phone.length < 6) return
    setError("")
    setIsSending(true)
    try {
      const verifier = setupRecaptcha()
      const result = await signInWithPhoneNumber(auth, phone, verifier)
      setConfirmationResult(result)
      setStep("otp")
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === "auth/invalid-phone-number") {
        setError("Invalid phone number. Use format: +7XXXXXXXXXX")
      } else if (e.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.")
      } else {
        setError(e.message ?? "Failed to send code.")
      }
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear()
        window.recaptchaVerifier = undefined
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleVerifyOtp = async () => {
    const code = otp.join("")
    if (code.length !== 6 || !confirmationResult) return
    setError("")
    setIsVerifying(true)
    try {
      const credential = await confirmationResult.confirm(code)
      const firebaseUser = credential.user

      let dbUser = null
      let jwtToken = null
      let isNew = false
      try {
        const res = await fetch("/backend/auth/firebase-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumber: firebaseUser.phoneNumber ?? phone,
            firebaseUid: firebaseUser.uid,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          dbUser = data.user
          jwtToken = data.token
          isNew = data.isNew ?? false
          if (jwtToken) localStorage.setItem("qpark_token", jwtToken)
        }
      } catch {}

      if (jwtToken) {
        try {
          const meRes = await fetch("/backend/auth/me", {
            headers: { Authorization: `Bearer ${jwtToken}` },
          })
          if (meRes.ok) {
            const meData = await meRes.json()
            setUser(mapDbUser(meData))
          } else if (dbUser) {
            setUser(mapDbUser(dbUser))
          }
        } catch {
          if (dbUser) setUser(mapDbUser(dbUser))
        }
      } else if (dbUser) {
        setUser(mapDbUser(dbUser))
      } else {
        setUser({
          id: firebaseUser.uid,
          phone: firebaseUser.phoneNumber ?? phone,
          name: "User",
          balance: 0,
          bonusPoints: 0,
          noShowCount: 0,
          isBanned: false,
          cars: [],
          transactions: [],
        })
      }
      setIsAuthenticated(true)
      if (isNew) {
        setIsNewUser(true)
        setCurrentScreen("onboarding")
      } else {
        setCurrentScreen("home")
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === "auth/invalid-verification-code") {
        setError("Invalid code. Please check and try again.")
      } else if (e.code === "auth/code-expired") {
        setError("Code expired. Please request a new one.")
      } else {
        setError(e.message ?? "Verification failed.")
      }
    } finally {
      setIsVerifying(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus()
    }
  }

  const isNative = Capacitor.isNativePlatform()

  return (
    <div className={isNative
      ? "relative w-full h-full bg-gray-50 overflow-hidden"
      : "relative mx-auto h-[844px] w-[390px] overflow-hidden rounded-[3rem] border-[12px] border-foreground/90 bg-gray-50 shadow-2xl"
    }>
      <div id="recaptcha-container" />

      {!isNative && (
        <div className="flex h-12 items-center justify-between bg-white px-6 text-sm">
          <span className="font-medium">9:41</span>
          <div className="absolute left-1/2 top-3 h-6 w-28 -translate-x-1/2 rounded-full bg-foreground/90" />
          <div className="flex items-center gap-1">
            <div className="h-3 w-4 rounded-sm border border-foreground/70">
              <div className="ml-0.5 mt-0.5 h-2 w-2.5 rounded-sm bg-foreground/70" />
            </div>
          </div>
        </div>
      )}

      <div className={isNative ? "h-full overflow-y-auto bg-gray-50" : "h-[calc(100%-48px)] overflow-y-auto bg-gray-50"}>
        <div className="bg-white rounded-b-3xl px-6 py-8 shadow-md">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Image src="/app_icon2.svg" alt="QPark Logo" width={200} height={200} className="object-fill" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 drop-shadow-sm">QPark</h1>
            <p className="text-sm text-gray-500 mt-1 font-medium drop-shadow-sm">Smart parking for your convenience</p>
          </div>
        </div>

        <div className="px-6 py-8">
          <div className="bg-white rounded-3xl p-6 shadow-md">
            {step === "phone" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-[#333333] drop-shadow-sm">Welcome</h2>
                  <p className="text-sm text-gray-600 drop-shadow-sm">Enter your phone number to continue</p>
                </div>

                <div className="relative">
                  <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                    <Image src="/Phone_light.svg" alt="Phone" width={20} height={20} />
                  </div>
                  <input
                    type="tel"
                    placeholder="+7XXXXXXXXXX"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError("") }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                    className="w-full pl-12 pr-4 py-4 bg-gray-100 rounded-2xl text-gray-900 placeholder-gray-500 focus:outline-none"
                  />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <button
                  className="w-full bg-[#495E8E] text-white py-4 rounded-2xl font-semibold active:bg-[#3d4c73] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={handleSendOtp}
                  disabled={isSending || phone.length < 6}
                >
                  {isSending ? "Sending code…" : "Continue"}
                </button>

                <p className="text-center text-xs text-gray-500">
                  By continuing, you agree to our{" "}
                  <button onClick={() => setShowTerms(true)} className="text-[#296186] hover:underline font-medium">Terms of Service</button>
                </p>

              </div>
            )}

            {step === "otp" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-[#333333] drop-shadow-sm">Enter Code</h2>
                  <p className="text-sm text-gray-600 drop-shadow-sm">
                    We sent a 6-digit code to <span className="font-medium">{phone}</span>
                  </p>
                </div>

                <div className="flex justify-between gap-1">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      id={`otp-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      className="w-11 h-14 bg-gray-100 rounded-2xl text-center text-xl font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#495E8E]"
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    />
                  ))}
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <button
                  className="w-full bg-[#495E8E] text-white py-4 rounded-2xl font-semibold active:bg-[#3d4c73] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={handleVerifyOtp}
                  disabled={isVerifying || otp.join("").length !== 6}
                >
                  {isVerifying ? "Verifying…" : "Verify"}
                </button>

                <button
                  className="w-full text-[#4a5568] hover:text-[#296186] font-medium py-2 transition-colors"
                  onClick={() => { setStep("phone"); setOtp(["", "", "", "", "", ""]); setError("") }}
                >
                  Change my phone number
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showTerms && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white rounded-t-3xl w-full max-h-[80%] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Terms of Service</h3>
              <button onClick={() => setShowTerms(false)} className="p-1 rounded-full hover:bg-gray-100">
                <span className="text-xl text-gray-500 leading-none">✕</span>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
              {termsEN.map((s) => (
                <div key={s.title}>
                  <p className="font-semibold text-sm text-gray-900 mb-1">{s.title}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={() => setShowTerms(false)} className="w-full rounded-xl bg-[#495E8E] py-3 font-semibold text-white">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
