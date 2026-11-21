import type { Gender, LifeEvent, PDate, Person, Union } from '../types'
import { emptyPerson } from '../types'
import { parseLooseDate } from './dates'
import { fold, nid } from './util'

/** One person found in the document, waiting for the user's review. */
export interface DraftPerson {
  key: string
  include: boolean
  fullName: string
  gender: Gender
  birthDate: PDate
  deathDate: PDate
  deceased: boolean
  birthPlace: string
  occupation: string
  note: string
  fatherKey: string
  motherKey: string
  spouseKeys: string[]
  /** id of an existing member with the same name ('' = create a new member) */
  matchId: string
}

export interface LlmSettings {
  provider: 'gemini' | 'openai'
  apiKey: string
  model: string
  /** base URL for OpenAI-compatible providers (Groq, OpenRouter, a local server…) */
  baseUrl: string
}

const LS_KEY = 'gpt.llm'
export const DEFAULT_LLM: LlmSettings = { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', baseUrl: 'https://api.groq.com/openai/v1' }

/** The key is kept in this browser only (localStorage); it is never sent anywhere except the chosen LLM provider. */
export function loadLlmSettings(): LlmSettings {
  try {
    return { ...DEFAULT_LLM, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }
  } catch {
    return { ...DEFAULT_LLM }
  }
}
export function saveLlmSettings(s: LlmSettings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

export async function docxToText(file: Blob): Promise<string> {
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value.replace(/\n{3,}/g, '\n\n').trim()
}

function blank(key: string, fullName: string): DraftPerson {
  return { key, include: true, fullName, gender: 'other', birthDate: '', deathDate: '', deceased: false, birthPlace: '', occupation: '', note: '', fatherKey: '', motherKey: '', spouseKeys: [], matchId: '' }
}

export function guessGender(name: string): Gender {
  const f = ` ${fold(name)} `
  if (/ thi /.test(f)) return 'female'
  if (/ (van|duc|huu|dinh|ba|cong|quang|xuan) /.test(f)) return 'male'
  return 'other'
}

// ---------- LLM extraction ----------

const PROMPT = `Bạn là trợ lý trích xuất gia phả. Đọc văn bản gia phả tiếng Việt bên dưới và trả về DUY NHẤT một đối tượng JSON theo mẫu:
{"people":[{"id":"p1","fullName":"Họ và tên đầy đủ","gender":"male|female|other","birthDate":"YYYY hoặc YYYY-MM-DD hoặc rỗng","deathDate":"YYYY hoặc YYYY-MM-DD hoặc rỗng","deceased":true|false,"birthPlace":"","occupation":"","note":"","fatherId":"id hoặc rỗng","motherId":"id hoặc rỗng","spouseIds":["id"]}]}
Quy tắc: mỗi người chỉ xuất hiện một lần; không bịa thông tin không có trong văn bản; fatherId/motherId/spouseIds phải trỏ tới id trong danh sách; bỏ danh xưng (ông, bà, cụ…) khỏi fullName.

VĂN BẢN:
`

interface LlmPerson {
  id?: string
  fullName?: string
  gender?: string
  birthDate?: string
  deathDate?: string
  deceased?: boolean
  birthPlace?: string
  occupation?: string
  note?: string
  fatherId?: string
  motherId?: string
  spouseIds?: string[]
}

/** Turns the model's JSON answer into review drafts. Exported for tests. */
export function draftsFromLlmJson(raw: string): DraftPerson[] {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('AI trả về dữ liệu không đúng định dạng. Hãy thử lại hoặc dùng chế độ nhận dạng theo mẫu.')
  let parsed: { people?: LlmPerson[] }
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('AI trả về dữ liệu không đúng định dạng. Hãy thử lại hoặc dùng chế độ nhận dạng theo mẫu.')
  }
  const list = Array.isArray(parsed.people) ? parsed.people : []
  const keyOf = new Map<string, string>()
  list.forEach((p, i) => keyOf.set(String(p.id ?? i), `k${i}`))
  const ref = (id?: string) => (id ? (keyOf.get(String(id)) ?? '') : '')
  const drafts = list
    .filter((p) => (p.fullName ?? '').trim())
    .map((p, i): DraftPerson => {
      const name = String(p.fullName).trim()
      const g = p.gender === 'male' || p.gender === 'female' ? p.gender : guessGender(name)
      const death = parseLooseDate(String(p.deathDate ?? ''))
      return {
        ...blank(keyOf.get(String(p.id ?? i)) ?? `k${i}`, name),
        gender: g,
        birthDate: parseLooseDate(String(p.birthDate ?? '')),
        deathDate: death,
        deceased: !!p.deceased || !!death,
        birthPlace: String(p.birthPlace ?? ''),
        occupation: String(p.occupation ?? ''),
        note: String(p.note ?? ''),
        fatherKey: ref(p.fatherId),
        motherKey: ref(p.motherId),
        spouseKeys: (Array.isArray(p.spouseIds) ? p.spouseIds : []).map(ref).filter(Boolean),
      }
    })
  const keys = new Set(drafts.map((d) => d.key))
  for (const d of drafts) {
    if (!keys.has(d.fatherKey) || d.fatherKey === d.key) d.fatherKey = ''
    if (!keys.has(d.motherKey) || d.motherKey === d.key) d.motherKey = ''
    d.spouseKeys = d.spouseKeys.filter((k) => keys.has(k) && k !== d.key)
  }
  return drafts
}

export async function extractWithLlm(text: string, s: LlmSettings): Promise<DraftPerson[]> {
  const prompt = PROMPT + text.slice(0, 60000)
  let answer = ''
  if (s.provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
    })
    if (!res.ok) throw new Error(await llmError(res))
    const json = await res.json()
    answer = (json.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  } else {
    const res = await fetch(`${s.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
      body: JSON.stringify({ model: s.model, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) throw new Error(await llmError(res))
    const json = await res.json()
    answer = json.choices?.[0]?.message?.content ?? ''
  }
  return draftsFromLlmJson(answer)
}

async function llmError(res: Response): Promise<string> {
  let detail = ''
  try {
    const j = await res.json()
    detail = j.error?.message ?? ''
  } catch {
    /* ignore */
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) return `Khóa API hoặc tên mô hình không hợp lệ (${res.status}). ${detail}`
  if (res.status === 429) return 'Đã vượt giới hạn miễn phí của nhà cung cấp AI. Hãy thử lại sau ít phút.'
  return `Dịch vụ AI báo lỗi ${res.status}. ${detail}`
}

// ---------- Pattern-based fallback (no key needed) ----------

const NAME = String.raw`\p{Lu}[\p{Ll}\p{M}]+(?:[ \t]+\p{Lu}[\p{Ll}\p{M}]+){1,5}`
/** alternatives that also match with a capitalised first letter (the name pattern is case-sensitive) */
const ci = (...alts: string[]) => alts.map((a) => `[${a[0]}${a[0].toUpperCase()}]${a.slice(1)}`).join('|')
const HON = `(?:${ci('cụ ông', 'cụ bà', 'ông', 'bà', 'cụ', 'anh', 'chị', 'cô', 'chú', 'bác', 'em')})`
const MALE_HON = /^(cụ ông|ông|anh|chú)$/i
const FEMALE_HON = /^(cụ bà|bà|chị|cô)$/i
const STOP = new Set(['gia pha', 'viet nam', 'ha noi', 'gia dinh', 'dong ho', 'the he', 'doi thu'])

/**
 * Finds people and relationships from common Vietnamese genealogy phrasing:
 * "Ông A (1920 - 1995)", "sinh năm", "mất năm", "vợ là bà B", "con của ông A và bà B", "sinh được 3 người con: X, Y, Z".
 */
export function extractByPatterns(text: string): DraftPerson[] {
  const drafts: DraftPerson[] = []
  const byName = new Map<string, DraftPerson>()
  const person = (rawName: string, hon = ''): DraftPerson | null => {
    const name = rawName.trim().replace(/\s+/g, ' ')
    const f = fold(name)
    if (STOP.has(f) || name.split(' ').length < 2) return null
    let d = byName.get(f)
    if (!d) {
      d = blank(`k${drafts.length}`, name)
      d.gender = guessGender(name)
      byName.set(f, d)
      drafts.push(d)
    }
    if (MALE_HON.test(hon)) d.gender = 'male'
    else if (FEMALE_HON.test(hon)) d.gender = 'female'
    return d
  }
  const marry = (a: DraftPerson, b: DraftPerson) => {
    if (a === b) return
    if (!a.spouseKeys.includes(b.key)) a.spouseKeys.push(b.key)
    if (!b.spouseKeys.includes(a.key)) b.spouseKeys.push(a.key)
    if (a.gender === 'other' && b.gender !== 'other') a.gender = b.gender === 'male' ? 'female' : 'male'
    if (b.gender === 'other' && a.gender !== 'other') b.gender = a.gender === 'male' ? 'female' : 'male'
  }
  const setParent = (child: DraftPerson, parent: DraftPerson) => {
    if (child === parent) return
    if (parent.gender === 'female') child.motherKey ||= parent.key
    else child.fatherKey ||= parent.key
  }
  const named = (s: string) => [...s.matchAll(new RegExp(String.raw`(?:(${HON})\s+)?(${NAME})`, 'gu'))].map((m) => ({ hon: m[1] ?? '', name: m[2], index: m.index }))

  const sentences = text
    .split(/\n+|(?<=[.;!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  let subject: DraftPerson | null = null
  let lastSpouse: DraftPerson | null = null

  for (const s of sentences) {
    const mentions = named(s)
    // a sentence that opens with a name starts a new subject; otherwise it continues the previous one
    if (mentions.length && s.slice(0, mentions[0].index).trim() === '') {
      const first = person(mentions[0].name, mentions[0].hon)
      if (first) {
        subject = first
        lastSpouse = null
      }
    }
    if (!subject) continue
    const subj: DraftPerson = subject

    // life span right after a name: "A (1920 - 1995)" or "A (1920 - nay)"
    for (const m of s.matchAll(new RegExp(String.raw`(${NAME})\s*\(\s*(\d{4})\s*[-–—]\s*(\d{4}|nay)?\s*\)`, 'gu'))) {
      const who = person(m[1])
      if (!who) continue
      who.birthDate ||= m[2]
      if (m[3] && m[3] !== 'nay') {
        who.deathDate ||= m[3]
        who.deceased = true
      }
    }
    const born = s.match(/sinh\s+(?:vào\s+)?(?:ngày\s+)?(\d{1,2}[/-]\d{1,2}[/-]\d{4})/iu) ?? s.match(/sinh\s+(?:vào\s+)?năm\s+(\d{4})/iu)
    if (born) subj.birthDate ||= parseLooseDate(born[1])
    const died = s.match(/(?:mất|qua đời|tạ thế|từ trần|hy sinh)\s+(?:vào\s+)?(?:ngày\s+)?(\d{1,2}[/-]\d{1,2}[/-]\d{4})/iu) ?? s.match(/(?:mất|qua đời|tạ thế|từ trần|hy sinh)\s+(?:vào\s+)?năm\s+(\d{4})/iu)
    if (died) {
      subj.deathDate ||= parseLooseDate(died[1])
      subj.deceased = true
    }
    const place = s.match(/(?:quê quán|quê ở|quê|sinh tại|sinh ra tại)\s*:?\s+((?:\p{Lu}[\p{L}\p{M}]*)(?:[ ,]+\p{Lu}[\p{L}\p{M}]*){0,5})/u)
    if (place) subj.birthPlace ||= place[1].trim()
    const job = s.match(/(?:làm nghề|nghề nghiệp|làm|là)\s*:?\s+((?:nông dân|giáo viên|bác sĩ|kỹ sư|thợ [\p{L}]+|công nhân|bộ đội|buôn bán|thầy đồ|thầy thuốc|kế toán|kiến trúc sư|y tá|công chức|lập trình viên|nội trợ|sinh viên|học sinh)[\p{L} ]{0,20}?)(?=[,.;]|$)/iu)
    if (job) subj.occupation ||= job[1].trim()

    // spouses
    for (const m of s.matchAll(new RegExp(String.raw`(?:(?:${ci('vợ')})(?: cả| hai| ba| kế)?|${ci('chồng', 'phu nhân')})(?:\s+(?:là|tên|tên là))?\s*:?\s+(?:(${HON})\s+)?(${NAME})`, 'gu'))) {
      const sp = person(m[2], m[1] ?? '')
      if (!sp) continue
      if (sp.gender === 'other') sp.gender = /^chồng/iu.test(m[0]) ? 'male' : 'female'
      marry(subj, sp)
      lastSpouse = sp
    }
    for (const m of s.matchAll(new RegExp(String.raw`(?:${ci('kết hôn', 'thành hôn', 'lập gia đình', 'cưới', 'lấy')})(?:\s+(?:với|vợ là|chồng là|vợ|chồng))?\s+(?:(${HON})\s+)?(${NAME})`, 'gu'))) {
      const sp = person(m[2], m[1] ?? '')
      if (!sp) continue
      marry(subj, sp)
      lastSpouse = sp
    }

    // parents: "con (trai/gái…) của ông A và bà B"
    const par = s.match(new RegExp(String.raw`[cC]on(?:\s+(?:trai|gái|cả|trưởng|út|thứ\s+\p{L}+|đầu|duy nhất))*\s+của\s+(?:(${HON})\s+)?(${NAME})(?:\s+(?:và|với)\s+(?:(${HON})\s+)?(${NAME}))?`, 'u'))
    if (par) {
      const p1 = person(par[2], par[1] ?? '')
      const p2 = par[4] ? person(par[4], par[3] ?? '') : null
      if (p1) setParent(subj, p1)
      if (p2) setParent(subj, p2)
      if (p1 && p2) marry(p1, p2)
      if (/con\s+gái/iu.test(par[0]) && subj.gender === 'other') subj.gender = 'female'
      if (/con\s+trai/iu.test(par[0]) && subj.gender === 'other') subj.gender = 'male'
    }
    for (const m of s.matchAll(new RegExp(String.raw`(${ci('cha', 'bố', 'thân phụ', 'mẹ', 'thân mẫu')})(?:\s+(?:là|tên|tên là))?\s*:?\s+(?:(${HON})\s+)?(${NAME})`, 'gu'))) {
      const p = person(m[3], m[2] ?? '')
      if (!p) continue
      if (p.gender === 'other') p.gender = /^(mẹ|thân mẫu)/iu.test(m[1]) ? 'female' : 'male'
      setParent(subj, p)
    }

    // children list: "sinh được 3 người con: A, B và C" / "Các con: …" / "có hai con là …"
    const kids = s.match(/(?:người con|các con|con cái|sinh (?:được|ra|hạ)|có\s+[\p{L}\d]+\s+con|con)(?:\s+(?:trai|gái))?(?:\s+(?:là|gồm|gồm có|tên là))?\s*[:：]\s*(.+)$/iu) ?? s.match(/(?:người con|các con|con cái|có\s+[\p{L}\d]+\s+con)(?:\s+(?:trai|gái))?\s+(?:là|gồm|gồm có)\s+(.+)$/iu)
    if (kids && !par) {
      const other = lastSpouse ?? (subj.spouseKeys.length === 1 ? drafts.find((d) => d.key === subj.spouseKeys[0])! : null)
      for (const k of named(kids[1])) {
        const child = person(k.name, k.hon)
        if (!child || child === subj || child === other) continue
        setParent(child, subj)
        if (other) setParent(child, other)
      }
    }
  }
  return drafts
}

/** Marks drafts whose name matches an existing member, so the import links instead of duplicating. */
export function matchExisting(drafts: DraftPerson[], people: Person[]): DraftPerson[] {
  const byName = new Map<string, Person[]>()
  for (const p of people) byName.set(fold(p.fullName), [...(byName.get(fold(p.fullName)) ?? []), p])
  return drafts.map((d) => {
    const found = byName.get(fold(d.fullName)) ?? []
    const hit = found.find((p) => !d.birthDate || !p.birthDate || p.birthDate.slice(0, 4) === d.birthDate.slice(0, 4))
    return { ...d, matchId: hit?.id ?? '' }
  })
}

/** Builds the records to write from the reviewed drafts. */
export function buildImport(drafts: DraftPerson[], people: Person[], unions: Union[]): { people: Person[]; unions: Union[]; events: LifeEvent[] } {
  const chosen = drafts.filter((d) => d.include && d.fullName.trim())
  const existing = new Map(people.map((p) => [p.id, p]))
  const idOf = new Map<string, string>()
  for (const d of chosen) idOf.set(d.key, d.matchId && existing.has(d.matchId) ? d.matchId : nid())
  const out = new Map<string, Person>()
  for (const d of chosen) {
    const id = idOf.get(d.key)!
    const base = existing.get(id)
    const fatherId = idOf.get(d.fatherKey) ?? ''
    const motherId = idOf.get(d.motherKey) ?? ''
    if (base) {
      // existing member: only fill in what is missing
      const next: Person = {
        ...base,
        birthDate: base.birthDate || d.birthDate,
        deathDate: base.deathDate || d.deathDate,
        deceased: base.deceased || d.deceased,
        birthPlace: base.birthPlace || d.birthPlace,
        occupation: base.occupation || d.occupation,
        fatherId: base.fatherId || fatherId,
        motherId: base.motherId || motherId,
        updatedAt: Date.now(),
      }
      if (JSON.stringify({ ...next, updatedAt: 0 }) !== JSON.stringify({ ...base, updatedAt: 0 })) out.set(id, next)
    } else {
      out.set(id, {
        ...emptyPerson(id),
        fullName: d.fullName.trim(),
        gender: d.gender,
        birthDate: d.birthDate,
        deathDate: d.deathDate,
        deceased: d.deceased || !!d.deathDate,
        birthPlace: d.birthPlace,
        occupation: d.occupation,
        bio: d.note,
        fatherId,
        motherId,
      })
    }
  }
  const pairKey = (a: string, b: string) => [a, b].sort().join('|')
  const have = new Set(unions.map((u) => pairKey(u.a, u.b)))
  const newUnions: Union[] = []
  for (const d of chosen) {
    for (const k of d.spouseKeys) {
      const a = idOf.get(d.key)!
      const b = idOf.get(k)
      if (!b || a === b || have.has(pairKey(a, b))) continue
      have.add(pairKey(a, b))
      newUnions.push({ id: nid(), a, b, startDate: '', endDate: '', divorced: false, note: '' })
    }
  }
  return { people: [...out.values()], unions: newUnions, events: [] }
}
