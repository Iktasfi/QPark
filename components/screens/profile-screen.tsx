"use client"

import { useState, useEffect } from "react"
import { useParking, mapDbUser, type Language } from "@/lib/parking-context"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Trash2, LogOut, Settings, Bell, User, ChevronRight, Moon, Globe, Shield, HelpCircle, ChevronLeft, Pencil, X, Check } from "lucide-react"
import Image from "next/image"

const privacyContent: Record<Language, { sections: { title: string; body: string }[] }> = {
  en: {
    sections: [
      { title: "1. Information We Collect", body: "We collect information you provide directly, including your phone number, name, vehicle information, and payment details when you use our parking services." },
      { title: "2. How We Use Your Information", body: "Your information is used to provide parking services, process payments, send notifications about your parking sessions, and improve our application." },
      { title: "3. Data Storage", body: "Your data is securely stored on encrypted servers. We retain your information only as long as necessary to provide our services." },
      { title: "4. Data Sharing", body: "We do not sell your personal information. We may share data with parking operators and payment processors only as necessary to provide services." },
      { title: "5. Your Rights", body: "You have the right to access, correct, or delete your personal data. Contact us at privacy@qpark.kz to exercise these rights." },
    ],
  },
  kk: {
    sections: [
      { title: "1. Ақпарат жинау", body: "Біз сізден тікелей берілген ақпаратты жинаймыз: телефон нөмірі, аты-жөні, көлік туралы мәлімет және парковка қызметтерін пайдалану кезіндегі төлем деректері." },
      { title: "2. Ақпаратты пайдалану", body: "Сіздің ақпаратыңыз парковка қызметтерін ұсыну, төлемдерді өңдеу, сессиялар туралы хабарландырулар жіберу және қосымшамызды жетілдіру үшін пайдаланылады." },
      { title: "3. Деректерді сақтау", body: "Деректеріңіз шифрланған серверлерде қауіпсіз сақталады. Қызметтерімізді ұсыну үшін қажет болған уақытқа ғана сақталады." },
      { title: "4. Деректерді бөлісу", body: "Жеке ақпаратыңызды сатпаймыз. Тек қызмет ұсыну үшін қажет болған жағдайда парковка операторлары мен төлем өңдеушілермен бөлісеміз." },
      { title: "5. Сіздің құқықтарыңыз", body: "Жеке деректеріңізге қол жеткізу, түзету немесе жою құқығыңыз бар. privacy@qpark.kz мекенжайына хабарласыңыз." },
    ],
  },
  ru: {
    sections: [
      { title: "1. Сбор информации", body: "Мы собираем информацию, которую вы предоставляете напрямую: номер телефона, имя, данные об автомобиле и платёжные данные при использовании наших услуг." },
      { title: "2. Использование информации", body: "Ваши данные используются для предоставления услуг парковки, обработки платежей, отправки уведомлений о сессиях и улучшения приложения." },
      { title: "3. Хранение данных", body: "Ваши данные надёжно хранятся на зашифрованных серверах. Мы храним их только столько, сколько необходимо для предоставления услуг." },
      { title: "4. Передача данных", body: "Мы не продаём вашу личную информацию. Данные могут передаваться операторам парковок и платёжным системам только при необходимости." },
      { title: "5. Ваши права", body: "Вы имеете право на доступ, исправление или удаление ваших персональных данных. Свяжитесь с нами по адресу privacy@qpark.kz." },
    ],
  },
}

