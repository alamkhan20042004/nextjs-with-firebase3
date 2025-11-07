// Centralized Firebase initialization for client-side usage in Next.js (App Router)
// Reads config from NEXT_PUBLIC_ environment variables.

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// Analytics should only be initialized in the browser and when a measurement ID exists
// Import inside a function to avoid SSR side-effects.

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Initialize Firebase App (singleton)
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

// Initialize client-only SDKs guarded for SSR
const auth: Auth | null = typeof window !== 'undefined' ? getAuth(app) : null
const db: Firestore | null = typeof window !== 'undefined' ? getFirestore(app) : null

// Lazy getter for Analytics to avoid SSR issues
async function getAnalyticsIfAvailable() {
  if (typeof window === 'undefined') return null
  if (!firebaseConfig.measurementId) return null
  const { getAnalytics } = await import('firebase/analytics')
  try {
    return getAnalytics(app)
  } catch {
    return null
  }
}

export { app, auth, db, getAnalyticsIfAvailable }
