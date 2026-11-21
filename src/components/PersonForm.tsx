import { Camera } from 'lucide-react'
import { useMemo, useState } from 'react'
import { imageToDataUrl } from '../lib/images'
import type { Graph } from '../lib/kinship'
import { ops } from '../lib/store'
import { nid } from '../lib/util'
import type { Person, TreeData } from '../types'
import { Avatar, Button, DateInput, errorText, Field, Sheet, useToast } from './ui'

export interface FormRequest {
  person: Person
  isNew: boolean
  /** after saving a new member: link it to an existing one */
  link?: { type: 'spouse' | 'father' | 'mother'; of: string }
  title?: string
}

function descendants(g: Graph, id: string): Set<string> {
  const out = new Set<string>([id])
  const queue = [id]
  while (queue.length) for (const c of g.children.get(queue.pop()!) ?? []) if (!out.has(c)) (out.add(c), queue.push(c))
  return out
}

export default function PersonForm({ data, graph, request, onClose, onSaved }: { data: TreeData; graph: Graph; request: FormRequest; onClose: () => void; onSaved: (p: Person) => void }) {
  const [p, setP] = useState<Person>(request.person)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const set = <K extends keyof Person>(k: K, v: Person[K]) => setP((cur) => ({ ...cur, [k]: v }))
  const blocked = useMemo(() => descendants(graph, p.id), [graph, p.id])
  const candidates = useMemo(
    () => data.people.filter((x) => !blocked.has(x.id)).sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')),
    [data.people, blocked],
  )
  const option = (x: Person) => (
    <option key={x.id} value={x.id}>
      {x.fullName}
      {x.birthDate ? ` (${x.birthDate.slice(0, 4)})` : ''}
    </option>
  )

  const save = async () => {
    if (!p.fullName.trim()) return toast('Hãy nhập họ và tên.', 'error')
    setBusy(true)
    try {
      const tid = data.tree.id
      const saved: Person = { ...p, fullName: p.fullName.trim(), deceased: p.deceased || !!p.deathDate, deathDate: p.deceased || p.deathDate ? p.deathDate : '' }
      await ops.savePerson(tid, saved, request.isNew)
      const link = request.link
      if (link?.type === 'spouse') await ops.saveUnion(tid, { id: nid(), a: link.of, b: saved.id, startDate: '', endDate: '', divorced: false, note: '' })
      if (link?.type === 'father' || link?.type === 'mother') {
        const child = data.people.find((x) => x.id === link.of)
        if (child) await ops.savePerson(tid, { ...child, [link.type === 'father' ? 'fatherId' : 'motherId']: saved.id }, false)
      }
      toast(request.isNew ? 'Đã thêm thành viên.' : 'Đã lưu thay đổi.')
      onSaved(saved)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={request.title ?? (request.isNew ? 'Thêm thành viên' : 'Sửa thành viên')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button className="flex-1" onClick={save} disabled={busy} data-testid="person-save">Lưu</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar person={p} size={64} />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold">
            <Camera size={16} /> {p.photo ? 'Đổi ảnh' : 'Chọn ảnh'}
            <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && set('photo', await imageToDataUrl(e.target.files[0], 256, true, 0.8))} />
          </label>
          {p.photo && (
            <button type="button" className="text-sm text-red-600 underline" onClick={() => set('photo', '')}>Xóa ảnh</button>
          )}
        </div>
        <Field label="Họ và tên *">
          <input className="field" value={p.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus data-testid="person-name" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tên thường gọi">
            <input className="field" value={p.nickname} onChange={(e) => set('nickname', e.target.value)} />
          </Field>
          <Field label="Giới tính">
            <select className="field" value={p.gender} onChange={(e) => set('gender', e.target.value as Person['gender'])} data-testid="person-gender">
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
            </select>
          </Field>
        </div>
        <Field label="Ngày sinh" hint="Có thể chỉ nhập năm.">
          <DateInput value={p.birthDate} onChange={(v) => set('birthDate', v)} />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={p.deceased} onChange={(e) => set('deceased', e.target.checked)} /> Đã mất
        </label>
        {p.deceased && (
          <Field label="Ngày mất">
            <DateInput value={p.deathDate} onChange={(v) => set('deathDate', v)} />
          </Field>
        )}
        <Field label="Nơi sinh">
          <input className="field" value={p.birthPlace} onChange={(e) => set('birthPlace', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cha">
            <select className="field" value={p.fatherId} onChange={(e) => set('fatherId', e.target.value)} data-testid="person-father">
              <option value="">— Chưa rõ —</option>
              {candidates.filter((x) => x.gender !== 'female').map(option)}
            </select>
          </Field>
          <Field label="Mẹ">
            <select className="field" value={p.motherId} onChange={(e) => set('motherId', e.target.value)} data-testid="person-mother">
              <option value="">— Chưa rõ —</option>
              {candidates.filter((x) => x.gender !== 'male').map(option)}
            </select>
          </Field>
        </div>
        <Field label="Thứ tự trong anh chị em" hint="1 = con cả. Dùng để xưng hô anh/chị/em, bác/chú khi không rõ năm sinh.">
          <input className="field" inputMode="numeric" value={p.birthOrder || ''} onChange={(e) => set('birthOrder', Number(e.target.value.replace(/\D/g, '')) || 0)} />
        </Field>
        <Field label="Nghề nghiệp">
          <input className="field" value={p.occupation} onChange={(e) => set('occupation', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Điện thoại">
            <input className="field" type="tel" value={p.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <input className="field" type="email" value={p.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
        <Field label="Địa chỉ">
          <input className="field" value={p.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Tiểu sử / Ghi chú">
          <textarea className="field" rows={4} value={p.bio} onChange={(e) => set('bio', e.target.value)} />
        </Field>
      </div>
    </Sheet>
  )
}
