import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { emptyPerson, type JoinDoc, type LifeEvent, type MediaItem, type Person, type Report, type Role, type ShareLink, type Tree, type TreeData, type Union, type UserDoc } from '../../types'
import { db, storage, storageEnabled } from '../firebase'
import { nid } from '../util'
import { newTree } from './local'

const treeRef = (id: string) => doc(db(), 'trees', id)
const sub = (id: string, name: string) => collection(db(), 'trees', id, name)

export function toTree(id: string, d: DocumentData): Tree {
  return { ...newTree(id, '', '', '', '', ''), ...d, id } as Tree
}
const toPerson = (id: string, d: DocumentData): Person => ({ ...emptyPerson(id), ...d, id }) as Person

export interface CloudUser {
  uid: string
  email: string
  verified: boolean
}

/** Trees the user owns, was invited to by email, or joined through a link. */
export function watchCloudTrees(user: CloudUser, cb: (trees: Tree[]) => void): Unsubscribe {
  const results: Tree[][] = [[], [], []]
  const push = () => {
    const map = new Map<string, Tree>()
    results.flat().forEach((t) => map.set(t.id, t))
    cb([...map.values()].sort((a, b) => b.updatedAt - a.updatedAt))
  }
  const trees = collection(db(), 'trees')
  const queries = [
    query(trees, where('ownerId', '==', user.uid)),
    query(trees, where('memberUids', 'array-contains', user.uid), where('hidden', '==', false)),
    ...(user.verified && user.email ? [query(trees, where('inviteEmails', 'array-contains', user.email), where('hidden', '==', false))] : []),
  ]
  const unsubs = queries.map((q, i) =>
    onSnapshot(
      q,
      (snap) => {
        results[i] = snap.docs.map((d) => toTree(d.id, d.data()))
        push()
      },
      (err) => {
        console.warn('Không tải được danh sách cây', err.code)
        push()
      },
    ),
  )
  return () => unsubs.forEach((u) => u())
}

export function watchCloudTree(id: string, cb: (data: TreeData | null, error?: string) => void): Unsubscribe {
  const state: Partial<TreeData> = {}
  let failed = false
  const push = () => {
    if (failed) return
    if (state.tree && state.people && state.unions && state.events && state.media) cb(state as TreeData)
  }
  const fail = (err: { code?: string }) => {
    if (failed) return
    failed = true
    cb(null, err.code === 'permission-denied' ? 'denied' : 'error')
  }
  const unsubs = [
    onSnapshot(
      treeRef(id),
      (snap) => {
        if (!snap.exists()) return fail({ code: 'permission-denied' })
        state.tree = toTree(snap.id, snap.data())
        push()
      },
      fail,
    ),
    onSnapshot(sub(id, 'people'), (s) => ((state.people = s.docs.map((d) => toPerson(d.id, d.data()))), push()), fail),
    onSnapshot(sub(id, 'unions'), (s) => ((state.unions = s.docs.map((d) => ({ ...d.data(), id: d.id }) as Union)), push()), fail),
    onSnapshot(sub(id, 'events'), (s) => ((state.events = s.docs.map((d) => ({ ...d.data(), id: d.id }) as LifeEvent)), push()), fail),
    onSnapshot(sub(id, 'media'), (s) => ((state.media = s.docs.map((d) => ({ ...d.data(), id: d.id }) as MediaItem)), push()), fail),
  ]
  return () => unsubs.forEach((u) => u())
}

const touch = () => ({ updatedAt: Date.now() })

async function commitChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db())
    ops.slice(i, i + 400).forEach((op) => op(batch))
    await batch.commit()
  }
}

