import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { PDate, Person } from '../types'
import { makeDate, splitDate } from '../lib/dates'
import { initials } from '../lib/util'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50',
  ghost: 'text-stone-700 hover:bg-stone-100',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
}

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  )
}

/** Bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose} role="dialog" aria-label={title}>
      <div
        className={`flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="safe-b flex gap-2 border-t border-stone-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Avatar({ person, size = 40 }: { person: Pick<Person, 'fullName' | 'photo' | 'gender'>; size?: number }) {
  const tone = person.gender === 'female' ? 'bg-rose-100 text-rose-700' : person.gender === 'male' ? 'bg-sky-100 text-sky-700' : 'bg-stone-200 text-stone-700'
  return person.photo ? (
    <img src={person.photo} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${tone}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(person.fullName)}
    </span>
  )
}

export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-brand-700" />
      {label}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">{children}</div>
}

/** Day / month / year inputs; day and month are optional (old records often only have a year). */
export function DateInput({ value, onChange, disabled }: { value: PDate; onChange: (v: PDate) => void; disabled?: boolean }) {
  const [parts, setParts] = useState(() => splitDate(value))
  useEffect(() => {
    setParts((cur) => (makeDate(cur.y, cur.m, cur.d) === value ? cur : splitDate(value)))
  }, [value])
  const set = (k: 'd' | 'm' | 'y', v: string) => {
    const next = { ...parts, [k]: v.replace(/\D/g, '') }
    setParts(next)
    onChange(makeDate(next.y, next.m, next.d))
  }
  return (
    <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
      <input className="field" inputMode="numeric" placeholder="Ngày" maxLength={2} value={parts.d} disabled={disabled} onChange={(e) => set('d', e.target.value)} aria-label="Ngày" />
      <input className="field" inputMode="numeric" placeholder="Tháng" maxLength={2} value={parts.m} disabled={disabled} onChange={(e) => set('m', e.target.value)} aria-label="Tháng" />
      <input className="field" inputMode="numeric" placeholder="Năm" maxLength={4} value={parts.y} disabled={disabled} onChange={(e) => set('y', e.target.value)} aria-label="Năm" />
    </div>
  )
}

interface ToastApi {
  toast(text: string, kind?: 'ok' | 'error'): void
}
const ToastCtx = createContext<ToastApi>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; text: string; kind: string }[]>([])
  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((cur) => [...cur, { id, text, kind }])
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-3">
        {items.map((t) => (
          <div key={t.id} role="status" className={`max-w-md rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${t.kind === 'error' ? 'bg-red-600' : 'bg-stone-800'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// eslint-disable-next-line react/only-export-components
export const useToast = () => useContext(ToastCtx)

// eslint-disable-next-line react/only-export-components
export function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code === 'permission-denied' || code === 'storage/unauthorized') return 'Bạn không có quyền thực hiện thao tác này (hoặc quy tắc bảo mật chưa được xuất bản).'
  if (code === 'unavailable') return 'Mất kết nối. Vui lòng thử lại.'
  if (code.startsWith('storage/')) return 'Không tải được tệp lên Cloud Storage. Kiểm tra lại cấu hình Storage của dự án Firebase.'
  return (e as Error)?.message || 'Có lỗi xảy ra.'
}
