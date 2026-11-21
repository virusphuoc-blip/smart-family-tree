import { CloudOff, Settings as SettingsIcon, ShieldCheck, TreePine, UserRound } from 'lucide-react'
import { Link, Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import Admin from './pages/Admin'
import Home from './pages/Home'
import Join from './pages/Join'
import Login from './pages/Login'
import Settings from './pages/Settings'
import TreePage from './pages/TreePage'
import { APP_NAME } from './version'

function Header() {
  const { user, enabled, isAdmin } = useAuth()
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 bg-white/95 px-3 backdrop-blur">
      <Link to="/" className="flex min-w-0 items-center gap-2 font-bold text-brand-700">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-amber-200">
          <TreePine size={20} />
        </span>
        <span className="truncate text-[17px]">{APP_NAME}</span>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        {!enabled && (
          <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-xs text-stone-600" title="Chưa cấu hình Firebase">
            <CloudOff size={14} /> Khách
          </span>
        )}
        {isAdmin && (
          <Link to="/admin" aria-label="Quản trị" className="rounded-full p-2 text-stone-600 hover:bg-stone-100">
            <ShieldCheck size={20} />
          </Link>
        )}
        <Link to="/settings" aria-label="Cài đặt" className="rounded-full p-2 text-stone-600 hover:bg-stone-100">
          <SettingsIcon size={20} />
        </Link>
        {enabled &&
          (user ? (
            <Link to="/settings" aria-label="Tài khoản" className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {(user.displayName || user.email).slice(0, 1).toUpperCase()}
            </Link>
          ) : (
            <Link to="/login" className="flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white">
              <UserRound size={16} /> Đăng nhập
            </Link>
          ))}
      </div>
    </header>
  )
}

export default function App() {
  const { ready, profile, logout } = useAuth()
  if (!ready) return <Spinner />
  return (
    <div className="flex h-full flex-col">
      <Header />
      {profile?.locked && (
        <div className="bg-red-600 px-3 py-2 text-center text-sm text-white">
          Tài khoản của bạn đã bị khóa bởi quản trị viên. Bạn chỉ có thể xem dữ liệu.{' '}
          <button type="button" className="underline" onClick={() => logout()}>
            Đăng xuất
          </button>
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/join/:id" element={<Join />} />
          <Route path="/t/:id" element={<TreePage />} />
          <Route path="*" element={<div className="p-8 text-center text-stone-500">Không tìm thấy trang. <Link className="text-brand-700 underline" to="/">Về trang chủ</Link></div>} />
        </Routes>
      </main>
    </div>
  )
}
