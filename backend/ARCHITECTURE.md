# 🏗️ Архитектура Smart Parking Backend

## 📐 Общая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                       │
│                  3000 - Next.js Client                      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                  Backend (Express + Node.js)                │
│                     3001 - API Server                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Express Routes & Middleware                 │  │
│  │  - /auth (авторизация)                              │  │
│  │  - /bookings (бронирования)                         │  │
│  │  - /payments (платежи)                              │  │
│  │  - /parking (управление местами)                    │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Services (Бизнес-логика)                    │  │
│  │  - AuthService (авторизация, профиль)              │  │
│  │  - BookingService (бронирования)                    │  │
│  │  - PaymentService (платежи, кошельки)              │  │
│  │  - ParkingService (места, LPR)                      │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Socket.io (Real-time)                       │  │
│  │  - Обновления статуса мест                          │  │
│  │  - Уведомления о бронированиях                      │  │
│  │  - Live аналитика                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────┬─────────────┬─────────────┬──────────┬────────────┘
          │             │             │          │
          │             │             │          │
    ┌─────▼─────┐ ┌────▼────┐ ┌───────▼──┐ ┌────▼─────┐
    │ PostgreSQL│ │  Redis  │ │  Stripe  │ │ Firebase │
    │    5432   │ │  6379   │ │ Payments │ │  Notify  │
    └───────────┘ └─────────┘ └──────────┘ └──────────┘

    ┌──────────────┐              ┌─────────────┐
    │ LPR Webhook  │              │ SMS Twilio  │
    │  (въезд/выезд)              │  (OTP)     │
    └──────────────┘              └─────────────┘
```

## 🔄 Основные потоки данных

### 1️⃣ Регистрация и вход пользователя

```
Frontend (регистрация)
        ↓
POST /auth/register
        ↓
AuthService.registerUser()
        ↓
Создать User в БД (+ 150₸ промокод FIRST)
        ↓
Создать Transaction (PROMO)
        ↓
Вернуть User + JWT token
```

### 2️⃣ Краткосрочное бронирование

```
Frontend (выбрать место)
        ↓
POST /bookings/short-term
        ↓
BookingService.createShortTermBooking()
        ↓
Создать Booking (PENDING)
        ↓
Обновить ParkingSpot (BOOKED)
        ↓
Запустить 15-минутный таймер (BullMQ)
        ↓
Вернуть Booking + Socket.io обновить карту
        ↓ (через 15 минут, если не выехал)
BullMQ перешлёт: "Продлить за 75₸?"
```

### 3️⃣ Обработка LPR въезда

```
LPR Камера распознала номер
        ↓
Webhook POST /parking/lpr/entry
        ↓
ParkingService.handleLPREntry()
        ↓
Найти активное Booking по номеру машины
        ↓
Если найдено:
  - Обновить Booking (CONFIRMED)
  - Обновить ParkingSpot (OCCUPIED)
  - Записать LPREvent
  - Отправить Signal открыть шлагбаум
        ↓
Вернуть {success: true, message: "Gate opened"}
```

### 4️⃣ Платёж за парковку

```
Frontend (нажать "Оплатить и выехать")
        ↓
PaymentService.processBookingPayment()
        ↓
Рассчитать стоимость:
  - Если < 60 мин: 150₸
  - Если > 60 мин: 150₸ + (мин - 60) × 3₸
        ↓
Списать со счета через debitWallet()
        ↓
Начислить 1% кэшбэк
        ↓
Создать Transaction (PAYMENT)
        ↓
Обновить Booking (isPaid = true)
        ↓
Вернуть {success: true, walletBalance: X}
        ↓ (платеж завершен)
LPR: выехать разрешено (gate open)
```

### 5️⃣ Долгосрочная аренда

```
Frontend (выбрать "Аренда на 7 дней")
        ↓
POST /bookings/long-term
        ↓
Получить цену (для 7 дней = 3500₸)
        ↓
PaymentService.debitWallet() (списать со счета)
        ↓
Создать LongTermRental (ACTIVE)
        ↓
Обновить ParkingSpot (RESERVED за пользователем)
        ↓
Создать RenewalNotification (за 24 часа)
        ↓ (через 6 дней)
Отправить Push "Аренда закончится через 1 день!"
        ↓ (через 7 дней)
LongTermRental (EXPIRED)
        ↓
