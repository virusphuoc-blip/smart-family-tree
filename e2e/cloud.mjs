// Login / sync / sharing / rules / admin self-test against the Firebase Emulator Suite.
// Start: `npm run emulators` and `VITE_FIREBASE_EMULATOR=1 npx vite --port 5174`, then: node e2e/cloud.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { open } from './util.mjs'

const base = process.argv[2] ?? 'http://localhost:5174'
const AUTH = 'http://localhost:9099', FS = 'http://localhost:8080', PROJECT = 'demo-giapha'
const out = new URL('./out/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
const run = Date.now().toString(36)
const mail = (n) => `${n}-${run}@example.com`
const PASS = 'matkhau123'
const { browser, session, page: a, check, done } = await open(chromium, base)
const cards = (p) => p.locator('[data-testid=tree-diagram] [data-id]')

const register = async (p, name, email) => {
  await p.goto(base + '/login')
  await p.getByRole('button', { name: 'Đăng ký', exact: true }).click()
  await p.getByTestId('auth-name').fill(name)
  await p.getByTestId('auth-email').fill(email)
  await p.getByTestId('auth-password').fill(PASS)
  await p.getByTestId('auth-submit').click()
  await p.waitForURL((u) => !u.pathname.startsWith('/login'))
}
const login = async (p, email) => {
  await p.goto(base + '/login')
  await p.getByTestId('auth-email').fill(email)
  await p.getByTestId('auth-password').fill(PASS)
  await p.getByTestId('auth-submit').click()
  await p.waitForURL((u) => !u.pathname.startsWith('/login'))
}
const logout = async (p) => {
  await p.goto(base + '/settings')
  await p.getByTestId('logout').click()
  await p.waitForSelector('[data-testid=logout]', { state: 'detached' })
}
const token = async (email) => (await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) })).json())
const verifyEmail = async (email) => {
  const { localId } = await token(email)
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' }, body: JSON.stringify({ localId, emailVerified: true }) })
}
const rest = async (email, method, path, body) => {
  const { idToken } = email ? await token(email) : {}
  const r = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, { method, headers: { 'content-type': 'application/json', ...(idToken ? { authorization: `Bearer ${idToken}` } : {}) }, body: body && JSON.stringify(body) })
  return r.status
}

// 1. register + login
const A = mail('chu-cay'), B = mail('nguoi-xem'), C = mail('nguoi-sua')
await register(a, 'Chủ Cây', A)
check('register with email + password signs the user in', (await a.locator('header').innerText()).includes('Chủ') || (await a.goto(base + '/settings'), (await a.locator('main').innerText()).includes(A)))
await logout(a)
await a.goto(base + '/login')
await a.getByTestId('auth-email').fill(A)
await a.getByTestId('auth-password').fill('sai-mat-khau')
await a.getByTestId('auth-submit').click()
await a.waitForSelector('[role=alert]')
check('wrong password shows a Vietnamese error', /mật khẩu|không đúng/i.test(await a.locator('[role=alert]').first().innerText()))
await login(a, A)
check('login with email + password', true)
await a.goto(base + '/settings')
await a.getByTestId('profile-name').fill('Chủ Cây Nguyễn')
await a.getByTestId('profile-save').click()
await a.waitForTimeout(800)
await a.reload()
await a.waitForSelector('[data-testid=profile-name]')
check('profile saved to Firestore', (await a.getByTestId('profile-name').inputValue()) === 'Chủ Cây Nguyễn')

// 2. local demo tree -> upload to cloud
await a.goto(base)
await a.getByTestId('load-demo').click()
await cards(a).first().waitFor()
if (!a.url().includes('/t/local-')) {
  check('demo created directly in the cloud', true)
} else {
  await a.getByTestId('tree-menu').click()
  await a.getByTestId('menu-upload').click()
  await a.waitForURL((u) => /\/t\/(?!local-)/.test(u.pathname), { timeout: 60000 })
}
await a.waitForFunction(() => document.querySelectorAll('[data-testid=tree-diagram] [data-id]').length === 17)
const treeId = new URL(a.url()).pathname.split('/').pop()
check('demo tree stored in Firestore (17 members)', (await cards(a).count()) === 17, treeId)
check('owner role shown', (await a.locator('main').innerText()).includes('Chủ sở hữu'))

// 3. private by default
const b = await session()
await register(b, 'Người Xem', B)
await b.goto(`${base}/t/${treeId}`)
await b.waitForSelector('text=không có quyền')
check('other signed-in user cannot open a private tree', true)
const anon = await session()
await anon.goto(`${base}/t/${treeId}`)
await anon.waitForSelector('text=không có quyền')
check('anonymous visitor cannot open a private tree', true)
check('rules: stranger read of people denied (REST)', (await rest(B, 'GET', `trees/${treeId}/people`)) === 403)
check('rules: anonymous read denied (REST)', (await rest('', 'GET', `trees/${treeId}`)) === 403)

