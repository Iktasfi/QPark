"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import { getSocket, disconnectSocket } from "./socket"

export type Language = "en" | "kk" | "ru"

const translations = {
  en: {
    home: "Home", map: "Map", booking: "Booking", wallet: "Wallet", profile: "Profile",
    settings: "Settings", appearance: "Appearance", darkMode: "Dark Mode", language: "Language",
    notifications: "Notifications", pushNotifications: "Push Notifications",
    securityPrivacy: "Security & Privacy", privacyPolicy: "Privacy Policy",
    termsOfService: "Terms of Service", about: "About", appVersion: "App Version",
    build: "Build", deleteAccount: "Delete Account", selectLanguage: "Select Language",
    noShowCounter: "No-Show Counter", contactSupport: "Contact support:", signOut: "Sign Out",
    balance: "Balance", bonus: "Bonus Points", bonusPoints: "Bonus Points",
    myCars: "My Cars", add: "Add", cancel: "Cancel", noCarsRegistered: "No cars registered",
    manageBalance: "Manage your balance", currentBalance: "Current Balance",
    topUpBalance: "Top Up Balance", promoCodeAvailable: "Promo Code Available",
    promoDescription: "FIRST - 150₸ off your first parking",
    active: "Active", transactionHistory: "Transaction History",
    selectAmount: "Select Amount", payWithStripe: "Pay with Stripe",
    poweredByStripe: "Powered by Stripe (Test Mode)", walletTopUp: "Wallet Top-Up",
    welcomeBack: "Welcome back,", bonusPointsLabel: "Bonus points",
    shortTerm: "Short-term", longTerm: "Long-term", spotsAvailable: "spots available",
    activeBooking: "Active Booking", quickActions: "Quick Actions",
    bookNow: "Book now", findParking: "Find available parking",
    registered: "registered", specialOffer: "Special Offer!",
    firstBookingOffer: "Get 50% off your first booking",
    parkingMap: "Parking Map", parkingLocation: "Astana, Central Location - 30 spots",
    shortTermSection: "Short-term · SP-01–15", longTermSection: "Long-term · SP-16–30",
    statusFree: "Free", statusBooked: "Booked", statusOccupied: "Occupied",
    statusReserved: "Reserved", statusRepair: "Repair",
    myBookings: "My Bookings", noActiveBooking: "No active booking",
    longTermReservation: "Long-term reservation", shortTermParking: "Short-term parking",
    parked: "Parked", enRoute: "En Route",
    timeToArrive: "Time to arrive", driveUpTo: "Drive up to", lprDetect: "LPR will detect you",
    hurryExpire: "Hurry! Your booking will expire soon.",
    parkingDuration: "Parking Duration", currentCost: "Current Cost",
    rentalPeriod: "Rental Period", daysRemaining: "days remaining", paid: "Paid",
    carParked: "Car is parked", spotReservedOutside: "Spot reserved — car outside",
    driveToExitLpr: "Drive to exit — LPR will open the barrier",
    driveInLpr: "Drive in — LPR will detect your plate",
    parkingSpot: "Parking Spot", vehicle: "Car",
    entryMethod: "Entry Method", lprCamera: "LPR Camera", autoPlate: "Automatic plate recognition",
    costBreakdown: "Cost Breakdown", firstHourMin: "First hour (minimum)",
    extraTime: "Extra time", total: "Total",
    processing: "Processing...", payAndExit: "Pay & Exit",
    extendWaiting: "Extend +30 min · 75 ₸", cancelBooking: "Cancel Booking",
    extendRental: "Extend Rental", terminateRental: "Terminate Rental Early",
    noBookingHistory: "No booking history yet", findParkingBtn: "Find Parking",
    completed: "Completed", cancelled: "Cancelled",
    paymentSuccessful: "Payment Successful!",
    driveToExitMsg: "Drive to the exit — the barrier will open when the camera scans your plate.",
    terminateRentalTitle: "Terminate Rental?",
    terminateRentalMsg: "Your rental for spot", terminateRentalMsg2: "will be ended early. No refund will be issued.",
    terminate: "Terminate", terminating: "Terminating...",
    currentPeriod: "Current:", addMoreDays: "Add more days below",
    newTotalPeriod: "New total period", confirmExtend: "Confirm",
    selectPeriod: "Select a period",
    insufficientBalance: "Insufficient Balance",
    insufficientMsg1: "You need", insufficientMsg2: "but your wallet only has",
    insufficientMsg3: "Please top up to continue.",
    shortfall: "Shortfall", back: "Back", topUpWallet: "Top Up Wallet",
    spotDetails: "Spot Details", free: "Free", bookedStatus: "Booked",
    hourlyRate: "Hourly rate", dailyRate: "Daily rate",
    minOneHour: "Minimum 1 hour", additionalMin: "min · 3₸/min after 1hr",
    selectVehicle: "Select your car", selectPeriodLabel: "Select rental period",
    perDay: "per day", bookNowBtn: "Book Now", bookingLabel: "Booking...",
    youAlreadyBooked: "You Already Have a Booking",
    alreadyBookedMsg: "is already booked. Complete or cancel it to select a new spot.",
    goToBooking: "Go to Booking", viewMyBooking: "View My Booking",
    alreadyBookedComplete: "Complete or cancel your current booking to select a new spot.",
    period: "Period", day: "day", days: "days", selected: "Selected",
    spotLabel: "Spot", noCarsAddFirst: "No cars registered. Add a car in Profile first.",
    pricing: "Pricing",
    firstHourDetail: "First hour: 150 ₸ (minimum)",
    afterFirstHour: "After first hour: 3 ₸/minute",
    arrivalWindow: "30 min arrival window (free)",
    extendedWaitingInfo: "Extended waiting: +75 ₸ for 30 min",
    noTransactionsYet: "No transactions yet",
    payment: "Payment",
    payNow: "Pay & Book Now",
    chargedImmediately: "Payment is charged from your wallet immediately",
    reservationConfirmed: "Reservation Confirmed!", bookingConfirmed: "Booking Confirmed!",
    spotNowReserved: "Your spot is now reserved",
    have15Minutes: "You have 30 minutes to arrive",
    arrivalDeadline: "Arrival Deadline", arriveWithin15: "Arrive within 15 minutes", arriveWithin30: "Arrive within 30 minutes",
    unlimitedEntries: "Unlimited entries & exits",
    lprEntry: "LPR Entry",
    lprEntryDesc: "Drive to the entrance — camera reads your plate and opens barrier",
    viewActiveBooking: "View Active Booking", backToHome: "Back to Home",
    saving: "Saving...",
    brandPlaceholder: "Brand (e.g., Toyota)",
    modelPlaceholder: "Model (e.g., Camry)",
    platePlaceholder: "Plate Number (e.g., 123 ABC 01)",
    close: "Close",
    stripeTopUpDesc: "Top up via Stripe — ",
    deleteAccountTitle: "Delete Account?",
    deleteAccountMsg: "This action cannot be undone. All your data, including cars and booking history, will be permanently deleted.",
    delete: "Delete",
    yourProfile: "Your Profile", yourCars: "Your Cars",
    tellUsName: "Tell us your name", addYourCars: "Add your car(s)",
    personalInfo: "Personal Info", firstNameLabel: "First Name", lastNameLabel: "Last Name",
    addCar: "Add Car", skipAndContinue: "Skip & Continue", continueBtn: "Continue",
    brandLabel: "Brand", modelLabel: "Model", plateLabel: "Plate Number", done: "Done",
    spotTaken: "My Spot is Taken",
    spotTakenDesc: "Someone parked in your reserved spot",
    complaintTitle: "Report Spot Violation",
    complaintReason: "Describe the situation",
    complaintReasonPlaceholder: "e.g. Another car is parked in my reserved spot",
    complaintPhoto: "Take Photo",
    complaintSend: "Send Report",
    complaintSending: "Sending...",
    complaintSent: "Report Sent!",
    complaintSentDesc: "Admin will review and find you a new spot",
    newSpotFound: "New Spot Found!",
    newSpotFoundDesc: "We moved your booking to",
    acceptNewSpot: "Go to New Spot",
    noSpotsAvailable: "No Free Spots",
    noSpotsDesc: "No spots available now. Full refund sent to your wallet.",
    complaintsList: "Complaints",
    resolve: "Resolve",
    fine: "Fine User",
  },
  kk: {
    home: "Басты", map: "Карта", booking: "Брондау", wallet: "Әмиян", profile: "Жеке бет",
    settings: "Баптаулар", appearance: "Сыртқы түр", darkMode: "Қараңғы режим",
    language: "Тіл", notifications: "Хабарландырулар", pushNotifications: "Push хабарландырулар",
    securityPrivacy: "Қауіпсіздік және құпиялылық", privacyPolicy: "Құпиялылық саясаты",
    termsOfService: "Қызмет көрсету шарттары", about: "Қосымша туралы",
    appVersion: "Нұсқасы", build: "Жинақ", deleteAccount: "Аккаунтты жою",
    selectLanguage: "Тілді таңдаңыз", noShowCounter: "Келмеу санауышы",
    contactSupport: "Қолдау қызметіне хабарласу:", signOut: "Шығу",
    balance: "Баланс", bonus: "Бонус ұпайлар", bonusPoints: "Бонус ұпайлар",
    myCars: "Менің көліктерім", add: "Қосу", cancel: "Болдырмау",
    noCarsRegistered: "Тіркелген көлік жоқ",
    manageBalance: "Балансты басқару", currentBalance: "Ағымдағы баланс",
    topUpBalance: "Балансты толтыру", promoCodeAvailable: "Промокод қол жетімді",
    promoDescription: "FIRST - алғашқы тұрақ үшін 150₸ жеңілдік",
    active: "Белсенді", transactionHistory: "Транзакция тарихы",
    selectAmount: "Соманы таңдаңыз", payWithStripe: "Stripe арқылы төлеу",
    poweredByStripe: "Stripe (Тест режимі)", walletTopUp: "Әмиянды толтыру",
    welcomeBack: "Қайта оралдыңыз,", bonusPointsLabel: "Бонус ұпайлар",
    shortTerm: "Қысқа мерзімді", longTerm: "Ұзақ мерзімді", spotsAvailable: "орын бар",
    activeBooking: "Белсенді брондау", quickActions: "Жылдам әрекеттер",
    bookNow: "Қазір брондау", findParking: "Бос орын табу",
    registered: "тіркелген", specialOffer: "Арнайы ұсыныс!",
    firstBookingOffer: "Бірінші брондауға 50% жеңілдік",
    parkingMap: "Тұрақ картасы", parkingLocation: "Астана, Орталық орын - 30 орын",
    shortTermSection: "Қысқа мерзімді · SP-01–15",
    longTermSection: "Ұзақ мерзімді · SP-16–30",
    statusFree: "Бос", statusBooked: "Брондалған", statusOccupied: "Бос емес",
    statusReserved: "Резервте", statusRepair: "Жөндеуде",
    myBookings: "Менің брондауларым", noActiveBooking: "Белсенді брондау жоқ",
    longTermReservation: "Ұзақ мерзімді брондау", shortTermParking: "Қысқа мерзімді тұрақ",
    parked: "Тұрды", enRoute: "Жолда",
    timeToArrive: "Келу уақыты", driveUpTo: "Жету нүктесі", lprDetect: "LPR анықтайды",
    hurryExpire: "Асығыңыз! Брондауыңыздың мерзімі жақын арада аяқталады.",
    parkingDuration: "Тұрақ уақыты", currentCost: "Ағымдағы құны",
    rentalPeriod: "Жалдау мерзімі", daysRemaining: "күн қалды", paid: "Төленді",
    carParked: "Көлік тұрды", spotReservedOutside: "Орын резервте — көлік сыртта",
    driveToExitLpr: "Шығуға жүріңіз — LPR шлагбаумды ашады",
    driveInLpr: "Кіруге жүріңіз — LPR нөмірді анықтайды",
    parkingSpot: "Тұрақ орны", vehicle: "Көлік",
    entryMethod: "Кіру тәсілі", lprCamera: "LPR камера", autoPlate: "Автоматты нөмір тану",
    costBreakdown: "Шығын бөлімі", firstHourMin: "Бірінші сағат (ең аз)",
    extraTime: "Қосымша уақыт", total: "Жиыны",
    processing: "Өңделуде...", payAndExit: "Төлеу және шығу",
    extendWaiting: "+30 мин ұзарту · 75 ₸", cancelBooking: "Брондауды бас тарту",
    extendRental: "Жалдауды ұзарту", terminateRental: "Жалдауды мерзімінен бұрын аяқтау",
    noBookingHistory: "Брондау тарихы жоқ", findParkingBtn: "Тұрақ табу",
    completed: "Аяқталды", cancelled: "Бас тартылды",
    paymentSuccessful: "Төлем сәтті өтті!",
    driveToExitMsg: "Шығуға жүріңіз — камера нөміріңізді оқығанда шлагбаум ашылады.",
    terminateRentalTitle: "Жалдауды аяқтау?",
    terminateRentalMsg: "Орынның жалдауы", terminateRentalMsg2: "мерзімінен бұрын аяқталады. Қаражат қайтарылмайды.",
    terminate: "Аяқтау", terminating: "Аяқталуда...",
    currentPeriod: "Ағымдағы:", addMoreDays: "Төменде күн қосыңыз",
    newTotalPeriod: "Жаңа жалпы мерзім", confirmExtend: "Растау",
    selectPeriod: "Мерзімді таңдаңыз",
    insufficientBalance: "Баланс жеткіліксіз",
    insufficientMsg1: "Сізге керек", insufficientMsg2: "бірақ балансыңызда тек",
    insufficientMsg3: "Жалғастыру үшін толтырыңыз.",
    shortfall: "Жетіспейді", back: "Артқа", topUpWallet: "Балансты толтыру",
    spotDetails: "Орын мәліметтері", free: "Бос", bookedStatus: "Брондалған",
    hourlyRate: "Сағаттық тариф", dailyRate: "Күндік тариф",
    minOneHour: "Кемінде 1 сағат", additionalMin: "мин · 1 сағаттан кейін 3₸/мин",
    selectVehicle: "Көлігіңізді таңдаңыз", selectPeriodLabel: "Жалдау мерзімін таңдаңыз",
    perDay: "күніне", bookNowBtn: "Қазір брондау", bookingLabel: "Брондалуда...",
    youAlreadyBooked: "Сізде белсенді брондау бар",
    alreadyBookedMsg: "бұрын брондалған. Жаңа орын үшін оны аяқтаңыз немесе бас тартыңыз.",
    goToBooking: "Брондауға өту", viewMyBooking: "Брондауымды қарау",
    alreadyBookedComplete: "Жаңа орын таңдау үшін брондауды аяқтаңыз немесе бас тартыңыз.",
    period: "Мерзім", day: "күн", days: "күн", selected: "Таңдалды",
    spotLabel: "Орын", noCarsAddFirst: "Тіркелген көлік жоқ. Алдымен Жеке бетте қосыңыз.",
    pricing: "Баға",
    firstHourDetail: "Бірінші сағат: 150 ₸ (ең аз)",
    afterFirstHour: "Бірінші сағаттан кейін: 3 ₸/мин",
    arrivalWindow: "30 мин тегін күту уақыты",
    extendedWaitingInfo: "Күту ұзартылуы: +75 ₸, 30 мин",
    noTransactionsYet: "Транзакциялар жоқ",
    payment: "Төлем",
    payNow: "Төлеу және брондау",
    chargedImmediately: "Төлем кошельектен бірден алынады",
    reservationConfirmed: "Брондау расталды!", bookingConfirmed: "Брондау расталды!",
    spotNowReserved: "Орыныңыз резервте",
    have15Minutes: "Келу үшін 30 минут бар",
    arrivalDeadline: "Келу мерзімі", arriveWithin15: "15 минут ішінде келіңіз", arriveWithin30: "30 минут ішінде келіңіз",
    unlimitedEntries: "Кіру/шығу шектеусіз",
    lprEntry: "LPR кіруі",
    lprEntryDesc: "Кіреберіске жүріңіз — камера нөміріңізді оқып, шлагбаумды ашады",
    viewActiveBooking: "Белсенді брондауды қарау", backToHome: "Басты бетке оралу",
    saving: "Сақталуда...",
    brandPlaceholder: "Маркасы (мыс., Toyota)",
    modelPlaceholder: "Моделі (мыс., Camry)",
    platePlaceholder: "Нөмірі (мыс., 123 ABC 01)",
    close: "Жабу",
    stripeTopUpDesc: "Stripe арқылы толтыру — ",
    deleteAccountTitle: "Аккаунтты жою?",
    deleteAccountMsg: "Бұл әрекетті болдырмау мүмкін емес. Барлық деректеріңіз, соның ішінде көліктер мен брондау тарихы, біржола жойылады.",
    delete: "Жою",
    yourProfile: "Профиліңіз", yourCars: "Сіздің көліктерім",
    tellUsName: "Атыңызды жазыңыз", addYourCars: "Көлігіңізді қосыңыз",
    personalInfo: "Жеке ақпарат", firstNameLabel: "Аты", lastNameLabel: "Тегі",
    addCar: "Көлік қосу", skipAndContinue: "Өткізу", continueBtn: "Жалғастыру",
    brandLabel: "Маркасы", modelLabel: "Моделі", plateLabel: "Нөмірі", done: "Дайын",
    spotTaken: "Орным алынды",
    spotTakenDesc: "Басқа көлік сіздің орыныңызда тұр",
    complaintTitle: "Шағым жіберу",
    complaintReason: "Жағдайды сипаттаңыз",
    complaintReasonPlaceholder: "Мысалы: Басқа көлік менің орыныма тұрды",
    complaintPhoto: "Фото түсіру",
    complaintSend: "Жіберу",
    complaintSending: "Жіберілуде...",
    complaintSent: "Жіберілді!",
    complaintSentDesc: "Әкімші қарайды және жаңа орын табады",
    newSpotFound: "Жаңа орын табылды!",
    newSpotFoundDesc: "Брондауыңыз ауысты",
    acceptNewSpot: "Жаңа орынға өту",
    noSpotsAvailable: "Бос орын жоқ",
    noSpotsDesc: "Қазір бос орын жоқ. Толық қайтарым кошельекке жіберілді.",
    complaintsList: "Шағымдар",
    resolve: "Шешу",
    fine: "Айыппұл",
  },
  ru: {
    home: "Главная", map: "Карта", booking: "Бронь", wallet: "Кошелёк", profile: "Профиль",
    settings: "Настройки", appearance: "Внешний вид", darkMode: "Тёмный режим",
    language: "Язык", notifications: "Уведомления", pushNotifications: "Push-уведомления",
    securityPrivacy: "Безопасность и конфиденциальность", privacyPolicy: "Политика конфиденциальности",
    termsOfService: "Условия использования", about: "О приложении",
    appVersion: "Версия", build: "Сборка", deleteAccount: "Удалить аккаунт",
    selectLanguage: "Выбрать язык", noShowCounter: "Счётчик неявок",
    contactSupport: "Связаться с поддержкой:", signOut: "Выйти",
    balance: "Баланс", bonus: "Бонусные баллы", bonusPoints: "Бонусные баллы",
    myCars: "Мои автомобили", add: "Добавить", cancel: "Отмена",
    noCarsRegistered: "Нет зарегистрированных авто",
    manageBalance: "Управление балансом", currentBalance: "Текущий баланс",
    topUpBalance: "Пополнить баланс", promoCodeAvailable: "Промокод доступен",
    promoDescription: "FIRST - скидка 150₸ на первую парковку",
    active: "Активен", transactionHistory: "История транзакций",
    selectAmount: "Выберите сумму", payWithStripe: "Оплатить через Stripe",
    poweredByStripe: "Работает на Stripe (Тестовый режим)", walletTopUp: "Пополнение кошелька",
    welcomeBack: "С возвращением,", bonusPointsLabel: "Бонусные баллы",
    shortTerm: "Краткосрочная", longTerm: "Долгосрочная", spotsAvailable: "мест свободно",
    activeBooking: "Активное бронирование", quickActions: "Быстрые действия",
    bookNow: "Забронировать", findParking: "Найти свободное место",
    registered: "зарегистрирован(о)", specialOffer: "Спецпредложение!",
    firstBookingOffer: "Скидка 50% на первое бронирование",
    parkingMap: "Карта парковки", parkingLocation: "Астана, Центральная - 30 мест",
    shortTermSection: "Краткосрочн. · SP-01–15",
    longTermSection: "Долгосрочн. · SP-16–30",
    statusFree: "Свободно", statusBooked: "Забронировано", statusOccupied: "Занято",
    statusReserved: "Зарезервировано", statusRepair: "Ремонт",
    myBookings: "Мои бронирования", noActiveBooking: "Нет активного бронирования",
    longTermReservation: "Долгосрочная аренда", shortTermParking: "Краткосрочная парковка",
    parked: "Припаркован", enRoute: "В пути",
    timeToArrive: "Время прибытия", driveUpTo: "Подъехать к", lprDetect: "LPR вас определит",
    hurryExpire: "Торопитесь! Срок бронирования скоро истечёт.",
    parkingDuration: "Время парковки", currentCost: "Текущая стоимость",
    rentalPeriod: "Срок аренды", daysRemaining: "дней осталось", paid: "Оплачено",
    carParked: "Автомобиль припаркован", spotReservedOutside: "Место зарезервировано — авто снаружи",
    driveToExitLpr: "Езжайте на выезд — LPR откроет шлагбаум",
    driveInLpr: "Въезжайте — LPR определит ваш номер",
    parkingSpot: "Место парковки", vehicle: "Автомобиль",
    entryMethod: "Способ въезда", lprCamera: "LPR камера", autoPlate: "Автоматическое распознавание",
    costBreakdown: "Разбивка стоимости", firstHourMin: "Первый час (минимум)",
    extraTime: "Дополнительное время", total: "Итого",
    processing: "Обработка...", payAndExit: "Оплатить и выехать",
    extendWaiting: "+30 мин · 75 ₸", cancelBooking: "Отменить бронирование",
    extendRental: "Продлить аренду", terminateRental: "Завершить аренду досрочно",
    noBookingHistory: "История бронирований пуста", findParkingBtn: "Найти парковку",
    completed: "Завершено", cancelled: "Отменено",
    paymentSuccessful: "Оплата прошла успешно!",
    driveToExitMsg: "Езжайте на выезд — шлагбаум откроется, когда камера считает номер.",
    terminateRentalTitle: "Завершить аренду?",
    terminateRentalMsg: "Аренда места", terminateRentalMsg2: "будет досрочно завершена. Средства не возвращаются.",
    terminate: "Завершить", terminating: "Завершаем...",
    currentPeriod: "Текущий:", addMoreDays: "Добавьте дни ниже",
    newTotalPeriod: "Новый общий срок", confirmExtend: "Подтвердить",
    selectPeriod: "Выберите период",
    insufficientBalance: "Недостаточно средств",
    insufficientMsg1: "Нужно", insufficientMsg2: "а на кошельке только",
    insufficientMsg3: "Пополните баланс для продолжения.",
    shortfall: "Не хватает", back: "Назад", topUpWallet: "Пополнить кошелёк",
    spotDetails: "Детали места", free: "Свободно", bookedStatus: "Забронировано",
    hourlyRate: "Почасовой тариф", dailyRate: "Суточный тариф",
    minOneHour: "Минимум 1 час", additionalMin: "мин · 3₸/мин после 1 ч",
    selectVehicle: "Выберите автомобиль", selectPeriodLabel: "Выберите срок аренды",
    perDay: "в день", bookNowBtn: "Забронировать", bookingLabel: "Бронирование...",
    youAlreadyBooked: "У вас уже есть бронирование",
    alreadyBookedMsg: "уже забронировано. Завершите или отмените его для выбора нового места.",
    goToBooking: "К бронированию", viewMyBooking: "Моё бронирование",
    alreadyBookedComplete: "Завершите или отмените текущее бронирование, чтобы выбрать новое место.",
    period: "Период", day: "день", days: "дн.", selected: "Выбрано",
    spotLabel: "Место", noCarsAddFirst: "Нет авто. Добавьте в Профиле.",
    pricing: "Тарифы",
    firstHourDetail: "Первый час: 150 ₸ (минимум)",
    afterFirstHour: "После первого часа: 3 ₸/мин",
    arrivalWindow: "30 мин на приезд (бесплатно)",
    extendedWaitingInfo: "Продление ожидания: +75 ₸ за 30 мин",
    noTransactionsYet: "Транзакций пока нет",
    payment: "Оплата",
    payNow: "Оплатить и забронировать",
    chargedImmediately: "Оплата спишется с кошелька сразу",
    reservationConfirmed: "Бронирование подтверждено!", bookingConfirmed: "Бронирование подтверждено!",
    spotNowReserved: "Место зарезервировано",
    have15Minutes: "У вас 30 минут на прибытие",
    arrivalDeadline: "Крайний срок прибытия", arriveWithin15: "Прибудьте в течение 15 минут", arriveWithin30: "Прибудьте в течение 30 минут",
    unlimitedEntries: "Неограниченные въезды и выезды",
    lprEntry: "Вход через LPR",
    lprEntryDesc: "Подъезжайте ко входу — камера считает номер и откроет шлагбаум",
    viewActiveBooking: "Просмотр бронирования", backToHome: "На главную",
    saving: "Сохранение...",
    brandPlaceholder: "Марка (напр., Toyota)",
    modelPlaceholder: "Модель (напр., Camry)",
    platePlaceholder: "Номер (напр., 123 ABC 01)",
    close: "Закрыть",
    stripeTopUpDesc: "Пополнение через Stripe — ",
    deleteAccountTitle: "Удалить аккаунт?",
    deleteAccountMsg: "Это действие нельзя отменить. Все данные, включая автомобили и историю бронирований, будут удалены навсегда.",
    delete: "Удалить",
    yourProfile: "Ваш профиль", yourCars: "Мои авто",
    tellUsName: "Укажите ваше имя", addYourCars: "Добавьте ваш авто",
    personalInfo: "Личные данные", firstNameLabel: "Имя", lastNameLabel: "Фамилия",
    addCar: "Добавить авто", skipAndContinue: "Пропустить", continueBtn: "Продолжить",
    brandLabel: "Марка", modelLabel: "Модель", plateLabel: "Номер", done: "Готово",
    spotTaken: "Моё место занято",
    spotTakenDesc: "Чужая машина на вашем месте",
    complaintTitle: "Подать жалобу",
    complaintReason: "Опишите ситуацию",
    complaintReasonPlaceholder: "Например: Другая машина заняла моё место",
    complaintPhoto: "Сделать фото",
    complaintSend: "Отправить",
    complaintSending: "Отправка...",
    complaintSent: "Жалоба отправлена!",
    complaintSentDesc: "Администратор рассмотрит и найдёт вам новое место",
    newSpotFound: "Найдено новое место!",
    newSpotFoundDesc: "Ваша бронь перенесена на",
    acceptNewSpot: "Перейти на новое место",
    noSpotsAvailable: "Нет свободных мест",
    noSpotsDesc: "Свободных мест нет. Полный возврат отправлен на кошелёк.",
    complaintsList: "Жалобы",
    resolve: "Решить",
    fine: "Штраф",
  },
}

