export type Gender = 'male' | 'female' | 'other'
export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

/** Partial date: "YYYY", "YYYY-MM" or "YYYY-MM-DD" (empty string = unknown). */
export type PDate = string

export interface Tree {
  id: string
  name: string
  description: string
  cover: string
  ownerId: string
  ownerEmail: string
  /** email (lowercase) -> role, for people invited by email */
  emailRoles: Record<string, Role>
  inviteEmails: string[]
  /** owner + people who joined through the share link */
  memberUids: string[]
  publicRead: boolean
  hidden: boolean
  memberCount: number
  storageBytes: number
  createdAt: number
  updatedAt: number
}

export interface Person {
  id: string
  fullName: string
  nickname: string
  gender: Gender
  birthDate: PDate
  deathDate: PDate
  deceased: boolean
  birthPlace: string
  photo: string
  phone: string
  email: string
  address: string
  occupation: string
  bio: string
  fatherId: string
  motherId: string
  /** Birth order among siblings (1 = eldest); used when birth dates are unknown. */
  birthOrder: number
  hidden: boolean
  createdAt: number
  updatedAt: number
}

/** A marriage / partnership between two members. */
export interface Union {
  id: string
  a: string
  b: string
  startDate: PDate
  endDate: PDate
  /** true when the marriage ended by divorce */
  divorced: boolean
  note: string
}

export interface LifeEvent {
  id: string
  personId: string
  date: PDate
  title: string
  description: string
}

export type MediaKind = 'photo' | 'video' | 'document'

export interface MediaItem {
  id: string
  personId: string
  kind: MediaKind
  name: string
  caption: string
  url: string
  path: string
  size: number
  contentType: string
  createdAt: number
}

export interface TreeData {
  tree: Tree
  people: Person[]
  unions: Union[]
  events: LifeEvent[]
  media: MediaItem[]
}

export interface ShareLink {
  token: string
  role: 'viewer' | 'editor'
  enabled: boolean
}

export interface JoinDoc {
  uid: string
  role: Role
  token: string
  email: string
  name: string
  joinedAt: number
}

export interface UserDoc {
  uid: string
  email: string
  displayName: string
  photo: string
  isAdmin: boolean
  locked: boolean
  createdAt: number
  lastLoginAt: number
}

export interface Report {
  id: string
  treeId: string
  treeName: string
  personId: string
  personName: string
  reason: string
  reporterUid: string
  reporterEmail: string
  status: 'open' | 'resolved'
  createdAt: number
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị',
  editor: 'Biên tập',
  viewer: 'Người xem',
}

export function emptyPerson(id: string): Person {
  return {
    id,
    fullName: '',
    nickname: '',
    gender: 'male',
    birthDate: '',
    deathDate: '',
    deceased: false,
    birthPlace: '',
    photo: '',
    phone: '',
    email: '',
    address: '',
    occupation: '',
    bio: '',
    fatherId: '',
    motherId: '',
    birthOrder: 0,
    hidden: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function canEdit(role: Role | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor'
}
export function canManage(role: Role | null): boolean {
  return role === 'owner' || role === 'admin'
}
