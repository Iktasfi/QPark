'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { auth } from '@/lib/firebase'
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth'
import { useParking } from '@/lib/parking-context'

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier
  }
}

export default function AuthPage() {
  const { setIsAuthenticated, setUser } = useParking()
  const [step, setStep] = useState(1)
  const [phoneNumber, setPhoneNumber] = useState('+7')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState('')
  const recaptchaContainerRef = useRef<HTMLDivElement>(null)

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
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {},
      })
    }
    return window.recaptchaVerifier
  }

  const handleContinue = async () => {
    if (phoneNumber.length < 6) return
    setError('')
    setIsSending(true)
    try {
      const verifier = setupRecaptcha()
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier)
      setConfirmationResult(result)
      setStep(2)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number. Use international format: +7XXXXXXXXXX')
      } else if (e.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.')
      } else {
        setError(e.message ?? 'Failed to send code. Try again.')
      }
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear()
        window.recaptchaVerifier = undefined
      }
    } finally {
      setIsSending(false)
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
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus()
    }
  }

  const handleVerify = async () => {
    const code = otp.join('')
    if (code.length !== 6 || !confirmationResult) return
    setError('')
    setIsVerifying(true)
    try {
      const userCredential = await confirmationResult.confirm(code)
      const firebaseUser = userCredential.user

      // Build local user object from Firebase data
      setUser({
        id: firebaseUser.uid,
        phone: firebaseUser.phoneNumber ?? phoneNumber,
        name: firebaseUser.displayName ?? 'User',
        balance: 0,
        bonusPoints: 0,
        noShowCount: 0,
        isBanned: false,
        cars: [],
        transactions: [],
      })
      setIsAuthenticated(true)
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string }
      if (e.code === 'auth/invalid-verification-code') {
        setError('Invalid code. Please check and try again.')
      } else if (e.code === 'auth/code-expired') {
        setError('Code expired. Please request a new one.')
      } else {
        setError(e.message ?? 'Verification failed. Try again.')
      }
    } finally {
      setIsVerifying(false)
    }
  }

  const handleBack = () => {
    if (step === 2) {
      setStep(1)
      setOtp(['', '', '', '', '', ''])
      setError('')
      setConfirmationResult(null)
    }
  }

  const Header = () => (
    <div className="bg-white rounded-b-3xl px-6 py-8 relative">
      {step === 2 && (
        <button
          onClick={handleBack}
          className="absolute left-6 top-8 text-gray-600 hover:text-gray-800"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 bg-blue-900 rounded-full flex items-center justify-center mb-4">
          <Image src="/app_icon2.svg" alt="QPark Logo" width={32} height={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">QPark</h1>
        <p className="text-sm text-gray-600 mt-1">Smart parking for your convenience</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Invisible reCAPTCHA container */}
      <div id="recaptcha-container" ref={recaptchaContainerRef} />

      <Header />

      {step === 1 ? (
        <div className="px-6 py-8">
          <h2 className="text-2xl font-bold text-[#333333] mb-2">Welcome</h2>
          <p className="text-gray-600 mb-8">Enter your phone number to continue</p>

          <div className="relative mb-4">
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
              <Image src="/Phone_light.svg" alt="Phone" width={20} height={20} />
            </div>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              className="w-full pl-12 pr-4 py-4 bg-gray-100 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+7XXXXXXXXXX"
            />
          </div>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          <button
            onClick={handleContinue}
            disabled={isSending || phoneNumber.length < 6}
            className="w-full bg-[#495E8E] text-white py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSending ? 'Sending code…' : 'Continue'}
          </button>

          <div className="text-center mt-8">
            <p className="text-sm text-gray-500">
              By continuing, you agree to our <span className="text-blue-600">Terms of Service</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="px-6 py-8">
          <h2 className="text-2xl font-bold text-[#333333] mb-2">Enter Code</h2>
          <p className="text-gray-600 mb-8">
            We sent a 6-digit code to <span className="font-medium">{phoneNumber}</span>
          </p>

          <div className="flex justify-between gap-2 mb-4">
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                inputMode="numeric"
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                className="w-12 h-14 bg-gray-100 rounded-xl text-center text-2xl font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={1}
              />
            ))}
          </div>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          <button
            onClick={handleVerify}
            disabled={isVerifying || otp.join('').length !== 6}
            className="w-full bg-[#495E8E] text-white py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isVerifying ? 'Verifying…' : 'Verify'}
          </button>

          <div className="text-center mt-6">
            <button
              onClick={handleBack}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Change my phone number
            </button>
          </div>

          <div className="text-center mt-3">
            <button
              onClick={() => {
                setOtp(['', '', '', '', '', ''])
                setError('')
                setStep(1)
              }}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Resend code
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