export type SpotStatus = "FREE" | "BOOKED" | "OCCUPIED" | "RESERVED" | "REPAIR"

export interface ParkingSpot {
  id: string
  number: number
  status: SpotStatus
  type: "short-term" | "long-term"
  bookedBy?: string
  plateNumber?: string
  bookedAt?: Date
  expiresAt?: Date
}

export interface Car {
  id: string
  brand: string
  model: string
  plateNumber: string
}

export interface Transaction {
  id: string
  type: "topup_stripe" | "parking_charge" | "longterm_charge" | "waiting_fee" | "bonus_credit" | "promo_discount"
  amount: number
  description: string
  date: Date
}

export interface User {
  id: string
  phone: string
  name: string
  balance: number
  bonusPoints: number
  noShowCount: number
  isBanned: boolean
  bannedUntil?: Date
  cars: Car[]
  transactions: Transaction[]
  promoCode?: string
}

export interface Booking {
  id: string
  spotId: string
  userId: string
  plateNumber: string
  type: "short-term" | "long-term"
  status: "active" | "completed" | "cancelled"
  startTime: Date
  endTime?: Date
  totalAmount?: number
  isPaid: boolean
  waitingFee: number
  rentalDays?: number
  arrivedAt?: Date
}

interface ParkingContextType {
  currentScreen: string
  setCurrentScreen: (screen: string) => void
  isAuthenticated: boolean
  setIsAuthenticated: (auth: boolean) => void
  isNewUser: boolean
  setIsNewUser: (v: boolean) => void
  isRestoringSession: boolean

