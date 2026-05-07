# 🚀 Smart Parking Backend - Структура проекта

## ✅ Завершено

Создана полная структура backend проекта для системы управления парковкой с LPR, реальным временем и интеграцией платежей.

## 📁 Структура папок

```
backend/
├── src/
│   ├── config/              # Конфигурация внешних сервисов
│   │   ├── redis.ts         # Redis конфигурация
│   │   ├── stripe.ts        # Stripe платежи
│   │   ├── firebase.ts      # Firebase уведомления
│   │   └── twilio.ts        # Twilio SMS
│   │
│   ├── middleware/          # Express middleware
│   │   └── auth.ts          # JWT авторизация
│   │
│   ├── routes/              # API маршруты
│   │   └── auth.routes.ts   # Авторизация (регистрация, вход)
│   │
│   ├── services/            # Бизнес-логика
│   │   ├── auth.service.ts       # Управление пользователями
│   │   ├── booking.service.ts    # Управление бронированиями
│   │   ├── payment.service.ts    # Управление платежами
│   │   └── parking.service.ts    # Управление парковкой и LPR
│   │
│   ├── utils/               # Утилиты
│   │   └── pricing.ts       # Расчет тарифов парковки
│   │
│   ├── queues/              # BullMQ задачи (TODO)
│   │
│   └── server.ts            # Главный файл сервера
│
├── prisma/
│   └── schema.prisma        # Схема БД (Prisma ORM)
│
├── package.json             # Зависимости проекта
├── tsconfig.json            # TypeScript конфигурация
├── .env                     # Переменные окружения (local)
├── .env.example             # Пример переменных окружения
├── .gitignore               # Git игнор
├── README.md                # Документация проекта
└── DEVELOPMENT.md           # Инструкции по локальной разработке
```

## 🗄️ Модели БД (Prisma)

### User
- `id` - UUID
- `phoneNumber` - Уникальный номер телефона
- `firstName`, `lastName` - ФИО
- `email` - Email
- `carPlate` - Номер машины (для LPR)
- `walletBalance` - Баланс кошелька
- `noShowCount` - Счетчик no-show
- `isBanned`, `bannedUntil` - Статус блокировки
- Relations: bookings, transactions, payments

### ParkingSpot
- `id` - UUID
- `spotNumber` - Номер места (SP-01...SP-30)
- `type` - SHORT_TERM или LONG_TERM
- `status` - FREE, BOOKED, OCCUPIED, RESERVED, REPAIR
- `currentUserPlate`, `currentUserId` - Текущий пользователь
- Relations: bookings, longTermRentals

### Booking
- `id` - UUID
- `userId`, `spotId` - FK
- `startTime`, `estimatedEndTime`, `actualEndTime`
- `status` - PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW
- `isPaid` - Оплачено ли
- `totalCost` - Итоговая стоимость
- `minutesExtended` - Продлено на X минут

### LongTermRental
- `id` - UUID
- `userId`, `spotId` - FK
- `rentalDays` - 1, 3, 5, 7, 14
- `totalCost`, `isPaid`
- `startDate`, `endDate`
- `status` - ACTIVE, EXPIRED, CANCELLED

### Payment
- `id` - UUID
- `userId`, `bookingId`, `rentalId` - FK
- `amount` - Сумма
- `status` - PENDING, COMPLETED, FAILED, REFUNDED
- `paymentMethod` - WALLET, STRIPE, CARD
- `stripePaymentIntentId` - Для интеграции Stripe

### Transaction
- `id` - UUID
- `userId` - FK
- `amount` - Сумма
- `type` - DEPOSIT, WITHDRAWAL, PAYMENT, REFUND, CASHBACK, PROMO
- `balanceBefore`, `balanceAfter` - Баланс до/после

### LPREvent
- `id` - UUID
- `carPlate` - Номер машины
- `eventType` - ENTRY, EXIT
- `timestamp` - Время события
- `spotNumber` - Номер места
- `imageUrl`, `confidence` - Для хранения изображения и уверенности распознавания

## 🔌 Реализованные сервисы

### AuthService
- ✅ `registerUser()` - Регистрация пользователя
- ✅ `findUserByPhone()` - Поиск по номеру
- ✅ `generateToken()` - Создание JWT
- ✅ `verifyToken()` - Проверка JWT
- ✅ `updateUserProfile()` - Обновление профиля
- ✅ `checkAndApplyBan()` - Система блокировок
- ✅ `unbanUser()` / `isUserBanned()` - Управление баном

### BookingService
- ✅ `createShortTermBooking()` - Создание краткосрочного бронирования
- ✅ `completeBooking()` - Завершение бронирования
- ✅ `cancelBooking()` - Отмена бронирования
- ✅ `getUserActiveBookings()` - Получить активные бронирования
- ✅ `getBookingByCarPlate()` - Поиск по номеру машины (для LPR)

