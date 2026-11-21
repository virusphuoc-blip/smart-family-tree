import type { Person, Union } from '../types'
import { compareDates } from './dates'

export interface SpouseLink {
  id: string
  union: Union | null // null = implied by a shared child
  ended: boolean
}

export interface Graph {
  byId: Map<string, Person>
  children: Map<string, string[]>
  spouses: Map<string, SpouseLink[]>
}

export interface Relation {
  /** What the viewpoint person calls the other person. */
  term: string
  note: string
  /** Chain of member ids from the viewpoint person to the other person. */
  path: string[]
  kind: 'self' | 'blood' | 'spouse' | 'inlaw' | 'distant' | 'none'
}

export function buildGraph(people: Person[], unions: Union[]): Graph {
  const byId = new Map(people.map((p) => [p.id, p]))
  const children = new Map<string, string[]>()
  const spouses = new Map<string, SpouseLink[]>()
  const addSpouse = (a: string, b: string, union: Union | null) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return
    const list = spouses.get(a) ?? []
    if (list.some((s) => s.id === b)) return
    list.push({ id: b, union, ended: !!union?.divorced })
    spouses.set(a, list)
  }
  const sorted = [...unions].sort((x, y) => compareDates(x.startDate, y.startDate))
  for (const u of sorted) {
    addSpouse(u.a, u.b, u)
    addSpouse(u.b, u.a, u)
  }
  for (const p of people) {
    for (const pid of [p.fatherId, p.motherId]) {
      if (pid && byId.has(pid)) {
        const list = children.get(pid) ?? []
        list.push(p.id)
        children.set(pid, list)
      }
    }
    if (p.fatherId && p.motherId) {
      addSpouse(p.fatherId, p.motherId, null)
      addSpouse(p.motherId, p.fatherId, null)
    }
  }
  return { byId, children, spouses }
}

export function parentsOf(g: Graph, id: string): string[] {
  const p = g.byId.get(id)
  if (!p) return []
  return [p.fatherId, p.motherId].filter((x) => x && g.byId.has(x))
}

/** 1 if x is senior (older) than y, -1 if junior, 0 if unknown. */
export function seniority(g: Graph, x: string, y: string): number {
  const a = g.byId.get(x)
  const b = g.byId.get(y)
  if (!a || !b) return 0
  const c = compareDates(a.birthDate, b.birthDate)
  if (c !== 0) return -c
  if (a.birthOrder > 0 && b.birthOrder > 0 && a.birthOrder !== b.birthOrder) {
    return a.birthOrder < b.birthOrder ? 1 : -1
  }
  return 0
}

/** Shortest upward path from id to every ancestor (including id itself). */
function ancestorPaths(g: Graph, id: string): Map<string, string[]> {
  const out = new Map<string, string[]>([[id, [id]]])
  let frontier = [id]
  while (frontier.length) {
    const next: string[] = []
    for (const cur of frontier) {
      for (const par of parentsOf(g, cur)) {
        if (!out.has(par)) {
          out.set(par, [...out.get(cur)!, par])
          next.push(par)
        }
      }
    }
    frontier = next
  }
  return out
}

interface BloodLink {
  /** ego, parent, ..., common ancestor */
  up: string[]
  /** other, parent, ..., common ancestor */
  down: string[]
}

function bloodLink(g: Graph, ego: string, other: string): BloodLink | null {
  const ea = ancestorPaths(g, ego)
  const oa = ancestorPaths(g, other)
  let best: BloodLink | null = null
  for (const [anc, up] of ea) {
    const down = oa.get(anc)
    if (!down) continue
    const better =
      !best ||
      up.length + down.length < best.up.length + best.down.length ||
      (up.length + down.length === best.up.length + best.down.length && up.length < best.up.length)
    if (better) best = { up, down }
  }
  return best
}

const isF = (g: Graph, id: string) => g.byId.get(id)?.gender === 'female'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

