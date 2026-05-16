"use client"

import { useState } from "react"
import { loadStripe } from "@stripe/stripe-js"
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js"
import { Lock, CreditCard } from "lucide-react"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "")

interface StripeTopUpProps {
  amount: number
  onSuccess: (walletBalance: number) => void
  onCancel: () => void
  darkMode?: boolean
}

function CardForm({ amount, onSuccess, onCancel, darkMode }: StripeTopUpProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const handlePay = async () => {
    if (!stripe || !elements) return
    setIsProcessing(true)
    setErrorMsg("")

    try {
      const token = localStorage.getItem("qpark_token")

      const intentRes = await fetch("/backend/payments/stripe/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      })
      const intentData = await intentRes.json()
      if (!intentRes.ok) throw new Error(intentData.error || "Failed to create payment")

      const cardEl = elements.getElement(CardElement)
      if (!cardEl) throw new Error("Card element not found")

      const { error, paymentIntent } = await stripe.confirmCardPayment(intentData.clientSecret, {
        payment_method: { card: cardEl },
      })

      if (error) throw new Error(error.message || "Payment failed")
      if (paymentIntent?.status !== "succeeded") throw new Error("Payment not completed")

      const confirmRes = await fetch("/backend/payments/stripe/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      })
      const confirmData = await confirmRes.json()
      if (!confirmRes.ok) throw new Error(confirmData.error || "Confirmation failed")

      onSuccess(confirmData.walletBalance)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Payment failed")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl p-4 ${darkMode ? "bg-[#2a3654]" : "bg-[#495E8E]"} text-white`}>
        <p className="text-white/70 text-sm">Amount to top up</p>
        <p className="text-3xl font-bold mt-1">{amount.toLocaleString()}₸</p>
      </div>

      <div>
        <label className={`block text-xs font-semibold uppercase tracking-wide mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          Card details
        </label>
        <div className={`border-2 rounded-xl px-4 py-3 ${darkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200"}`}>
          <CardElement
            options={{
              hidePostalCode: true,
              style: {
                base: {
                  fontSize: "16px",
                  color: darkMode ? "#ffffff" : "#1a1a2e",
                  fontFamily: "system-ui, sans-serif",
                  "::placeholder": { color: darkMode ? "#6b7280" : "#9ca3af" },
                },
                invalid: { color: "#ef4444" },
              },
            }}
          />
        </div>
        <div className={`mt-2 rounded-xl px-3 py-2 text-xs ${darkMode ? "bg-gray-800 text-gray-400" : "bg-blue-50 text-blue-600"}`}>
          <span className="font-semibold">Test card:</span> 4242 4242 4242 4242 · любая дата · любой CVC
        </div>
      </div>

      {errorMsg && (
        <p className="text-red-500 text-sm text-center">{errorMsg}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className={`flex-1 py-4 rounded-2xl font-semibold ${darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-700"} disabled:opacity-50`}
        >
          Cancel
        </button>
        <button
          onClick={handlePay}
          disabled={isProcessing || !stripe}
          className="flex-1 py-4 rounded-2xl font-semibold bg-[#354469] text-white flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isProcessing ? (
            <span className="animate-pulse">Processing...</span>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Pay {amount.toLocaleString()}₸
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Lock className={`w-3 h-3 ${darkMode ? "text-gray-500" : "text-gray-400"}`} />
        <p className={`text-xs ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
          Secured by Stripe · Test Mode
        </p>
      </div>
    </div>
  )
}

export function StripeTopUp(props: StripeTopUpProps) {
  return (
    <Elements stripe={stripePromise}>
      <CardForm {...props} />
    </Elements>
  )
}