  user: User | null
  setUser: (user: User | null) => void

  spots: ParkingSpot[]
  setSpots: (spots: ParkingSpot[]) => void
  updateSpot: (spotId: string, updates: Partial<ParkingSpot>) => void

  activeBooking: Booking | null
  setActiveBooking: (booking: Booking | null) => void
  bookings: Booking[]
  setBookings: (bookings: Booking[]) => void

  selectedSpot: ParkingSpot | null
  setSelectedSpot: (spot: ParkingSpot | null) => void

  isAdminMode: boolean
  setIsAdminMode: (admin: boolean) => void

  darkMode: boolean
  setDarkMode: (dark: boolean) => void
  language: Language
  setLanguage: (lang: Language) => void
  t: typeof translations['en']
}

const ParkingContext = createContext<ParkingContextType | undefined>(undefined)

const generateInitialSpots = (): ParkingSpot[] => {
  const spots: ParkingSpot[] = []
  for (let i = 1; i <= 15; i++) {
    const status: SpotStatus = Math.random() > 0.6 ? "FREE" : 
                               Math.random() > 0.5 ? "OCCUPIED" : 
                               Math.random() > 0.5 ? "BOOKED" : "FREE"
    spots.push({
      id: `SP-${String(i).padStart(2, "0")}`,
      number: i,
      status,
      type: "short-term",
    })
  }
  for (let i = 16; i <= 30; i++) {
    const status: SpotStatus = Math.random() > 0.7 ? "FREE" : 
                               Math.random() > 0.5 ? "RESERVED" : 
                               Math.random() > 0.3 ? "OCCUPIED" : "FREE"
    spots.push({
      id: `SP-${String(i).padStart(2, "0")}`,
      number: i,
      status: i === 22 ? "REPAIR" : status,
      type: "long-term",
    })
  }
  
  return spots
}

