"use client"

// Show a system notification using Capacitor LocalNotifications.
// Works on real iPhone without Push Notifications capability or paid developer account.
// Falls back silently in browser.

let permissionGranted = false
let nextId = 1

export async function initLocalNotifications(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return

    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.requestPermissions()
    permissionGranted = display === 'granted'
  } catch {
    // not in Capacitor — ignore
  }
}

// Schedule all 3 overstay notifications at booking time so iOS fires them
// even when the app is backgrounded / frozen.
export async function scheduleBookingNotifications(durationMinutes: number): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return

    const { LocalNotifications } = await import('@capacitor/local-notifications')
    if (!permissionGranted) {
      const { display } = await LocalNotifications.requestPermissions()
      permissionGranted = display === 'granted'
    }
    if (!permissionGranted) return

    const now = Date.now()
    const min = 60 * 1000
    const warningAt  = new Date(now + (durationMinutes - 5) * min)   // 5 min before end
    const expiredAt  = new Date(now + durationMinutes * min)          // at end
    const overstayAt = new Date(now + (durationMinutes + 5) * min)   // after 5 min grace

    const notifications = []

    // Only show 5-min warning if booking is longer than 5 min
    if (durationMinutes > 5) {
      notifications.push({
        id: nextId++, title: '⏰ 5 минут до конца',
        body: 'Время парковки скоро закончится. Продлите или завершите.',
        sound: 'default', schedule: { at: warningAt },
      })
    }
    notifications.push({
      id: nextId++, title: '⏳ Время истекло — 5 мин на выезд',
      body: 'Даём 5 минут на выезд, потом начнётся 3₸/мин.',
      sound: 'default', schedule: { at: expiredAt },
    })
    notifications.push({
      id: nextId++, title: '🚨 Идёт списание 3₸/мин',
      body: 'Льготные 5 минут истекли. Завершите парковку.',
      sound: 'default', schedule: { at: overstayAt },
    })

    await LocalNotifications.schedule({ notifications })
  } catch {
    // ignore
  }
}

// Cancel existing booking notifications and reschedule from a known real endTimeMs.
// Called after LPR entry when the actual estimatedEndTime is known from the server.
export async function rescheduleBookingNotifications(endTimeMs: number): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    // Cancel any notifications scheduled at booking creation (wrong times)
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications })
    }
    if (!permissionGranted) {
      const { display } = await LocalNotifications.requestPermissions()
      permissionGranted = display === 'granted'
    }
    if (!permissionGranted) return
    const now = Date.now()
    const min = 60 * 1000
    const notifications = []
    if (endTimeMs - now > 5 * min) {
      notifications.push({
        id: nextId++, title: '⏰ 5 минут до конца',
        body: 'Время парковки скоро закончится. Продлите или завершите.',
        sound: 'default', schedule: { at: new Date(endTimeMs - 5 * min) },
      })
    }
    if (endTimeMs > now) {
      notifications.push({
        id: nextId++, title: '⏳ Время истекло — льготный период',
        body: 'Даём 5 минут на выезд, потом начнётся 3₸/мин.',
        sound: 'default', schedule: { at: new Date(endTimeMs) },
      })
    }
    notifications.push({
      id: nextId++, title: '🚨 Идёт списание 3₸/мин',
      body: 'Льготные 5 минут истекли. Завершите парковку.',
      sound: 'default', schedule: { at: new Date(endTimeMs + 5 * min) },
    })
    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications })
    }
  } catch { }
}

export async function cancelBookingNotifications(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications })
    }
  } catch {
    // ignore
  }
}

export async function showLocalNotification(title: string, body: string): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return

    const { LocalNotifications } = await import('@capacitor/local-notifications')

    // Request permission lazily if not yet done
    if (!permissionGranted) {
      const { display } = await LocalNotifications.requestPermissions()
      permissionGranted = display === 'granted'
    }
    if (!permissionGranted) return

    await LocalNotifications.schedule({
      notifications: [{
        id: nextId++,
        title,
        body,
        sound: 'default',
        smallIcon: 'ic_launcher',
        // fire immediately
        schedule: { at: new Date(Date.now() + 100) },
      }],
    })
  } catch {
    // ignore
  }
}
