"use client"

// Capacitor native push — works on real iOS device (not browser)
// Falls back silently if running in a browser

let registered = false

export async function registerNativePush(authToken: string): Promise<void> {
  if (registered) return
  if (typeof window === 'undefined') return

  try {
    // Dynamic import so server-side build doesn't break
    const { PushNotifications } = await import('@capacitor/push-notifications')

    // Check if we're actually in a Capacitor native context
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return

    // Ask for permission
    const { receive } = await PushNotifications.requestPermissions()
    if (receive !== 'granted') return

    // Register with APNs
    await PushNotifications.register()

    // One-time listener: APNs device token arrives here
    await PushNotifications.addListener('registration', async (tokenData) => {
      const deviceToken = tokenData.value
      registered = true
      try {
        await fetch('/backend/auth/fcm-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token: deviceToken }),
        })
        console.log('[QPark] APNs token saved:', deviceToken.slice(0, 16) + '…')
      } catch {
        // Silently ignore network errors
      }
    })

    // Foreground notification handler — show as alert inside app
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const title = notification.title ?? 'QPark'
      const body  = notification.body  ?? ''
      if (title || body) {
        alert(`${title}\n${body}`)
      }
    })
  } catch {
    // Not in Capacitor or plugin unavailable — ignore
  }
}
