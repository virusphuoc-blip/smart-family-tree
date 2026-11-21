import { Cloud, HardDrive, ImagePlus, Plus, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Empty, errorText, Field, Sheet, Spinner, useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { DEMO_TREE_DESCRIPTION, DEMO_TREE_NAME, demoData } from '../lib/demo'
import { imageToDataUrl } from '../lib/images'
import { ops, useTreeList } from '../lib/store'
import { localTree } from '../lib/store/local'
import { nid } from '../lib/util'
import type { Tree } from '../types'

function TreeCard({ tree, local, mine }: { tree: Tree; local: boolean; mine: boolean }) {
  return (
    <Link to={`/t/${tree.id}`} className="card flex gap-3 overflow-hidden p-3 transition hover:border-brand-600" data-testid="tree-card">
      {tree.cover ? (
        <img src={tree.cover} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Users size={26} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{tree.name}</span>
        <span className="line-clamp-1 text-sm text-stone-500">{tree.description || 'Chưa có mô tả'}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
          <span>{tree.memberCount} thành viên</span>
          <span className="flex items-center gap-1">
            {local ? <HardDrive size={12} /> : <Cloud size={12} />}
            {local ? 'Trên thiết bị này' : mine ? 'Đám mây · Của tôi' : 'Đám mây · Được chia sẻ'}
          </span>
          {tree.publicRead && <span className="rounded bg-amber-100 px-1.5 text-amber-800">Công khai</span>}
          {tree.hidden && <span className="rounded bg-red-100 px-1.5 text-red-700">Đã bị ẩn</span>}
        </span>
      </span>
    </Link>
  )
}

export default function Home() {
  const { user, enabled } = useAuth()
  const { local, cloud, loading } = useTreeList(user)
  const nav = useNavigate()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [cover, setCover] = useState('')
  const [toCloud, setToCloud] = useState(true)
  const useCloud = !!user && toCloud

  const create = async () => {
    if (!name.trim()) return toast('Hãy nhập tên cây gia phả.', 'error')
    setBusy(true)
    try {
      const id = await ops.createTree(name.trim(), description.trim(), cover, useCloud)
      nav(`/t/${id}`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const loadDemo = async () => {
    setBusy(true)
    try {
      const id = await ops.createTree(DEMO_TREE_NAME, DEMO_TREE_DESCRIPTION, '', false)
      const demo = demoData(nid() + '-')
      await ops.importBatch(localTree(id)!, demo.people, demo.unions, demo.events)
      nav(`/t/${id}`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const empty = !loading && local.length + cloud.length === 0
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-3 pb-10">
      {empty && (
        <section className="card bg-gradient-to-br from-brand-700 to-brand-800 p-5 text-white">
          <h1 className="text-xl font-bold">Gìn giữ cội nguồn gia đình bạn</h1>
          <p className="mt-1 text-sm text-rose-100">Tạo cây gia phả tương tác, tự động xưng hô đúng vai vế (chú, bác, cô, cậu, dì…), lưu ảnh và tư liệu, chia sẻ với người thân. Miễn phí.</p>
        </section>
      )}
      {!user && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Bạn đang dùng <b>chế độ khách</b>: dữ liệu chỉ lưu trên thiết bị này.{' '}
          {enabled ? (
            <>
              <Link to="/login" className="font-semibold underline">Đăng nhập</Link> để đồng bộ đám mây và chia sẻ với người thân.
            </>
          ) : (
            'Đồng bộ đám mây chưa được cấu hình cho bản cài đặt này.'
          )}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setCreating(true)} data-testid="new-tree">
          <Plus size={18} /> Tạo cây mới
        </Button>
        <Button variant="secondary" onClick={loadDemo} disabled={busy} data-testid="load-demo">
          <Sparkles size={18} /> Dùng thử cây mẫu
        </Button>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <>
          {user && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-stone-600">Cây trên đám mây</h2>
              {cloud.length ? cloud.map((t) => <TreeCard key={t.id} tree={t} local={false} mine={t.ownerId === user.uid} />) : <Empty>Chưa có cây nào trên đám mây.</Empty>}
            </section>
          )}
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-stone-600">Cây trên thiết bị này</h2>
            {local.length ? local.map((t) => <TreeCard key={t.id} tree={t} local mine />) : <Empty>Chưa có cây nào. Hãy tạo cây mới hoặc dùng thử cây mẫu.</Empty>}
          </section>
        </>
      )}

      {creating && (
        <Sheet
          title="Tạo cây gia phả"
          onClose={() => setCreating(false)}
          footer={
            <Button className="flex-1" onClick={create} disabled={busy} data-testid="create-tree-submit">
              Tạo cây
            </Button>
          }
        >
          <div className="space-y-3">
            <Field label="Tên cây *">
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Họ Nguyễn bên nội" autoFocus data-testid="tree-name" />
            </Field>
            <Field label="Mô tả">
              <textarea className="field" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Ảnh bìa">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-stone-300 p-2 text-sm text-stone-600">
                {cover ? <img src={cover} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <ImagePlus size={22} />}
                <span>{cover ? 'Đổi ảnh' : 'Chọn ảnh'}</span>
                <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setCover(await imageToDataUrl(e.target.files[0], 480, false, 0.75))} />
              </label>
            </Field>
            {user ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={toCloud} onChange={(e) => setToCloud(e.target.checked)} /> Lưu trên đám mây (đồng bộ và chia sẻ được)
              </label>
            ) : (
              <p className="text-xs text-stone-500">Cây sẽ được lưu trên thiết bị này. Sau khi đăng nhập bạn có thể tải cây lên đám mây.</p>
            )}
            <p className="text-xs text-stone-500">Cây gia phả luôn ở chế độ riêng tư cho đến khi bạn chia sẻ.</p>
          </div>
        </Sheet>
      )}
    </div>
  )
}