interface Term {
  term: string
  note: string
}
const T = (term: string, note = ''): Term => ({ term, note })

function siblingNote(g: Graph, a: string, b: string): string {
  const x = g.byId.get(a)!
  const y = g.byId.get(b)!
  const fa = x.fatherId && y.fatherId ? x.fatherId === y.fatherId : null
  const mo = x.motherId && y.motherId ? x.motherId === y.motherId : null
  if (fa === true && mo === false) return 'cùng cha khác mẹ'
  if (mo === true && fa === false) return 'cùng mẹ khác cha'
  return ''
}

/** Vietnamese term for a blood relative, from ego's point of view. */
function bloodTerm(g: Graph, link: BloodLink): Term {
  const a = link.up.length - 1
  const b = link.down.length - 1
  const ego = link.up[0]
  const x = link.down[0]
  const f = isF(g, x)
  const egoP = g.byId.get(ego)!
  // side of the family: through father = nội, through mother = ngoại
  const viaFather = a >= 1 && link.up[1] === egoP.fatherId
  const side = viaFather ? 'nội' : 'ngoại'
  const sideNote = viaFather ? 'bên nội' : 'bên ngoại'

  if (b === 0) {
    if (a === 1) return T(x === egoP.fatherId ? 'Cha' : x === egoP.motherId ? 'Mẹ' : f ? 'Mẹ' : 'Cha')
    if (a === 2) return T(`${f ? 'Bà' : 'Ông'} ${side}`)
    if (a === 3) return T(`${f ? 'Cụ bà' : 'Cụ ông'} ${side}`)
    if (a === 4) return T(f ? 'Kỵ bà' : 'Kỵ ông', sideNote)
    return T('Tổ tiên', `${a} đời trước, ${sideNote}`)
  }
  if (a === 0) {
    if (b === 1) return T(f ? 'Con gái' : 'Con trai')
    const viaSon = !isF(g, link.down[b - 1])
    const gNote = f ? 'cháu gái' : 'cháu trai'
    if (b === 2) return T(viaSon ? 'Cháu nội' : 'Cháu ngoại', gNote)
    if (b === 3) return T('Chắt', f ? 'chắt gái' : 'chắt trai')
    if (b === 4) return T('Chút', f ? 'chút gái' : 'chút trai')
    return T('Hậu duệ', `${b} đời sau`)
  }
  // The two children of the common ancestor that start each branch.
  const egoBranch = link.up[a - 1]
  const xBranch = link.down[b - 1]
  const sen = seniority(g, xBranch, egoBranch)

  if (a === 1 && b === 1) {
    const note = siblingNote(g, ego, x)
    if (sen > 0) return T(f ? 'Chị gái' : 'Anh trai', note)
    if (sen < 0) return T(f ? 'Em gái' : 'Em trai', note)
    return T(f ? 'Chị/Em gái' : 'Anh/Em trai', note)
  }
  if (a === 2 && b === 1) {
    // sibling of ego's parent
    if (viaFather) {
      if (f) return T('Cô', 'chị/em gái của cha')
      if (sen > 0) return T('Bác', 'anh trai của cha')
      if (sen < 0) return T('Chú', 'em trai của cha')
      return T('Bác/Chú', 'anh/em trai của cha')
    }
    return f ? T('Dì', 'chị/em gái của mẹ') : T('Cậu', 'anh/em trai của mẹ')
  }
  if (a === 3 && b === 1) {
    // sibling of a grandparent
    const gp = link.up[2]
    if (!isF(g, gp)) {
      if (f) return T('Bà cô', `chị/em gái của ông ${side}`)
      if (sen > 0) return T('Ông bác', `anh trai của ông ${side}`)
      if (sen < 0) return T('Ông chú', `em trai của ông ${side}`)
      return T('Ông bác/Ông chú', `anh/em trai của ông ${side}`)
    }
    return f ? T('Bà dì', `chị/em gái của bà ${side}`) : T('Ông cậu', `anh/em trai của bà ${side}`)
  }
  if (a === b) {
    // cousins: rank follows the seniority of the branches, not the cousins' own ages
    let s = sen
    if (s === 0) s = seniority(g, x, ego)
    const note = a === 2 ? `anh chị em họ ${sideNote}` : `anh chị em họ đời thứ ${a}, ${sideNote}`
    if (a > 3) return T('Anh chị em họ xa', note)
    if (s > 0) return T(f ? 'Chị họ' : 'Anh họ', note)
    if (s < 0) return T('Em họ', `${f ? 'em gái' : 'em trai'} họ, ${sideNote}`)
    return T(f ? 'Chị/Em họ' : 'Anh/Em họ', note)
  }
  if (a === 3 && b === 2) {
    // first cousin of ego's parent
    if (viaFather) {
      if (f) return T('Cô họ', 'chị/em họ của cha')
      if (sen > 0) return T('Bác họ', 'anh họ của cha')
      if (sen < 0) return T('Chú họ', 'em họ của cha')
      return T('Bác/Chú họ', 'anh/em họ của cha')
    }
    return f ? T('Dì họ', 'chị/em họ của mẹ') : T('Cậu họ', 'anh/em họ của mẹ')
  }
  if (a === 1 && b === 2) return T(f ? 'Cháu gái' : 'Cháu trai', 'con của anh/chị/em ruột')
  if (a === 1 && b === 3) return T('Cháu', 'cháu nội/ngoại của anh/chị/em ruột')
  if (a === 2 && b === 3) return T('Cháu họ', 'con của anh/chị/em họ')
  return T('Họ hàng', `cùng tổ tiên, cách ${a} và ${b} đời`)
}

