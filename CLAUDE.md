# QPark — Правила для AI-ассистента

## Правила перед любым изменением

1. **Найди все места** в коде где используется изменяемая логика (grep по всем файлам)
2. **Не удаляй существующие Socket.io события** — только добавляй новые
3. **BullMQ jobs при изменении логики таймера** — сначала `job.remove()`, потом новый job
4. **Любое списание с кошелька** — через единую функцию `paymentService.chargeWallet()` с проверкой на отрицательный баланс и созданием долга
5. **Статус места и статус брони** — всегда обновлять вместе в одной транзакции Prisma (`prisma.$transaction`)
6. **После каждого изменения проверять**: работает ли краткосрочное, работает ли долгосрочное, работает ли admin dashboard

## Порядок задач

- Выполнять строго по одному
- После каждой задачи сообщить какие файлы изменены
- Ждать подтверждения «ок, работает» перед следующей задачей
- Не делать следующую задачу пока пользователь не протестирует

## Архитектура

- **Frontend**: Next.js → Vercel (`q-park.vercel.app`)
- **Backend**: Express + Prisma + BullMQ → Railway (`qpark-production.up.railway.app`)
- **iOS**: Capacitor wrapper → собирается в Xcode
- **OCR**: Python Flask → локально через ngrok (`OCR_SERVICE_URL` в Railway env)
- **Deploy frontend**: `git push origin master` (Vercel auto-deploy) — НЕ запускать `railway up`
- **Deploy backend**: `railway up --service QPark` или через `bash deploy.sh`

## Стек

- DB: PostgreSQL (Neon) через Prisma
- Queue: BullMQ + Redis
- Sockets: Socket.io
- Payments: Stripe + wallet
- Push: Firebase FCM + Capacitor LocalNotifications
