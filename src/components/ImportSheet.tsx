import { FileUp, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { buildImport, docxToText, extractByPatterns, extractWithLlm, loadLlmSettings, matchExisting, type DraftPerson } from '../lib/aiImport'
import { ops } from '../lib/store'
import type { TreeData } from '../types'
import { Button, DateInput, errorText, Sheet, useToast } from './ui'

export default function ImportSheet({ data, onClose }: { data: TreeData; onClose: () => void }) {
  const llm = loadLlmSettings()
  const hasKey = !!llm.apiKey.trim()
  const [useAi, setUseAi] = useState(hasKey)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<DraftPerson[] | null>(null)
  const [mode, setMode] = useState('')
  const { toast } = useToast()

  const run = async (file: Blob) => {
    setError('')
    try {
      setBusy('Đang đọc tệp Word…')
      const t = await docxToText(file)
      if (!t) throw new Error('Không đọc được nội dung văn bản trong tệp này.')
      setText(t)
      let found: DraftPerson[]
      if (useAi && hasKey) {
        setBusy('AI đang trích xuất tên và quan hệ…')
        found = await extractWithLlm(t, llm)
        setMode('AI')
      } else {
        found = extractByPatterns(t)
        setMode('nhận dạng theo mẫu câu')
      }
      if (!found.length) throw new Error('Không tìm thấy người nào trong văn bản. Hãy thử chế độ AI hoặc nhập tay.')
      setDrafts(matchExisting(found, data.people))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy('')
    }
  }
  const useSample = async () => run(await (await fetch('/samples/gia-pha-mau.docx')).blob())

  const patch = (key: string, p: Partial<DraftPerson>) => setDrafts((cur) => cur!.map((d) => (d.key === key ? { ...d, ...p } : d)))
  const nameOf = (key: string) => drafts?.find((d) => d.key === key)?.fullName ?? ''
  const chosen = drafts?.filter((d) => d.include) ?? []

  const confirmImport = async () => {
    if (!drafts) return
    setBusy('Đang thêm vào cây…')
    try {
      const res = buildImport(drafts, data.people, data.unions)
      await ops.importBatch(data, res.people, res.unions, res.events)
      const created = res.people.filter((p) => !data.people.some((x) => x.id === p.id)).length
      toast(`Đã thêm ${created} thành viên mới và ${res.unions.length} quan hệ vợ chồng.`)
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy('')
    }
  }

  const select = (d: DraftPerson, field: 'fatherKey' | 'motherKey') => (
    <select className="field !py-1.5 text-sm" value={d[field]} onChange={(e) => patch(d.key, { [field]: e.target.value })} aria-label={field === 'fatherKey' ? 'Cha' : 'Mẹ'}>
      <option value="">{field === 'fatherKey' ? 'Cha: chưa rõ' : 'Mẹ: chưa rõ'}</option>
      {drafts!.filter((x) => x.key !== d.key).map((x) => <option key={x.key} value={x.key}>{field === 'fatherKey' ? 'Cha' : 'Mẹ'}: {x.fullName}</option>)}
    </select>
  )

  return (
    <Sheet
      wide
      title={drafts ? 'Kiểm tra trước khi thêm vào cây' : 'Nhập từ tệp Word (.docx)'}
      onClose={onClose}
      footer={
        drafts ? (
          <>
            <Button variant="secondary" onClick={() => setDrafts(null)}>Quay lại</Button>
            <Button className="flex-1" disabled={!!busy || !chosen.length} onClick={confirmImport} data-testid="import-confirm">
              {busy || `Thêm ${chosen.length} người vào cây`}
            </Button>
          </>
        ) : undefined
      }
    >
      {!drafts ? (
        <div className="space-y-3 text-sm">
          <p className="text-stone-600">Tải lên bản gia phả cũ dạng Word. Ứng dụng đọc văn bản ngay trên trình duyệt, trích xuất tên và quan hệ, rồi để bạn kiểm tra, sửa từng người trước khi thêm vào cây.</p>
          {hasKey ? (
            <label className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900">
              <input type="checkbox" className="mt-1" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              <span>
                <b className="flex items-center gap-1"><Sparkles size={14} /> Dùng AI ({llm.model})</b>
                Văn bản sẽ được gửi tới nhà cung cấp AI bằng khóa của bạn. Bỏ chọn để chỉ nhận dạng theo mẫu câu trên thiết bị.
              </span>
            </label>
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900" data-testid="import-nokey">
              <b>Nhập bằng AI cần khóa API.</b> Bạn chưa đặt khóa nên ứng dụng sẽ dùng cách <b>nhận dạng theo mẫu câu</b> (đơn giản hơn, chạy hoàn toàn trên thiết bị; hiểu các câu như “Ông A sinh năm…, vợ là bà B, con của ông C và bà D, các con: …”). Để AI đọc được văn bản tự do, hãy dán khóa miễn phí (ví dụ Google Gemini) trong{' '}
              <Link to="/settings" className="font-semibold underline">Cài đặt</Link>.
            </p>
          )}
          <label className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 p-4 text-stone-600 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            <FileUp size={26} />
            <span className="font-semibold">{busy || 'Chọn tệp .docx'}</span>
            <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} data-testid="import-input" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={!!busy} onClick={useSample} data-testid="import-sample">Thử với tệp mẫu</Button>
            <a href="/samples/gia-pha-mau.docx" download className="text-brand-700 underline">Tải tệp mẫu về</a>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3" data-testid="import-review">
          <p className="text-sm text-stone-600">
            Tìm thấy <b>{drafts.length}</b> người bằng {mode}. Bỏ chọn người không muốn thêm, sửa lại thông tin và quan hệ nếu cần.
          </p>
          <details className="rounded-lg bg-stone-100 p-2 text-xs text-stone-600">
            <summary className="cursor-pointer font-semibold">Xem văn bản gốc</summary>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap">{text}</p>
          </details>
          {drafts.map((d) => (
            <div key={d.key} className={`card space-y-2 p-3 ${d.include ? '' : 'opacity-50'}`} data-testid="draft">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={d.include} onChange={(e) => patch(d.key, { include: e.target.checked })} aria-label="Thêm người này" />
                <input className="field !py-1.5 font-semibold" value={d.fullName} onChange={(e) => patch(d.key, { fullName: e.target.value })} aria-label="Họ và tên" />
                <select className="field !w-24 !py-1.5 text-sm" value={d.gender} onChange={(e) => patch(d.key, { gender: e.target.value as DraftPerson['gender'] })} aria-label="Giới tính">
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                  <option value="other">Khác</option>
                </select>
              </div>
              {d.matchId && (
                <p className="flex items-center justify-between gap-2 rounded-lg bg-sky-50 px-2 py-1 text-xs text-sky-900">
                  Trùng tên với thành viên đã có — sẽ gộp, không tạo trùng.
                  <button type="button" className="shrink-0 underline" onClick={() => patch(d.key, { matchId: '' })}>Tạo người mới</button>
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-xs text-stone-500">Ngày sinh<DateInput value={d.birthDate} onChange={(v) => patch(d.key, { birthDate: v })} /></label>
                <label className="text-xs text-stone-500">Ngày mất<DateInput value={d.deathDate} onChange={(v) => patch(d.key, { deathDate: v, deceased: d.deceased || !!v })} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {select(d, 'fatherKey')}
                {select(d, 'motherKey')}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-xs text-stone-500">Vợ/chồng:</span>
                {d.spouseKeys.map((k) => (
                  <span key={k} className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800">
                    {nameOf(k)}
                    <button type="button" aria-label="Gỡ" onClick={() => setDrafts((cur) => cur!.map((x) => (x.key === d.key ? { ...x, spouseKeys: x.spouseKeys.filter((s) => s !== k) } : x.key === k ? { ...x, spouseKeys: x.spouseKeys.filter((s) => s !== d.key) } : x)))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <select className="rounded-lg border border-stone-300 px-1 py-0.5 text-xs" value="" onChange={(e) => e.target.value && patch(d.key, { spouseKeys: [...d.spouseKeys, e.target.value] })} aria-label="Thêm vợ/chồng">
                  <option value="">+ thêm</option>
                  {drafts.filter((x) => x.key !== d.key && !d.spouseKeys.includes(x.key)).map((x) => <option key={x.key} value={x.key}>{x.fullName}</option>)}
                </select>
              </div>
              {(d.birthPlace || d.occupation) && <p className="text-xs text-stone-500">{[d.birthPlace && `Quê: ${d.birthPlace}`, d.occupation && `Nghề: ${d.occupation}`].filter(Boolean).join(' · ')}</p>}
            </div>
          ))}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        </div>
      )}
    </Sheet>
  )
}
