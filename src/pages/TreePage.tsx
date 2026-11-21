import { CalendarDays, CloudUpload, Download, FileUp, Flag, FolderOpen, GitCompareArrows, Menu, Network, Pencil, Plus, Search, Share2, Trash2, Users, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ImportSheet from '../components/ImportSheet'
import MediaTab from '../components/MediaTab'
import PersonForm, { type FormRequest } from '../components/PersonForm'
import PersonPanel from '../components/PersonPanel'
import ShareSheet from '../components/ShareSheet'
import Timeline from '../components/Timeline'
import TreeDiagram, { TreeSvgContent } from '../components/TreeDiagram'
import { Avatar, Button, Empty, errorText, Field, Sheet, Spinner, useToast } from '../components/ui'
import { useAuth } from '../lib/auth'
import { lifeSpan } from '../lib/dates'
import { dataUrlToBlob, downloadBlob, exportName, exportPdf, exportXlsx, nodeToPng } from '../lib/exporters'
import { imageToDataUrl } from '../lib/images'
import { buildGraph, describePath, relationOf } from '../lib/kinship'
import { computeLayout } from '../lib/layout'
import { ops, useTree } from '../lib/store'
import { createReport } from '../lib/store/cloud'
import { fold, nid } from '../lib/util'
import { canEdit, canManage, emptyPerson, ROLE_LABEL, type Person } from '../types'

type Tab = 'diagram' | 'members' | 'timeline' | 'media'
const TABS: { id: Tab; label: string; icon: typeof Network }[] = [
  { id: 'diagram', label: 'Sơ đồ', icon: Network },
  { id: 'members', label: 'Thành viên', icon: Users },
  { id: 'timeline', label: 'Dòng thời gian', icon: CalendarDays },
  { id: 'media', label: 'Tư liệu', icon: FolderOpen },
]
const NONE = new Set<string>()

export default function TreePage() {
  const { id = '' } = useParams()
  const { user, isAdmin, enabled } = useAuth()
  const state = useTree(id, user, isAdmin)
  const { data, role, isCloud } = state
  const nav = useNavigate()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('diagram')
  const [selected, setSelected] = useState('')
  const [egoId, setEgoId] = useState('')
  const [pair, setPair] = useState<{ a: string; b: string } | null>(null)
  const [pairOpen, setPairOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(NONE)
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<{ id: string; n: number }>()
  const [form, setForm] = useState<FormRequest | null>(null)
  const [sheet, setSheet] = useState<'' | 'menu' | 'import' | 'share' | 'export' | 'edit' | 'report'>('')
  const [busy, setBusy] = useState('')
  const [reportOf, setReportOf] = useState<Person | null>(null)
  const [reason, setReason] = useState('')
  const [treeEdit, setTreeEdit] = useState({ name: '', description: '', cover: '' })
  const exportRef = useRef<HTMLDivElement>(null)

  const people = data?.people
  const unions = data?.unions
  const graph = useMemo(() => buildGraph(people ?? [], unions ?? []), [people, unions])
  const labels = useMemo(() => {
    const m = new Map<string, string>()
    if (!egoId || !graph.byId.has(egoId)) return m
    for (const p of graph.byId.values()) m.set(p.id, p.id === egoId ? 'Tôi' : relationOf(graph, egoId, p.id).term)
    return m
  }, [graph, egoId])
  const relation = useMemo(() => (pair && graph.byId.has(pair.a) && graph.byId.has(pair.b) ? relationOf(graph, pair.a, pair.b) : null), [graph, pair])
  const reverse = useMemo(() => (pair && relation ? relationOf(graph, pair.b, pair.a) : null), [graph, pair, relation])
  const fullLayout = useMemo(() => computeLayout(people ?? [], unions ?? [], NONE), [people, unions])
  const matches = useMemo(() => {
    const q = fold(query.trim())
    if (!q || !people) return []
    return people.filter((p) => fold(p.fullName + ' ' + p.nickname).includes(q)).slice(0, 8)
  }, [query, people])

  if (state.loading) return <Spinner />
  if (!data) {
    const denied = state.error === 'denied'
    return (
      <div className="mx-auto max-w-md space-y-3 p-8 text-center text-stone-600">
        <p>{denied ? 'Bạn không có quyền xem cây gia phả này, hoặc cây không tồn tại.' : state.error === 'error' ? 'Không tải được cây gia phả. Kiểm tra kết nối mạng.' : 'Không tìm thấy cây gia phả.'}</p>
        {denied && !user && enabled && <Link className="font-semibold text-brand-700 underline" to={`/login?next=/t/${id}`}>Đăng nhập</Link>}
        <p><Link className="text-brand-700 underline" to="/">Về trang chủ</Link></p>
      </div>
    )
  }

  const tree = data.tree
  const editable = canEdit(role)
  const manage = canManage(role)
  const selectedPerson = graph.byId.get(selected)
  const name = (pid: string) => graph.byId.get(pid)?.fullName ?? ''
  const sorted = [...data.people].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
  const listed = query.trim() ? sorted.filter((p) => fold(p.fullName + ' ' + p.nickname).includes(fold(query.trim()))) : sorted

  const locate = (pid: string) => {
    setCollapsed(NONE)
    setTab('diagram')
    setSelected('')
    setQuery('')
    setTimeout(() => setFocus({ id: pid, n: Date.now() }), 50)
  }
  const toggle = (g: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur)
      if (!next.delete(g)) next.add(g)
      return next
    })
  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try {
      await fn()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy('')
    }
  }
  const png = async () => nodeToPng(exportRef.current!)
  const exporters = {
    xlsx: () => guard('Đang tạo Excel…', async () => downloadBlob(await exportXlsx(data), exportName(data, 'xlsx'))),
    png: () => guard('Đang tạo ảnh…', async () => downloadBlob(await dataUrlToBlob(await png()), exportName(data, 'png'))),
    pdf: () => guard('Đang tạo PDF…', async () => downloadBlob(await exportPdf(data, await png(), exportRef.current!.offsetWidth, exportRef.current!.offsetHeight), exportName(data, 'pdf'))),
  }
  const removeTree = () => {
    if (!confirm(`Xóa vĩnh viễn cây "${tree.name}" cùng toàn bộ thành viên và tư liệu?`)) return
    guard('Đang xóa…', async () => {
      await ops.deleteTree(tree.id)
      nav('/')
    })
  }
  const upload = () =>
    guard('Đang tải lên đám mây…', async () => {
      const newId = await ops.uploadLocalTree(data, setBusy)
      toast('Đã tải cây lên đám mây. Bản trên thiết bị vẫn được giữ lại.')
      setSheet('')
      nav(`/t/${newId}`)
    })
  const sendReport = () =>
    guard('Đang gửi…', async () => {
      await createReport({ treeId: tree.id, treeName: tree.name, personId: reportOf?.id ?? '', personName: reportOf?.fullName ?? '', reason: reason.trim(), reporterUid: user!.uid, reporterEmail: user!.email, status: 'open', createdAt: Date.now() })
      toast('Đã gửi báo cáo tới quản trị viên.')
      setSheet('')
      setReason('')
    })
  const menuItem = 'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold hover:bg-stone-100'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-stone-200 bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-bold" data-testid="tree-title">{tree.name}</h1>
          <p className="truncate text-xs text-stone-500">
            {data.people.length} thành viên · {fullLayout.generations} thế hệ · {isCloud ? (role ? ROLE_LABEL[role] : 'Khách xem công khai') : 'Trên thiết bị này'}
          </p>
        </div>
        {editable && (
          <Button onClick={() => setForm({ person: emptyPerson(nid()), isNew: true })} data-testid="add-person" aria-label="Thêm thành viên">
            <Plus size={18} /> <span className="hidden sm:inline">Thêm</span>
          </Button>
        )}
        <Button variant="secondary" onClick={() => setSheet('menu')} aria-label="Thêm tùy chọn" data-testid="tree-menu"><Menu size={18} /></Button>
      </div>

      {(tab === 'diagram' || tab === 'members') && (
        <div className="relative z-20 flex gap-2 border-b border-stone-200 bg-white px-3 py-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute top-3 left-3 text-stone-400" />
            <input className="field !pl-9" placeholder="Tìm theo tên…" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="search" />
            {query && <button type="button" aria-label="Xóa tìm kiếm" className="absolute top-2.5 right-2 text-stone-400" onClick={() => setQuery('')}><X size={18} /></button>}
            {tab === 'diagram' && query.trim() && (
              <ul className="absolute inset-x-0 top-full mt-1 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-lg" data-testid="search-results">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={() => locate(p.id)}>
                      <Avatar person={p} size={28} /> {p.fullName} <span className="text-xs text-stone-500">{lifeSpan(p.birthDate, p.deathDate, p.deceased)}</span>
                    </button>
                  </li>
                ))}
                {!matches.length && <li className="px-3 py-2 text-sm text-stone-500">Không tìm thấy.</li>}
              </ul>
            )}
          </div>
          <Button variant="secondary" onClick={() => setPairOpen(true)} data-testid="relation-open"><GitCompareArrows size={16} /> Quan hệ</Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {tab === 'diagram' &&
          (data.people.length ? (
            <>
              <TreeDiagram people={data.people} unions={data.unions} collapsed={collapsed} onToggle={toggle} selectedId={selected} highlight={relation?.path} labels={labels} onSelect={setSelected} focus={focus} />
              <div className="pointer-events-none absolute inset-x-2 top-2 space-y-2">
                {egoId && graph.byId.has(egoId) && (
                  <p className="pointer-events-auto flex items-center gap-2 rounded-xl bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900 shadow" data-testid="ego-banner">
                    <span className="min-w-0 flex-1 truncate">Xưng hô theo vai của <b>{name(egoId)}</b></span>
                    <button type="button" aria-label="Tắt xưng hô" onClick={() => setEgoId('')}><X size={16} /></button>
                  </p>
                )}
                {pair && relation && (
                  <div className="pointer-events-auto rounded-xl bg-white/95 px-3 py-2 text-sm shadow ring-1 ring-amber-300" data-testid="relation-result">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1">
                        <b>{name(pair.a)}</b> gọi <b>{name(pair.b)}</b> là <b className="text-amber-700">{relation.term}</b>{relation.note && ` (${relation.note})`}.
                        {reverse && <> Ngược lại gọi là <b className="text-amber-700">{reverse.term}</b>.</>}
                      </p>
                      <button type="button" aria-label="Đóng" onClick={() => setPair(null)}><X size={16} /></button>
                    </div>
                    {relation.path.length > 1 && <p className="mt-1 text-xs text-stone-600">Đường nối: {name(pair.a)} → {describePath(graph, relation.path).join(' → ')}</p>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-4"><Empty>Cây chưa có thành viên nào. {editable ? 'Bấm “+” để thêm người đầu tiên, hoặc nhập từ tệp Word trong menu.' : ''}</Empty></div>
          ))}
        {tab === 'members' && (
          <ul className="mx-auto max-w-2xl space-y-2 p-3 pb-24" data-testid="member-list">
            {listed.map((p) => (
              <li key={p.id}>
                <button type="button" className="card flex w-full items-center gap-3 p-2.5 text-left" onClick={() => setSelected(p.id)}>
                  <Avatar person={p} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.fullName}</span>
                    <span className="block truncate text-xs text-stone-500">{[lifeSpan(p.birthDate, p.deathDate, p.deceased), p.occupation, p.birthPlace].filter(Boolean).join(' · ')}</span>
                  </span>
                  {labels.get(p.id) && <b className="shrink-0 text-xs text-amber-700">{labels.get(p.id)}</b>}
                </button>
              </li>
            ))}
            {!listed.length && <Empty>Không có thành viên nào.</Empty>}
          </ul>
        )}
        {tab === 'timeline' && <Timeline data={data} editable={editable} onOpen={setSelected} />}
        {tab === 'media' && <MediaTab data={data} editable={editable} isCloud={isCloud} />}
      </div>

      <nav className="safe-b grid shrink-0 grid-cols-4 border-t border-stone-200 bg-white">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${tab === t.id ? 'text-brand-700' : 'text-stone-500'}`}>
            <t.icon size={20} /> {t.label}
          </button>
        ))}
      </nav>

      {/* full-size tree used for the PNG / PDF export */}
      <div style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none' }} aria-hidden>
        <div ref={exportRef} style={{ width: fullLayout.width + 48, height: fullLayout.height + 48, padding: 24, background: '#fff', fontFamily: "'Be Vietnam Pro', sans-serif" }} data-testid="export-node">
          <svg width={fullLayout.width} height={fullLayout.height} xmlns="http://www.w3.org/2000/svg">
            <TreeSvgContent layout={fullLayout} people={data.people} />
          </svg>
        </div>
      </div>

      {selectedPerson && (
        <PersonPanel
          data={data}
          graph={graph}
          person={selectedPerson}
          egoId={egoId}
          editable={editable}
          onClose={() => setSelected('')}
          onOpen={setSelected}
          onForm={setForm}
          onEgo={(pid) => (setEgoId(pid), setSelected(''), toast(`Đang xưng hô theo vai của ${name(pid)}.`))}
          onLocate={locate}
          onCompare={(pid) => (setPair({ a: egoId && egoId !== pid ? egoId : pid, b: egoId && egoId !== pid ? pid : '' }), setSelected(''), setPairOpen(true))}
          onReport={isCloud && user && role !== 'owner' ? (p) => (setReportOf(p), setSheet('report')) : undefined}
        />
      )}
      {form && <PersonForm data={data} graph={graph} request={form} onClose={() => setForm(null)} onSaved={(p) => (setForm(null), setSelected(p.id))} />}

      {pairOpen && (
        <Sheet title="Hai người có quan hệ thế nào?" onClose={() => setPairOpen(false)} footer={<Button className="flex-1" disabled={!pair?.a || !pair?.b || pair.a === pair.b} onClick={() => (setPairOpen(false), setTab('diagram'), setCollapsed(NONE))} data-testid="relation-show">Xem quan hệ trên sơ đồ</Button>}>
          <div className="space-y-3">
            {(['a', 'b'] as const).map((k) => (
              <Field key={k} label={k === 'a' ? 'Người thứ nhất' : 'Người thứ hai'}>
                <select className="field" value={pair?.[k] ?? ''} onChange={(e) => setPair({ a: pair?.a ?? '', b: pair?.b ?? '', [k]: e.target.value })} data-testid={`relation-${k}`}>
                  <option value="">— Chọn thành viên —</option>
                  {sorted.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </Field>
            ))}
            {relation && pair && pair.a !== pair.b && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>{name(pair.a)}</b> gọi <b>{name(pair.b)}</b> là <b>{relation.term}</b>{relation.note && ` (${relation.note})`}.</p>}
          </div>
        </Sheet>
      )}

      {sheet === 'menu' && (
        <Sheet title={tree.name} onClose={() => setSheet('')}>
          <div className="pb-2">
            {tree.description && <p className="px-3 pb-2 text-sm text-stone-600">{tree.description}</p>}
            {editable && <button type="button" className={menuItem} onClick={() => setSheet('import')} data-testid="menu-import"><FileUp size={18} /> Nhập từ tệp Word (AI)</button>}
            <button type="button" className={menuItem} onClick={() => setSheet('export')} data-testid="menu-export"><Download size={18} /> Xuất Excel / PDF / Ảnh</button>
            {isCloud && manage && <button type="button" className={menuItem} onClick={() => setSheet('share')} data-testid="menu-share"><Share2 size={18} /> Chia sẻ & phân quyền</button>}
            {!isCloud && (user ? (
              <button type="button" className={menuItem} onClick={upload} disabled={!!busy} data-testid="menu-upload"><CloudUpload size={18} /> {busy || 'Tải cây này lên đám mây để đồng bộ, chia sẻ'}</button>
            ) : (
              <p className="px-3 py-2 text-xs text-stone-500">Đăng nhập để tải cây lên đám mây và chia sẻ với người thân.</p>
            ))}
            {manage && <button type="button" className={menuItem} onClick={() => (setTreeEdit({ name: tree.name, description: tree.description, cover: tree.cover }), setSheet('edit'))} data-testid="menu-edit"><Pencil size={18} /> Sửa tên, mô tả, ảnh bìa</button>}
            {isCloud && user && role !== 'owner' && <button type="button" className={menuItem} onClick={() => (setReportOf(null), setSheet('report'))}><Flag size={18} /> Báo cáo cây gia phả này</button>}
            {(role === 'owner' || isAdmin) && <button type="button" className={`${menuItem} text-red-700`} onClick={removeTree} data-testid="menu-delete"><Trash2 size={18} /> Xóa cây gia phả</button>}
          </div>
        </Sheet>
      )}
      {sheet === 'import' && <ImportSheet data={data} onClose={() => setSheet('')} />}
      {sheet === 'share' && <ShareSheet tree={tree} onClose={() => setSheet('')} />}
      {sheet === 'export' && (
        <Sheet title="Xuất dữ liệu" onClose={() => setSheet('')}>
          <div className="space-y-2 pb-2">
            <p className="text-sm text-stone-600">Tệp được tạo ngay trên trình duyệt của bạn, không gửi lên máy chủ nào.</p>
            <Button variant="secondary" className="w-full !justify-start" disabled={!!busy} onClick={exporters.xlsx} data-testid="export-xlsx">Excel (.xlsx) — danh sách thành viên và quan hệ</Button>
            <Button variant="secondary" className="w-full !justify-start" disabled={!!busy} onClick={exporters.pdf} data-testid="export-pdf">PDF — sơ đồ cây và danh sách thành viên</Button>
            <Button variant="secondary" className="w-full !justify-start" disabled={!!busy} onClick={exporters.png} data-testid="export-png">Ảnh PNG — sơ đồ cây</Button>
            {busy && <p className="text-sm text-stone-500">{busy}</p>}
          </div>
        </Sheet>
      )}
      {sheet === 'edit' && (
        <Sheet title="Sửa cây gia phả" onClose={() => setSheet('')} footer={<Button className="flex-1" disabled={!!busy} onClick={() => guard('Đang lưu…', async () => { if (!treeEdit.name.trim()) throw new Error('Hãy nhập tên cây.'); await ops.updateTree(tree.id, { ...treeEdit, name: treeEdit.name.trim() }); setSheet('') })}>Lưu</Button>}>
          <div className="space-y-3">
            <Field label="Tên cây *"><input className="field" value={treeEdit.name} onChange={(e) => setTreeEdit({ ...treeEdit, name: e.target.value })} /></Field>
            <Field label="Mô tả"><textarea className="field" rows={3} value={treeEdit.description} onChange={(e) => setTreeEdit({ ...treeEdit, description: e.target.value })} /></Field>
            <Field label="Ảnh bìa">
              <div className="flex items-center gap-3">
                {treeEdit.cover && <img src={treeEdit.cover} alt="" className="h-16 w-16 rounded-xl object-cover" />}
                <input type="file" accept="image/*" className="text-sm" onChange={async (e) => e.target.files?.[0] && setTreeEdit({ ...treeEdit, cover: await imageToDataUrl(e.target.files[0], 480, false, 0.75) })} />
              </div>
            </Field>
          </div>
        </Sheet>
      )}
      {sheet === 'report' && (
        <Sheet title={reportOf ? `Báo cáo: ${reportOf.fullName}` : 'Báo cáo cây gia phả'} onClose={() => setSheet('')} footer={<Button className="flex-1" disabled={!reason.trim() || !!busy} onClick={sendReport}>Gửi báo cáo</Button>}>
          <Field label="Lý do" hint="Quản trị viên sẽ xem xét và có thể ẩn nội dung vi phạm."><textarea className="field" rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Sheet>
      )}
    </div>
  )
}
