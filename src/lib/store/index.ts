import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { LifeEvent, MediaItem, Person, Role, Tree, TreeData, Union } from '../../types'
import { firebaseEnabled } from '../firebase'
import { cloudBackend, getJoin, watchCloudTree, watchCloudTrees, type CloudUser } from './cloud'
import { loadLocal, localBackend, localBlob, localTree, localTrees, subscribeLocal } from './local'

export const isLocalId = (id: string) => id.startsWith('local-')

let currentUser: CloudUser | null = null
export function setStoreUser(u: CloudUser | null) {
  currentUser = u
}

let version = 0
subscribeLocal(() => {
  version++
})
function useLocalVersion(): number {
  return useSyncExternalStore(subscribeLocal, () => version)
}

export function useTreeList(user: CloudUser | null): { local: Tree[]; cloud: Tree[]; loading: boolean } {
  const v = useLocalVersion()
  const [localReady, setLocalReady] = useState(false)
  const [cloud, setCloud] = useState<Tree[] | null>(null)
  useEffect(() => {
    loadLocal().then(() => setLocalReady(true))
  }, [])
  const uid = user?.uid
  const email = user?.email
  const verified = user?.verified
  useEffect(() => {
    if (!firebaseEnabled || !uid) {
      setCloud(null)
      return
    }
    return watchCloudTrees({ uid, email: email ?? '', verified: !!verified }, setCloud)
  }, [uid, email, verified])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const local = useMemo(() => localTrees(), [v, localReady])
  return { local, cloud: cloud ?? [], loading: !localReady || (!!uid && firebaseEnabled && cloud === null) }
}

export interface TreeState {
  data: TreeData | null
  loading: boolean
  error: '' | 'denied' | 'error' | 'notfound'
  role: Role | null
  isCloud: boolean
}

