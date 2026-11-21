import type { Person, Union } from '../types'
import { buildGraph, parentsOf, type Graph } from './kinship'
import { compareDates } from './dates'

export const CARD_W = 150
export const CARD_H = 72
export const GAP_X = 28
export const GAP_SPOUSE = 14
export const ROW_H = 164

export interface NodePos {
  id: string
  x: number
  y: number
  /** id of the group head (the member whose descent line this card sits on) */
  group: string
}

export interface Edge {
  kind: 'child' | 'spouse' | 'cross'
  /** member ids the edge touches; used for highlighting */
  ids: string[]
  /** SVG path */
  d: string
}

export interface Toggle {
  group: string
  x: number
  y: number
  collapsed: boolean
  hiddenCount: number
}

export interface Layout {
  nodes: NodePos[]
  edges: Edge[]
  toggles: Toggle[]
  width: number
  height: number
  generations: number
}

interface Group {
  head: string
  /** left-to-right order of cards */
  members: string[]
  children: Group[]
  hiddenCount: number
  width: number
  gen: number
}

function sortSiblings(g: Graph, ids: string[]): string[] {
  return [...ids].sort((x, y) => {
    const a = g.byId.get(x)!
    const b = g.byId.get(y)!
    if (a.birthOrder > 0 && b.birthOrder > 0 && a.birthOrder !== b.birthOrder) return a.birthOrder - b.birthOrder
    return compareDates(a.birthDate, b.birthDate) || a.createdAt - b.createdAt
  })
}

/** Generation index: children sit one row below their parents, spouses share a row. */
function generations(g: Graph): Map<string, number> {
  const gen = new Map<string, number>()
  for (const id of g.byId.keys()) gen.set(id, 0)
  for (let pass = 0; pass < g.byId.size + 2; pass++) {
    let changed = false
    for (const id of g.byId.keys()) {
      let v = gen.get(id)!
      for (const par of parentsOf(g, id)) v = Math.max(v, gen.get(par)! + 1)
      for (const s of g.spouses.get(id) ?? []) v = Math.max(v, gen.get(s.id)!)
      if (v !== gen.get(id)) {
        gen.set(id, Math.min(v, g.byId.size))
        changed = true
      }
    }
    if (!changed) break
  }
  return gen
}

