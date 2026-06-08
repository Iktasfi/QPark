import { initializeApp, getApps } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging"

const firebaseConfig = {
  apiKey: "AIzaSyA8aQ6lWHEQGL2AAO3KOoPtQBQvyx_9G-I",
  authDomain: "smart-parking-9d0c5.firebaseapp.com",
  projectId: "smart-parking-9d0c5",
  storageBucket: "smart-parking-9d0c5.appspot.com",
  messagingSenderId: "9513175114",
  appId: "1:9513175114:web:2bbef28f6b55d328eefeb3",
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export const auth = getAuth(app)

if (typeof window !== "undefined") {
  auth.settings.appVerificationDisabledForTesting = true
}

// Register FCM token after user logs in — call once from app layout
export async function registerFCMToken(authToken: string): Promise<void> {
  try {
    if (!(await isSupported())) return
    const messaging = getMessaging(app)
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    if (!vapidKey) return

    const permission = await Notification.requestPermission()
    if (permission !== "granted") return

    const fcmToken = await getToken(messaging, { vapidKey })
    if (!fcmToken) return

    await fetch("/backend/auth/fcm-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ token: fcmToken }),
    })
  } catch {
    // Silently ignore — push is optional
  }
}

// Handle foreground messages (app is open) — returns unsubscribe fn
export async function onForegroundMessage(handler: (title: string, body: string) => void): Promise<() => void> {
  try {
    if (typeof window === "undefined" || !(await isSupported())) return () => {}
    const messaging = getMessaging(app)
    return onMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? "QPark"
      const body = payload.notification?.body ?? ""
      handler(title, body)
    })
  } catch {
    return () => {}
  }
}
