// Smoke test against the real Firebase project configured in .env.local (creates and then deletes one test account).
import { chromium } from 'playwright-core'
import { open } from './util.mjs'
const base = process.argv[2] ?? 'http://localhost:5175'
const { browser, page, check, done } = await open(chromium, base)
const email = `selftest-${Date.now().toString(36)}@example.com`, PASS = 'Kiemthu#2026'
const logs = []
page.on('console', (m) => logs.push(m.text()))
await page.goto(base + '/login')
await page.getByRole('button', { name: 'Đăng ký', exact: true }).click()
await page.getByTestId('auth-name').fill('Tài khoản tự kiểm thử')
await page.getByTestId('auth-email').fill(email)
await page.getByTestId('auth-password').fill(PASS)
await page.getByTestId('auth-submit').click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'))
check('real project: register', true)
await page.goto(base + '/settings')
await page.waitForSelector('[data-testid=logout]')
check('real project: session restored, settings shows the email', (await page.locator('main').innerText()).includes(email))
await page.getByTestId('logout').click()
await page.waitForSelector('[data-testid=logout]', { state: 'detached' })
await page.goto(base + '/login')
await page.getByTestId('auth-email').fill(email)
await page.getByTestId('auth-password').fill(PASS)
await page.getByTestId('auth-submit').click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'))
check('real project: login', true)
// cloud write attempt
await page.goto(base)
await page.getByTestId('new-tree').click()
await page.getByTestId('tree-name').fill('Cây kiểm thử đồng bộ')
await page.getByTestId('create-tree-submit').click()
await page.waitForTimeout(6000)
console.log('URL after create:', page.url())
console.log('BODY:', (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 600))
console.log('LOGS:', logs.filter((l) => /permission|firestore|denied/i.test(l)).slice(0, 3).join(' || ').slice(0, 500))
await page.screenshot({ path: new URL('./out/real.png', import.meta.url).pathname })
// clean up the test account
const key = process.env.VITE_FIREBASE_API_KEY
const j = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) })).json()
const del = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: j.idToken }) })
check('test account deleted again', del.status === 200, String(del.status))
await done(browser)