/** Term for X, the spouse of ego's blood relative R. */
function spouseOfRelativeTerm(g: Graph, link: BloodLink, rTerm: Term, x: string, ended: boolean): Term {
  const a = link.up.length - 1
  const b = link.down.length - 1
  const f = isF(g, x)
  const generic = T(`${f ? 'Vợ' : 'Chồng'}${ended ? ' cũ' : ''} của ${low(rTerm.term)}`)
  if (ended) return generic
  const t = rTerm.term
  if (b === 0 && a === 1) return T(f ? 'Mẹ kế' : 'Cha dượng', `${f ? 'vợ' : 'chồng'} của ${low(t)}`)
  if (a === 0) {
    if (b === 1) return T(f ? 'Con dâu' : 'Con rể')
    if (b <= 4) return T(`${['', '', 'Cháu', 'Chắt', 'Chút'][b]} ${f ? 'dâu' : 'rể'}`)
    return generic
  }
  if (a === 1 && b === 1) {
    if (t.startsWith('Anh/') || t.startsWith('Chị/')) return T(f ? 'Chị/Em dâu' : 'Anh/Em rể')
    const senior = t.startsWith('Anh') || t.startsWith('Chị')
    return T(f ? (senior ? 'Chị dâu' : 'Em dâu') : senior ? 'Anh rể' : 'Em rể')
  }
  const map: Record<string, string> = {
    Bác: f ? 'Bác gái' : 'Bác trai',
    Chú: 'Thím',
    'Bác/Chú': 'Bác gái/Thím',
    Cô: 'Dượng',
    Cậu: 'Mợ',
    Dì: 'Dượng',
    'Ông bác': 'Bà bác',
    'Ông chú': 'Bà thím',
    'Bà cô': 'Ông dượng',
    'Ông cậu': 'Bà mợ',
    'Bà dì': 'Ông dượng',
    'Anh họ': 'Chị dâu họ',
    'Chị họ': 'Anh rể họ',
    'Em họ': f ? 'Em dâu họ' : 'Em rể họ',
    'Bác họ': 'Bác gái họ',
    'Chú họ': 'Thím họ',
    'Cô họ': 'Dượng họ',
    'Cậu họ': 'Mợ họ',
    'Dì họ': 'Dượng họ',
    'Cháu trai': 'Cháu dâu',
    'Cháu gái': 'Cháu rể',
    'Cháu họ': f ? 'Cháu dâu họ' : 'Cháu rể họ',
  }
  if (map[t]) return T(map[t], `${f ? 'vợ' : 'chồng'} của ${low(t)}`)
  return generic
}

