import { del, get, keys, set } from 'idb-keyval'
import type { LifeEvent, MediaItem, Person, Tree, TreeData, Union } from '../../types'
import { nid } from '../util'

const TREE_PREFIX = 'tree:'
const BLOB_PREFIX = 'blob:'
export const LOCAL_OWNER = 'guest'

type Listener = () => void
const listeners = new Set<Listener>()
const cache = new Map<string, TreeData>()
let loaded: Promise<void> | null = null

function emit() {
  listeners.forEach((l) => l())
}

export function subscribeLocal(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function loadLocal(): Promise<void> {
  loaded ??= (async () => {
    try {
      for (const k of await keys()) {
        if (typeof k === 'string' && k.startsWith(TREE_PREFIX)) {
          const data = await get<TreeData>(k)
          if (data?.tree) cache.set(data.tree.id, data)
        }
      }
    } catch (e) {
      console.warn('Không đọc được dữ liệu cục bộ', e)
    }
    emit()
  })()
  return loaded
}

export const localTrees = (): Tree[] => [...cache.values()].map((d) => d.tree).sort((a, b) => b.updatedAt - a.updatedAt)
export const localTree = (id: string): TreeData | null => cache.get(id) ?? null

async function persist(data: TreeData) {
  const next: TreeData = {
    ...data,
    tree: { ...data.tree, memberCount: data.people.length, storageBytes: data.media.reduce((s, m) => s + m.size, 0), updatedAt: Date.now() },
  }
  cache.set(next.tree.id, next)
  emit()
  await set(TREE_PREFIX + next.tree.id, next)
}

function need(id: string): TreeData {
  const d = cache.get(id)
  if (!d) throw new Error('Không tìm thấy cây gia phả')
  return d
}

export function newTree(id: string, name: string, description: string, cover: string, ownerId: string, ownerEmail: string): Tree {
  const now = Date.now()
  return {
    id,
    name,
    description,
    cover,
    ownerId,
    ownerEmail,
    emailRoles: {},
    inviteEmails: [],
    memberUids: [ownerId],
    publicRead: false,
    hidden: false,
    memberCount: 0,
    storageBytes: 0,
    createdAt: now,
    updatedAt: now,
  }
}

const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

export const localBackend = {
  async createTree(name: string, description: string, cover: string): Promise<string> {
    await loadLocal()
    const id = nid('local-')
    await persist({ tree: newTree(id, name, description, cover, LOCAL_OWNER, ''), people: [], unions: [], events: [], media: [] })
    return id
  },
  async updateTree(id: string, patch: Partial<Tree>) {
    const d = need(id)
    await persist({ ...d, tree: { ...d.tree, ...patch } })
  },
  async deleteTree(id: string) {
    const d = need(id)
    for (const m of d.media) await del(BLOB_PREFIX + m.id)
    cache.delete(id)
    emit()
    await del(TREE_PREFIX + id)
  },
  async savePerson(id: string, p: Person) {
    const d = need(id)
    await persist({ ...d, people: upsert(d.people, { ...p, updatedAt: Date.now() }) })
  },
  async deletePerson(id: string, pid: string) {
    const d = need(id)
    await persist({
      ...d,
      people: d.people
        .filter((p) => p.id !== pid)
        .map((p) => (p.fatherId === pid || p.motherId === pid ? { ...p, fatherId: p.fatherId === pid ? '' : p.fatherId, motherId: p.motherId === pid ? '' : p.motherId } : p)),
      unions: d.unions.filter((u) => u.a !== pid && u.b !== pid),
      events: d.events.filter((e) => e.personId !== pid),
      media: d.media.map((m) => (m.personId === pid ? { ...m, personId: '' } : m)),
    })
  },
  async saveUnion(id: string, u: Union) {
    const d = need(id)
    await persist({ ...d, unions: upsert(d.unions, u) })
  },
  async deleteUnion(id: string, uid: string) {
    const d = need(id)
    await persist({ ...d, unions: d.unions.filter((u) => u.id !== uid) })
  },
  async saveEvent(id: string, e: LifeEvent) {
    const d = need(id)
    await persist({ ...d, events: upsert(d.events, e) })
  },
  async deleteEvent(id: string, eid: string) {
    const d = need(id)
    await persist({ ...d, events: d.events.filter((e) => e.id !== eid) })
  },
  async importBatch(id: string, people: Person[], unions: Union[], events: LifeEvent[]) {
    const d = need(id)
    let next = d
    for (const p of people) next = { ...next, people: upsert(next.people, p) }
    for (const u of unions) next = { ...next, unions: upsert(next.unions, u) }
    for (const e of events) next = { ...next, events: upsert(next.events, e) }
    await persist(next)
  },
  async addMedia(id: string, file: File, meta: Pick<MediaItem, 'personId' | 'kind' | 'caption'>, onProgress?: (p: number) => void): Promise<MediaItem> {
    const d = need(id)
    const item: MediaItem = {
      id: nid(),
      ...meta,
      name: file.name,
      url: '',
      path: 'idb',
      size: file.size,
      contentType: file.type,
      createdAt: Date.now(),
    }
    await set(BLOB_PREFIX + item.id, file)
    onProgress?.(1)
    await persist({ ...d, media: [...d.media, item] })
    return item
  },
  async updateMedia(id: string, m: MediaItem) {
    const d = need(id)
    await persist({ ...d, media: upsert(d.media, m) })
  },
  async deleteMedia(id: string, m: MediaItem) {
    const d = need(id)
    await del(BLOB_PREFIX + m.id)
    await persist({ ...d, media: d.media.filter((x) => x.id !== m.id) })
  },
}

export async function localBlob(mediaId: string): Promise<Blob | undefined> {
  return get<Blob>(BLOB_PREFIX + mediaId)
}

/** Total bytes of all files kept in this browser. */
export const localUsage = (): number => [...cache.values()].reduce((s, d) => s + d.media.reduce((x, m) => x + m.size, 0), 0)
