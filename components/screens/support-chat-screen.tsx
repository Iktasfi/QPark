"use client"

import { useState, useEffect, useRef } from "react"
import { useParking } from "@/lib/parking-context"
import { ChevronLeft, Send, MessageCircle } from "lucide-react"
import { getSocket } from "@/lib/socket"

interface Message {
  id: string
  text: string
  fromAdmin: boolean
  createdAt: string
}

export function SupportChatScreen() {
  const { user, setCurrentScreen, darkMode } = useParking()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const token = typeof window !== "undefined" ? localStorage.getItem("qpark_token") : null

  // Load history
  useEffect(() => {
    if (!token) return
    fetch("/backend/support/messages", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setMessages(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Join socket room + listen for admin replies
  useEffect(() => {
    if (!user?.id) return
    const socket = getSocket()
    socket.emit("join-support", user.id)

    const onReply = (msg: Message) => {
      setMessages(prev => [...prev, msg])
    }
    socket.on("support-reply", onReply)
    return () => { socket.off("support-reply", onReply) }
  }, [user?.id])

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!inputText.trim() || sending || !token) return
    setSending(true)
    const text = inputText.trim()
    setInputText("")

    // Optimistic update
    const tempMsg: Message = { id: `tmp-${Date.now()}`, text, fromAdmin: false, createdAt: new Date().toISOString() }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await fetch("/backend/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? data : m))
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      setInputText(text)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className={`flex flex-col h-full ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      {/* Header */}
      <div className={`${darkMode ? "bg-[#2a3654]" : "bg-[#495E8E]"} px-4 pt-6 pb-4 shadow-lg flex items-center gap-3`}>
        <button onClick={() => setCurrentScreen("profile")} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Поддержка QPark</p>
            <p className="text-white/60 text-xs">Отвечаем в течение нескольких минут</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-4">
        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="w-6 h-6 border-2 border-[#495E8E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center pt-16 gap-3">
            <div className="w-16 h-16 rounded-full bg-[#495E8E]/10 flex items-center justify-center">
              <MessageCircle className="w-8 h-8 text-[#495E8E]" />
            </div>
            <p className={`font-semibold ${darkMode ? "text-white" : "text-gray-800"}`}>Задайте вопрос</p>
            <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"} max-w-xs`}>
              Напишите нам — администратор ответит как можно скорее
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.fromAdmin ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[78%] px-4 py-2.5 rounded-2xl ${
                  msg.fromAdmin
                    ? darkMode ? "bg-gray-700 text-white" : "bg-white text-gray-900 shadow-sm"
                    : "bg-[#495E8E] text-white"
                }`}
              >
                {msg.fromAdmin && (
                  <p className="text-xs font-semibold text-[#495E8E] dark:text-blue-400 mb-1">QPark</p>
                )}
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <p className={`text-xs mt-1 ${msg.fromAdmin ? "text-gray-400" : "text-white/60"} text-right`}>
                  {formatTime(msg.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={`px-4 py-3 border-t ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} pb-safe`}>
        <div className="flex gap-2 items-end">
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Напишите сообщение..."
            rows={1}
            className={`flex-1 resize-none rounded-2xl px-4 py-2.5 text-sm outline-none border ${
              darkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                : "bg-gray-100 border-gray-200 text-gray-900 placeholder:text-gray-400"
            } max-h-28 overflow-y-auto`}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="w-10 h-10 rounded-full bg-[#495E8E] flex items-center justify-center disabled:opacity-40 hover:bg-[#3d4c73] transition-colors flex-shrink-0"
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send className="w-4 h-4 text-white" />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