export const cloudBackend = {
  async createTree(name: string, description: string, cover: string, user: CloudUser): Promise<string> {
    const id = nid()
    const { id: _id, ...data } = newTree(id, name, description, cover, user.uid, user.email)
    void _id
    await setDoc(treeRef(id), data)
    return id
  },
  async updateTree(id: string, patch: Partial<Tree>) {
    const { id: _id, ...rest } = patch
    void _id
    await updateDoc(treeRef(id), { ...rest, ...touch() })
  },
  async deleteTree(id: string) {
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
    const mediaSnap = await getDocs(sub(id, 'media'))
    if (storageEnabled) {
      for (const m of mediaSnap.docs) {
        const path = m.data().path as string
        if (path) await deleteObject(ref(storage(), path)).catch(() => undefined)
      }
    }
    for (const name of ['people', 'unions', 'events', 'media', 'joins', 'private']) {
      const snap = name === 'media' ? mediaSnap : await getDocs(sub(id, name)).catch(() => null)
      snap?.docs.forEach((d) => ops.push((b) => b.delete(d.ref)))
    }
    await commitChunks(ops)
    await deleteDoc(treeRef(id))
  },
  async savePerson(id: string, p: Person, isNew: boolean) {
    const { id: pid, ...data } = { ...p, updatedAt: Date.now() }
    const batch = writeBatch(db())
    batch.set(doc(sub(id, 'people'), pid), data)
    batch.update(treeRef(id), isNew ? { memberCount: increment(1), ...touch() } : touch())
    await batch.commit()
  },
  async deletePerson(id: string, pid: string, data: TreeData) {
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
    ops.push((b) => b.delete(doc(sub(id, 'people'), pid)))
    for (const p of data.people) {
      if (p.fatherId === pid) ops.push((b) => b.update(doc(sub(id, 'people'), p.id), { fatherId: '' }))
      if (p.motherId === pid) ops.push((b) => b.update(doc(sub(id, 'people'), p.id), { motherId: '' }))
    }
    for (const u of data.unions) if (u.a === pid || u.b === pid) ops.push((b) => b.delete(doc(sub(id, 'unions'), u.id)))
    for (const e of data.events) if (e.personId === pid) ops.push((b) => b.delete(doc(sub(id, 'events'), e.id)))
    for (const m of data.media) if (m.personId === pid) ops.push((b) => b.update(doc(sub(id, 'media'), m.id), { personId: '' }))
    ops.push((b) => b.update(treeRef(id), { memberCount: increment(-1), ...touch() }))
    await commitChunks(ops)
  },
  async saveUnion(id: string, u: Union) {
    const { id: uid, ...data } = u
    await setDoc(doc(sub(id, 'unions'), uid), data)
  },
  async deleteUnion(id: string, uid: string) {
    await deleteDoc(doc(sub(id, 'unions'), uid))
  },
  async saveEvent(id: string, e: LifeEvent) {
    const { id: eid, ...data } = e
    await setDoc(doc(sub(id, 'events'), eid), data)
  },
  async deleteEvent(id: string, eid: string) {
    await deleteDoc(doc(sub(id, 'events'), eid))
  },
  async importBatch(id: string, people: Person[], unions: Union[], events: LifeEvent[], existingIds: Set<string>) {
    const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
    for (const { id: pid, ...data } of people) ops.push((b) => b.set(doc(sub(id, 'people'), pid), data))
    for (const { id: uid, ...data } of unions) ops.push((b) => b.set(doc(sub(id, 'unions'), uid), data))
    for (const { id: eid, ...data } of events) ops.push((b) => b.set(doc(sub(id, 'events'), eid), data))
    const added = people.filter((p) => !existingIds.has(p.id)).length
    ops.push((b) => b.update(treeRef(id), { memberCount: increment(added), ...touch() }))
    await commitChunks(ops)
  },
  async addMedia(id: string, file: File, meta: Pick<MediaItem, 'personId' | 'kind' | 'caption'>, onProgress?: (p: number) => void): Promise<MediaItem> {
    if (!storageEnabled) throw new Error('Chưa cấu hình Cloud Storage (VITE_FIREBASE_STORAGE_BUCKET).')
    const mid = nid()
    const path = `trees/${id}/${mid}/${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`
    const task = uploadBytesResumable(ref(storage(), path), file, { contentType: file.type || 'application/octet-stream' })
    await new Promise<void>((resolve, reject) => {
      task.on('state_changed', (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0), reject, () => resolve())
    })
    const url = await getDownloadURL(task.snapshot.ref)
    const item: MediaItem = { id: mid, ...meta, name: file.name, url, path, size: file.size, contentType: file.type, createdAt: Date.now() }
    const { id: _id, ...data } = item
    void _id
    const batch = writeBatch(db())
    batch.set(doc(sub(id, 'media'), mid), data)
    batch.update(treeRef(id), { storageBytes: increment(file.size), ...touch() })
    await batch.commit()
    return item
  },
  async updateMedia(id: string, m: MediaItem) {
    await updateDoc(doc(sub(id, 'media'), m.id), { caption: m.caption, personId: m.personId })
  },
  async deleteMedia(id: string, m: MediaItem) {
    if (storageEnabled && m.path) await deleteObject(ref(storage(), m.path)).catch(() => undefined)
    const batch = writeBatch(db())
    batch.delete(doc(sub(id, 'media'), m.id))
    batch.update(treeRef(id), { storageBytes: increment(-m.size), ...touch() })
    await batch.commit()
  },
}