const termsContent: Record<Language, { sections: { title: string; body: string }[] }> = {
  en: {
    sections: [
      { title: "1. Acceptance of Terms", body: "By using QPark, you agree to these Terms of Service. If you do not agree, please do not use our application." },
      { title: "2. Service Description", body: "QPark provides smart parking solutions including finding, reserving, and paying for parking spaces through our mobile application." },
      { title: "3. User Responsibilities", body: "Users must provide accurate information, follow parking regulations, and ensure timely payment for services used." },
      { title: "4. No-Show Policy", body: "Failure to use a reserved parking spot may result in penalties. After 6 no-shows, your account may be suspended." },
      { title: "5. Limitation of Liability", body: "QPark is not responsible for vehicle damage, theft, or any incidents occurring in parking facilities." },
      { title: "6. Contact", body: "For questions, contact us at support@qpark.kz or +7 708 239 51 19" },
    ],
  },
  kk: {
    sections: [
      { title: "1. Шарттарды қабылдау", body: "QPark пайдалана отырып, сіз осы қызмет шарттарына келісесіз. Келіспесеңіз, қосымшаны пайдаланбаңыз." },
      { title: "2. Қызмет сипаттамасы", body: "QPark мобильді қосымша арқылы парковка орындарын табуды, брондауды және төлеуді қамтамасыз етеді." },
      { title: "3. Пайдаланушы жауапкершілігі", body: "Пайдаланушылар дұрыс ақпарат беруі, парковка ережелерін сақтауы және қызметтер үшін уақытылы төлем жасауы керек." },
      { title: "4. Келмеу саясаты", body: "Брондалған орынды пайдаланбау айыппұлға алып келуі мүмкін. 6 рет келмегеннен кейін аккаунт тоқтатылуы мүмкін." },
      { title: "5. Жауапкершілікті шектеу", body: "QPark парковка орнында болған көлік зақымдану, ұрлық немесе басқа оқиғалар үшін жауапты емес." },
      { title: "6. Байланыс", body: "Сұрақтар бойынша: support@qpark.kz немесе +7 708 239 51 19" },
    ],
  },
  ru: {
    sections: [
      { title: "1. Принятие условий", body: "Используя QPark, вы соглашаетесь с настоящими Условиями. Если вы не согласны, не используйте приложение." },
      { title: "2. Описание услуги", body: "QPark предоставляет решения для умной парковки: поиск, бронирование и оплата парковочных мест через мобильное приложение." },
      { title: "3. Ответственность пользователя", body: "Пользователи обязаны предоставлять достоверную информацию, соблюдать правила парковки и своевременно оплачивать услуги." },
      { title: "4. Политика неявки", body: "Неиспользование забронированного места может повлечь штрафы. После 6 неявок аккаунт может быть заблокирован." },
      { title: "5. Ограничение ответственности", body: "QPark не несёт ответственности за повреждение, кражу транспортного средства или иные инциденты на парковке." },
      { title: "6. Контакт", body: "По вопросам: support@qpark.kz или +7 708 239 51 19" },
    ],
  },
}

