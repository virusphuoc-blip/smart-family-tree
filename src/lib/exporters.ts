import type { Person, TreeData } from '../types'
import { formatDate } from './dates'
import { buildGraph } from './kinship'
import { downloadBlob, safeFileName } from './util'

const GENDER = { male: 'Nam', female: 'Nữ', other: 'Khác' }

function memberRows(data: TreeData) {
  const g = buildGraph(data.people, data.unions)
  const name = (id: string) => g.byId.get(id)?.fullName ?? ''
  const sorted = [...data.people].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
  return sorted.map((p: Person, i) => ({
    STT: i + 1,
    'Họ và tên': p.fullName,
    'Tên thường gọi': p.nickname,
    'Giới tính': GENDER[p.gender],
    'Ngày sinh': formatDate(p.birthDate),
    'Đã mất': p.deceased ? 'Có' : '',
    'Ngày mất': formatDate(p.deathDate),
    'Nơi sinh': p.birthPlace,
    'Nghề nghiệp': p.occupation,
    'Điện thoại': p.phone,
    Email: p.email,
    'Địa chỉ': p.address,
    Cha: name(p.fatherId),
    Mẹ: name(p.motherId),
    'Vợ/Chồng': (g.spouses.get(p.id) ?? []).map((s) => name(s.id) + (s.ended ? ' (đã ly hôn)' : '')).join('; '),
    Con: (g.children.get(p.id) ?? []).map(name).join('; '),
    'Tiểu sử / Ghi chú': p.bio,
  }))
}

export async function exportXlsx(data: TreeData): Promise<Blob> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const rows = memberRows(data)
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0] ?? { A: 1 }).map((k) => ({ wch: Math.max(10, Math.min(40, k.length + 8)) }))
  XLSX.utils.book_append_sheet(wb, ws, 'Thành viên')
  const name = (id: string) => data.people.find((p) => p.id === id)?.fullName ?? ''
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      data.unions.map((u) => ({
        'Người thứ nhất': name(u.a),
        'Người thứ hai': name(u.b),
        'Ngày cưới': formatDate(u.startDate),
        'Ngày kết thúc': formatDate(u.endDate),
        'Ly hôn': u.divorced ? 'Có' : '',
        'Ghi chú': u.note,
      })),
    ),
    'Hôn nhân',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      data.events.map((e) => ({ Ngày: formatDate(e.date), 'Thành viên': name(e.personId), 'Sự kiện': e.title, 'Mô tả': e.description })),
    ),
    'Sự kiện',
  )
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** PNG of a DOM node that holds the full-size tree SVG. */
export async function nodeToPng(node: HTMLElement): Promise<string> {
  const { toPng } = await import('html-to-image')
  const w = node.offsetWidth
  const h = node.offsetHeight
  // keep the bitmap below browser canvas limits for very large trees
  const pixelRatio = Math.max(0.5, Math.min(2, 8000 / Math.max(w, h), Math.sqrt(40_000_000 / (w * h))))
  return toPng(node, { pixelRatio, backgroundColor: '#ffffff', cacheBust: false })
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

async function fontBase64(path: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(path)).arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function exportPdf(data: TreeData, png: string, pngW: number, pngH: number): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  // Embedded font so Vietnamese diacritics render correctly.
  pdf.addFileToVFS('BeVietnamPro-Regular.ttf', await fontBase64('/fonts/BeVietnamPro-Regular.ttf'))
  pdf.addFont('BeVietnamPro-Regular.ttf', 'BeVietnamPro', 'normal')
  pdf.addFileToVFS('BeVietnamPro-Bold.ttf', await fontBase64('/fonts/BeVietnamPro-Bold.ttf'))
  pdf.addFont('BeVietnamPro-Bold.ttf', 'BeVietnamPro', 'bold')
  pdf.setFont('BeVietnamPro', 'bold')
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  pdf.setFontSize(18)
  pdf.text(data.tree.name, 12, 16)
  pdf.setFont('BeVietnamPro', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(90)
  pdf.text(`${data.people.length} thành viên · Xuất ngày ${new Date().toLocaleDateString('vi-VN')} · Gia Phả Thông Minh`, 12, 22)
  const maxW = W - 24
  const maxH = H - 36
  const k = Math.min(maxW / pngW, maxH / pngH)
  pdf.addImage(png, 'PNG', (W - pngW * k) / 2, 28, pngW * k, pngH * k, undefined, 'FAST')

  pdf.addPage()
  pdf.setTextColor(0)
  pdf.setFont('BeVietnamPro', 'bold')
  pdf.setFontSize(14)
  pdf.text('Danh sách thành viên', 12, 14)
  const rows = memberRows(data)
  const cols = ['STT', 'Họ và tên', 'Giới tính', 'Ngày sinh', 'Ngày mất', 'Nơi sinh', 'Nghề nghiệp', 'Cha', 'Mẹ', 'Vợ/Chồng', 'Con'] as const
  autoTable(pdf, {
    startY: 18,
    head: [[...cols]],
    body: rows.map((r) => cols.map((c) => String(r[c] ?? ''))),
    styles: { font: 'BeVietnamPro', fontStyle: 'normal', fontSize: 7.5, cellPadding: 1.2, overflow: 'linebreak' },
    headStyles: { font: 'BeVietnamPro', fontStyle: 'bold', fillColor: [159, 18, 57] },
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 34 }, 2: { cellWidth: 13 }, 3: { cellWidth: 19 }, 4: { cellWidth: 19 } },
    margin: { left: 10, right: 10 },
  })
  return pdf.output('blob')
}

export const exportName = (data: TreeData, ext: string) => `${safeFileName(data.tree.name) || 'gia-pha'}.${ext}`
export { downloadBlob }
