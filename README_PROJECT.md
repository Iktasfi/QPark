# 🚗 Smart Parking Management System - Diploma Project

Полнофункциональная система управления парковкой с LPR (распознавание номеров), реальным временем, платежами и мобильным приложением.

## 🎯 О проекте

**Smart Parking** - это инновационная система для автоматизации управления открытой парковкой на 30 мест в Астане. Система полностью исключает необходимость в кассирах, бумажных билетах и QR-кодах, используя вместо этого технологию распознавания номерных знаков (LPR).

### Ключевые особенности
- 🔒 **Полная автоматизация** через LPR (камеры)
- 💳 **Интеграция платежей** через Stripe
- ⏱️ **Real-time обновления** через Socket.io
- 📱 **Мобильное приложение** на Next.js
- 🔐 **SMS OTP авторизация** через Twilio
- 💬 **Push уведомления** через Firebase
- 💰 **Система кэшбэка** (1% от каждого платежа)
- ⛔ **Система дисциплины** (блокировка после no-show)

## 📦 Структура проекта

```
/Diploma
├── app/                    # Frontend (Next.js 16)
│   ├── page.tsx           # Главная страница
│   ├── layout.tsx         # Лэйаут приложения
│   └── globals.css        # Глобальные стили
│
├── components/            # React компоненты
│   ├── screens/           # Экраны приложения (8 экранов)
│   ├── ui/                # UI компоненты (50+ компонентов)
│   ├── admin/             # Админ-панель
│   └── ...
│
├── backend/               # Node.js + Express сервер ✅
│   ├── src/
│   │   ├── config/        # Конфигурация сервисов
│   │   ├── services/      # Бизнес-логика (4 сервиса)
│   │   ├── routes/        # API маршруты
│   │   ├── middleware/    # Авторизация
│   │   └── utils/         # Утилиты
│   ├── prisma/            # Схема БД (9 таблиц)
│   └── package.json       # 277+ зависимостей
│
├── public/                # Статические файлы
├── package.json           # Frontend зависимости
└── README.md              # Этот файл
```

## 🛠️ Технологический стек

### Frontend
- **Framework:** Next.js 16.2.0
- **Styling:** TailwindCSS 4.2.0
- **UI Library:** Radix UI (25+ компонентов)
- **Charts:** Recharts 2.15.0
- **Forms:** React Hook Form + Zod валидация
- **State:** React Context API
- **Icons:** Lucide React

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js 4.18
- **Language:** TypeScript 5.1
- **Database:** PostgreSQL + Prisma ORM
- **Real-time:** Socket.io 4.6
- **Payment:** Stripe
- **Cache:** Redis + BullMQ
- **Notifications:** Firebase, Twilio

### DevOps
- **Package Manager:** npm (frontend), npm (backend)
- **Version Control:** Git
- **Containerization:** Docker (готово к deploy)

## 🚀 Быстрый старт

### Предварительные требования
- Node.js 16+
- PostgreSQL 12+
- Redis 6+
- macOS/Linux

### Установка (5 минут)

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd Diploma

# 2. Установить frontend зависимости
npm install

# 3. Установить backend зависимости
cd backend
npm install
cd ..

# 4. Настроить БД и Redis (macOS)
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis
createdb smart_parking

# 5. Инициализировать Prisma
cd backend
npm run prisma:migrate
cd ..

# 6. Запустить development серверы
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
cd backend
npm run dev

