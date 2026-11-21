import { Baby, Flower2, Heart, HeartCrack, Pencil, Plus, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { compareDates, formatDate } from '../lib/dates'
import { ops } from '../lib/store'
import { nid } from '../lib/util'
import type { LifeEvent, PDate, TreeData } from '../types'
import { Button, DateInput, Empty, errorText, Field, Sheet, useToast } from './ui'

interface Item {
  key: string
  date: PDate
  kind: 'birth' | 'death' | 'marriage' | 'divorce' | 'event'
  title: string
  description: string
  people: string[]
  event?: LifeEvent
}

const ICON = { birth: Baby, death: Flower2, marriage: Heart, divorce: HeartCrack, event: Star }
const TONE = { birth: 'bg-sky-100 text-sky-700', death: 'bg-stone-200 text-stone-700', marriage: 'bg-rose-100 text-rose-700', divorce: 'bg-stone-200 text-stone-700', event: 'bg-amber-100 text-amber-700' }

/** All dated facts of the tree as one list, oldest first. Exported for tests. */
// eslint-disable-next-line react/only-export-components
export function buildTimeline(data: TreeData): Item[] {
  const name = (id: string) => data.people.find((p) => p.id === id)?.fullName ?? ''
  const items: Item[] = []
  for (const p of data.people) {
    if (p.birthDate) items.push({ key: 'b' + p.id, date: p.birthDate, kind: 'birth', title: `${p.fullName} chào đời`, description: p.birthPlace ? `Tại ${p.birthPlace}` : '', people: [p.id] })
    if (p.deathDate) items.push({ key: 'd' + p.id, date: p.deathDate, kind: 'death', title: `${p.fullName} qua đời`, description: '', people: [p.id] })
  }
  for (const u of data.unions) {
    if (!name(u.a) || !name(u.b)) continue
    if (u.startDate) items.push({ key: 'm' + u.id, date: u.startDate, kind: 'marriage', title: `${name(u.a)} và ${name(u.b)} kết hôn`, description: u.note, people: [u.a, u.b] })
    if (u.divorced && u.endDate) items.push({ key: 'x' + u.id, date: u.endDate, kind: 'divorce', title: `${name(u.a)} và ${name(u.b)} ly hôn`, description: '', people: [u.a, u.b] })
  }
  for (const e of data.events) {
    if (e.personId && !name(e.personId)) continue
    items.push({ key: 'e' + e.id, date: e.date, kind: 'event', title: e.personId ? `${name(e.personId)}: ${e.title}` : e.title, description: e.description, people: e.personId ? [e.personId] : [], event: e })
  }
  return items.sort((a, b) => compareDates(a.date, b.date))
}

export default function Timeline({ data, editable, onOpen }: { data: TreeData; editable: boolean; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState('')
  const [edit, setEdit] = useState<LifeEvent | null>(null)
  const { toast } = useToast()
  const all = useMemo(() => buildTimeline(data), [data])
  const items = filter ? all.filter((i) => i.people.includes(filter)) : all
  const sorted = useMemo(() => [...data.people].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')), [data.people])

  const save = async () => {
    if (!edit) return
    if (!edit.title.trim()) return toast('Hãy nhập tên sự kiện.', 'error')
    await ops.saveEvent(data.tree.id, edit).catch((e) => toast(errorText(e), 'error'))
    setEdit(null)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-3 pb-24">
      <div className="flex gap-2">
        <select className="field" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Lọc theo thành viên" data-testid="timeline-filter">
          <option value="">Tất cả thành viên</option>
          {sorted.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        {editable && (
          <Button onClick={() => setEdit({ id: nid(), personId: filter, date: '', title: '', description: '' })} className="shrink-0">
            <Plus size={16} /> Sự kiện
          </Button>
        )}
      </div>
      {!items.length && <Empty>Chưa có sự kiện nào có ngày tháng.</Empty>}
      <ol className="relative ml-4 space-y-3 border-l-2 border-stone-200 pl-6" data-testid="timeline">
        {items.map((i) => {
          const Icon = ICON[i.kind]
          return (
            <li key={i.key} className="relative">
              <span className={`absolute top-1 -left-[41px] flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-stone-50 ${TONE[i.kind]}`}>
                <Icon size={16} />
              </span>
              <div className="card p-3">
                <p className="text-xs font-bold text-brand-700">{formatDate(i.date) || 'Không rõ ngày'}</p>
                <p className="text-sm font-semibold">{i.title}</p>
                {i.description && <p className="text-sm text-stone-600">{i.description}</p>}
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  {i.people.map((id) => (
                    <button key={id} type="button" className="text-brand-700 underline" onClick={() => onOpen(id)}>
                      Hồ sơ {data.people.find((p) => p.id === id)?.fullName}
                    </button>
                  ))}
                  {editable && i.event && (
                    <button type="button" className="flex items-center gap-1 text-stone-500 underline" onClick={() => setEdit(i.event!)}>
                      <Pencil size={11} /> Sửa
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {edit && (
        <Sheet
          title="Sự kiện"
          onClose={() => setEdit(null)}
          footer={
            <>
              {data.events.some((e) => e.id === edit.id) && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await ops.deleteEvent(data.tree.id, edit.id).catch((e) => toast(errorText(e), 'error'))
                    setEdit(null)
                  }}
                >
                  Xóa
                </Button>
              )}
              <Button className="flex-1" onClick={save}>Lưu</Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Tên sự kiện *"><input className="field" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="VD: Tốt nghiệp đại học, xây nhà thờ họ…" /></Field>
            <Field label="Ngày"><DateInput value={edit.date} onChange={(v) => setEdit({ ...edit, date: v })} /></Field>
            <Field label="Thành viên">
              <select className="field" value={edit.personId} onChange={(e) => setEdit({ ...edit, personId: e.target.value })}>
                <option value="">Cả gia đình</option>
                {sorted.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </Field>
            <Field label="Mô tả"><textarea className="field" rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          </div>
        </Sheet>
      )}
    </div>
  )
}
