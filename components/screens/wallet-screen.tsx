"use client"

import { useState } from "react"
import { useParking } from "@/lib/parking-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Wallet, Plus, Sparkles, ArrowUpRight, ArrowDownRight, CreditCard } from "lucide-react"
import { cn } from "@/lib/utils"

const topUpAmounts = [500, 1000, 2000, 5000]

export function WalletScreen() {
  const { user, setUser } = useParking()
  const [isTopUpOpen, setIsTopUpOpen] = useState(false)
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  
  const handleTopUp = () => {
    if (!selectedAmount || !user) return
    
    setIsProcessing(true)
    
    // Simulate Stripe payment
    setTimeout(() => {
      setUser({
        ...user,
        balance: user.balance + selectedAmount,
        transactions: [
          { 
            id: `t-${Date.now()}`, 
            type: "topup_stripe", 
            amount: selectedAmount, 
            description: "Wallet top-up via Stripe", 
            date: new Date() 
          },
          ...user.transactions
        ]
      })
      
      setIsProcessing(false)
      setIsTopUpOpen(false)
      setSelectedAmount(null)
    }, 1500)
  }
  
  const getTransactionIcon = (type: string) => {
    if (type === "topup_stripe") return <ArrowDownRight className="h-4 w-4 text-[oklch(var(--status-free))]" />
    if (type === "bonus_credit") return <Sparkles className="h-4 w-4 text-accent" />
    return <ArrowUpRight className="h-4 w-4 text-destructive" />
  }
  
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", { 
      month: "short", 
      day: "numeric", 
      hour: "2-digit", 
      minute: "2-digit" 
    }).format(date)
  }
  
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Wallet</h1>
        <p className="text-sm text-muted-foreground">Manage your balance</p>
      </div>
      
      {/* Balance Card */}
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-80">Current Balance</p>
              <p className="text-4xl font-bold mt-1">
                {user?.balance?.toLocaleString() || 0} &#8376;
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm opacity-80">
                <Sparkles className="h-4 w-4" />
                <span>{user?.bonusPoints || 0} bonus points</span>
              </div>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-foreground/20">
              <Wallet className="h-7 w-7" />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Top Up Section */}
      {!isTopUpOpen ? (
        <Button 
          size="lg" 
          className="w-full gap-2"
          onClick={() => setIsTopUpOpen(true)}
        >
          <Plus className="h-5 w-5" />
          Top Up Balance
        </Button>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5" />
              Select Amount
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {topUpAmounts.map((amount) => (
                <button
                  key={amount}
                  onClick={() => setSelectedAmount(amount)}
                  className={cn(
                    "rounded-lg border-2 p-3 text-center transition-all",
                    selectedAmount === amount 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <p className="text-lg font-bold text-foreground">{amount.toLocaleString()} &#8376;</p>
                </button>
              ))}
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => {
                  setIsTopUpOpen(false)
                  setSelectedAmount(null)
                }}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1"
                disabled={!selectedAmount || isProcessing}
                onClick={handleTopUp}
              >
                {isProcessing ? "Processing..." : "Pay with Stripe"}
              </Button>
            </div>
            
            <p className="text-center text-xs text-muted-foreground">
              Powered by Stripe (Test Mode)
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Promo Code */}
      {user?.promoCode && (
        <Card className="bg-accent/10 border-accent/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-accent" />
                <div>
                  <p className="font-medium text-foreground">Promo Code Available</p>
                  <p className="text-sm text-muted-foreground">FIRST - 150&#8376; off your first parking</p>
                </div>
              </div>
              <Badge variant="outline">Active</Badge>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Transaction History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {user?.transactions.map((transaction, index) => (
            <div key={transaction.id}>
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    {getTransactionIcon(transaction.type)}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(transaction.date)}</p>
                  </div>
                </div>
                <p className={cn(
                  "font-semibold",
                  transaction.amount > 0 ? "text-[oklch(var(--status-free))]" : "text-foreground"
                )}>
                  {transaction.amount > 0 ? "+" : ""}{transaction.amount.toLocaleString()} &#8376;
                </p>
              </div>
              {index < user.transactions.length - 1 && <Separator />}
            </div>
          ))}
          
          {(!user?.transactions || user.transactions.length === 0) && (
            <p className="py-4 text-center text-muted-foreground">No transactions yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
