import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field, useToast } from '../components/ui'
import { authErrorMessage, useAuth } from '../lib/auth'

export default function Login() {
  const { user, enabled, login, register, google, resetPassword } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const nav = useNavigate()
  const { toast } = useToast()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to={next} replace />
  if (!enabled)
    return (
      <div className="mx-auto max-w-md p-4">
        <div className="card p-5 text-sm text-stone-600">
          <h1 className="mb-2 text-lg font-bold text-stone-900">Chế độ khách</h1>
          Bản cài đặt này chưa cấu hình Firebase nên chưa có đăng nhập và đồng bộ đám mây. Bạn vẫn dùng được đầy đủ tính năng, dữ liệu lưu trên thiết bị này.
        </div>
      </div>
    )

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      nav(next, { replace: true })
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'register' && !name.trim()) return setError('Hãy nhập họ tên.')
    run(() => (mode === 'login' ? login(email, password) : register(name, email, password)))
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <form onSubmit={submit} className="card space-y-3 p-5">
        <div className="grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm font-semibold">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} type="button" onClick={() => (setMode(m), setError(''))} className={`rounded-md py-2 ${mode === m ? 'bg-white text-brand-700 shadow' : 'text-stone-600'}`}>
              {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
            </button>
          ))}
        </div>
        {mode === 'register' && (
          <Field label="Họ và tên">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" data-testid="auth-name" />
          </Field>
        )}
        <Field label="Email">
          <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="auth-email" />
        </Field>
        <Field label="Mật khẩu" hint={mode === 'register' ? 'Ít nhất 6 ký tự.' : undefined}>
          <input className="field" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} data-testid="auth-password" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy} data-testid="auth-submit">
          {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </Button>
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => run(google)}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.6 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.500-4.800 7.200l7.600 5.900c4.500-4.100 7.100-10.200 7.100-17.600z"/><path fill="#FBBC05" d="M10.500 28.600c-.5-1.400-.8-3-.8-4.600s.3-3.200.8-4.600l-7.900-6.200C1 16.500 0 20.100 0 24s1 7.500 2.600 10.800l7.900-6.200z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.600-5.900c-2.100 1.400-4.800 2.300-8.300 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z"/></svg>
          Tiếp tục với Google
        </Button>
        {mode === 'login' && (
          <button
            type="button"
            className="block w-full text-center text-sm text-brand-700 underline"
            onClick={async () => {
              if (!email) return setError('Nhập email của bạn ở trên rồi bấm lại "Quên mật khẩu".')
              try {
                await resetPassword(email)
                toast('Đã gửi email đặt lại mật khẩu.')
              } catch (e) {
                setError(authErrorMessage(e))
              }
            }}
          >
            Quên mật khẩu?
          </button>
        )}
      </form>
    </div>
  )
}