// 4. share link (viewer) + realtime sync
await a.getByTestId('tree-menu').click()
await a.getByTestId('menu-share').click()
await a.getByTestId('link-toggle').check()
await a.waitForSelector('[data-testid=join-url]')
const joinUrl = (await a.getByTestId('join-url').inputValue()).replace(/^https?:\/\/[^/]+/, base)
await b.goto(joinUrl)
await b.waitForURL((u) => u.pathname === `/t/${treeId}`)
await cards(b).first().waitFor()
check('viewer joins through the share link and sees the tree', (await cards(b).count()) === 17)
check('viewer has no edit controls', (await b.getByTestId('add-person').count()) === 0 && (await b.locator('main').innerText()).includes('Người xem'))
check('rules: viewer write denied (REST)', (await rest(B, 'PATCH', `trees/${treeId}/people/hack`, { fields: { fullName: { stringValue: 'x' } } })) === 403)
check('rules: viewer cannot change tree doc (REST)', (await rest(B, 'PATCH', `trees/${treeId}?updateMask.fieldPaths=name`, { fields: { name: { stringValue: 'x' } } })) === 403)
await a.keyboard.press('Escape')
await a.getByTestId('add-person').click()
await a.getByTestId('person-name').fill('Nguyễn Đồng Bộ')
await a.getByTestId('person-save').click()
await a.waitForSelector('[data-testid=person-panel]')
await b.waitForFunction(() => document.querySelectorAll('[data-testid=tree-diagram] [data-id]').length === 18)
check('realtime sync: member added by owner appears for the viewer', true)
await b.screenshot({ path: out + 'cloud-viewer.png' })

// 5. email invite as editor
await a.keyboard.press('Escape')
await a.locator('[data-testid=person-panel] [aria-label="Đóng"]').first().click().catch(() => {})
await a.getByTestId('tree-menu').click()
await a.getByTestId('menu-share').click()
await a.getByTestId('invite-email').fill(C)
await a.getByLabel('Vai trò').first().selectOption('editor')
await a.getByTestId('invite-submit').click()
await a.waitForSelector('[data-testid=invited]')
const c = await session()
await register(c, 'Người Sửa', C)
await verifyEmail(C)
await logout(c)
await login(c, C)
await c.goto(base)
await c.waitForSelector('[data-testid=tree-card]')
check('invited email sees the shared tree in their list', (await c.getByTestId('tree-card').first().innerText()).includes('Được chia sẻ'))
await c.getByTestId('tree-card').first().click()
await cards(c).first().waitFor()
await c.getByTestId('add-person').click()
await c.getByTestId('person-name').fill('Người Do Biên Tập Thêm')
await c.getByTestId('person-save').click()
await c.waitForSelector('[data-testid=person-panel]')
await a.keyboard.press('Escape')
await a.waitForFunction(() => document.querySelectorAll('[data-testid=tree-diagram] [data-id]').length === 19)
check('editor can add a member and it syncs back to the owner', true)
check('editor has no share/manage menu', (await c.keyboard.press('Escape'), await c.locator('[data-testid=person-panel] [aria-label="Đóng"]').first().click().catch(() => {}), await c.getByTestId('tree-menu').click(), (await c.getByTestId('menu-share').count()) === 0 && (await c.getByTestId('menu-delete').count()) === 0))
check('rules: editor cannot delete the tree (REST)', (await rest(C, 'DELETE', `trees/${treeId}`)) === 403)