export function mapDbUser(dbUser: {
  id: string; phoneNumber: string; firstName?: string | null; lastName?: string | null;
  walletBalance: number; bonusPoints: number; noShowCount: number; isBanned: boolean;
  bannedUntil?: string | Date | null;
  cars?: { id: string; brand: string; model: string; plateNumber: string }[];
  transactions?: { id: string; type: string; amount: number; description?: string | null; createdAt: string | Date }[];
}): User {
  return {
    id: dbUser.id,
    phone: dbUser.phoneNumber,
    name: dbUser.firstName
      ? `${dbUser.firstName}${dbUser.lastName ? " " + dbUser.lastName : ""}`
      : "User",
    balance: dbUser.walletBalance,
    bonusPoints: dbUser.bonusPoints,
    noShowCount: dbUser.noShowCount,
    isBanned: dbUser.isBanned,
    bannedUntil: dbUser.bannedUntil ? new Date(dbUser.bannedUntil) : undefined,
    cars: (dbUser.cars ?? []).map(c => ({ id: c.id, brand: c.brand, model: c.model, plateNumber: c.plateNumber })),
    transactions: (dbUser.transactions ?? []).map(t => ({
      id: t.id,
      type: t.type.toLowerCase() as Transaction["type"],
      amount: t.amount,
      description: t.description ?? "",
      date: new Date(t.createdAt),
    })),
  }
}

