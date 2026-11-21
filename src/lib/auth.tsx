import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { getDoc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UserDoc } from '../types'
import { DEFAULT_ADMIN_EMAIL } from '../version'
import { auth, firebaseEnabled } from './firebase'
import { userRef, type CloudUser } from './store/cloud'
import { setStoreUser } from './store'

export interface AuthUser extends CloudUser {
  displayName: string
}

interface AuthState {
  /** false until the first auth state is known */
  ready: boolean
  enabled: boolean
  user: AuthUser | null
  profile: UserDoc | null
  isAdmin: boolean
  login(email: string, password: string): Promise<void>
  register(name: string, email: string, password: string): Promise<void>
  google(): Promise<void>
  logout(): Promise<void>
  resetPassword(email: string): Promise<void>
  resendVerification(): Promise<void>
  saveProfile(name: string, photo: string): Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

function toUser(u: User): AuthUser {
  return { uid: u.uid, email: (u.email ?? '').toLowerCase(), verified: u.emailVerified, displayName: u.displayName ?? '' }
}

async function ensureUserDoc(u: User, name?: string) {
  const ref = userRef(u.uid)
  const snap = await getDoc(ref)
  const now = Date.now()
  if (!snap.exists()) {
    await setDoc(ref, {
      email: (u.email ?? '').toLowerCase(),
      displayName: name || u.displayName || '',
      photo: '',
      isAdmin: false,
      locked: false,
      createdAt: now,
      lastLoginAt: now,
    })
  } else {
    await updateDoc(ref, { lastLoginAt: now, email: (u.email ?? '').toLowerCase() })
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!firebaseEnabled)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<UserDoc | null>(null)

  useEffect(() => {
    if (!firebaseEnabled) return
    let unsubProfile = () => {}
    const unsub = onAuthStateChanged(auth(), (u) => {
      unsubProfile()
      setProfile(null)
      const next = u ? toUser(u) : null
      setStoreUser(next)
      setUser(next)
      setReady(true)
      if (!u) return
      ensureUserDoc(u).catch((e) => console.warn('Không cập nhật được hồ sơ', e.code))
      unsubProfile = onSnapshot(
        userRef(u.uid),
        (snap) => setProfile(snap.exists() ? ({ ...snap.data(), uid: u.uid } as UserDoc) : null),
        () => setProfile(null),
      )
    })
    return () => {
      unsub()
      unsubProfile()
    }
  }, [])

  const value = useMemo<AuthState>(() => {
    const isAdmin = !!user && ((user.verified && user.email === DEFAULT_ADMIN_EMAIL) || !!profile?.isAdmin)
    return {
      ready,
      enabled: firebaseEnabled,
      user,
      profile,
      isAdmin,
      async login(email, password) {
        await signInWithEmailAndPassword(auth(), email.trim(), password)
      },
      async register(name, email, password) {
        const cred = await createUserWithEmailAndPassword(auth(), email.trim(), password)
        await updateProfile(cred.user, { displayName: name.trim() })
        await ensureUserDoc(cred.user, name.trim())
        setUser(toUser(cred.user))
        await sendEmailVerification(cred.user).catch(() => undefined)
      },
      async google() {
        await signInWithPopup(auth(), new GoogleAuthProvider())
      },
      async logout() {
        await signOut(auth())
      },
      async resetPassword(email) {
        await sendPasswordResetEmail(auth(), email.trim())
      },
      async resendVerification() {
        if (auth().currentUser) await sendEmailVerification(auth().currentUser!)
      },
      async saveProfile(name, photo) {
        const u = auth().currentUser
        if (!u) return
        await updateProfile(u, { displayName: name })
        await updateDoc(userRef(u.uid), { displayName: name, photo })
        setUser(toUser(u))
      },
    }
  }, [ready, user, profile])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthProvider missing')
  return v
}

// eslint-disable-next-line react/only-export-components
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
    'auth/wrong-password': 'Email hoặc mật khẩu không đúng.',
    'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
    'auth/email-already-in-use': 'Email này đã được đăng ký.',
    'auth/weak-password': 'Mật khẩu quá yếu (cần ít nhất 6 ký tự).',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập.',
    'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên.',
    'auth/network-request-failed': 'Lỗi mạng. Vui lòng thử lại.',
    'auth/too-many-requests': 'Thử quá nhiều lần. Vui lòng đợi một lát.',
    'auth/unauthorized-domain': 'Tên miền này chưa được cho phép trong Firebase Authentication.',
    'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được bật trong Firebase.',
    'auth/user-disabled': 'Tài khoản đã bị vô hiệu hoá.',
  }
  return map[code] ?? 'Có lỗi xảy ra. Vui lòng thử lại.'
}
