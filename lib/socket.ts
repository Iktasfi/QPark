import { io, type Socket } from "socket.io-client"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_WS_URL || "https://qpark-production.up.railway.app"

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export type BookingEvent = {
  id: string
  spotId: string
  spot?: { spotNumber: string }
  plateNumber?: string
  status: string
  createdAt?: string
}
