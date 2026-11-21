import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Empty, errorText, Spinner, useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { adminActions, listAllTrees, listReports, listUsers } from '../lib/store/cloud'
import { formatBytes } from '../lib/util'
import type { Report, Tree, UserDoc } from '../types'
import { DEFAULT_ADMIN_EMAIL, STORAGE_QUOTA_BYTES } from '../version'

type Tab = 'users' | 'trees' | 'reports'

export default function Admin() {
  const { user, isAdmin, enabled } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<UserDoc[] | null>(null)
  const [trees, setTrees] = useState<Tree[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [u, t, r] = await Promise.all([listUsers(), listAllTrees(), listReports()])
      setUsers(u.sort((a, b) => b.lastLoginAt - a.lastLoginAt))
      setTrees(t.sort((a, b) => b.updatedAt - a.updatedAt))
      setReports(r)
    } catch (e) {
      setError(errorText(e))
    }
  }, [])
  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin, load])

  if (!enabled) return <div className="p-8 text-center text-stone-500">Trang quản trị cần cấu hình Firebase.</div>
  if (!user || !isAdmin) return <div className="p-8 text-center text-stone-500" data-testid="admin-denied">Trang này chỉ dành cho quản trị viên. <Link className="text-brand-700 underline" to="/">Về trang chủ</Link></div>
  if (error) return <div className="p-8 text-center text-red-700">{error}</div>
  if (!users) return <Spinner />

  const act = (p: Promise<unknown>) => p.then(load, (e) => toast(errorText(e), 'error'))
  const members = trees.reduce((s, t) => s + (t.memberCount || 0), 0)
  const bytes = trees.reduce((s, t) => s + (t.storageBytes || 0), 0)
  const stat = (label: string, value: string, id: string) => (
    <div className="card p-3" data-testid={id}>
      <p className="text-xs text-stone-500">{label}</p>
      <p className="text-xl font-bold text-brand-700">{value}</p>
    </div>
  )
  const date = (n: number) => (n ? new Date(n).toLocaleDateString('vi-VN') : '—')
  const open = reports.filter((r) => r.status === 'open').length

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 pb-10" data-testid="admin">
      <h1 className="text-lg font-bold">Bảng điều khiển quản trị</h1>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat('Người dùng', String(users.length), 'stat-users')}
        {stat('Cây gia phả', String(trees.length), 'stat-trees')}
        {stat('Thành viên', String(members), 'stat-members')}
        {stat('Dung lượng', `${formatBytes(bytes)} / ${formatBytes(STORAGE_QUOTA_BYTES)}`, 'stat-storage')}
      </div>
      <div className="grid grid-cols-3 rounded-lg bg-stone-200 p-1 text-sm font-semibold">
        {(['users', 'trees', 'reports'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} data-testid={`admin-tab-${t}`} className={`rounded-md py-2 ${tab === t ? 'bg-white text-brand-700 shadow' : 'text-stone-600'}`}>
            {t === 'users' ? 'Người dùng' : t === 'trees' ? 'Cây gia phả' : `Báo cáo${open ? ` (${open})` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <ul className="space-y-2">
          {users.map((u) => {
            const fixed = u.email === DEFAULT_ADMIN_EMAIL || u.uid === user.uid
            return (
              <li key={u.uid} className="card space-y-2 p-3 text-sm" data-testid="admin-user">
                <div>
                  <p className="font-semibold">{u.displayName || '(chưa đặt tên)'} {(u.isAdmin || u.email === DEFAULT_ADMIN_EMAIL) && <span className="rounded bg-brand-100 px-1.5 text-xs text-brand-700">Quản trị</span>} {u.locked && <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">Đã khóa</span>}</p>
                  <p className="truncate text-stone-500">{u.email}</p>
                  <p className="text-xs text-stone-500">Tham gia {date(u.createdAt)} · Đăng nhập gần nhất {date(u.lastLoginAt)}</p>
                </div>
                {!fixed && (
                  <div className="flex gap-2">
                    <Button variant={u.locked ? 'secondary' : 'danger'} onClick={() => act(adminActions.setUser(u.uid, { locked: !u.locked }))} data-testid="toggle-lock">{u.locked ? 'Mở khóa' : 'Khóa tài khoản'}</Button>
                    <Button variant="secondary" onClick={() => act(adminActions.setUser(u.uid, { isAdmin: !u.isAdmin }))} data-testid="toggle-admin">{u.isAdmin ? 'Thu quyền quản trị' : 'Cấp quyền quản trị'}</Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {tab === 'trees' && (
        <ul className="space-y-2">
          {trees.map((t) => (
            <li key={t.id} className="card flex items-center gap-2 p-3 text-sm" data-testid="admin-tree">
              <div className="min-w-0 flex-1">
                <Link to={`/t/${t.id}`} className="block truncate font-semibold text-brand-700 underline">{t.name}</Link>
                <p className="truncate text-xs text-stone-500">{t.ownerEmail} · {t.memberCount} thành viên · {formatBytes(t.storageBytes || 0)} {t.publicRead && '· Công khai'}</p>
                {t.hidden && <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">Đang bị ẩn</span>}
              </div>
              <Button variant={t.hidden ? 'secondary' : 'danger'} onClick={() => act(adminActions.setTreeHidden(t.id, !t.hidden))} data-testid="toggle-hide-tree">{t.hidden ? 'Bỏ ẩn' : 'Ẩn'}</Button>
            </li>
          ))}
          {!trees.length && <Empty>Chưa có cây nào trên đám mây.</Empty>}
        </ul>
      )}

      {tab === 'reports' && (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className={`card space-y-2 p-3 text-sm ${r.status === 'resolved' ? 'opacity-60' : ''}`} data-testid="admin-report">
              <p>
                <Link to={`/t/${r.treeId}`} className="font-semibold text-brand-700 underline">{r.treeName}</Link>
                {r.personName && <> · thành viên <b>{r.personName}</b></>}
              </p>
              <p className="whitespace-pre-wrap">{r.reason}</p>
              <p className="text-xs text-stone-500">{r.reporterEmail} · {date(r.createdAt)} · {r.status === 'open' ? 'Chưa xử lý' : 'Đã xử lý'}</p>
              {r.status === 'open' && (
                <div className="flex flex-wrap gap-2">
                  {r.personId ? (
                    <Button variant="danger" onClick={() => act(adminActions.setPersonHidden(r.treeId, r.personId, true).then(() => adminActions.resolveReport(r.id)))}>Ẩn thành viên</Button>
                  ) : (
                    <Button variant="danger" onClick={() => act(adminActions.setTreeHidden(r.treeId, true).then(() => adminActions.resolveReport(r.id)))}>Ẩn cây</Button>
                  )}
                  <Button variant="secondary" onClick={() => act(adminActions.resolveReport(r.id))}>Bỏ qua</Button>
                </div>
              )}
            </li>
          ))}
          {!reports.length && <Empty>Chưa có báo cáo nào.</Empty>}
        </ul>
      )}
    </div>
  )
}
