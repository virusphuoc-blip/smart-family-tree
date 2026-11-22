// Guest-mode browser self-test at 390px. Usage: node e2e/guest.mjs [baseUrl]
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { open } from './util.mjs'

const base = process.argv[2] ?? 'http://localhost:5173'
const out = new URL('./out/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
const { browser, page, check, done } = await open(chromium, base)

const footerOk = async () => {
  const f = page.getByTestId('copyright')
  const box = await f.boundingBox()
  return (await f.innerText()).trim() === '© 2026 VH Phước. Mọi nội dung thuộc về VH Phước.' && box && box.y >= 700 && box.y + box.height <= 844.5
}
await page.goto(base)
check('copyright footer visible at the bottom of the home screen', await footerOk())
check('page title', (await page.title()) === 'Gia Phả Thông Minh - Smart Family Tree')
await page.getByTestId('load-demo').click()
await page.waitForSelector('[data-testid=tree-diagram] [data-id]')
check('demo tree renders 17 member cards', (await page.locator('[data-testid=tree-diagram] [data-id]').count()) === 17)
check('header shows 3 generations', (await page.locator('header ~ main').innerText()).includes('3 thế hệ'))
check('UI language is Vietnamese', (await page.locator('html').getAttribute('lang')) === 'vi')
check('no horizontal overflow at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= 390))
check('copyright footer visible inside the tree view', await footerOk())
await page.screenshot({ path: out + 'guest-tree.png' })

// pan + zoom
const d = page.getByTestId('tree-diagram')
const before = { zoom: await d.getAttribute('data-zoom'), pan: await d.getAttribute('data-pan') }
await page.getByLabel('Phóng to').click()
check('zoom button changes scale', (await d.getAttribute('data-zoom')) !== before.zoom)
const box = await d.boundingBox()
await page.mouse.move(box.x + 60, box.y + box.height - 60)
await page.mouse.down()
await page.mouse.move(box.x + 160, box.y + box.height - 140, { steps: 5 })
await page.mouse.up()
check('dragging pans the diagram', (await d.getAttribute('data-pan')) !== before.pan)
await page.mouse.move(box.x + 100, box.y + 300)
const z1 = await d.getAttribute('data-zoom')
await page.mouse.wheel(0, -300)
await page.waitForTimeout(100)
check('wheel zooms', (await d.getAttribute('data-zoom')) !== z1)
await page.getByLabel('Vừa màn hình').click()

// collapse / expand
const toggles = page.locator('[data-toggle]')
await toggles.first().dispatchEvent('pointerdown', { pointerId: 9, clientX: 1, clientY: 1 })
await toggles.first().dispatchEvent('pointerup', { pointerId: 9, clientX: 1, clientY: 1 })
const afterCollapse = await page.locator('[data-testid=tree-diagram] [data-id]').count()
check('collapse hides a branch', afterCollapse < 17, String(afterCollapse))
await toggles.first().dispatchEvent('pointerdown', { pointerId: 9, clientX: 1, clientY: 1 })
await toggles.first().dispatchEvent('pointerup', { pointerId: 9, clientX: 1, clientY: 1 })
check('expand restores it', (await page.locator('[data-testid=tree-diagram] [data-id]').count()) === 17)

// search -> profile panel -> kinship labels
const openPerson = async (name) => {
  await page.getByTestId('tab-members').click()
  await page.getByTestId('search').fill(name)
  await page.getByTestId('member-list').getByText(name, { exact: true }).first().click()
  await page.waitForSelector('[data-testid=person-panel]')
}
await page.getByTestId('search').fill('minh')
check('search finds by name without diacritics', (await page.getByTestId('search-results').innerText()).includes('Nguyễn Văn Minh'))
await openPerson('Nguyễn Văn Minh')
const rel = await page.getByTestId('relatives').innerText().catch(() => '')
await page.getByText(/Xem tất cả/).click()
const relAll = await page.getByTestId('relatives').innerText()
const kin = JSON.parse(readFileSync(new URL('./kinship-expected.json', import.meta.url)))
for (const [who, term] of Object.entries(kin)) {
  const row = relAll.split('\n').findIndex((l) => l.trim() === who)
  const got = relAll.split('\n').slice(row + 1, row + 3).join(' ')
  if (who !== '__') check(`kinship: Minh gọi ${who} là "${term}"`, row >= 0 && got.includes(term), got)
}
void rel
await page.getByTestId('set-ego').click()
await page.getByTestId('tab-diagram').click()
check('ego banner + labels on cards', (await page.getByTestId('ego-banner').innerText()).includes('Nguyễn Văn Minh') && (await d.innerText().catch(() => '')) !== null && (await page.locator('[data-testid=tree-diagram] text', { hasText: 'Ông nội' }).count()) >= 1)
await page.screenshot({ path: out + 'guest-kinship.png' })

// relation path between two members
await page.getByTestId('relation-open').click()
const opts = await page.getByTestId('relation-a').locator('option').allInnerTexts()
await page.getByTestId('relation-a').selectOption({ label: 'Nguyễn Văn Minh' })
await page.getByTestId('relation-b').selectOption({ label: opts.find((o) => o.includes('Lê Thị Thảo')) })
await page.getByTestId('relation-show').click()
const res = await page.getByTestId('relation-result').innerText()
check('relation finder explains the link + path', res.includes('gọi') && res.includes('Đường nối'), res.replace(/\n/g, ' | '))
check('path is highlighted on the diagram', (await page.locator('[data-testid=tree-diagram] path[stroke="#d97706"]').count()) > 0)
await page.screenshot({ path: out + 'guest-path.png' })

// add / edit / delete a member
await page.getByTestId('add-person').click()
await page.getByTestId('person-name').fill('Nguyễn Thử Nghiệm')
await page.getByTestId('person-father').selectOption({ label: (await page.getByTestId('person-father').locator('option').allInnerTexts()).find((o) => o.startsWith('Nguyễn Văn Minh')) })
await page.getByTestId('person-save').click()
await page.waitForSelector('[data-testid=person-panel]')
check('new member saved and profile opens', (await page.getByTestId('panel-name').innerText()) === 'Nguyễn Thử Nghiệm')
check("new child calls Minh Cha", /Nguyễn Văn Minh\s+Cha/.test(await page.getByTestId("relatives").innerText()))
page.once('dialog', (dlg) => dlg.accept())
await page.getByTestId('delete-person').click()
await page.waitForSelector('[data-testid=person-panel]', { state: 'detached' })
await page.reload()
await page.waitForSelector('[data-testid=tree-diagram] [data-id]')
check('data persists locally after reload (17 members)', (await page.locator('[data-testid=tree-diagram] [data-id]').count()) === 17)

// timeline
await page.getByTestId('tab-timeline').click()
const all = await page.getByTestId('timeline').locator('li').count()
await page.getByTestId('timeline-filter').selectOption({ label: 'Nguyễn Văn Minh' })
const some = await page.getByTestId('timeline').locator('li').count()
check('timeline lists events and filters by member', all > 20 && some > 0 && some < all, `${all} -> ${some}`)
const years = (await page.getByTestId('timeline').locator('li p:first-child').allInnerTexts()).map((t) => Number(t.match(/\d{4}/)?.[0]))
check('timeline sorted by date', years.every((y, i) => i === 0 || y >= years[i - 1]))
await page.screenshot({ path: out + 'guest-timeline.png' })

// media (local) with compression
await page.getByTestId('tab-media').click()
const bigPng = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 2000
  const x = c.getContext('2d'); for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${i * 7},70%,50%)`; x.fillRect(Math.random() * 3000, Math.random() * 2000, 300, 300) }
  return c.toDataURL('image/png').split(',')[1]
})
await page.getByTestId('media-input').setInputFiles({ name: 'anh-gia-dinh.png', mimeType: 'image/png', buffer: Buffer.from(bigPng, 'base64') })
await page.waitForSelector('[data-testid=media-item] img')
const dims = await page.locator('[data-testid=media-item] img').evaluate((img) => new Promise((r) => (img.complete ? r([img.naturalWidth, img.naturalHeight]) : (img.onload = () => r([img.naturalWidth, img.naturalHeight])))))
check('photo compressed in browser to max 1920px', dims[0] === 1920, dims.join('x'))
check('storage usage shown', /KB|MB/.test(await page.getByTestId('storage-usage').innerText()))

// exports
const dl = async (testid) => {
  await page.getByTestId('tree-menu').click()
  await page.getByTestId('menu-export').click()
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId(testid).click()])
  const path = out + download.suggestedFilename()
  await download.saveAs(path)
  await page.keyboard.press('Escape')
  return path
}
writeFileSync(out + 'exports.json', JSON.stringify({ xlsx: await dl('export-xlsx'), png: await dl('export-png'), pdf: await dl('export-pdf') }))
check('three export files downloaded', true)

// docx import (pattern fallback, no key)
await page.getByTestId('tree-menu').click()
await page.getByTestId('menu-import').click()
check('explains that AI import needs a key', (await page.getByTestId('import-nokey').innerText()).includes('cần khóa API'))
await page.getByTestId('import-input').setInputFiles(new URL('../public/samples/gia-pha-mau.docx', import.meta.url).pathname)
await page.waitForSelector('[data-testid=import-review]')
check('review screen lists 12 extracted people', (await page.getByTestId('draft').count()) === 12)
await page.getByTestId('draft').nth(0).getByLabel('Họ và tên').fill('Phạm Văn Khải (đã sửa)')
await page.getByTestId('draft').nth(11).getByLabel('Thêm người này').uncheck()
await page.screenshot({ path: out + 'guest-import-review.png' })
await page.getByTestId('import-confirm').click()
await page.waitForSelector('[data-testid=import-review]', { state: 'detached' })
await page.getByTestId('tab-members').click()
const members = await page.getByTestId('member-list').innerText()
check('confirmed people added with edits (17 + 11 = 28)', (await page.getByTestId('member-list').locator('li').count()) === 28 && members.includes('Phạm Văn Khải (đã sửa)'))
await openPerson('Phạm Minh Tuấn')
await page.getByText(/Xem tất cả/).click().catch(() => {})
check('imported relationships work (Tuấn gọi Phạm Văn Lộc là Ông nội)', /Phạm Văn Lộc\s+Ông nội/.test(await page.getByTestId('relatives').innerText()))

// PWA + settings
await page.goto(base + '/settings')
await page.waitForSelector('[data-testid=llm-key]')
check('settings page: AI key field + guest notice', (await page.getByTestId('llm-key').count()) === 1 && (await page.locator('main').innerText()).includes('khách'))
check('copyright footer on settings', await footerOk())
await page.goto(base + '/login')
await page.waitForSelector('[data-testid=copyright]')
check('copyright footer on login', await footerOk())
await done(browser)
