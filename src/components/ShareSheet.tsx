import { Copy, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getShareLink, listJoins, removeJoin, saveShareLink, setEmailRole, setJoinRole } from '../lib/store/cloud'
import { ops } from '../lib/store'
import { nid } from '../lib/util'
import { ROLE_LABEL, type JoinDoc, type Role, type ShareLink, type Tree } from '../types'
import { Button, errorText, Field, Sheet, useToast } from './ui'

const ROLES: Role[] = ['viewer', 'editor', 'admin']

export default function ShareSheet({ tree, onClose }: { tree: Tree; onClose: () => void }) {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('viewer')
  const [link, setLink] = useState<ShareLink | null>(null)
  const [joins, setJoins] = useState<JoinDoc[]>([])
  const guard = (p: Promise<unknown>) => p.catch((e) => toast(errorText(e), 'error'))
  const reload = () => listJoins(tree.id).then(setJoins).catch(() => setJoins([]))
  useEffect(() => {
    getShareLink(tree.id).then(setLink).catch(() => setLink(null))
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.id])

  const origin = window.location.origin
  const joinUrl = link ? `${origin}/join/${tree.id}?k=${link.token}&r=${link.role}` : ''
  const publicUrl = `${origin}/t/${tree.id}`
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Đã sao chép liên kết.'), () => toast('Không sao chép được, hãy chọn và sao chép thủ công.', 'error'))
  const updateLink = async (next: ShareLink) => {
    setLink(next)
    await guard(saveShareLink(tree.id, next))
  }
  const invite = async () => {
    const e = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(e)) return toast('Email không hợp lệ.', 'error')
    await guard(setEmailRole(tree, e, role))
    setEmail('')
  }
  const urlBox = (url: string, testid: string) => (
    <div className="flex gap-2">
      <input className="field text-xs" readOnly value={url} onFocus={(e) => e.target.select()} data-testid={testid} />
      <Button variant="secondary" onClick={() => copy(url)} aria-label="Sao chép"><Copy size={16} /></Button>
    </div>
  )

  return (
    <Sheet title="Chia sẻ cây gia phả" onClose={onClose}>
      <div className="space-y-5 pb-2 text-sm">
        <section className="space-y-2">
          <h3 className="font-bold">Mời qua email</h3>
          <p className="text-xs text-stone-500">Người được mời đăng nhập bằng đúng email này (đã xác minh) sẽ thấy cây trong danh sách của họ. Ứng dụng không tự gửi thư — hãy báo cho người thân hoặc bấm “Soạn thư mời”.</p>
          <div className="flex gap-2">
            <input className="field" type="email" placeholder="email@vidu.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="invite-email" />
            <select className="field !w-28" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Vai trò">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <Button className="w-full" onClick={invite} data-testid="invite-submit">Mời</Button>
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            <li className="flex items-center justify-between px-3 py-2"><span className="truncate">{tree.ownerEmail}</span><b>{ROLE_LABEL.owner}</b></li>
            {Object.entries(tree.emailRoles).map(([e, r]) => (
              <li key={e} className="flex items-center gap-2 px-3 py-1.5" data-testid="invited">
                <span className="min-w-0 flex-1 truncate">{e}</span>
                <a className="text-xs text-brand-700 underline" href={`mailto:${e}?subject=${encodeURIComponent(`Mời xem gia phả "${tree.name}"`)}&body=${encodeURIComponent(`Mời bạn xem cây gia phả "${tree.name}" trên Gia Phả Thông Minh.\nĐăng nhập bằng email ${e} tại: ${origin}/t/${tree.id}`)}`}>Soạn thư mời</a>
                <select className="rounded border border-stone-300 px-1 py-1 text-xs" value={r} onChange={(ev) => guard(setEmailRole(tree, e, ev.target.value as Role))} aria-label="Vai trò">
                  {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                </select>
                <button type="button" aria-label="Gỡ quyền" className="p-1 text-red-600" onClick={() => guard(setEmailRole(tree, e, null))}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Liên kết tham gia</h3>
          <p className="text-xs text-stone-500">Ai có liên kết và đã đăng nhập đều tham gia được với vai trò bên dưới. Tắt liên kết hoặc tạo liên kết mới để thu hồi.</p>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={!!link?.enabled} onChange={(e) => updateLink({ token: link?.token || nid() + nid(), role: link?.role ?? 'viewer', enabled: e.target.checked })} data-testid="link-toggle" /> Bật liên kết tham gia
          </label>
          {link?.enabled && (
            <>
              <Field label="Vai trò khi tham gia">
                <select className="field" value={link.role} onChange={(e) => updateLink({ ...link, role: e.target.value as ShareLink['role'] })}>
                  <option value="viewer">{ROLE_LABEL.viewer} (chỉ xem)</option>
                  <option value="editor">{ROLE_LABEL.editor} (được sửa)</option>
                </select>
              </Field>
              {urlBox(joinUrl, 'join-url')}
              <button type="button" className="text-xs text-brand-700 underline" onClick={() => updateLink({ ...link, token: nid() + nid() })}>Tạo liên kết mới (liên kết cũ hết hiệu lực)</button>
            </>
          )}
          {joins.length > 0 && (
            <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
              {joins.map((j) => (
                <li key={j.uid} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{j.name || j.email}<span className="block truncate text-xs text-stone-500">{j.email}</span></span>
                  <select className="rounded border border-stone-300 px-1 py-1 text-xs" value={j.role} onChange={(e) => guard(setJoinRole(tree.id, j.uid, e.target.value as Role).then(reload))} aria-label="Vai trò">
                    {ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}
                  </select>
                  <button type="button" aria-label="Gỡ khỏi cây" className="p-1 text-red-600" onClick={() => guard(removeJoin(tree.id, j.uid).then(reload))}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-bold">Liên kết công khai (chỉ xem)</h3>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={tree.publicRead} onChange={(e) => guard(ops.updateTree(tree.id, { publicRead: e.target.checked }))} data-testid="public-toggle" /> Cho phép bất kỳ ai có liên kết xem cây này
          </label>
          <p className="text-xs text-stone-500">Mặc định tắt. Khi bật, người xem không cần đăng nhập và không sửa được gì; họ thấy toàn bộ thông tin thành viên trong cây.</p>
          {tree.publicRead && urlBox(publicUrl, 'public-url')}
        </section>
      </div>
    </Sheet>
  )
}