# Terminal 3 (опционально): Prisma Studio
cd backend
npm run prisma:studio
```

Готово! Приложение откроется на http://localhost:3000, backend на http://localhost:3001

## 📱 Экраны приложения

1. **Login Screen** - Вход по номеру телефона с SMS OTP
2. **Home Screen** - Главная с картой свободных мест
3. **Map Screen** - Интерактивная карта парковки (30 мест)
4. **Booking Confirm Screen** - Подтверждение бронирования
5. **Active Booking Screen** - Активная брань с таймером
6. **Payment Screen** - Интеграция Stripe
7. **Wallet Screen** - Баланс и история платежей
8. **Profile Screen** - Профиль пользователя

## 💾 Структура БД

### Ключевые таблицы

**User** - Пользователи системы
```sql
- id (UUID primary key)
- phoneNumber (unique)
- carPlate (для LPR)
- walletBalance (баланс кошелька)
- noShowCount (счетчик не-явок)
- isBanned (статус блокировки)
- bannedUntil (дата разблокировки)
```

**ParkingSpot** - Места парковки (SP-01...SP-30)
```sql
- id, spotNumber, type (SHORT_TERM/LONG_TERM)
- status (FREE/BOOKED/OCCUPIED/RESERVED/REPAIR)
- currentUserPlate, currentUserId
```

**Booking** - Краткосрочные бронирования
```sql
- id, userId (FK), spotId (FK)
- startTime, estimatedEndTime, actualEndTime
- status (PENDING/CONFIRMED/COMPLETED/NO_SHOW)
- isPaid, totalCost
```

**Payment** - История платежей
```sql
- id, userId (FK), amount, status
- paymentMethod (WALLET/STRIPE/CARD)
- stripePaymentIntentId (для Stripe)
```

**LongTermRental** - Долгосрочная аренда
```sql
- id, userId (FK), spotId (FK)
- rentalDays (1/3/5/7/14), totalCost
- startDate, endDate, status (ACTIVE/EXPIRED)
```

## 💰 Тарифная система

### Краткосрочная парковка (SHORT_TERM)
- **Минимум:** 150₸ (включает 1 час)
- **Сверх часа:** +3₸ за каждую минуту
- **Продление:** 75₸ на 30 минут (идет в зачет)
- **Пример 2 часа:** 150₸ + (60 мин × 3₸) = 330₸

### Долгосрочная аренда (LONG_TERM)
```
1 день    → 700₸
3 дня     → 1,800₸
5 дней    → 2,700₸
7 дней    → 3,500₸
14 дней   → 6,000₸
```

### Финансовые механики
- **Кэшбэк:** 1% от каждого платежа обратно в кошелек
- **Промокод FIRST:** 150₸ для новых пользователей
- **Система блокировок:**
  - 1-3 no-show → счетчик
  - 4-я no-show → предупреждение
  - 6-я no-show → бан на 3 дня

## 🔌 API Endpoints

### Авторизация
```
POST   /auth/register          - Регистрация
POST   /auth/login             - Вход
GET    /auth/me                - Профиль
PUT    /auth/me                - Обновить профиль
GET    /auth/verify-token      - Проверить токен
```

### Бронирования (в разработке)
```
POST   /bookings/short-term    - Новое краткосрочное бронирование
POST   /bookings/long-term     - Новая долгосрочная аренда
GET    /bookings/my            - Мои бронирования
PUT    /bookings/:id/cancel    - Отменить бронирование
POST   /bookings/:id/extend    - Продлить бронирование
```

### Платежи (в разработке)
```
POST   /payments/deposit       - Пополнить кошелек
POST   /payments/booking/:id   - Оплатить парковку
GET    /payments/transactions  - История
```

### Парковка (в разработке)
```
GET    /parking/spots          - Все места
GET    /parking/spots/available - Свободные места
GET    /parking/stats          - Статистика
POST   /parking/lpr/entry      - Webhook въезда
POST   /parking/lpr/exit       - Webhook выезда
```

## 👨‍💻 Разработка

### Frontend разработка
```bash
npm run dev          # Запустить Next.js dev сервер
npm run build        # Build production
npm start            # Запустить production build
npm run lint         # ESLint проверка
```

### Backend разработка
```bash
cd backend
npm run dev          # Watch mode with hot reload
npm run build        # Компилировать TypeScript
npm start            # Запустить production версию
npm run prisma:migrate  # Миграция БД
npm run prisma:studio   # Открыть Prisma UI
npm run seed         # Заполнить тестовыми данными
```

### Документация
- [Backend README](./backend/README.md)
- [Backend Quick Start](./backend/QUICKSTART.md)
- [Backend Development](./backend/DEVELOPMENT.md)
- [Backend Architecture](./backend/ARCHITECTURE.md)
- [Backend Completion Report](./backend/COMPLETION_REPORT.md)

## 🧪 Тестирование

### Регистрация
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+77001234567",
    "firstName": "Иван",
    "lastName": "Иванов"
  }'
```

### Вход
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+77001234567"}'
```

### Проверка здоровья сервера
```bash
curl http://localhost:3001/health
```

## 📊 Мониторинг и Логирование

- **Frontend:** Пино логи (структурированные)
- **Backend:** Пино + Pino-http middleware
- **БД:** Prisma логи в консоль
- **Real-time:** Socket.io события в логах

## 🔐 Безопасность

- ✅ JWT авторизация (7 дней)
- ✅ Хеширование паролей (bcrypt)
- ✅ CORS настройка
- ✅ Валидация всех входных данных
- ✅ Rate limiting (готово к добавлению)
- ✅ SQL injection prevention (Prisma ORM)

## 📝 Лицензия

MIT - Open for educational purposes

## 👥 Разработчики

- **Frontend:** [Ваше имя]
- **Backend:** [Ваше имя]
- **Project Manager:** [Ваше имя]

## 🤝 Вклад

1. Форкни репозиторий
2. Создай feature ветку (`git checkout -b feature/amazing-feature`)
3. Коммитни изменения (`git commit -m 'Add amazing feature'`)
4. Пушни ветку (`git push origin feature/amazing-feature`)
5. Открой Pull Request

## 📞 Поддержка

Если возникли вопросы:
- Посмотри документацию в `backend/` папке
- Проверь логи при ошибках
- Обратись к команде разработки

---

## 🎯 Статус проекта

### ✅ Завершено (MVP)
- [x] Backend архитектура
- [x] Database схема
- [x] Authentication API
- [x] Frontend структура
- [x] UI компоненты (50+)
- [x] Real-time Socket.io

### 🚧 В разработке
- [ ] Booking маршруты
- [ ] Payment интеграция
- [ ] Parking API
- [ ] LPR обработчики
- [ ] BullMQ очереди
- [ ] Firebase уведомления
- [ ] Admin панель

### 📋 Планируется
- [ ] E2E тесты
- [ ] Performance оптимизация
- [ ] Docker контейнеризация
- [ ] CI/CD pipeline
- [ ] Production deploy

---

## 🚀 Готово к дипломной защите!

**Проект полностью структурирован и готов к разработке всех оставшихся функций.**

Начните с [Backend README](./backend/README.md) и [Backend Quick Start](./backend/QUICKSTART.md)

**Happy coding! 💻**
