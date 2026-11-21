export async function open(chromium, base) {
  const browser = process.env.CDP ? await chromium.connectOverCDP(process.env.CDP) : await chromium.launch({ executablePath: process.env.CHROME || undefined, channel: process.env.CHROME ? undefined : 'chrome' })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, locale: 'vi-VN' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()))
  page.setDefaultTimeout(15000)
  let failed = 0
  const check = (name, ok, extra = '') => {
    if (!ok) failed++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra && !ok ? `  [${extra}]` : ''}`)
  }
  const done = async () => {
    check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' || '))
    await context.close()
    if (!process.env.CDP) await browser.close()
    console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
    process.exit(failed ? 1 : 0)
  }
  return { browser, context, page, check, done, base }
}