// ---- Sharing ----

export async function setEmailRole(tree: Tree, email: string, role: Role | null) {
  const key = email.trim().toLowerCase()
  const emailRoles = { ...tree.emailRoles }
  if (role) emailRoles[key] = role
  else delete emailRoles[key]
  await updateDoc(treeRef(tree.id), { emailRoles, inviteEmails: Object.keys(emailRoles), ...touch() })
}

const shareRef = (id: string) => doc(db(), 'trees', id, 'private', 'share')

export async function getShareLink(id: string): Promise<ShareLink | null> {
  const snap = await getDoc(shareRef(id))
  return snap.exists() ? (snap.data() as ShareLink) : null
}

export async function saveShareLink(id: string, link: ShareLink) {
  await setDoc(shareRef(id), link)
}

export async function listJoins(id: string): Promise<JoinDoc[]> {
  const snap = await getDocs(sub(id, 'joins'))
  return snap.docs.map((d) => ({ ...d.data(), uid: d.id }) as JoinDoc)
}

export async function getJoin(id: string, uid: string): Promise<JoinDoc | null> {
  const snap = await getDoc(doc(sub(id, 'joins'), uid)).catch(() => null)
  return snap?.exists() ? ({ ...snap.data(), uid } as JoinDoc) : null
}

export async function setJoinRole(id: string, uid: string, role: Role) {
  await updateDoc(doc(sub(id, 'joins'), uid), { role })
}

export async function removeJoin(id: string, uid: string) {
  await updateDoc(treeRef(id), { memberUids: arrayRemove(uid) })
  await deleteDoc(doc(sub(id, 'joins'), uid))
}

/** Join a tree with the token from a share link. The role is validated by the security rules. */
export async function joinWithToken(id: string, token: string, role: 'viewer' | 'editor', user: CloudUser, name: string) {
  await setDoc(doc(sub(id, 'joins'), user.uid), { role, token, email: user.email, name, joinedAt: Date.now() })
  await updateDoc(treeRef(id), { memberUids: arrayUnion(user.uid) })
}

// ---- Users, reports, admin ----

export const userRef = (uid: string) => doc(db(), 'users', uid)

export async function listUsers(): Promise<UserDoc[]> {
  const snap = await getDocs(collection(db(), 'users'))
  return snap.docs.map((d) => ({ ...d.data(), uid: d.id }) as UserDoc)
}

export async function listAllTrees(): Promise<Tree[]> {
  const snap = await getDocs(collection(db(), 'trees'))
  return snap.docs.map((d) => toTree(d.id, d.data()))
}

export async function listReports(): Promise<Report[]> {
  const snap = await getDocs(collection(db(), 'reports'))
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Report).sort((a, b) => b.createdAt - a.createdAt)
}

export async function createReport(r: Omit<Report, 'id'>) {
  await setDoc(doc(collection(db(), 'reports'), nid()), r)
}

export const adminActions = {
  setUser: (uid: string, patch: Partial<Pick<UserDoc, 'locked' | 'isAdmin'>>) => updateDoc(userRef(uid), patch),
  setTreeHidden: (id: string, hidden: boolean) => updateDoc(treeRef(id), { hidden }),
  setPersonHidden: (treeId: string, pid: string, hidden: boolean) => updateDoc(doc(sub(treeId, 'people'), pid), { hidden }),
  resolveReport: (id: string) => updateDoc(doc(db(), 'reports', id), { status: 'resolved' }),
}