// 6. media in Cloud Storage
await a.getByTestId('tab-media').click()
const png = await a.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 2600; cv.height = 1300; const x = cv.getContext('2d'); x.fillStyle = '#9f1239'; x.fillRect(0, 0, 2600, 1300); x.fillStyle = '#fff'; x.font = '200px sans-serif'; x.fillText('Gia phả', 300, 700); return cv.toDataURL('image/png').split(',')[1] })
await a.getByTestId('media-input').setInputFiles({ name: 'anh.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
await a.waitForSelector('[data-testid=media-item] img', { timeout: 30000 })
await b.getByTestId('tab-media').click()
await b.waitForSelector('[data-testid=media-item] img', { timeout: 30000 })
const loaded = await b.locator('[data-testid=media-item] img').first().evaluate((img) => new Promise((r) => (img.complete && img.naturalWidth ? r(img.naturalWidth) : ((img.onload = () => r(img.naturalWidth)), (img.onerror = () => r(0))))))
check('photo uploaded to Storage (compressed to 1920px) and visible to the viewer', loaded === 1920, String(loaded))
check('storage usage shows the 5 GB quota', /5(,|\.)?0? ?GB/.test(await a.getByTestId('storage-usage').innerText()), await a.getByTestId('storage-usage').innerText())

// 7. public read-only link
await a.getByTestId('tree-menu').click()
await a.getByTestId('menu-share').click()
await a.getByTestId('public-toggle').click()
await a.waitForSelector('[data-testid=public-url]')
await anon.goto(`${base}/t/${treeId}`)
await cards(anon).first().waitFor()
check('public link: anonymous visitor can view, cannot edit', (await cards(anon).count()) === 19 && (await anon.getByTestId('add-person').count()) === 0)
check('rules: anonymous write to public tree denied (REST)', (await rest('', 'PATCH', `trees/${treeId}/people/hack`, { fields: { fullName: { stringValue: 'x' } } })) === 403)
await a.getByTestId('public-toggle').click()
await anon.waitForSelector('text=không có quyền')
check('turning the public link off revokes access', true)
await a.keyboard.press('Escape')

// 8. admin
await b.goto(base + '/admin')
await b.waitForSelector('[data-testid=admin-denied]')
check('non-admin cannot open the admin dashboard', true)
check('rules: non-admin cannot list users (REST)', (await rest(B, 'GET', 'users')) === 403)
check('rules: user cannot make themselves admin (REST)', (await rest(B, 'PATCH', `users/${(await token(B)).localId}?updateMask.fieldPaths=isAdmin`, { fields: { isAdmin: { booleanValue: true } } })) === 403)
const ADMIN = 'virusphuoc@gmail.com'
const ad = await session()
const exists = (await token(ADMIN)).idToken
if (!exists) await register(ad, 'Quản Trị', ADMIN)
await verifyEmail(ADMIN)
if (!exists) await logout(ad)
await login(ad, ADMIN)
await ad.goto(base + '/admin')
await ad.waitForSelector('[data-testid=admin]')
const n = async (id) => Number((await ad.getByTestId(id).locator('p').nth(1).innerText()).match(/\d+/)[0])
check('admin dashboard loads with totals', (await n('stat-users')) >= 4 && (await n('stat-trees')) >= 1 && (await n('stat-members')) >= 19, `${await n('stat-users')}/${await n('stat-trees')}/${await n('stat-members')}`)
check('admin sees storage used', /B/.test(await ad.getByTestId('stat-storage').innerText()))
await ad.screenshot({ path: out + 'cloud-admin.png', fullPage: true })
const rowB = ad.getByTestId('admin-user').filter({ hasText: B })
await rowB.getByTestId('toggle-lock').click()
await rowB.getByText('Đã khóa').waitFor()
check('admin locks a user', true)
check('rules: locked user loses access (REST)', (await rest(B, 'GET', `trees/${treeId}/people`)) === 403)
await rowB.getByTestId('toggle-lock').click()
await rowB.getByText('Đã khóa').waitFor({ state: 'detached' })
check('admin unlocks the user', (await rest(B, 'GET', `trees/${treeId}/people`)) === 200)
const rowC = ad.getByTestId('admin-user').filter({ hasText: C })
await rowC.getByTestId('toggle-admin').click()
await rowC.getByText('Quản trị', { exact: true }).waitFor()
check('admin grants admin rights', (await rest(C, 'GET', 'users')) === 200)
await rowC.getByTestId('toggle-admin').click()
await rowC.getByText('Quản trị', { exact: true }).waitFor({ state: 'detached' })
check('admin revokes admin rights', (await rest(C, 'GET', 'users')) === 403)
await ad.getByTestId('admin-tab-trees').click()
const rowT = ad.getByTestId('admin-tree').filter({ has: ad.locator(`a[href="/t/${treeId}"]`) })
check('admin lists all trees', (await rowT.count()) === 1)
await rowT.getByTestId('toggle-hide-tree').click()
await rowT.getByText('Đang bị ẩn').waitFor()
await b.goto(`${base}/t/${treeId}`)
await b.waitForSelector('text=không có quyền')
check('moderation: hidden tree is no longer visible to members', true)
await rowT.getByTestId('toggle-hide-tree').click()
await rowT.getByText('Đang bị ẩn').waitFor({ state: 'detached' })
await b.reload()
await cards(b).first().waitFor()
check('moderation: un-hiding restores access', true)

// 9. owner deletes the tree
a.once('dialog', (d) => d.accept())
await a.getByTestId('tree-menu').click()
await a.getByTestId('menu-delete').click()
await a.waitForURL((u) => u.pathname === '/')
check('owner deletes the tree', (await rest(A, 'GET', `trees/${treeId}`)) !== 200)
await done(browser)