function mapBackendSpot(s: { spotNumber: string; type: string; status: string; carPlate?: string | null }): ParkingSpot {
  const num = parseInt(s.spotNumber.replace("SP-", ""), 10)
  const statusMap: Record<string, SpotStatus> = {
    FREE: "FREE", BOOKED: "BOOKED", OCCUPIED: "OCCUPIED", RESERVED: "RESERVED", REPAIR: "REPAIR",
  }
  return {
    id: s.spotNumber,
    number: num,
    status: statusMap[s.status] ?? "FREE",
    type: s.type === "SHORT_TERM" ? "short-term" : "long-term",
    plateNumber: s.carPlate ?? undefined,
  }
}

export function ParkingProvider({ children }: { children: ReactNode }) {
  const [currentScreen, setCurrentScreen] = useState("home")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isNewUser, setIsNewUser] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [spots, setSpots] = useState<ParkingSpot[]>(generateInitialSpots())
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null)
  const activeBookingRef = useRef<Booking | null>(null)
  useEffect(() => { activeBookingRef.current = activeBooking }, [activeBooking])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null)
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [language, setLanguage] = useState<Language>("en")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
  }, [darkMode])
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const t = translations[language]
  const spotsRef = useRef(spots)
  spotsRef.current = spots

  useEffect(() => {
    const token = localStorage.getItem("qpark_token")
    if (!token) { setIsRestoringSession(false); return }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    fetch("/backend/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.ok) {
          const dbUser = await res.json()
          setUser(mapDbUser(dbUser))
          setIsAuthenticated(true)
          try {
            const br = await fetch("/backend/bookings/restore", {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (br.ok) {
              const restored = await br.json()
              setActiveBooking(restored ?? null)
            }
          } catch {}
        } else {
          localStorage.removeItem("qpark_token")
        }
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timeout); setIsRestoringSession(false) })
  }, [])

  const fetchSpotsFromBackend = async () => {
    try {
      const res = await fetch("/backend/parking/spots/simple")
      if (!res.ok) return
      const data: { spotNumber: string; type: string; status: string; carPlate?: string | null }[] = await res.json()
      setSpots(prev => {
        const updated = [...prev]
        data.forEach(bs => {
          const idx = updated.findIndex(s => s.id === bs.spotNumber)
          const mapped = mapBackendSpot(bs)
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], status: mapped.status, plateNumber: mapped.plateNumber }
          }
        })
        return updated
      })
    } catch {}
  }

  useEffect(() => {
    fetchSpotsFromBackend()
    const socket = getSocket()
    const handleSpotStatusChanged = (data: { spotNumber: string; status: string; carPlate?: string | null }) => {
      const statusMap: Record<string, SpotStatus> = {
        FREE: "FREE", BOOKED: "BOOKED", OCCUPIED: "OCCUPIED", RESERVED: "RESERVED", REPAIR: "REPAIR",
      }
      setSpots(prev => prev.map(s =>
        s.id === data.spotNumber
          ? { ...s, status: statusMap[data.status] ?? s.status, plateNumber: data.carPlate ?? undefined }
          : s
      ))
      const ab = activeBookingRef.current
      if (data.status === "OCCUPIED" && ab && ab.spotId === data.spotNumber && !ab.arrivedAt) {
        setActiveBooking({ ...ab, arrivedAt: new Date() })
      }
    }
    const handleBookingCreated = () => { fetchSpotsFromBackend() }
    const handleBookingCompleted = () => { fetchSpotsFromBackend() }
    const handleBookingCancelled = () => { fetchSpotsFromBackend() }
    const handleRentalCreated = () => { fetchSpotsFromBackend() }
    const handleBookingExtended = () => { fetchSpotsFromBackend() }

    socket.on("spot-status-changed", handleSpotStatusChanged)
    socket.on("booking-created", handleBookingCreated)
    socket.on("booking-completed", handleBookingCompleted)
    socket.on("booking-cancelled", handleBookingCancelled)
    socket.on("rental-created", handleRentalCreated)
    socket.on("booking-extended", handleBookingExtended)

    return () => {
      socket.off("spot-status-changed", handleSpotStatusChanged)
      socket.off("booking-created", handleBookingCreated)
      socket.off("booking-completed", handleBookingCompleted)
      socket.off("booking-cancelled", handleBookingCancelled)
      socket.off("rental-created", handleRentalCreated)
      socket.off("booking-extended", handleBookingExtended)
    }
  }, [])

  const updateSpot = (spotId: string, updates: Partial<ParkingSpot>) => {
    setSpots(prev => prev.map(spot =>
      spot.id === spotId ? { ...spot, ...updates } : spot
    ))
  }
  
  return (
    <ParkingContext.Provider value={{
      currentScreen,
      setCurrentScreen,
      isAuthenticated,
      setIsAuthenticated,
      isNewUser,
      setIsNewUser,
      user,
      setUser,
      spots,
      setSpots,
      updateSpot,
      activeBooking,
      setActiveBooking,
      bookings,
      setBookings,
      selectedSpot,
      setSelectedSpot,
      isAdminMode,
      setIsAdminMode,
      darkMode,
      setDarkMode,
      language,
      setLanguage,
      isRestoringSession,
      t,
    }}>
      {children}
    </ParkingContext.Provider>
  )
}

export function useParking() {
  const context = useContext(ParkingContext)
  if (context === undefined) {
    throw new Error("useParking must be used within a ParkingProvider")
  }
  return context
}
