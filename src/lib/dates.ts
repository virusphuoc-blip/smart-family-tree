import type { PDate } from '../types'

export function makeDate(y: string, m: string, d: string): PDate {
  const yy = parseInt(y, 10)
  if (!yy || yy < 1 || yy > 9999) return ''
  let out = String(yy).padStart(4, '0')
  const mm = parseInt(m, 10)
  if (!mm || mm < 1 || mm > 12) return out
  out += '-' + String(mm).padStart(2, '0')
  const dd = parseInt(d, 10)
  if (!dd || dd < 1 || dd > 31) return out
  return out + '-' + String(dd).padStart(2, '0')
}

export function splitDate(p: PDate): { y: string; m: string; d: string } {
  const [y = '', m = '', d = ''] = (p || '').split('-')
  return { y, m: m.replace(/^0/, ''), d: d.replace(/^0/, '') }
}

/** dd/mm/yyyy, mm/yyyy or yyyy */
export function formatDate(p: PDate): string {
  if (!p) return ''
  const [y, m, d] = p.split('-')
  if (d) return `${d}/${m}/${y}`
  if (m) return `${m}/${y}`
  return y
}

export function yearOf(p: PDate): string {
  return p ? p.slice(0, 4).replace(/^0+/, '') : ''
}

/** Sortable key; missing month/day sort first within the year. */
export function dateKey(p: PDate): string {
  if (!p) return ''
  const [y, m = '00', d = '00'] = p.split('-')
  return `${y}-${m}-${d}`
}

/** -1 if a is earlier, 1 if later, 0 if unknown or equal. */
export function compareDates(a: PDate, b: PDate): number {
  if (!a || !b) return 0
  const ka = dateKey(a)
  const kb = dateKey(b)
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

/** Parses free text such as "12/3/1950", "3-1950", "1950" or "1950-03-12". */
export function parseLooseDate(s: string): PDate {
  const t = (s || '').trim()
  let m = t.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/)
  if (m) return makeDate(m[1], m[2] || '', m[3] || '')
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return makeDate(m[3], m[2], m[1])
  m = t.match(/^(\d{1,2})[/.-](\d{4})$/)
  if (m) return makeDate(m[2], m[1], '')
  m = t.match(/(\d{4})/)
  return m ? makeDate(m[1], '', '') : ''
}

export function lifeSpan(birth: PDate, death: PDate, deceased: boolean): string {
  const b = yearOf(birth)
  const d = yearOf(death)
  if (b && d) return `${b} – ${d}`
  if (b) return deceased ? `${b} – ?` : `s. ${b}`
  if (d) return `? – ${d}`
  return deceased ? 'Đã mất' : ''
}