export function useTree(id: string, user: CloudUser | null, isAppAdmin: boolean): TreeState {
  const v = useLocalVersion()
  const local = isLocalId(id)
  const [localReady, setLocalReady] = useState(false)
  const [cloud, setCloud] = useState<{ id: string; data: TreeData | null; error: TreeState['error'] } | null>(null)
  const [joinRole, setJoinRole] = useState<Role | null>(null)

  useEffect(() => {
    if (local) loadLocal().then(() => setLocalReady(true))
  }, [local])

  const uid = user?.uid
  useEffect(() => {
    if (local) return
    if (!firebaseEnabled) {
      setCloud({ id, data: null, error: 'notfound' })
      return
    }
    setCloud(null)
    return watchCloudTree(id, (data, error) => setCloud({ id, data, error: (error as TreeState['error']) ?? '' }))
  }, [id, local, uid])

  const tree = cloud?.id === id ? cloud.data?.tree : undefined
  const inMembers = !!uid && !!tree?.memberUids.includes(uid) && tree.ownerId !== uid
  useEffect(() => {
    setJoinRole(null)
    if (!inMembers || !uid) return
    let live = true
    getJoin(id, uid).then((j) => live && setJoinRole(j?.role ?? null))
    return () => {
      live = false
    }
  }, [id, uid, inMembers])

  return useMemo<TreeState>(() => {
    if (local) {
      const data = localReady ? localTree(id) : null
      return { data, loading: !localReady, error: localReady && !data ? 'notfound' : '', role: data ? 'owner' : null, isCloud: false }
    }
    if (!cloud || cloud.id !== id) return { data: null, loading: true, error: '', role: null, isCloud: true }
    const data = cloud.data
    let role: Role | null = null
    if (data && user) {
      const t = data.tree
      if (t.ownerId === user.uid) role = 'owner'
      else if (user.verified && t.emailRoles[user.email]) role = t.emailRoles[user.email]
      else if (joinRole) role = joinRole
      if (isAppAdmin && role !== 'owner') role = 'admin'
    }
    const seeHidden = role === 'owner' || isAppAdmin
    const visible = data && !seeHidden ? { ...data, people: data.people.filter((p) => !p.hidden) } : data
    return { data: visible, loading: false, error: cloud.error, role, isCloud: true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, localReady, v, id, cloud, user, joinRole, isAppAdmin])
}

function needUser(): CloudUser {
  if (!currentUser) throw new Error('Bạn cần đăng nhập để dùng đồng bộ đám mây.')
  return currentUser
}

/** Data operations; local trees go to IndexedDB, the rest to Firestore. */
export const ops = {
  createTree(name: string, description: string, cover: string, cloud: boolean): Promise<string> {
    return cloud ? cloudBackend.createTree(name, description, cover, needUser()) : localBackend.createTree(name, description, cover)
  },
  updateTree: (id: string, patch: Partial<Tree>) => (isLocalId(id) ? localBackend.updateTree(id, patch) : cloudBackend.updateTree(id, patch)),
  deleteTree: (id: string) => (isLocalId(id) ? localBackend.deleteTree(id) : cloudBackend.deleteTree(id)),
  savePerson: (id: string, p: Person, isNew: boolean) => (isLocalId(id) ? localBackend.savePerson(id, p) : cloudBackend.savePerson(id, p, isNew)),
  deletePerson: (data: TreeData, pid: string) =>
    isLocalId(data.tree.id) ? localBackend.deletePerson(data.tree.id, pid) : cloudBackend.deletePerson(data.tree.id, pid, data),
  saveUnion: (id: string, u: Union) => (isLocalId(id) ? localBackend.saveUnion(id, u) : cloudBackend.saveUnion(id, u)),
  deleteUnion: (id: string, uid: string) => (isLocalId(id) ? localBackend.deleteUnion(id, uid) : cloudBackend.deleteUnion(id, uid)),
  saveEvent: (id: string, e: LifeEvent) => (isLocalId(id) ? localBackend.saveEvent(id, e) : cloudBackend.saveEvent(id, e)),
  deleteEvent: (id: string, eid: string) => (isLocalId(id) ? localBackend.deleteEvent(id, eid) : cloudBackend.deleteEvent(id, eid)),
  importBatch(data: TreeData, people: Person[], unions: Union[], events: LifeEvent[]) {
    const id = data.tree.id
    return isLocalId(id)
      ? localBackend.importBatch(id, people, unions, events)
      : cloudBackend.importBatch(id, people, unions, events, new Set(data.people.map((p) => p.id)))
  },
  addMedia: (id: string, file: File, meta: Pick<MediaItem, 'personId' | 'kind' | 'caption'>, onProgress?: (p: number) => void) =>
    isLocalId(id) ? localBackend.addMedia(id, file, meta, onProgress) : cloudBackend.addMedia(id, file, meta, onProgress),
  updateMedia: (id: string, m: MediaItem) => (isLocalId(id) ? localBackend.updateMedia(id, m) : cloudBackend.updateMedia(id, m)),
  deleteMedia: (id: string, m: MediaItem) => (isLocalId(id) ? localBackend.deleteMedia(id, m) : cloudBackend.deleteMedia(id, m)),

  /** Copies a local (guest) tree to the signed-in account. Returns the new cloud id. */
  async uploadLocalTree(data: TreeData, onProgress?: (text: string) => void): Promise<string> {
    const user = needUser()
    const t = data.tree
    const id = await cloudBackend.createTree(t.name, t.description, t.cover, user)
    onProgress?.('Đang tải thành viên…')
    await cloudBackend.importBatch(id, data.people, data.unions, data.events, new Set())
    let i = 0
    for (const m of data.media) {
      onProgress?.(`Đang tải tư liệu ${++i}/${data.media.length}…`)
      const blob = await localBlob(m.id)
      if (!blob) continue
      const file = new File([blob], m.name, { type: m.contentType })
      await cloudBackend.addMedia(id, file, { personId: m.personId, kind: m.kind, caption: m.caption })
    }
    return id
  },
}

/** Object URL for media kept in the browser, or the download URL for cloud media. */
export function useMediaUrl(m: MediaItem | null): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!m) return
    if (m.url) {
      setUrl(m.url)
      return
    }
    let obj = ''
    let live = true
    localBlob(m.id).then((b) => {
      if (!b || !live) return
      obj = URL.createObjectURL(b)
      setUrl(obj)
    })
    return () => {
      live = false
      if (obj) URL.revokeObjectURL(obj)
    }
  }, [m])
  return url
}
