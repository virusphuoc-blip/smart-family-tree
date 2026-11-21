import { Flag, GitCompareArrows, LocateFixed, Pencil, Plus, Trash2, UserRoundCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDate, lifeSpan } from '../lib/dates'
import { relationOf, relativesOf, type Graph } from '../lib/kinship'
import { ops } from '../lib/store'
import { nid } from '../lib/util'
import { emptyPerson, type Person, type TreeData, type Union } from '../types'
import type { FormRequest } from './PersonForm'
import { Avatar, Button, DateInput, errorText, Field, Sheet, useToast } from './ui'

interface Props {
  data: TreeData
  graph: Graph
  person: Person
  egoId: string
  editable: boolean
  onClose: () => void
  onOpen: (id: string) => void
  onForm: (r: FormRequest) => void
  onEgo: (id: string) => void
  onLocate: (id: string) => void
  onCompare: (id: string) => void
  onReport?: (p: Person) => void
}

export default function PersonPanel({ data, graph, person: p, egoId, editable, onClose, onOpen, onForm, onEgo, onLocate, onCompare, onReport }: Props) {
  const { toast } = useToast()
  const [union, setUnion] = useState<Union | null>(null)
  const [pickSpouse, setPickSpouse] = useState('')
  const [showAll, setShowAll] = useState(false)
  const tid = data.tree.id
  const get = (id: string) => graph.byId.get(id)
  const ego = egoId && egoId !== p.id ? get(egoId) : undefined
  const rel = ego ? relationOf(graph, ego.id, p.id) : null
  const relatives = useMemo(() => relativesOf(graph, p.id), [graph, p.id])
  const spouses = graph.spouses.get(p.id) ?? []
  const children = graph.children.get(p.id) ?? []
  const siblings = relatives.filter((r) => r.relation.path.length === 3 && get(r.relation.path[1]) && (p.fatherId === r.relation.path[1] || p.motherId === r.relation.path[1]) && r.relation.kind === 'blood')
  const events = data.events.filter((e) => e.personId === p.id)
  const media = data.media.filter((m) => m.personId === p.id)

  const chip = (id: string, caption?: string) => {
    const x = get(id)
    if (!x) return null
    return (
      <button key={id + (caption ?? '')} type="button" onClick={() => onOpen(id)} className="flex items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pr-3 pl-1 text-left text-sm hover:border-brand-600">
        <Avatar person={x} size={28} />
        <span>
          <span className="font-semibold">{x.fullName}</span>
          {caption && <span className="text-stone-500"> · {caption}</span>}
        </span>
      </button>
    )
  }
  const newPerson = (patch: Partial<Person>): Person => ({ ...emptyPerson(nid()), ...patch })
  const addChild = () => {
    const current = spouses.filter((s) => !s.ended)
    const other = current.length === 1 ? current[0].id : spouses.length === 1 ? spouses[0].id : ''
    const mine = p.gender === 'female' ? { motherId: p.id, fatherId: other } : { fatherId: p.id, motherId: other }
    onForm({ person: newPerson(mine), isNew: true, title: `Thêm con của ${p.fullName}` })
  }
  const remove = async () => {
    if (!confirm(`Xóa "${p.fullName}" khỏi cây gia phả? Các liên kết cha mẹ, vợ chồng của người này cũng bị gỡ.`)) return
    try {
      await ops.deletePerson(data, p.id)
      toast('Đã xóa thành viên.')
      onClose()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  const linkSpouse = async () => {
    if (!pickSpouse) return
    try {
      await ops.saveUnion(tid, { id: nid(), a: p.id, b: pickSpouse, startDate: '', endDate: '', divorced: false, note: '' })
      setPickSpouse('')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }
  const row = (label: string, value: string) =>
    value ? (
      <div className="flex gap-3 py-1 text-sm">
        <span className="w-24 shrink-0 text-stone-500">{label}</span>
        <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{value}</span>
      </div>
    ) : null
  const act = 'flex flex-col items-center gap-1 rounded-xl border border-stone-200 px-1 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50'

  return (
    <Sheet title="Hồ sơ thành viên" onClose={onClose}>
      <div className="space-y-4 pb-2" data-testid="person-panel">
        <div className="flex items-center gap-3">
          <Avatar person={p} size={72} />
          <div className="min-w-0">
            <h3 className="text-lg leading-tight font-bold" data-testid="panel-name">{p.fullName}</h3>
            {p.nickname && <p className="text-sm text-stone-500">Thường gọi: {p.nickname}</p>}
            <p className="text-sm text-stone-600">
              {p.gender === 'male' ? 'Nam' : p.gender === 'female' ? 'Nữ' : 'Khác'}
              {lifeSpan(p.birthDate, p.deathDate, p.deceased) && ` · ${lifeSpan(p.birthDate, p.deathDate, p.deceased)}`}
            </p>
            {p.hidden && <span className="rounded bg-red-100 px-1.5 text-xs text-red-700">Đã bị quản trị viên ẩn</span>}
          </div>
        </div>
        {rel && ego && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="panel-kinship">
            <b>{ego.fullName}</b> gọi người này là <b>{rel.term}</b>
            {rel.note && ` (${rel.note})`}
          </p>
        )}
        <div className={`grid gap-2 ${editable ? 'grid-cols-5' : 'grid-cols-3'}`}>
          <button type="button" className={act} onClick={() => onLocate(p.id)}><LocateFixed size={18} />Trên sơ đồ</button>
          <button type="button" className={act} onClick={() => onEgo(p.id)} data-testid="set-ego"><UserRoundCheck size={18} />Xưng hô</button>
          <button type="button" className={act} onClick={() => onCompare(p.id)}><GitCompareArrows size={18} />Quan hệ</button>
          {editable && <button type="button" className={act} onClick={() => onForm({ person: p, isNew: false })} data-testid="edit-person"><Pencil size={18} />Sửa</button>}
          {editable && <button type="button" className={`${act} text-red-700`} onClick={remove} data-testid="delete-person"><Trash2 size={18} />Xóa</button>}
        </div>

        <section>
          {row('Ngày sinh', formatDate(p.birthDate))}
          {p.deceased && row('Ngày mất', formatDate(p.deathDate) || 'Đã mất')}
          {row('Nơi sinh', p.birthPlace)}
          {row('Nghề nghiệp', p.occupation)}
          {row('Điện thoại', p.phone)}
          {row('Email', p.email)}
          {row('Địa chỉ', p.address)}
          {row('Tiểu sử', p.bio)}
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-bold text-stone-600">Gia đình</h4>
          <div className="flex flex-wrap gap-2">
            {chip(p.fatherId, 'Cha')}
            {chip(p.motherId, 'Mẹ')}
            {spouses.map((s) => (
              <span key={s.id} className="flex items-center gap-1">
                {chip(s.id, (get(s.id)?.gender === 'male' ? 'Chồng' : 'Vợ') + (s.ended ? ' (cũ)' : ''))}
                {editable && s.union && (
                  <button type="button" aria-label="Sửa hôn nhân" className="rounded-full p-1 text-stone-500 hover:bg-stone-100" onClick={() => setUnion(s.union)}>
                    <Pencil size={14} />
                  </button>
                )}
              </span>
            ))}
            {children.map((c) => chip(c, get(c)?.gender === 'female' ? 'Con gái' : 'Con trai'))}
            {siblings.map((s) => chip(s.person.id, s.relation.term))}
          </div>
          {editable && (
            <div className="flex flex-wrap gap-2">
              {!p.fatherId && <Button variant="secondary" onClick={() => onForm({ person: newPerson({ gender: 'male' }), isNew: true, link: { type: 'father', of: p.id }, title: `Thêm cha của ${p.fullName}` })}><Plus size={14} />Cha</Button>}
              {!p.motherId && <Button variant="secondary" onClick={() => onForm({ person: newPerson({ gender: 'female' }), isNew: true, link: { type: 'mother', of: p.id }, title: `Thêm mẹ của ${p.fullName}` })}><Plus size={14} />Mẹ</Button>}
              <Button variant="secondary" data-testid="add-spouse" onClick={() => onForm({ person: newPerson({ gender: p.gender === 'male' ? 'female' : 'male' }), isNew: true, link: { type: 'spouse', of: p.id }, title: `Thêm vợ/chồng của ${p.fullName}` })}><Plus size={14} />Vợ/Chồng</Button>
              <Button variant="secondary" data-testid="add-child" onClick={addChild}><Plus size={14} />Con</Button>
            </div>
          )}
          {editable && (
            <div className="flex gap-2">
              <select className="field" value={pickSpouse} onChange={(e) => setPickSpouse(e.target.value)} aria-label="Chọn vợ/chồng từ thành viên có sẵn">
                <option value="">Liên kết vợ/chồng với thành viên có sẵn…</option>
                {data.people
                  .filter((x) => x.id !== p.id && !spouses.some((s) => s.id === x.id && s.union))
                  .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
                  .map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}
              </select>
              <Button variant="secondary" disabled={!pickSpouse} onClick={linkSpouse}>Liên kết</Button>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-bold text-stone-600">Cách {p.fullName} xưng hô với họ hàng ({relatives.length})</h4>
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200" data-testid="relatives">
            {(showAll ? relatives : relatives.slice(0, 6)).map((r) => (
              <li key={r.person.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => onOpen(r.person.id)}>
                  <span className="min-w-0 truncate">{r.person.fullName}</span>
                  <span className="shrink-0 text-right">
                    <b className="text-amber-700">{r.relation.term}</b>
                    {r.relation.note && <span className="block text-xs text-stone-500">{r.relation.note}</span>}
                  </span>
                </button>
              </li>
            ))}
            {!relatives.length && <li className="px-3 py-2 text-sm text-stone-500">Chưa có liên kết họ hàng.</li>}
          </ul>
          {relatives.length > 6 && (
            <button type="button" className="text-sm text-brand-700 underline" onClick={() => setShowAll(!showAll)}>{showAll ? 'Thu gọn' : `Xem tất cả ${relatives.length} người`}</button>
          )}
        </section>

        {(events.length > 0 || media.length > 0) && (
          <section className="space-y-1 text-sm">
            <h4 className="text-sm font-bold text-stone-600">Sự kiện & tư liệu</h4>
            {events.map((e) => <p key={e.id}>• {formatDate(e.date)} — {e.title}</p>)}
            {media.length > 0 && <p className="text-stone-500">{media.length} tư liệu đính kèm (xem ở thẻ Tư liệu).</p>}
          </section>
        )}
        {onReport && (
          <button type="button" className="flex items-center gap-1 text-xs text-stone-500 underline" onClick={() => onReport(p)}>
            <Flag size={12} /> Báo cáo thông tin không phù hợp
          </button>
        )}
      </div>

      {union && (
        <Sheet
          title="Thông tin hôn nhân"
          onClose={() => setUnion(null)}
          footer={
            <>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm('Gỡ liên kết vợ chồng này?')) return
                  await ops.deleteUnion(tid, union.id).catch((e) => toast(errorText(e), 'error'))
                  setUnion(null)
                }}
              >
                Gỡ liên kết
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  await ops.saveUnion(tid, union).catch((e) => toast(errorText(e), 'error'))
                  setUnion(null)
                }}
              >
                Lưu
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm font-semibold">{get(union.a)?.fullName} & {get(union.b)?.fullName}</p>
            <Field label="Ngày cưới"><DateInput value={union.startDate} onChange={(v) => setUnion({ ...union, startDate: v })} /></Field>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={union.divorced} onChange={(e) => setUnion({ ...union, divorced: e.target.checked })} /> Đã ly hôn
            </label>
            {union.divorced && <Field label="Ngày ly hôn"><DateInput value={union.endDate} onChange={(v) => setUnion({ ...union, endDate: v })} /></Field>}
            <Field label="Ghi chú"><input className="field" value={union.note} onChange={(e) => setUnion({ ...union, note: e.target.value })} /></Field>
          </div>
        </Sheet>
      )}
    </Sheet>
  )
}