Освободить место (FREE)
```

## 🗄️ Структура данных в БД

### User таблица
```
id (UUID)           - Первичный ключ
phoneNumber         - Уникальный номер телефона
carPlate            - Номер машины для LPR
walletBalance       - Текущий баланс (тенге)
noShowCount         - Счетчик не-явок
isBanned            - Забанен ли?
bannedUntil         - До когда забанен?
createdAt           - Дата регистрации
```

### ParkingSpot таблица
```
id (UUID)
spotNumber          - Уникальный номер места (SP-01, SP-30)
type                - SHORT_TERM или LONG_TERM
status              - FREE, BOOKED, OCCUPIED, RESERVED, REPAIR
currentUserPlate    - Текущая машина на месте
currentUserId       - Текущий пользователь
```

### Booking таблица
```
id (UUID)
userId              - FK (User)
spotId              - FK (ParkingSpot)
startTime           - Когда забронировано
estimatedEndTime    - На когда забронировано
actualEndTime       - Когда фактически выехал
status              - PENDING, CONFIRMED, COMPLETED, NO_SHOW
isPaid              - Оплачено?
totalCost           - Итоговая стоимость (тенге)
```

### Payment таблица
```
id (UUID)
userId              - FK (User)
bookingId           - FK (Booking) - опционально
rentalId            - FK (LongTermRental) - опционально
amount              - Сумма
status              - PENDING, COMPLETED, FAILED, REFUNDED
paymentMethod       - WALLET, STRIPE, CARD
stripePaymentIntentId - Для Stripe интеграции
```

### Transaction таблица
```
id (UUID)
userId              - FK (User)
amount              - Сумма (позитивная или негативная)
type                - DEPOSIT, WITHDRAWAL, PAYMENT, REFUND, CASHBACK, PROMO
description         - Описание
balanceBefore       - Баланс до операции
balanceAfter        - Баланс после операции
createdAt           - Дата и время операции
```

## 🔐 Авторизация

### JWT Токен
```
Header: {
  "alg": "HS256",
  "typ": "JWT"
}

Payload: {
  "userId": "uuid-of-user",
  "iat": 1234567890,
  "exp": 1234654290  // 7 дней позже
}

Signature: HMAC_SHA256(header + payload, JWT_SECRET)
```

### Использование
```
Request Header:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Middleware проверяет:
1. Есть ли Bearer токен
2. Валидная ли подпись
3. Не истёк ли срок
4. Сохраняет userId в req.userId
```

## 📊 Тарифная система

### Краткосрочная парковка (SHORT_TERM)
```
Минимум: 150₸ (включает 1 час)

Пример:
- 30 мин     → 150₸
- 60 мин     → 150₸
- 90 мин     → 150₸ + (30 мин × 3₸) = 240₸
- 120 мин    → 150₸ + (60 мин × 3₸) = 330₸

Продление за 15 мин:
- Если не успел за 15 минут → "Продлить за 75₸ на 30 мин?"
- 75₸ идет в зачет финальной суммы
```

### Долгосрочная аренда (LONG_TERM)
```
1 день   → 700₸
3 дня    → 1800₸  (~600₸/день)
5 дней   → 2700₸  (~540₸/день)
7 дней   → 3500₸  (~500₸/день)
14 дней  → 6000₸  (~428₸/день)
```

### Кэшбэк и промокоды
```
Кэшбэк: 1% от каждого платежа
- Пример: оплатил 330₸ → 3₸ кэшбэк

Промокод FIRST:
- Для новых пользователей
- 150₸ на кошелек (скидка на первый час)
- Автоматически при регистрации
```

## 🛡️ Система дисциплины

### No-show счетчик
```
1-3 no-show    → Просто счетчик в профиле
4-я no-show    → Уведомление "Осторожно!"
6-я no-show    → Автоматический бан на 3 дня
                  Счетчик обнуляется после разблокировки

No-show = не приехал в течение 15 минут свободного подъезда
```

## 🔄 Очереди (BullMQ)

### Бронирование-очередь
```
Задача: 15-минутный таймер после создания бронирования
Если прошло 15 минут и машина не приехала:
  → Отправить уведомление "Хотите продлить?"
  → После 30 минут → No-show
```

### Аренда-очередь
```
Задача: Напоминание о продлении за день до конца срока
Если аренда заканчивается завтра:
  → Отправить Push "Осталось 24 часа. Продлить?"
```

## 🔌 External Integrations

### Stripe (Платежи)
```
1. User выбирает "Пополнить кошелек"
2. Frontend создает PaymentIntent через Stripe.js
3. User вводит данные карты на Stripe-hosted страницу
4. Stripe возвращает успех
5. Webhook POST /payments/stripe/webhook
6. Пополнить walletBalance + кэшбэк
```

### Firebase (Уведомления)
```
1. User устанавливает мобильное приложение
2. Получает deviceToken от Firebase
3. Сохраняет в БД в User.firebaseToken
4. Сервер отправляет push уведомления
5. Пример: "Ваше место готово!", "Бронь продлена"
```

### Twilio (SMS OTP)
```
1. User вводит номер телефона
2. Запрос к Twilio API
3. Twilio отправляет SMS с кодом: "Ваш код: 123456"
4. User вводит код в приложение
5. Проверить совпадение → регистрация успешна
```

### LPR Webhook
```
LPR Камера распознала номер:
POST /parking/lpr/entry
{
  "carPlate": "ABC123",
  "spotNumber": "SP-05",
  "timestamp": "2026-05-07T15:30:00Z",
  "imageUrl": "https://...",
  "confidence": 0.98
}

Сервер отвечает:
{
  "success": true,
  "action": "OPEN_GATE",
  "message": "Welcome!"
}
```

## 🚀 Развертывание (Production)

### Docker (рекомендуется)
```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment (Production)
```
NODE_ENV=production
JWT_SECRET=<random-256-bit-key>
DATABASE_URL=<production-postgres>
REDIS_URL=<production-redis>
STRIPE_SECRET_KEY=<live-key>
PORT=3001
LOG_LEVEL=info
```

### Масштабирование
```
- Использовать Redis для кэша сессий
- Использовать BullMQ для асинхронных задач
- Использовать Cloudflare для CDN
- Использовать логирование в ELK (Elasticsearch, Logstash, Kibana)
```

---

**Готово к разработке! 🎉**
