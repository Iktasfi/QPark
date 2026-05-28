FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY backend/package*.json ./
COPY backend/prisma ./prisma

RUN npm install
RUN npx prisma generate

COPY backend/ .

EXPOSE 3001

CMD ["npm", "start"]