export function computeLayout(people: Person[], unions: Union[], collapsed: Set<string>): Layout {
  const g = buildGraph(people, unions)
  const gen = generations(g)
  const hasParents = (id: string) => parentsOf(g, id).length > 0

  // 1. Put married-in spouses next to their partner.
  const host = new Map<string, string>() // spouse -> head
  const guests = new Map<string, string[]>() // head -> spouses
  const ordered = sortSiblings(g, [...g.byId.keys()]).sort((a, b) => gen.get(a)! - gen.get(b)!)
  const seenPairs = new Set<string>()
  for (const id of ordered) {
    for (const s of g.spouses.get(id) ?? []) {
      const a = id
      const b = s.id
      const pair = [a, b].sort().join('|')
      if (seenPairs.has(pair)) continue
      seenPairs.add(pair)
      if (host.get(a) === b || host.get(b) === a) continue
      const male = (x: string) => g.byId.get(x)!.gender === 'male'
      // prefer the partner with parents in the tree as head; ties go to the husband
      const score = (x: string) => (hasParents(x) ? 2 : 0) + (male(x) ? 1 : 0) + (guests.has(x) ? 4 : 0) - (host.has(x) ? 8 : 0)
      let head = score(a) >= score(b) ? a : b
      let guest = head === a ? b : a
      if (host.has(head) || host.has(guest) || guests.has(guest)) {
        ;[head, guest] = [guest, head]
        if (host.has(head) || host.has(guest) || guests.has(guest)) continue // drawn as a link only
      }
      host.set(guest, head)
      guests.set(head, [...(guests.get(head) ?? []), guest])
    }
  }
  const headOf = (id: string) => host.get(id) ?? id

  // 2. Each child hangs below the group of its father (or mother).
  const groupKids = new Map<string, string[]>()
  const attachedTo = new Map<string, string>()
  for (const p of g.byId.values()) {
    if (host.has(p.id)) continue
    const par = parentsOf(g, p.id)
    if (!par.length) continue
    const head = headOf(par[0])
    if (head === p.id) continue
    attachedTo.set(p.id, head)
    groupKids.set(head, [...(groupKids.get(head) ?? []), p.id])
  }

  const countDesc = (head: string, seen = new Set<string>()): number => {
    if (seen.has(head)) return 0
    seen.add(head)
    let n = 0
    for (const k of groupKids.get(head) ?? []) n += 1 + (guests.get(k)?.length ?? 0) + countDesc(k, seen)
    return n
  }

  const building = new Set<string>()
  const build = (head: string): Group => {
    building.add(head)
    const sp = guests.get(head) ?? []
    const members = sp.length >= 2 ? [sp[0], head, ...sp.slice(1)] : [head, ...sp]
    const kids = (groupKids.get(head) ?? []).filter((k) => !building.has(k))
    const isCollapsed = collapsed.has(head)
    const rank = (k: string) => {
      const p = g.byId.get(k)!
      const other = [p.fatherId, p.motherId].find((x) => x && x !== head && members.includes(x))
      return other ? members.indexOf(other) : members.indexOf(head)
    }
    const sortedKids = sortSiblings(g, kids).sort((a, b) => rank(a) - rank(b))
    const children = isCollapsed ? [] : sortedKids.map(build)
    const own = members.length * CARD_W + (members.length - 1) * GAP_SPOUSE
    const kidsW = children.reduce((s, c) => s + c.width, 0) + Math.max(0, children.length - 1) * GAP_X
    return {
      head,
      members,
      children,
      hiddenCount: isCollapsed ? countDesc(head) : 0,
      width: Math.max(own, kidsW),
      gen: Math.max(...members.map((m) => gen.get(m)!)),
    }
  }

  // 3. Root groups, keeping in-law families next to the family they married into.
  const rootHeads = [...g.byId.keys()].filter((id) => !host.has(id) && !attachedTo.has(id))
  const rootOf = (id: string): string => {
    let cur = headOf(id)
    const seen = new Set<string>()
    while (attachedTo.has(cur) && !seen.has(cur)) {
      seen.add(cur)
      cur = attachedTo.get(cur)!
    }
    return cur
  }
  const inlawRoots = new Map<string, string[]>()
  for (const guest of host.keys()) {
    const par = parentsOf(g, guest)
    if (!par.length) continue
    const from = rootOf(guest)
    const to = rootOf(par[0])
    if (from !== to) inlawRoots.set(from, [...(inlawRoots.get(from) ?? []), to])
  }
  const size = new Map(rootHeads.map((r) => [r, countDesc(r)]))
  const byImportance = sortSiblings(g, rootHeads).sort((a, b) => gen.get(a)! - gen.get(b)! || size.get(b)! - size.get(a)!)
  const rootOrder: string[] = []
  const place = (r: string) => {
    if (rootOrder.includes(r) || !rootHeads.includes(r)) return
    rootOrder.push(r)
    for (const next of inlawRoots.get(r) ?? []) place(next)
  }
  byImportance.forEach(place)

  // 4. Assign coordinates.
  const nodes: NodePos[] = []
  const pos = new Map<string, NodePos>()
  const edges: Edge[] = []
  const toggles: Toggle[] = []
  const visibleGroups: Group[] = []

  const assign = (grp: Group, left: number) => {
    visibleGroups.push(grp)
    const own = grp.members.length * CARD_W + (grp.members.length - 1) * GAP_SPOUSE
    const y = grp.gen * ROW_H
    let x = left + (grp.width - own) / 2
    for (const m of grp.members) {
      const n = { id: m, x, y, group: grp.head }
      nodes.push(n)
      pos.set(m, n)
      x += CARD_W + GAP_SPOUSE
    }
    const kidsW = grp.children.reduce((s, c) => s + c.width, 0) + Math.max(0, grp.children.length - 1) * GAP_X
    let cx = left + (grp.width - kidsW) / 2
    for (const c of grp.children) {
      assign(c, cx)
      cx += c.width + GAP_X
    }
  }
  let cursor = 0
  let maxGen = 0
  for (const r of rootOrder) {
    const grp = build(r)
    assign(grp, cursor)
    cursor += grp.width + GAP_X * 2
  }
  for (const n of nodes) maxGen = Math.max(maxGen, gen.get(n.id)!)

  // 5. Edges.
  const midY = CARD_H / 2
  const drawn = new Set<string>()
  for (const grp of visibleGroups) {
    // marriage lines between neighbouring cards
    for (let i = 1; i < grp.members.length; i++) {
      const l = pos.get(grp.members[i - 1])!
      const r = pos.get(grp.members[i])!
      const pair = [grp.members[i - 1], grp.members[i]]
      const married = (g.spouses.get(pair[0]) ?? []).some((s) => s.id === pair[1])
      const ids = married ? pair : [grp.head, grp.members[i]]
      drawn.add([...ids].sort().join('|'))
      edges.push({ kind: 'spouse', ids, d: `M${l.x + CARD_W},${l.y + midY} H${r.x}` })
    }
    const hasKids = (groupKids.get(grp.head) ?? []).length > 0
    if (hasKids) {
      const first = pos.get(grp.members[0])!
      const last = pos.get(grp.members[grp.members.length - 1])!
      toggles.push({
        group: grp.head,
        x: (first.x + last.x + CARD_W) / 2,
        y: first.y + CARD_H + 16,
        collapsed: collapsed.has(grp.head),
        hiddenCount: grp.hiddenCount,
      })
    }
  }
  const origin = (parents: string[]): { x: number; y: number } | null => {
    const ps = parents.map((p) => pos.get(p)).filter((p): p is NodePos => !!p)
    if (!ps.length) return null
    if (ps.length === 2 && ps[0].group === ps[1].group && Math.abs(ps[0].x - ps[1].x) <= CARD_W + GAP_SPOUSE + 1) {
      return { x: (ps[0].x + ps[1].x + CARD_W) / 2, y: ps[0].y + midY }
    }
    return { x: ps[0].x + CARD_W / 2, y: ps[0].y + CARD_H }
  }
  for (const n of nodes) {
    const parents = parentsOf(g, n.id)
    if (!parents.length) continue
    const visible = parents.filter((p) => pos.has(p))
    if (!visible.length) continue
    const inGroup = visible.filter((p) => pos.get(p)!.group === attachedTo.get(n.id))
    const natural = inGroup.length > 0 && !host.has(n.id)
    const from = origin(natural ? inGroup : visible)!
    const top = { x: n.x + CARD_W / 2, y: n.y }
    const busY = n.y - (natural ? 34 : 22)
    edges.push({
      kind: natural ? 'child' : 'cross',
      ids: [n.id, ...(natural ? inGroup : visible)],
      d: `M${from.x},${from.y} V${busY} H${top.x} V${top.y}`,
    })
    // a parent placed elsewhere (e.g. remarried) still gets a link
    if (natural) {
      for (const p of visible.filter((v) => !inGroup.includes(v))) {
        const o = origin([p])!
        edges.push({ kind: 'cross', ids: [n.id, p], d: `M${o.x},${o.y} V${n.y - 22} H${top.x - 10} V${top.y}` })
      }
    }
  }
  // couples that could not be placed side by side
  for (const n of nodes) {
    for (const s of g.spouses.get(n.id) ?? []) {
      const key = [n.id, s.id].sort().join('|')
      const o = pos.get(s.id)
      if (drawn.has(key) || !o) continue
      drawn.add(key)
      const [l, r] = n.x < o.x ? [n, o] : [o, n]
      const y1 = l.y + CARD_H
      const y2 = r.y + CARD_H
      const dip = Math.max(y1, y2) + 26
      edges.push({
        kind: 'spouse',
        ids: [n.id, s.id],
        d: `M${l.x + CARD_W / 2},${y1} C${l.x + CARD_W / 2},${dip} ${r.x + CARD_W / 2},${dip} ${r.x + CARD_W / 2},${y2}`,
      })
    }
  }

  return {
    nodes,
    edges,
    toggles,
    width: Math.max(CARD_W, cursor - GAP_X * 2),
    height: maxGen * ROW_H + CARD_H + 40,
    generations: maxGen + 1,
  }
}