/** Term for X, a blood relative of ego's spouse. `sp` is "vợ" or "chồng". */
function relativeOfSpouseTerm(link: BloodLink, sTerm: Term, sp: string): Term {
  const a = link.up.length - 1
  const b = link.down.length - 1
  const t = sTerm.term
  if (a === 1 && b === 0) return T(`${t} ${sp}`)
  if (a === 0 && b === 1) return T(`Con riêng của ${sp}`, low(t))
  if (a === 1 && b === 1) {
    const head = t.startsWith('Anh/') ? 'Anh/Em' : t.startsWith('Chị/') ? 'Chị/Em' : t.split(' ')[0]
    return T(`${head} ${sp}`, low(t) + ` của ${sp}`)
  }
  if (a > b || a === b) return T(`${t} ${sp}`, `${low(t)} của ${sp}`)
  return T(t, `bên ${sp}`)
}

function closestSpouseLink(g: Graph, ego: string, x: string): { r: string; link: BloodLink; ended: boolean } | null {
  let best: { r: string; link: BloodLink; ended: boolean } | null = null
  for (const s of g.spouses.get(x) ?? []) {
    if (s.id === ego) continue
    const link = bloodLink(g, ego, s.id)
    if (!link) continue
    const size = link.up.length + link.down.length
    if (!best || size < best.link.up.length + best.link.down.length) best = { r: s.id, link, ended: s.ended }
  }
  return best
}

const pathOf = (link: BloodLink) => [...link.up, ...link.down.slice(0, -1).reverse()]

/** Breadth-first search over parent, child and spouse links. */
function anyPath(g: Graph, from: string, to: string): string[] | null {
  const prev = new Map<string, string>([[from, '']])
  let frontier = [from]
  while (frontier.length) {
    const next: string[] = []
    for (const cur of frontier) {
      const neighbours = [
        ...parentsOf(g, cur),
        ...(g.children.get(cur) ?? []),
        ...(g.spouses.get(cur) ?? []).map((s) => s.id),
      ]
      for (const n of neighbours) {
        if (prev.has(n)) continue
        prev.set(n, cur)
        if (n === to) {
          const path = [to]
          let c = cur
          while (c) {
            path.unshift(c)
            c = prev.get(c)!
          }
          return path
        }
        next.push(n)
      }
    }
    frontier = next
  }
  return null
}

