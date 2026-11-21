import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage'

const env = import.meta.env
const useEmulator = env.VITE_FIREBASE_EMULATOR === '1'

// Configuration comes only from VITE_FIREBASE_* environment variables.
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (useEmulator ? 'demo-key' : ''),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || (useEmulator ? 'demo-giapha' : ''),
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || (useEmulator ? 'demo-giapha.appspot.com' : ''),
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || (useEmulator ? 'demo-app' : ''),
}

export const firebaseEnabled = !!(config.apiKey && config.projectId && config.appId)
export const storageEnabled = firebaseEnabled && !!config.storageBucket

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null
let storageInstance: FirebaseStorage | null = null

if (firebaseEnabled) {
  app = initializeApp(config)
  authInstance = getAuth(app)
  dbInstance = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true })
  if (storageEnabled) storageInstance = getStorage(app)
  if (useEmulator) {
    const host = env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1'
    connectAuthEmulator(authInstance, `http://${host}:9099`, { disableWarnings: true })
    connectFirestoreEmulator(dbInstance, host, 8080)
    if (storageInstance) connectStorageEmulator(storageInstance, host, 9199)
  }
}

export const auth = () => authInstance!
export const db = () => dbInstance!
export const storage = () => storageInstance!
