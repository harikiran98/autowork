import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url))

mkdirSync(SHOTS, { recursive: true })

const AUDIT = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }

  // Worst-case backdrop for translucent panels: the 3D canvas clear colour.
  const canvasBg =
    parse(getComputedStyle(document.documentElement).getPropertyValue('--color-canvas').trim()) ||
    { r: 238, g: 241, b: 247, a: 1 }

  const effectiveBg = (el) => {
    const layers = []
    let node = el
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor)
      if (c && c.a > 0) {
        layers.push(c)
        if (c.a === 1) break
      }
      node = node.parentElement
    }
    let base = canvasBg
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base)
    return base
  }

  const hasOwnText = (el) =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)

  const results = []
  for (const el of document.querySelectorAll('body *')) {
    if (!hasOwnText(el)) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue

    const fgRaw = parse(cs.color)
    if (!fgRaw) continue
    const bg = effectiveBg(el)
    const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw

    const size = parseFloat(cs.fontSize)
    const weight = Number(cs.fontWeight) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const required = large ? 3 : 4.5
    const r = ratio(fg, bg)

    results.push({
      text: el.textContent.trim().slice(0, 34),
      cls: el.className?.toString?.().slice(0, 48) ?? '',
      size, weight,
      fg: `rgb(${fg.r.toFixed(0)},${fg.g.toFixed(0)},${fg.b.toFixed(0)})`,
      bg: `rgb(${bg.r.toFixed(0)},${bg.g.toFixed(0)},${bg.b.toFixed(0)})`,
      ratio: Number(r.toFixed(2)),
      required,
      pass: r >= required,
    })
  }
  return results
}

const browser = await chromium.launch({
  // Set CHROME_PATH to use an existing browser; otherwise Playwright's own.
  executablePath: process.env.CHROME_PATH || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']})

for (const scheme of ['light','dark']) {
  const page = await browser.newPage({ viewport:{width:1440,height:900}, colorScheme: scheme })
  const errs=[]; page.on('pageerror',e=>errs.push(e.message))
    await page.goto(BASE, { waitUntil: 'load' })
    const loginPage = await page.evaluate(AUDIT)
    await page.getByLabel('Email address').fill(`${scheme}@autowork.local`)
    await page.locator('input[type="password"]').first().fill('contrast-test-password')
    await page.getByRole('button',{name:/Enter workspace/}).click()
  await page.waitForTimeout(3800)
  await page.screenshot({ path: SHOTS + `theme-${scheme}-default.png` })

  await page.getByRole('button',{name:/Ada/}).first().click()
  await page.waitForTimeout(2200)
  await page.screenshot({ path: SHOTS + `theme-${scheme}-panel.png` })

  const closed = await page.evaluate(AUDIT)

  // Tasks + outputs + files + dialogs all carry new colour combinations.
  await page.getByLabel('New task').fill('Draft the migration plan.')
  await page.getByRole('button',{name:'Add',exact:true}).click()
  await page.waitForTimeout(400)
  const withTask = await page.evaluate(AUDIT)

  await page.getByRole('button',{name:/^Outputs/}).click()
  await page.waitForTimeout(700)
  const outputs = await page.evaluate(AUDIT)
  await page.screenshot({ path: SHOTS + `theme-${scheme}-outputs.png` })
  await page.locator('aside').filter({ hasText: 'Drop text or code files' }).first().isVisible().catch(()=>{})
  await page.getByRole('button',{name:'Files',exact:true}).click()
  await page.waitForTimeout(600)
  const filesTab = await page.evaluate(AUDIT)
  await page.getByRole('button',{name:'Close panel'}).click()
  await page.waitForTimeout(400)

  await page.getByRole('button',{name:'New agent'}).click()
  await page.waitForTimeout(600)
  const dialog = await page.evaluate(AUDIT)
  await page.screenshot({ path: SHOTS + `theme-${scheme}-dialog.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // audit with a dropdown open too
  await page.getByRole('button',{name:/Ada/}).first().click()
  await page.waitForTimeout(1200)
  await page.getByRole('button',{name:/Provider Anthropic/}).first().click()
  await page.waitForTimeout(500)
  const opened = await page.evaluate(AUDIT)
  await page.screenshot({ path: SHOTS + `theme-${scheme}-dropdown.png` })

  const all = [...loginPage, ...closed, ...withTask, ...outputs, ...filesTab, ...dialog, ...opened]
  const fails = all.filter(r => !r.pass)
  const min = all.reduce((m,r)=> r.ratio < m.ratio ? r : m, all[0])
  console.log(`\n=== ${scheme.toUpperCase()} === checked ${all.length} text nodes, failures: ${fails.length}`)
  console.log(`  lowest passing ratio: ${min.ratio} on "${min.text}" (${min.size}px/${min.weight})`)
  for (const f of fails.slice(0,14)) {
    console.log(`  FAIL ${f.ratio} (need ${f.required})  ${f.size}px/${f.weight}  "${f.text}"  fg=${f.fg} bg=${f.bg}  ${f.cls}`)
  }
  if (errs.length) console.log('  pageerrors:', errs)
  await page.close()
}
await browser.close()
