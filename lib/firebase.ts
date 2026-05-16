import { initializeApp, getApps } from "firebase/app"
import { getAuth } from "firebase/auth"

const firebaseConfig = {
  apiKey: "AIzaSyA8aQ6lWHEQGL2AAO3KOoPtQBQvyx_9G-I",
  authDomain: "smart-parking-9d0c5.firebaseapp.com",
  projectId: "smart-parking-9d0c5",
  appId: "1:9513175114:web:2bbef28f6b55d328eefeb3",
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export const auth = getAuth(app)

if (typeof window !== "undefined") {
  auth.settings.appVerificationDisabledForTesting = true
}