/** How `egoId` addresses `otherId`. */
export function relationOf(g: Graph, egoId: string, otherId: string): Relation {
  const R = (t: Term, path: string[], kind: Relation['kind']): Relation => ({ ...t, term: cap(t.term), path, kind })
  if (!g.byId.has(egoId) || !g.byId.has(otherId)) return R(T('Không rõ'), [], 'none')
  if (egoId === otherId) return R(T('Bản thân'), [egoId], 'self')

  const blood = bloodLink(g, egoId, otherId)
  if (blood) return R(bloodTerm(g, blood), pathOf(blood), 'blood')

  const f = isF(g, otherId)
  const direct = (g.spouses.get(egoId) ?? []).find((s) => s.id === otherId)
  if (direct) return R(T(`${f ? 'Vợ' : 'Chồng'}${direct.ended ? ' cũ' : ''}`), [egoId, otherId], 'spouse')

  // spouse of a blood relative
  const viaRel = closestSpouseLink(g, egoId, otherId)
  if (viaRel) {
    const rTerm = bloodTerm(g, viaRel.link)
    return R(spouseOfRelativeTerm(g, viaRel.link, rTerm, otherId, viaRel.ended), [...pathOf(viaRel.link), otherId], 'inlaw')
  }

  const mySpouses = (g.spouses.get(egoId) ?? []).filter((s) => !s.ended)
  // blood relative of ego's spouse
  for (const s of mySpouses) {
    const link = bloodLink(g, s.id, otherId)
    if (!link) continue
    const sp = isF(g, s.id) ? 'vợ' : 'chồng'
    return R(relativeOfSpouseTerm(link, bloodTerm(g, link), sp), [egoId, ...pathOf(link)], 'inlaw')
  }
  // parents of a child's spouse
  for (const c of g.children.get(egoId) ?? []) {
    for (const cs of g.spouses.get(c) ?? []) {
      if (parentsOf(g, cs.id).includes(otherId)) {
        return R(T(f ? 'Bà thông gia' : 'Ông thông gia', `${f ? 'mẹ' : 'cha'} của con ${isF(g, cs.id) ? 'dâu' : 'rể'}`), [egoId, c, cs.id, otherId], 'inlaw')
      }
    }
  }
  // spouse of a blood relative of ego's spouse
  for (const s of mySpouses) {
    const via = closestSpouseLink(g, s.id, otherId)
    if (!via) continue
    const sp = isF(g, s.id) ? 'vợ' : 'chồng'
    const a = via.link.up.length - 1
    const b = via.link.down.length - 1
    const path = [egoId, ...pathOf(via.link), otherId]
    if (a === 1 && b === 1 && !via.ended) {
      if (!isF(g, egoId) && !f) return R(T('Anh em cọc chèo', 'chồng của chị/em vợ'), path, 'inlaw')
      if (isF(g, egoId) && f) return R(T('Chị em bạn dâu', 'vợ của anh/em chồng'), path, 'inlaw')
    }
    const t = spouseOfRelativeTerm(g, via.link, bloodTerm(g, via.link), otherId, via.ended)
    return R(T(t.term, `bên ${sp}`), path, 'inlaw')
  }

  const path = anyPath(g, egoId, otherId)
  if (path) return R(T('Họ hàng', 'quan hệ xa qua hôn nhân'), path, 'distant')
  return R(T('Không có quan hệ', 'chưa có liên kết trong cây'), [], 'none')
}

/** Human readable description of each step in a relation path. */
export function describePath(g: Graph, path: string[]): string[] {
  const out: string[] = []
  for (let i = 1; i < path.length; i++) {
    const prev = g.byId.get(path[i - 1])!
    const cur = g.byId.get(path[i])!
    let step: string
    if (cur.id === prev.fatherId) step = 'cha'
    else if (cur.id === prev.motherId) step = 'mẹ'
    else if (cur.fatherId === prev.id || cur.motherId === prev.id) step = cur.gender === 'female' ? 'con gái' : 'con trai'
    else step = cur.gender === 'female' ? 'vợ' : 'chồng'
    out.push(`${step} ${cur.fullName}`)
  }
  return out
}

export interface RelativeEntry {
  person: Person
  relation: Relation
}

const KIND_ORDER: Record<Relation['kind'], number> = { self: 0, blood: 1, spouse: 2, inlaw: 3, distant: 4, none: 5 }

/** Everyone related to ego, nearest first. */
export function relativesOf(g: Graph, egoId: string): RelativeEntry[] {
  const out: RelativeEntry[] = []
  for (const p of g.byId.values()) {
    if (p.id === egoId) continue
    const relation = relationOf(g, egoId, p.id)
    if (relation.kind !== 'none') out.push({ person: p, relation })
  }
  return out.sort(
    (x, y) =>
      x.relation.path.length - y.relation.path.length ||
      KIND_ORDER[x.relation.kind] - KIND_ORDER[y.relation.kind] ||
      x.person.fullName.localeCompare(y.person.fullName, 'vi'),
  )
}
