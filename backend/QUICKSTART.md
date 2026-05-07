# 🏃 Быстрый старт Backend

Следуй этим шагам, чтобы запустить backend локально за 5 минут.

## ✅ Предварительные требования

- Node.js 16+ установлен
- npm установлен
- macOS (инструкции ниже)

## 🚀 Шаг за шагом

### 1. Установить требуемые сервисы (2 минуты)

```bash
# Установить PostgreSQL
brew install postgresql@15
brew services start postgresql@15

# Установить Redis
brew install redis
brew services start redis

# Проверить, что всё работает
pg_isready
redis-cli ping  # должен вернуть PONG
```

### 2. Создать БД (1 минута)

```bash
# Подключиться к PostgreSQL
psql postgres

# Выполнить в psql:
CREATE DATABASE smart_parking;
\q
```

### 3. Настроить backend (1 минута)

```bash
cd backend

# Заполнить .env файл (уже готов, только проверить)
# Должна быть строка:
# DATABASE_URL="postgresql://postgres@localhost:5432/smart_parking"
```

### 4. Инициализировать БД (1 минута)

```bash
npm run prisma:migrate
```

### 5. Запустить сервер

```bash
npm run dev
```

Если видишь:
```
🚀 Server running on port 3001
📍 Environment: development
📡 Socket.io listening for connections
```

**✅ Готово! Backend работает!**

## 🧪 Тестировать API

В новом терминале:

```bash
# 1. Зарегистрировать пользователя
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+77001234567",
    "firstName": "Иван",
    "lastName": "Иванов"
  }'

# Ответ будет содержать token и user информацию

# 2. Проверить здоровье сервера
curl http://localhost:3001/health

# 3. Получить свои данные (нужен token из шага 1)
curl -X GET http://localhost:3001/auth/me \
  -H "Authorization: Bearer <ВАШ_TOKEN>"
```

## 🎯 Что дальше?

1. **Посмотреть структуру проекта:**
   ```bash
   cat backend/PROJECT_STRUCTURE.md
   ```

2. **Открыть Prisma Studio (UI для БД):**
   ```bash
   npm run prisma:studio
   ```

3. **Создавать новые маршруты:**
   - Изучи `src/routes/auth.routes.ts`
   - Создай свой `src/routes/bookings.routes.ts`

4. **Читать документацию:**
   - [README.md](./README.md) - Полная документация
   - [DEVELOPMENT.md](./DEVELOPMENT.md) - Детали разработки

## ⚠️ Проблемы?

### PostgreSQL не запускается
```bash
# Проверить статус
brew services list

# Перезапустить
brew services restart postgresql@15

# Или запустить вручную
postgres -D /usr/local/var/postgres
```

### Redis не отвечает
```bash
# Перезапустить Redis
brew services restart redis

# Или запустить вручную
redis-server
```

### Port 3001 занят
```bash
# Найти процесс на порту
lsof -i :3001

# Убить процесс (замени PID)
kill -9 <PID>
```

### "Cannot find module"
```bash
# Переустановить зависимости
rm -rf node_modules package-lock.json
npm install
```

## 📚 Файловая структура

```
backend/
├── src/
│   ├── config/          # Конфигурация Redis, Stripe, Firebase
│   ├── middleware/      # Авторизация, ошибки
│   ├── routes/          # API маршруты
│   ├── services/        # Бизнес-логика
│   ├── utils/           # Утилиты (расчеты тарифов)
│   └── server.ts        # Точка входа
├── prisma/
│   └── schema.prisma    # Модель БД
├── package.json         # Зависимости
├── .env                 # Переменные окружения
└── README.md            # Полная документация
```

## 🔐 Важные переменные .env

```env
# БД
DATABASE_URL="postgresql://postgres@localhost:5432/smart_parking"

# Сервер
PORT=3001

# JWT
JWT_SECRET="your-secret-key"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"

# Тарифы
SHORT_TERM_MIN_FEE=150         # 150 тенге за 1 час
SHORT_TERM_RATE_PER_MIN=3      # 3 тенге за минуту свыше часа
```

## 📞 Помощь

Если возникли проблемы:

1. Посмотри [DEVELOPMENT.md](./DEVELOPMENT.md) - там расширенные инструкции
2. Проверь логи сервера
3. Убедись что PostgreSQL и Redis запущены

---

**Готов к разработке! Happy coding! 🚀**
