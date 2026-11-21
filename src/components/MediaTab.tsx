import { FileText, Film, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { compressImage } from '../lib/images'
import { ops, useMediaUrl } from '../lib/store'
import { formatBytes } from '../lib/util'
import type { MediaItem, MediaKind, TreeData } from '../types'
import { STORAGE_QUOTA_BYTES } from '../version'
import { Button, Empty, errorText, Field, Sheet, useToast } from './ui'

const MAX_FILE = 200 * 1024 * 1024
const kindOf = (f: File): MediaKind => (f.type.startsWith('image/') ? 'photo' : f.type.startsWith('video/') ? 'video' : 'document')

function Thumb({ m, onClick }: { m: MediaItem; onClick: () => void }) {
  const url = useMediaUrl(m.kind === 'photo' ? m : null)
  return (
    <button type="button" onClick={onClick} className="card relative aspect-square overflow-hidden" data-testid="media-item">
      {m.kind === 'photo' && url ? (
        <img src={url} alt={m.caption || m.name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-stone-100 p-2 text-stone-500">
          {m.kind === 'video' ? <Film size={28} /> : <FileText size={28} />}
          <span className="line-clamp-2 text-center text-xs break-all">{m.name}</span>
        </span>
      )}
    </button>
  )
}

function Viewer({ m, data, editable, onClose }: { m: MediaItem; data: TreeData; editable: boolean; onClose: () => void }) {
  const url = useMediaUrl(m)
  const [caption, setCaption] = useState(m.caption)
  const [personId, setPersonId] = useState(m.personId)
  const { toast } = useToast()
  return (
    <Sheet
      title={m.name}
      onClose={onClose}
      footer={
        editable ? (
          <>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm('Xóa tư liệu này?')) return
                await ops.deleteMedia(data.tree.id, m).catch((e) => toast(errorText(e), 'error'))
                onClose()
              }}
            >
              Xóa
            </Button>
            <Button
              className="flex-1"
              onClick={async () => {
                await ops.updateMedia(data.tree.id, { ...m, caption, personId }).catch((e) => toast(errorText(e), 'error'))
                onClose()
              }}
            >
              Lưu
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {m.kind === 'photo' && url && <img src={url} alt={m.caption} className="max-h-[50dvh] w-full rounded-xl object-contain" />}
        {m.kind === 'video' && url && <video src={url} controls className="max-h-[50dvh] w-full rounded-xl" />}
        {url && (
          <a href={url} download={m.name} target="_blank" rel="noreferrer" className="inline-block text-sm text-brand-700 underline">
            Mở / tải xuống ({formatBytes(m.size)})
          </a>
        )}
        <Field label="Chú thích"><input className="field" value={caption} disabled={!editable} onChange={(e) => setCaption(e.target.value)} /></Field>
        <Field label="Gắn với">
          <select className="field" value={personId} disabled={!editable} onChange={(e) => setPersonId(e.target.value)}>
            <option value="">Cả cây gia phả</option>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
          </select>
        </Field>
      </div>
    </Sheet>
  )
}

export default function MediaTab({ data, editable, isCloud }: { data: TreeData; editable: boolean; isCloud: boolean }) {
  const [filter, setFilter] = useState('')
  const [kind, setKind] = useState<'' | MediaKind>('')
  const [target, setTarget] = useState('')
  const [open, setOpen] = useState<MediaItem | null>(null)
  const [progress, setProgress] = useState('')
  const { toast } = useToast()
  const used = useMemo(() => data.media.reduce((s, m) => s + m.size, 0), [data.media])
  const items = data.media.filter((m) => (!filter || m.personId === filter) && (!kind || m.kind === kind)).sort((a, b) => b.createdAt - a.createdAt)
  const sorted = useMemo(() => [...data.people].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')), [data.people])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    let done = 0
    for (const raw of [...files]) {
      try {
        if (raw.size > MAX_FILE) throw new Error(`"${raw.name}" lớn hơn 200 MB.`)
        setProgress(`Đang nén và tải ${++done}/${files.length}…`)
        const file = await compressImage(raw)
        if (isCloud && used + file.size > STORAGE_QUOTA_BYTES) throw new Error('Đã hết 5 GB dung lượng miễn phí.')
        await ops.addMedia(data.tree.id, file, { personId: target, kind: kindOf(file), caption: '' }, (p) => setProgress(`Đang tải ${done}/${files.length}: ${Math.round(p * 100)}%`))
      } catch (e) {
        toast(errorText(e), 'error')
      }
    }
    setProgress('')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-3 pb-24">
      <div className="card p-3 text-sm" data-testid="storage-usage">
        <div className="flex justify-between">
          <span className="font-semibold">Dung lượng tư liệu của cây</span>
          <span>{formatBytes(used)}{isCloud ? ` / ${formatBytes(STORAGE_QUOTA_BYTES)}` : ''}</span>
        </div>
        {isCloud ? (
          <>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
              <div className="h-full bg-brand-700" style={{ width: `${Math.min(100, (used / STORAGE_QUOTA_BYTES) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-stone-500">Gói miễn phí Firebase có 5 GB cho toàn bộ dự án. Ảnh được nén trên trình duyệt trước khi tải lên.</p>
          </>
        ) : (
          <p className="mt-1 text-xs text-stone-500">Tư liệu của cây này lưu trong trình duyệt trên thiết bị. Ảnh được nén trước khi lưu.</p>
        )}
      </div>
      {editable && (
        <div className="card space-y-2 p-3">
          <select className="field" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Gắn tư liệu với">
            <option value="">Gắn với: cả cây gia phả</option>
            {sorted.map((p) => <option key={p.id} value={p.id}>Gắn với: {p.fullName}</option>)}
          </select>
          <label className={`flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white ${progress ? 'pointer-events-none opacity-60' : ''}`}>
            <Upload size={16} /> {progress || 'Tải ảnh, video, tài liệu lên'}
            <input type="file" multiple hidden accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => (upload(e.target.files), (e.target.value = ''))} data-testid="media-input" />
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <select className="field" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Lọc theo thành viên">
          <option value="">Tất cả thành viên</option>
          {sorted.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as '' | MediaKind)} aria-label="Lọc theo loại">
          <option value="">Mọi loại</option>
          <option value="photo">Ảnh</option>
          <option value="video">Video</option>
          <option value="document">Tài liệu</option>
        </select>
      </div>
      {items.length ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{items.map((m) => <Thumb key={m.id} m={m} onClick={() => setOpen(m)} />)}</div>
      ) : (
        <Empty>Chưa có tư liệu nào.</Empty>
      )}
      {open && <Viewer m={open} data={data} editable={editable} onClose={() => setOpen(null)} />}
    </div>
  )
}
