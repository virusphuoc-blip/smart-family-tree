import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, errorText, Field, useToast } from '../components/ui'
import { DEFAULT_LLM, loadLlmSettings, saveLlmSettings, type LlmSettings } from '../lib/aiImport'
import { useAuth } from '../lib/auth'
import { useTreeList } from '../lib/store'
import { localUsage } from '../lib/store/local'
import { formatBytes } from '../lib/util'
import { APP_NAME, APP_VERSION, STORAGE_QUOTA_BYTES } from '../version'

export default function Settings() {
  const { user, enabled, isAdmin, logout, saveProfile, resendVerification, profile } = useAuth()
  const { cloud, local } = useTreeList(user)
  const { toast } = useToast()
  const [name, setName] = useState(user?.displayName ?? '')
  const [llm, setLlm] = useState<LlmSettings>(loadLlmSettings)
  const mine = cloud.filter((t) => t.ownerId === user?.uid)
  const cloudBytes = mine.reduce((s, t) => s + (t.storageBytes || 0), 0)
  const setL = (p: Partial<LlmSettings>) => setLlm((cur) => ({ ...cur, ...p }))

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-3 pb-10">
      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Tài khoản</h2>
        {user ? (
          <>
            <p className="text-sm text-stone-600">
              {user.email} {isAdmin && <span className="rounded bg-brand-100 px-1.5 text-xs font-semibold text-brand-700">Quản trị viên</span>}
              {profile?.locked && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs text-red-700">Đã bị khóa</span>}
            </p>
            {!user.verified && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Email chưa được xác minh. Cần xác minh để nhận lời mời chia sẻ qua email.{' '}
                <button type="button" className="font-semibold underline" onClick={() => resendVerification().then(() => toast('Đã gửi lại thư xác minh.'), (e) => toast(errorText(e), 'error'))}>Gửi lại thư xác minh</button>
              </p>
            )}
            <Field label="Họ và tên hiển thị">
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name" />
            </Field>
            <div className="flex gap-2">
              <Button onClick={() => saveProfile(name.trim(), profile?.photo ?? '').then(() => toast('Đã lưu hồ sơ.'), (e) => toast(errorText(e), 'error'))} data-testid="profile-save">Lưu hồ sơ</Button>
              <Button variant="secondary" onClick={() => logout()} data-testid="logout">Đăng xuất</Button>
            </div>
          </>
        ) : enabled ? (
          <p className="text-sm text-stone-600">Bạn đang dùng chế độ khách. <Link to="/login" className="font-semibold text-brand-700 underline">Đăng nhập hoặc đăng ký</Link> để đồng bộ đám mây.</p>
        ) : (
          <p className="text-sm text-stone-600">Chế độ khách: bản cài đặt này chưa cấu hình Firebase, dữ liệu lưu trên thiết bị.</p>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">AI nhập tài liệu Word</h2>
        <p className="text-sm text-stone-600">
          Dán khóa API của riêng bạn (ví dụ khóa miễn phí Google Gemini lấy tại{' '}
          <a className="text-brand-700 underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">aistudio.google.com/app/apikey</a>). Khóa chỉ lưu trong trình duyệt này, không gửi lên máy chủ của ứng dụng. Không có khóa, ứng dụng vẫn nhập được bằng cách nhận dạng theo mẫu câu.
        </p>
        <Field label="Nhà cung cấp">
          <select className="field" value={llm.provider} onChange={(e) => setL(e.target.value === 'gemini' ? { provider: 'gemini', model: DEFAULT_LLM.model } : { provider: 'openai', model: '' })}>
            <option value="gemini">Google Gemini</option>
            <option value="openai">Tương thích OpenAI (Groq, OpenRouter, máy chủ riêng…)</option>
          </select>
        </Field>
        {llm.provider === 'openai' && <Field label="Địa chỉ API (base URL)"><input className="field" value={llm.baseUrl} onChange={(e) => setL({ baseUrl: e.target.value })} /></Field>}
        <Field label="Tên mô hình"><input className="field" value={llm.model} onChange={(e) => setL({ model: e.target.value })} data-testid="llm-model" /></Field>
        <Field label="Khóa API"><input className="field" type="password" autoComplete="off" value={llm.apiKey} onChange={(e) => setL({ apiKey: e.target.value })} placeholder="Dán khóa vào đây" data-testid="llm-key" /></Field>
        <div className="flex gap-2">
          <Button onClick={() => (saveLlmSettings({ ...llm, apiKey: llm.apiKey.trim() }), toast('Đã lưu cài đặt AI trên thiết bị này.'))} data-testid="llm-save">Lưu</Button>
          <Button variant="secondary" onClick={() => (setL({ apiKey: '' }), saveLlmSettings({ ...llm, apiKey: '' }), toast('Đã xóa khóa API.'))}>Xóa khóa</Button>
        </div>
      </section>

      <section className="card space-y-2 p-4 text-sm">
        <h2 className="text-base font-bold">Dung lượng</h2>
        {user && (
          <>
            <div className="flex justify-between"><span>Đám mây (cây của tôi: {mine.length})</span><span>{formatBytes(cloudBytes)} / {formatBytes(STORAGE_QUOTA_BYTES)}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-brand-700" style={{ width: `${Math.min(100, (cloudBytes / STORAGE_QUOTA_BYTES) * 100)}%` }} /></div>
            <p className="text-xs text-stone-500">Gói miễn phí Firebase (Spark) có 5 GB lưu trữ dùng chung cho toàn bộ dự án.</p>
          </>
        )}
        <div className="flex justify-between"><span>Trên thiết bị này ({local.length} cây)</span><span>{formatBytes(localUsage())}</span></div>
      </section>

      <section className="card space-y-2 p-4 text-sm text-stone-600">
        <h2 className="text-base font-bold text-stone-900">Giới thiệu & quyền riêng tư</h2>
        <p>{APP_NAME} {APP_VERSION} — miễn phí, mã nguồn mở.</p>
        <p>Cây gia phả luôn riêng tư theo mặc định. Ở chế độ khách, dữ liệu không rời khỏi thiết bị. Khi đăng nhập, dữ liệu lưu trên Firebase của bản cài đặt này và chỉ chủ cây, người được mời và quản trị viên hệ thống xem được.</p>
        <p>Cài đặt như ứng dụng: mở menu trình duyệt và chọn “Thêm vào màn hình chính” / “Cài đặt ứng dụng”.</p>
        <a className="text-brand-700 underline" href="https://github.com/virusphuoc-blip/smart-family-tree" target="_blank" rel="noreferrer">Mã nguồn trên GitHub</a>
      </section>
    </div>
  )
}
