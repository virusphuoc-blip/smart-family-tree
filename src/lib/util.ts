export function nid(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return prefix + Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

export function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

/** Lowercase, strip Vietnamese diacritics; for name search and matching. */
export function fold(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function safeFileName(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gia-pha'
}