export function ProfileScreen() {
  const { user, setUser, setIsAuthenticated, setCurrentScreen, darkMode, setDarkMode, language, setLanguage, t } = useParking()
  const [isAddingCar, setIsAddingCar] = useState(false)
  const [newCar, setNewCar] = useState({ brand: "", model: "", plateNumber: "" })
  const [carError, setCarError] = useState("")
  const [isCarLoading, setIsCarLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(user?.name || "")
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false)
  const [showTermsOfService, setShowTermsOfService] = useState(false)
  const [showLanguageSelect, setShowLanguageSelect] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem("qpark_token")
    if (!token) return
    fetch("/backend/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setUser(mapDbUser(data)) })
      .catch(() => {})
  }, [])

  const languageNames = { en: "English", kk: "Қазақша", ru: "Русский" }

  const handleAddCar = async () => {
    if (!user || !newCar.brand || !newCar.model || !newCar.plateNumber) return
    setIsCarLoading(true)
    setCarError("")
    try {
      const token = localStorage.getItem("qpark_token")
      const res = await fetch("/backend/auth/cars", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          brand: newCar.brand.trim(),
          model: newCar.model.trim(),
          plateNumber: newCar.plateNumber.trim().toUpperCase(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCarError(data.error || data.errors?.[0]?.msg || "Failed to add car")
        return
      }
      setUser({
        ...user,
        cars: [
          ...user.cars,
          { id: data.car.id, brand: newCar.brand.trim(), model: newCar.model.trim(), plateNumber: newCar.plateNumber.trim().toUpperCase() },
        ],
      })
      setNewCar({ brand: "", model: "", plateNumber: "" })
      setIsAddingCar(false)
    } catch {
      setCarError("Cannot connect to server")
    } finally {
      setIsCarLoading(false)
    }
  }

  const handleRemoveCar = async (carId: string) => {
    if (!user) return
    try {
      const token = localStorage.getItem("qpark_token")
      await fetch(`/backend/auth/cars/${carId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
    setUser({ ...user, cars: user.cars.filter((c) => c.id !== carId) })
  }

  const handleSignOut = () => {
    localStorage.removeItem("qpark_token")
    setIsAuthenticated(false)
    setUser(null)
    setCurrentScreen("home")
  }

  const handleSaveName = async () => {
    if (!user || !editedName.trim()) return
    const parts = editedName.trim().split(" ")
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ")
    try {
      const token = localStorage.getItem("qpark_token")
      await fetch("/backend/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ firstName, lastName }),
      })
    } catch {}
    setUser({ ...user, name: editedName.trim() })
    setIsEditingName(false)
  }

  const handleCancelEditName = () => {
    setEditedName(user?.name || "")
    setIsEditingName(false)
  }

  if (showSettings) {
    return (
      <div className={`flex flex-col h-full ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <div className={`${darkMode ? "bg-[#2a3654]" : "bg-[#495E8E]"} rounded-b-[2.5rem] px-5 pt-6 pb-8 shadow-lg`}>
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setShowSettings(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">{t.settings}</h1>
          </div>
        </div>

        <div className="flex-1 px-4 py-6 overflow-y-auto pb-32">
          <div className={`${darkMode ? "bg-gray-800" : "bg-white"} rounded-3xl p-4 mb-4 shadow-lg`}>
            <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-400"} uppercase mb-3`}>{t.appearance}</h3>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Moon className={`w-5 h-5 ${darkMode ? "text-white" : "text-[#34415F]"}`} />
                <span className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>{t.darkMode}</span>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`w-12 h-7 rounded-full transition-colors ${darkMode ? "bg-[#495E8E]" : "bg-gray-300"}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform mx-1 ${darkMode ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <button
              onClick={() => setShowLanguageSelect(true)}
              className={`flex items-center justify-between py-3 border-t ${darkMode ? "border-gray-700" : "border-gray-100"} w-full`}
            >
              <div className="flex items-center gap-3">
                <Globe className={`w-5 h-5 ${darkMode ? "text-white" : "text-[#34415F]"}`} />
                <span className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>{t.language}</span>
              </div>
              <div className={`flex items-center gap-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                <span className="text-sm">{languageNames[language]}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          </div>

          <div className={`${darkMode ? "bg-gray-800" : "bg-white"} rounded-3xl p-4 mb-4 shadow-lg`}>
            <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-400"} uppercase mb-3`}>{t.notifications}</h3>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Bell className={`w-5 h-5 ${darkMode ? "text-white" : "text-[#34415F]"}`} />
                <span className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>{t.pushNotifications}</span>
              </div>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`w-12 h-7 rounded-full transition-colors ${notifications ? "bg-[#495E8E]" : "bg-gray-300"}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform mx-1 ${notifications ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          </div>

          <div className={`${darkMode ? "bg-gray-800" : "bg-white"} rounded-3xl p-4 mb-4 shadow-lg`}>
            <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-400"} uppercase mb-3`}>{t.securityPrivacy}</h3>
            <button onClick={() => setShowPrivacyPolicy(true)} className="flex items-center justify-between py-3 w-full">
              <div className="flex items-center gap-3">
                <Shield className={`w-5 h-5 ${darkMode ? "text-white" : "text-[#34415F]"}`} />
                <span className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>{t.privacyPolicy}</span>
              </div>
              <ChevronRight className={`w-5 h-5 ${darkMode ? "text-gray-500" : "text-gray-400"}`} />
            </button>
            <button
              onClick={() => setShowTermsOfService(true)}
              className={`flex items-center justify-between py-3 border-t ${darkMode ? "border-gray-700" : "border-gray-100"} w-full`}
            >
              <div className="flex items-center gap-3">
                <HelpCircle className={`w-5 h-5 ${darkMode ? "text-white" : "text-[#34415F]"}`} />
                <span className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>{t.termsOfService}</span>
              </div>
              <ChevronRight className={`w-5 h-5 ${darkMode ? "text-gray-500" : "text-gray-400"}`} />
            </button>
          </div>

          <div className={`${darkMode ? "bg-gray-800" : "bg-white"} rounded-3xl p-4 mb-4 shadow-lg`}>
            <h3 className={`text-sm font-semibold ${darkMode ? "text-gray-400" : "text-gray-400"} uppercase mb-3`}>{t.about}</h3>
            <div className="flex items-center justify-between py-3">
              <span className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>{t.appVersion}</span>
              <span className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>1.0.0</span>
            </div>
            <div className={`flex items-center justify-between py-3 border-t ${darkMode ? "border-gray-700" : "border-gray-100"}`}>
              <span className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>{t.build}</span>
              <span className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>2026.05.14</span>
            </div>
          </div>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-4 text-red-500 font-medium text-center hover:text-red-600 transition-colors"
          >
            {t.deleteAccount}
          </button>
        </div>

        {showLanguageSelect && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`mx-4 w-full max-w-[320px] overflow-hidden rounded-2xl ${darkMode ? "bg-gray-800" : "bg-white"} shadow-xl`}>
              <div className={`flex items-center justify-between border-b ${darkMode ? "border-gray-700" : "border-gray-100"} px-5 py-4`}>
                <h3 className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>{t.selectLanguage}</h3>
                <button onClick={() => setShowLanguageSelect(false)} className={`p-1 rounded-full ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
                  <X className={`w-5 h-5 ${darkMode ? "text-gray-400" : "text-gray-500"}`} />
                </button>
              </div>
              <div className="p-2">
                {(["en", "kk", "ru"] as const).map((code) => (
                  <button
                    key={code}
                    onClick={() => { setLanguage(code); setShowLanguageSelect(false) }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                      language === code
                        ? "bg-[#495E8E] text-white"
                        : darkMode
                        ? "hover:bg-gray-700 text-white"
                        : "hover:bg-gray-100 text-gray-900"
                    }`}
                  >
                    {languageNames[code]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showPrivacyPolicy && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`mx-4 max-h-[85%] w-full max-w-[350px] overflow-hidden rounded-2xl ${darkMode ? "bg-gray-800" : "bg-white"} shadow-xl`}>
              <div className={`flex items-center justify-between border-b ${darkMode ? "border-gray-700" : "border-gray-100"} px-5 py-4`}>
                <h3 className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>{t.privacyPolicy}</h3>
                <button onClick={() => setShowPrivacyPolicy(false)} className={`p-1 rounded-full ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
                  <X className={`w-5 h-5 ${darkMode ? "text-gray-400" : "text-gray-500"}`} />
                </button>
              </div>
              <div className={`max-h-[400px] overflow-y-auto px-5 py-4 text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                <p className={`mb-4 font-semibold ${darkMode ? "text-gray-200" : "text-gray-900"}`}>
                  {language === "kk" ? "Соңғы жаңарту: Мамыр 2026" : language === "ru" ? "Последнее обновление: Май 2026" : "Last updated: May 2026"}
                </p>
                {privacyContent[language].sections.map((s) => (
                  <div key={s.title}>
                    <h4 className={`mb-2 font-semibold ${darkMode ? "text-gray-200" : "text-gray-900"}`}>{s.title}</h4>
                    <p className="mb-4">{s.body}</p>
                  </div>
                ))}
              </div>
              <div className={`border-t ${darkMode ? "border-gray-700" : "border-gray-100"} px-5 py-4`}>
                <button onClick={() => setShowPrivacyPolicy(false)} className="w-full rounded-xl bg-[#495E8E] py-3 font-semibold text-white hover:bg-[#3d4c73] transition-colors">
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        )}

        {showTermsOfService && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`mx-4 max-h-[85%] w-full max-w-[350px] overflow-hidden rounded-2xl ${darkMode ? "bg-gray-800" : "bg-white"} shadow-xl`}>
              <div className={`flex items-center justify-between border-b ${darkMode ? "border-gray-700" : "border-gray-100"} px-5 py-4`}>
                <h3 className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>{t.termsOfService}</h3>
                <button onClick={() => setShowTermsOfService(false)} className={`p-1 rounded-full ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
                  <X className={`w-5 h-5 ${darkMode ? "text-gray-400" : "text-gray-500"}`} />
                </button>
              </div>
              <div className={`max-h-[400px] overflow-y-auto px-5 py-4 text-sm ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                <p className={`mb-4 font-semibold ${darkMode ? "text-gray-200" : "text-gray-900"}`}>
                  {language === "kk" ? "Соңғы жаңарту: Мамыр 2026" : language === "ru" ? "Последнее обновление: Май 2026" : "Last updated: May 2026"}
                </p>
                {termsContent[language].sections.map((s) => (
                  <div key={s.title}>
                    <h4 className={`mb-2 font-semibold ${darkMode ? "text-gray-200" : "text-gray-900"}`}>{s.title}</h4>
                    <p className="mb-4">{s.body}</p>
                  </div>
                ))}
              </div>
              <div className={`border-t ${darkMode ? "border-gray-700" : "border-gray-100"} px-5 py-4`}>
                <button onClick={() => setShowTermsOfService(false)} className="w-full rounded-xl bg-[#495E8E] py-3 font-semibold text-white hover:bg-[#3d4c73] transition-colors">
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`mx-4 w-full max-w-[320px] overflow-hidden rounded-2xl ${darkMode ? "bg-gray-800" : "bg-white"} shadow-xl`}>
              <div className="px-5 py-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-red-500" />
                </div>
                <h3 className={`text-lg font-bold ${darkMode ? "text-white" : "text-gray-900"} mb-2`}>{t.deleteAccountTitle}</h3>
                <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"} mb-6`}>{t.deleteAccountMsg}</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)} className={`flex-1 py-3 rounded-xl border ${darkMode ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"} font-medium transition-colors`}>
                    {t.cancel}
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setShowSettings(false); handleSignOut() }}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                  >
                    {t.delete}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`absolute bottom-0 left-0 right-0 h-20 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border-t z-40`}>
          <div className="flex justify-around items-center h-full px-4">
            {[
              { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", labelKey: "home" as const, active: false },
              { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", labelKey: "map" as const, active: false },
              { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", labelKey: "booking" as const, active: false },
              { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", labelKey: "wallet" as const, active: false },
              { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", labelKey: "profile" as const, active: true },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => { setShowSettings(false); setCurrentScreen(item.id) }}
                className={`flex flex-col items-center justify-center gap-0.5 p-3 transition-all ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"} rounded-xl active:scale-95`}
              >
                <div className="w-8 h-8 flex items-center justify-center">
                  <img
                    src={item.active ? item.activeIcon : item.icon}
                    alt={t[item.labelKey]}
                    width={28}
                    height={28}
                    className={`${item.active ? "opacity-100" : "opacity-80"} ${darkMode && !item.active ? "brightness-0 invert opacity-70" : ""}`}
                  />
                </div>
                <span className={`text-xs font-medium ${item.active ? (darkMode ? "text-blue-400" : "text-[#36549B]") : darkMode ? "text-gray-300" : "text-gray-900"}`}>
                  {t[item.labelKey]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full ${darkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className={`${darkMode ? "bg-[#2a3654]" : "bg-[#495E8E]"} rounded-b-[2.5rem] px-5 pt-6 pb-6 shadow-lg`}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">{t.profile}</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <Settings className="w-5 h-5 text-white" />
            </button>
            <button className="p-2 rounded-full hover:bg-white/10 transition-colors relative">
              <Bell className="w-5 h-5 text-white" />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#495E8E]"></span>
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mb-3">
            <User className="w-10 h-10 text-gray-400" />
          </div>
          {isEditingName ? (
            <div className="flex items-center justify-center gap-2 mb-1">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="w-36 bg-white/15 text-white text-lg font-bold text-center rounded-lg px-2 py-1 outline-none border border-white/20 focus:border-white/40"
                autoFocus
                placeholder="Your name"
              />
              <button onClick={handleSaveName} className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                <Check className="w-3.5 h-3.5 text-white" />
              </button>
              <button onClick={handleCancelEditName} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <X className="w-3.5 h-3.5 text-white/70" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 mb-1">
              <h2 className="text-xl font-bold text-white">{user?.name || "User Name"}</h2>
              <button
                onClick={() => { setEditedName(user?.name || ""); setIsEditingName(true) }}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-white/50" />
              </button>
            </div>
          )}
          <p className="text-white/80 text-sm">{user?.phone || "+7 XXX XXX XX XX"}</p>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/20">
            <div className="flex items-center gap-2 mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 10h20" />
              </svg>
              <p className="text-white font-bold text-xl">{user?.balance || 1500}₸</p>
            </div>
            <p className="text-white/70 text-xs">{t.balance}</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/20">
            <div className="flex items-center gap-2 mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <p className="text-white font-bold text-xl">{user?.bonusPoints || 50}</p>
            </div>
            <p className="text-white/70 text-xs">{t.bonus}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-4 overflow-y-auto pb-32">
        <div className={`${darkMode ? "bg-[#5a6b87]" : "bg-[#7A8BA8]"} rounded-3xl p-4 mb-4 shadow-lg`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-white" />
              <div>
                <p className="font-semibold text-white">{t.noShowCounter}</p>
                <p className="text-sm text-white/70">{user?.noShowCount || 1} of 6 (ban at 6)</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium text-white">
              {user?.noShowCount || 1}/6
            </span>
          </div>
        </div>

        <div className={`${darkMode ? "bg-[#5a6b87]" : "bg-[#7A8BA8]"} rounded-3xl p-4 mb-4 shadow-lg`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Image src="/car.svg" alt="Car" width={24} height={24} className="object-contain brightness-0 invert" />
              <p className="font-semibold text-white">{t.myCars}</p>
            </div>
            <button
              onClick={() => setIsAddingCar(true)}
              className="flex items-center gap-1 px-3 py-1 bg-white/20 rounded-full text-white font-medium text-sm hover:bg-white/30 transition-colors"
            >
              {t.add}
            </button>
          </div>

          {user?.cars.map((car) => (
            <div key={car.id} className="flex items-center justify-between py-3 border-t border-white/20">
              <div>
                <p className="font-medium text-white">{car.brand} {car.model}</p>
                <p className="text-sm text-white/70">{car.plateNumber}</p>
              </div>
              <button onClick={() => handleRemoveCar(car.id)} className="p-2 text-white/50 hover:text-red-400 transition-colors">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}

          {isAddingCar && (
            <div className="space-y-3 pt-3 border-t border-white/20">
              <Input
                placeholder={t.brandPlaceholder}
                value={newCar.brand}
                onChange={(e) => setNewCar({ ...newCar, brand: e.target.value })}
                className="rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/50"
              />
              <Input
                placeholder={t.modelPlaceholder}
                value={newCar.model}
                onChange={(e) => setNewCar({ ...newCar, model: e.target.value })}
                className="rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/50"
              />
              <Input
                placeholder={t.platePlaceholder}
                value={newCar.plateNumber}
                onChange={(e) => setNewCar({ ...newCar, plateNumber: e.target.value })}
                className="rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/50"
              />
              {carError && <p className="text-red-300 text-sm text-center">{carError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setIsAddingCar(false); setNewCar({ brand: "", model: "", plateNumber: "" }); setCarError("") }}
                  className="flex-1 py-3 rounded-xl border border-white/30 font-medium text-white hover:bg-white/10 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleAddCar}
                  disabled={!newCar.brand || !newCar.model || !newCar.plateNumber || isCarLoading}
                  className="flex-1 py-3 rounded-xl bg-white text-[#34415F] font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCarLoading ? t.saving : t.add}
                </button>
              </div>
            </div>
          )}

          {(!user?.cars || user.cars.length === 0) && !isAddingCar && (
            <p className="py-4 text-center text-white/50 border-t border-white/20">{t.noCarsRegistered}</p>
          )}
        </div>

        <p className={`text-center ${darkMode ? "text-gray-400" : "text-gray-500"} text-sm mb-4`}>
          {t.contactSupport} <span className={`font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>+7 708 239 51 19</span>
        </p>

        <button
          onClick={handleSignOut}
          className={`w-full flex items-center justify-center gap-2 py-4 rounded-3xl ${darkMode ? "bg-[#2a3654]" : "bg-[#495E8E]"} text-white font-semibold hover:opacity-90 transition-colors shadow-lg`}
        >
          <LogOut className="w-5 h-5 rotate-180" />
          {t.signOut}
        </button>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 h-20 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border-t z-50`}>
        <div className="flex justify-around items-center h-full px-4">
          {[
            { id: "home", icon: "/Home_light.svg", activeIcon: "/Home_light_active.svg", labelKey: "home" as const, active: false },
            { id: "map", icon: "/Map_light.svg", activeIcon: "/Map_light_active.svg", labelKey: "map" as const, active: false },
            { id: "booking", icon: "/Component.svg", activeIcon: "/Component_active.svg", labelKey: "booking" as const, active: false },
            { id: "wallet", icon: "/wallet.svg", activeIcon: "/wallet_active.svg", labelKey: "wallet" as const, active: false },
            { id: "profile", icon: "/User_cicrle_light.svg", activeIcon: "/User_cicrle_light_active.svg", labelKey: "profile" as const, active: true },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentScreen(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 p-3 transition-all ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"} rounded-xl active:scale-95`}
            >
              <div className="w-8 h-8 flex items-center justify-center">
                <img
                  src={item.active ? item.activeIcon : item.icon}
                  alt={t[item.labelKey]}
                  width={28}
                  height={28}
                  className={`${item.active ? "opacity-100" : "opacity-80"} ${darkMode && !item.active ? "brightness-0 invert opacity-70" : ""}`}
                />
              </div>
              <span className={`text-xs font-medium ${item.active ? (darkMode ? "text-blue-400" : "text-[#36549B]") : darkMode ? "text-gray-300" : "text-gray-900"}`}>
                {t[item.labelKey]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
