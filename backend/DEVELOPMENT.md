# Локальная разработка Smart Parking Backend

## Первоначальная настройка

### 1. Установить требуемые сервисы (macOS)

```bash
# PostgreSQL
brew install postgresql@15
brew services start postgresql@15

# Redis
brew install redis
brew services start redis

# Node.js (если еще не установлен)
brew install node
```

### 2. Создать базу данных

```bash
# Подключиться к PostgreSQL
psql postgres

# В интерпретаторе PostgreSQL:
CREATE DATABASE smart_parking;
CREATE USER parking_user WITH PASSWORD 'parking_password';
GRANT ALL PRIVILEGES ON DATABASE smart_parking TO parking_user;
\q
```

### 3. Обновить .env файл

```env
DATABASE_URL="postgresql://parking_user:parking_password@localhost:5432/smart_parking"
REDIS_HOST="localhost"
REDIS_PORT="6379"
```

### 4. Инициализировать Prisma

```bash
npm run prisma:generate
npm run prisma:migrate
```

## Запуск в разработке

```bash
# Terminal 1: Запустить backend
npm run dev

# Terminal 2: Запустить Prisma Studio (для управления БД)
npm run prisma:studio

# Terminal 3: Мониторить логи
tail -f logs/*.log
```

## Тестирование API

### Используя cURL

```bash
# 1. Регистрация
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+77771234567",
    "firstName": "Иван",
    "lastName": "Иванов"
  }'

# Ответ:
# {
#   "id": "uuid",
#   "phoneNumber": "+77771234567",
#   "walletBalance": 150,
#   ...
# }

# 2. Получить свободные места
curl -X GET http://localhost:3001/parking/spots/available \
  -H "Accept: application/json"

# 3. Создать бронирование (нужен токен)
curl -X POST http://localhost:3001/bookings/short-term \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "spotId": "<SPOT_ID>"
  }'
```

### Используя Postman

1. Импортировать коллекцию: [smart-parking.postman_collection.json](./postman-collection.json)
2. Установить переменные окружения в Postman
3. Запустить тесты

### Используя Insomnia

1. Импортировать: [smart-parking.insomnia.yaml](./insomnia-collection.yaml)
2. Запустить запросы

## Основные команды

```bash
# Разработка
npm run dev              # Запустить с hot reload

# Production
npm run build            # Скомпилировать TypeScript
npm start                # Запустить скомпилированный сервер

# БД
npm run prisma:generate  # Генерировать Prisma client
npm run prisma:migrate   # Запустить миграции
npm run prisma:studio    # Открыть Prisma Studio UI

# Seed
npm run seed             # Заполнить БД тестовыми данными
```

## Структура .env переменных

```env
# 🔌 Сервер
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# 🗄️ БД PostgreSQL
DATABASE_URL="postgresql://user:pass@localhost:5432/smart_parking"

# 🔐 JWT
JWT_SECRET="ваш-секретный-ключ"
JWT_EXPIRE="7d"

# 💰 Stripe (Test Mode)
STRIPE_SECRET_KEY="sk_test_xxx"
STRIPE_PUBLIC_KEY="pk_test_xxx"

# ⚡ Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_DB="0"

# 📱 Firebase (опционально)
FIREBASE_PROJECT_ID="project-id"
FIREBASE_PRIVATE_KEY="private-key"
FIREBASE_CLIENT_EMAIL="email"

# 📧 Twilio (опционально)
TWILIO_ACCOUNT_SID="sid"
TWILIO_AUTH_TOKEN="token"
TWILIO_PHONE_NUMBER="phone"

# 💸 Тарифы
SHORT_TERM_MIN_FEE=150        # 150 тенге (1 час)
SHORT_TERM_RATE_PER_MIN=3     # 3 тенге за минуту свыше часа
EXTEND_BOOKING_COST=75        # 75 тенге
EXTEND_BOOKING_DURATION=1800  # 30 минут
FREE_BOOKING_DURATION=900     # 15 минут

# ⛔ Система блокировок
BAN_THRESHOLD=6               # Количество no-show перед баном
BAN_DURATION=259200           # 3 дня в секундах
```

## Отладка

### Просмотр логов
```bash
# Все логи
tail -f logs/*.log

# Только ошибки
tail -f logs/error.log

# Real-time логи (структурированные)
npm run dev 2>&1 | grep "ERROR"
```

### Инспектирование БД
```bash
# Prisma Studio UI
npm run prisma:studio

# psql CLI
psql smart_parking

# Примеры запросов в psql:
\dt                           # Показать все таблицы
SELECT * FROM "User";         # Показать пользователей
SELECT * FROM "ParkingSpot";  # Показать места
```

### Проверка Redis
```bash
# Подключиться к Redis
redis-cli

# Примеры команд:
PING                          # Проверить соединение
KEYS *                        # Все ключи
GET <key>                     # Получить значение
DEL <key>                     # Удалить ключ
FLUSHALL                      # Очистить все
```

## Проблемы и решения

### ❌ "ECONNREFUSED" при подключении к БД
```bash
# Проверить PostgreSQL
brew services list

# Перезапустить PostgreSQL
brew services restart postgresql@15

# Или запустить вручную
postgres -D /usr/local/var/postgres
```

### ❌ "Cannot find module 'typescript'"
```bash
npm install -g ts-node typescript
```

### ❌ Port 3001 уже занят
```bash
# Найти процесс на порту
lsof -i :3001

# Убить процесс
kill -9 <PID>

# Или изменить PORT в .env
PORT=3002
```

### ❌ Ошибки миграции Prisma
```bash
# Пересоздать схему БД
npm run prisma:migrate reset

# Или вручную удалить и создать БД
psql postgres -c "DROP DATABASE smart_parking;"
psql postgres -c "CREATE DATABASE smart_parking;"
npm run prisma:migrate
```

## Socket.io Тестирование

### Используя Socket.io CLI
```bash
# Установить
npm install -g socket.io-client-tool

# Подключиться
sioc -u http://localhost:3001

# Отправить событие
emit join-parking '{"spotNumber":"SP-01"}'
```

### Используя VS Code Web Sockets
Установить расширение "Web Socket Client" и отправлять:
```json
{
  "event": "join-parking",
  "data": {"spotNumber": "SP-01"}
}
```

## Полезные ссылки

- [Prisma Docs](https://www.prisma.io/docs/)
- [Express API](https://expressjs.com/en/api.html)
- [Socket.io Docs](https://socket.io/docs/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Redis CLI](https://redis.io/commands)
- [Stripe Test Cards](https://stripe.com/docs/testing)

## Контакты

Если возникли вопросы, обратитесь к ведущему разработчику backend.
