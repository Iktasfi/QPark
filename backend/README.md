# Smart Parking Backend

Backend система управления парковкой с LPR (распознавание номеров), реальным временем и интеграцией платежей.

## 🚀 Особенности

- ✅ LPR интеграция (въезд/выезд по номеру машины)
- 🔄 Real-time обновления через Socket.io
- 💳 Интеграция с Stripe для платежей
- 👤 SMS OTP авторизация (Twilio)
- 📊 Система кэшбэка и промокодов
- ⏱️ Автоматическая система временных блокировок
- 📱 Firebase уведомления
- 🔐 JWT авторизация

## 📋 Требования

- Node.js 16+
- PostgreSQL 12+
- Redis 6+
- npm или pnpm

## ⚙️ Установка

1. **Установить зависимости:**

```bash
npm install
# или
pnpm install
```

2. **Настроить .env файл:**

```bash
cp .env.example .env
# Отредактировать .env с вашими credentials
```

3. **Создать базу данных PostgreSQL:**

```bash
createdb smart_parking
```

4. **Инициализировать Prisma:**

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. **Запустить сервер:**

```bash
npm run dev
```

Сервер запустится на `http://localhost:3001`

## 📚 API Endpoints

### Авторизация
- `POST /auth/register` - Регистрация по телефону
- `POST /auth/login` - Вход
- `POST /auth/verify-otp` - Проверка OTP

### Букинги
- `POST /bookings/short-term` - Создать короткое бронирование
- `POST /bookings/long-term` - Создать долгосрочную аренду
- `PUT /bookings/:id/cancel` - Отменить бронирование
- `GET /bookings/my` - Мои бронирования

### Платежи
- `POST /payments/deposit` - Пополнить кошелек
- `POST /payments/booking/:bookingId` - Оплатить парковку
- `GET /payments/transactions` - История платежей

### Парковка
- `GET /parking/spots` - Все места
- `GET /parking/spots/available` - Свободные места
- `GET /parking/stats` - Статистика
- `POST /parking/lpr/entry` - LPR въезд (webhook)
- `POST /parking/lpr/exit` - LPR выезд (webhook)

### Пользователь
- `GET /user/profile` - Профиль
- `PUT /user/profile` - Обновить профиль
- `GET /user/wallet` - Баланс кошелька

## 🔄 Socket.io Events

### Client → Server
- `join-parking` - Присоединиться к обновлениям парковки
- `leave-parking` - Отключиться

### Server → Client
- `parking-updated` - Обновление статуса мест
- `booking-confirmed` - Бронирование подтверждено
- `payment-completed` - Платеж завершен

## 🗄️ Структура проекта

```
src/
├── config/           # Конфигурация сервисов (Redis, Stripe, Firebase)
├── models/           # Prisma модели
├── routes/           # API маршруты
├── services/         # Бизнес-логика
├── middleware/       # Express middleware
├── utils/            # Утилиты и хелперы
├── queues/           # BullMQ задачи
└── server.ts         # Главный файл
```

## 📖 Документация

- [Техническое задание](../smart_parking_TZ_v6_FINAL.docx)
- [Prisma документация](https://www.prisma.io/docs/)
- [Socket.io документация](https://socket.io/docs/)
- [Express документация](https://expressjs.com/)

## 🛠️ Разработка

**Hot reload:**
```bash
npm run dev
```

**Инспектор БД:**
```bash
npm run prisma:studio
```

**Создать миграцию:**
```bash
npm run prisma:migrate
```

**Lint & Build:**
```bash
npm run build
```

## 🔐 Безопасность

- JWT токены с истечением
- Валидация всех входных данных
- CORS настройка
- Логирование всех действий
- Хеширование паролей (bcrypt)

## 📝 Примеры использования

### Регистрация и авторизация
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+77771234567"}'
```

### Создать бронирование
```bash
curl -X POST http://localhost:3001/bookings/short-term \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"spotId": "<spot-id>"}'
```

### Пополнить кошелек
```bash
curl -X POST http://localhost:3001/payments/deposit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000}'
```

## 🐛 Troubleshooting

**Ошибка подключения к БД:**
- Проверить PostgreSQL запущена
- Проверить DATABASE_URL в .env
- Убедиться что БД создана

**Redis недоступен:**
- Убедиться что Redis запущена
- Проверить REDIS_URL в .env
- Linux: `sudo service redis-server start`

**Port 3001 занят:**
- Изменить PORT в .env
- Или убить процесс: `lsof -i :3001`

## 📄 Лицензия

MIT

## 👨‍💻 Автор

Smart Parking Team
