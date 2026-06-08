importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js")

firebase.initializeApp({
  apiKey: "AIzaSyA8aQ6lWHEQGL2AAO3KOoPtQBQvyx_9G-I",
  authDomain: "smart-parking-9d0c5.firebaseapp.com",
  projectId: "smart-parking-9d0c5",
  storageBucket: "smart-parking-9d0c5.appspot.com",
  messagingSenderId: "9513175114",
  appId: "1:9513175114:web:2bbef28f6b55d328eefeb3",
})

const messaging = firebase.messaging()

// Handle background messages (app tab not in focus)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "QPark"
  const body = payload.notification?.body ?? ""
  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: payload.data?.type ?? "qpark",
    renotify: true,
  })
})