### PaymentService
- ✅ `createStripePaymentIntent()` - Создание платежа Stripe
- ✅ `confirmStripePayment()` - Подтверждение платежа
- ✅ `debitWallet()` - Списание с кошелька
- ✅ `processBookingPayment()` - Обработка платежа за парковку
- ✅ `getUserTransactions()` - История транзакций

### ParkingService
- ✅ `getAllSpots()` - Все места
- ✅ `getSpotByNumber()` - Место по номеру
- ✅ `getAvailableSpots()` - Свободные места
- ✅ `updateSpotStatus()` - Обновить статус места
- ✅ `handleLPREntry()` - Обработка въезда (LPR)
- ✅ `handleLPRExit()` - Обработка выезда (LPR)
- ✅ `initializeParkingSpots()` - Инициализация всех 30 мест
- ✅ `getParkingStats()` - Статистика парковки

## 🔐 Middleware

### verifyToken
- Проверяет JWT токен в заголовке Authorization
- Сохраняет userId в req.userId
- Возвращает 401 если токен невалидный

### errorHandler
- Обработка ошибок валидации
- Логирование ошибок
- Возврат правильного статус-кода

## 📡 API маршруты (реализованные)

### Авторизация (`/auth`)
- `POST /auth/register` - Регистрация
- `POST /auth/login` - Вход
- `GET /auth/me` - Профиль текущего пользователя
- `PUT /auth/me` - Обновить профиль
- `GET /auth/verify-token` - Проверить токен

### Маршруты для реализации
- `POST /bookings/short-term` - Создать краткосрочное бронирование
- `POST /bookings/long-term` - Создать долгосрочную аренду
- `GET /bookings/my` - Мои бронирования
- `POST /bookings/:id/cancel` - Отменить бронирование
- `POST /bookings/:id/extend` - Продлить бронирование

- `POST /payments/deposit` - Пополнить кошелек
- `POST /payments/booking/:bookingId` - Оплатить парковку
- `GET /payments/transactions` - История платежей

- `GET /parking/spots` - Все места
- `GET /parking/spots/available` - Свободные места
- `GET /parking/stats` - Статистика парковки
- `POST /parking/lpr/entry` - Webhook LPR въезд
- `POST /parking/lpr/exit` - Webhook LPR выезд

## 💾 Утилиты

### pricing.ts
- ✅ `calculateShortTermCost()` - Рассчитать стоимость по минутам
- ✅ `getLongTermPrice()` - Цена долгосрочной аренды
- ✅ `calculateCashback()` - Рассчитать кэшбэк (1%)
- ✅ `hasFreeTravelTime()` - Есть ли свободное время подъезда
- ✅ `getFreeTravelTimeRemaining()` - Оставшееся свободное время
- ✅ `getExtendBookingCost()` - Стоимость продления

## 🔌 Интеграции

### ✅ Реализованные
- PostgreSQL + Prisma ORM
- Express.js с TypeScript
- Socket.io для real-time обновлений
- JWT авторизация
- Redis (конфигурация готова)
- Stripe (конфигурация готова)
- Firebase (конфигурация готова)
- Twilio (конфигурация готова)

### 🚧 Требуют реализации
- BullMQ очереди для таймеров бронирования
- Webhook обработчики для LPR
- Firebase уведомления
- SMS OTP верификация через Twilio

## 📝 Следующие шаги

1. **Настроить локальное окружение:**
   ```bash
   cd backend
   npm install  # уже сделано
   cp .env.example .env
   # Установить PostgreSQL и Redis
   # Обновить DATABASE_URL в .env
   ```

2. **Инициализировать БД:**
   ```bash
   npm run prisma:migrate
   npm run seed  # Create test data
   ```

3. **Запустить сервер:**
   ```bash
   npm run dev
   ```

4. **Создать оставшиеся маршруты:**
   - `src/routes/bookings.routes.ts`
   - `src/routes/payments.routes.ts`
   - `src/routes/parking.routes.ts`
   - `src/routes/user.routes.ts`

5. **Добавить BullMQ очереди:**
   - `src/queues/booking.queue.ts` - Для 15-минутного таймера
   - `src/queues/renewal.queue.ts` - Для напоминаний о продлении

6. **Интеграция Socket.io:**
   - Реал-тайм обновления статуса мест
   - Уведомления о подтверждении бронирования

7. **Административная панель API:**
   - Управление местами (ручное вкл/выкл)
   - Управление пользователями
   - Аналитика

## 📞 Контакты

Если возникли вопросы при работе с backend - обратитесь к ведущему разработчику.

---

**Backend готов к разработке! 🎉**
