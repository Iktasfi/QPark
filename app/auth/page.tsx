'use client'

import { useState } from 'react'
import Image from 'next/image'

export default function AuthPage() {
  const [step, setStep] = useState(1)
  const [phoneNumber, setPhoneNumber] = useState('+7')
  const [otp, setOtp] = useState(['', '', '', ''])

  const handleContinue = () => {
    if (phoneNumber.length > 2) {
      setStep(2)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (value.length <= 1) {
      const newOtp = [...otp]
      newOtp[index] = value
      setOtp(newOtp)
      
      // Auto-focus next input
      if (value && index < 3) {
        const nextInput = document.getElementById(`otp-${index + 1}`)
        if (nextInput) {
          nextInput.focus()
        }
      }
    }
  }

  const handleVerify = () => {
    const otpCode = otp.join('')
    if (otpCode.length === 4) {
      // Handle verification logic
      console.log('Verifying:', otpCode)
    }
  }

  const handleBack = () => {
    if (step === 2) {
      setStep(1)
      setOtp(['', '', '', ''])
    }
  }

  const Header = () => (
    <div className="bg-white rounded-b-3xl px-6 py-8 relative">
      <button 
        onClick={handleBack}
        className="absolute left-6 top-8 text-gray-600 hover:text-gray-800"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 bg-blue-900 rounded-full flex items-center justify-center mb-4">
          <Image 
            src="/app_icon2.svg" 
            alt="QPark Logo" 
            width={32}
            height={32}
          />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">QPark</h1>
        <p className="text-sm text-gray-600 mt-1">Smart parking for your convenience</p>
      </div>
    </div>
  )

  const Step1 = () => (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="px-6 py-8">
        <h2 className="text-2xl font-bold text-[#333333] mb-2">Welcome</h2>
        <p className="text-gray-600 mb-8">Enter your phone number to continue</p>
        
        <div className="relative mb-8">
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
            <Image 
              src="/Phone_light.svg" 
              alt="Phone" 
              width={20}
              height={20}
            />
          </div>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-gray-100 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="+7"
          />
        </div>
        
        <button
          onClick={handleContinue}
          className="w-full bg-[#495E8E] text-white py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          Continue
        </button>
        
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            By continuing, you agree to our <span className="text-blue-600">Terms of Service</span>
          </p>
        </div>
      </div>
    </div>
  )

  const Step2 = () => (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="px-6 py-8">
        <h2 className="text-2xl font-bold text-[#333333] mb-2">Enter Code</h2>
        <p className="text-gray-600 mb-8">We sent a 4-digit code to {phoneNumber}</p>
        
        <div className="flex justify-between mb-8">
          {otp.map((digit, index) => (
            <input
              key={index}
              id={`otp-${index}`}
              type="text"
              value={digit}
              onChange={(e) => handleOtpChange(index, e.target.value)}
              className="w-16 h-16 bg-gray-100 rounded-xl text-center text-2xl font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={1}
            />
          ))}
        </div>
        
        <button
          onClick={handleVerify}
          className="w-full bg-[#495E8E] text-white py-4 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          Verify
        </button>
        
        <div className="text-center mt-6">
          <button
            onClick={() => setStep(1)}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Change my phone number
          </button>
        </div>
      </div>
    </div>
  )

  return step === 1 ? <Step1 /> : <Step2 />
}
