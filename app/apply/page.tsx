"use client"

import { useState } from "react"

export default function ApplyPage() {
  const [form, setForm] = useState({
    companyName: "", ownerName: "", phone: "", email: "",
    address: "", city: "", spotsCount: "", description: "",
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.companyName || !form.ownerName || !form.phone || !form.address || !form.city || !form.spotsCount) {
      setError("Пожалуйста, заполните все обязательные поля")
      return
    }
    setSending(true)
    setError("")
    try {
      const res = await fetch("/backend/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, spotsCount: parseInt(form.spotsCount) }),
      })
      if (!res.ok) throw new Error("Ошибка отправки")
      setSent(true)
    } catch {
      setError("Не удалось отправить заявку. Попробуйте ещё раз.")
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a2340] to-[#2d3f6b] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mx-auto mb-6">
            <svg className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Заявка отправлена!</h2>
          <p className="text-gray-500 mb-2">Спасибо, <span className="font-semibold text-gray-700">{form.ownerName}</span>!</p>
          <p className="text-gray-500 text-sm">Наша команда рассмотрит вашу заявку и свяжется с вами в течение <strong>1-2 рабочих дней</strong> по номеру {form.phone}.</p>
          <div className="mt-8 p-4 bg-[#354469]/10 rounded-2xl">
            <p className="text-[#354469] text-sm font-medium">QPark — умные парковки Казахстана</p>
            <p className="text-gray-400 text-xs mt-1">q-park.vercel.app</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2340] to-[#2d3f6b] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 mb-4">
            <span className="text-white/70 text-sm">QPark</span>
            <span className="text-white/30">·</span>
            <span className="text-white/70 text-sm">Для арендодателей</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Подключите свою парковку</h1>
          <p className="text-white/60 text-lg">Заполните заявку — мы свяжемся с вами и подключим к системе QPark</p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: "📊", text: "Управление через дашборд" },
            { icon: "💳", text: "Автооплата через приложение" },
            { icon: "🔐", text: "LPR-система въезда" },
          ].map((b, i) => (
            <div key={i} className="bg-white/10 rounded-2xl p-4 text-center">
              <div className="text-2xl mb-2">{b.icon}</div>
              <p className="text-white/70 text-xs font-medium">{b.text}</p>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Заявка на подключение</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Компания / ИП <span className="text-red-500">*</span></label>
                <input value={form.companyName} onChange={e => setForm({...form, companyName: e.target.value})}
                  placeholder="ТОО «Паркинг Астана»"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Контактное лицо <span className="text-red-500">*</span></label>
                <input value={form.ownerName} onChange={e => setForm({...form, ownerName: e.target.value})}
                  placeholder="Имя и фамилия"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Телефон <span className="text-red-500">*</span></label>
                <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
                  placeholder="+7 (___) ___-__-__" type="tel"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                  placeholder="email@company.kz" type="email"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Город <span className="text-red-500">*</span></label>
                <select value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#354469] bg-white">
                  <option value="">Выберите город</option>
                  <option>Астана</option>
                  <option>Алматы</option>
                  <option>Шымкент</option>
                  <option>Другой</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Кол-во мест <span className="text-red-500">*</span></label>
                <input value={form.spotsCount} onChange={e => setForm({...form, spotsCount: e.target.value})}
                  placeholder="Например: 50" type="number" min="1"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Адрес парковки <span className="text-red-500">*</span></label>
              <input value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                placeholder="Улица, дом, ориентир"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#354469]" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дополнительно</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                placeholder="Тип парковки (подземная, наземная), инфраструктура, вопросы..."
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#354469] resize-none" />
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-600 text-sm">{error}</div>
            )}

            <button type="submit" disabled={sending}
              className="w-full py-4 rounded-2xl text-white font-semibold text-base transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #354469, #2d3f6b)" }}>
              {sending ? "Отправка..." : "Отправить заявку →"}
            </button>

            <p className="text-center text-gray-400 text-xs">Нажимая кнопку, вы соглашаетесь на обработку персональных данных</p>
          </form>
        </div>

        <p className="text-center text-white/40 text-sm mt-6">QPark © 2025 · Умные парковки Казахстана</p>
      </div>
    </div>
  )
}
