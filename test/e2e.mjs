import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url))

mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch({
  // Set CHROME_PATH to use an existing browser; otherwise Playwright's own.
  executablePath: process.env.CHROME_PATH || undefined,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']})
const page = await browser.newPage({ viewport:{width:1440,height:900} })
const errs=[]; page.on('pageerror',e=>errs.push(e.message))
page.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text()) })
const step = (s)=>console.log('  ✓ '+s)

await page.goto(BASE, { waitUntil: 'load' })
await page.getByLabel('Email address').fill('e2e@autowork.local')
await page.locator('input[type="password"]').first().fill('e2e-test-password')
await page.getByRole('button',{name:/Enter workspace/}).click()
await page.waitForTimeout(4000)

// ---- create a team ----
await page.getByRole('button',{name:'New team'}).click()
await page.getByLabel('Name',{exact:true}).fill('Design Systems')
await page.getByLabel(/Mission/).fill('Own the component library.')
await page.getByRole('button',{name:'Create team'}).click()
await page.waitForTimeout(2500)
step('created team "Design Systems"')
await page.screenshot({ path:SHOTS + 'e2e-1-team.png' })

// ---- create an agent into it ----
await page.getByRole('button',{name:'New agent'}).click()
await page.getByLabel('Name',{exact:true}).fill('Kira')
await page.locator('[role=dialog]').getByRole('button',{name:'Design Systems',exact:true}).click()
await page.locator('[role=dialog]').getByRole('button',{name:/Business Analyst/}).click()
await page.getByRole('button',{name:'Create agent'}).click()
await page.waitForTimeout(2500)
step('created agent "Kira" in Design Systems')

// ---- upload a file ----
await page.getByRole('button',{name:'Files'}).click()
await page.waitForTimeout(600)
await page.setInputFiles('input[type=file]', {
  name:'brief.md', mimeType:'text/markdown',
  buffer: Buffer.from('# Brief\nWe need a date-picker component with range selection.'),
})
// Wait for the upload round-trip rather than guessing at a delay.
await page.locator('li:has-text("brief.md")').first().waitFor({ timeout: 10000 })
console.log('  files listed:', await page.locator('li:has-text("brief.md")').count())
await page.screenshot({ path:SHOTS + 'e2e-2-files.png' })
await page.getByRole('button',{name:'Close panel'}).click()
await page.waitForTimeout(400)

// ---- assign tasks ----
await page.getByRole('button',{name:/Kira/}).first().click()
await page.waitForTimeout(1500)
const taskInput = page.getByLabel('New task')
await taskInput.fill('Write acceptance criteria for the date picker.')
await page.getByRole('button',{name:'Add',exact:true}).click()
await page.waitForTimeout(300)
await taskInput.fill('List the edge cases QA should cover.')
await page.getByRole('button',{name:'Add',exact:true}).click()
await page.waitForTimeout(500)
step('added 2 tasks')

// attach the file to the first task
await page.getByRole('button',{name:'Attach files'}).first().click()
await page.waitForTimeout(300)
await page.getByRole('button',{name:/brief\.md/}).first().click()
await page.waitForTimeout(400)
console.log('  attachment label:', await page.locator('button:has-text("1 file attached")').count())

// ---- run ----
await page.locator('aside .overflow-y-auto').first().evaluate(el=>el.scrollTo(0,el.scrollHeight))
await page.waitForTimeout(400)
const runBtn = page.getByRole('button',{name:/Run 2 tasks/})
console.log('  run button present:', await runBtn.count())
await runBtn.click()
await page.waitForTimeout(3500)
step('ran tasks')
await page.screenshot({ path:SHOTS + 'e2e-3-run.png' })

// ---- outputs ----
await page.getByRole('button',{name:/Outputs/}).click()
await page.waitForTimeout(1000)
const bodies = await page.locator('article').allInnerTexts()
console.log('  output cards:', bodies.length)
console.log('  file was received by model:', bodies.join(' ').includes('[file received]'))
assert.equal(bodies.length, 2)
assert.ok(bodies.join(' ').includes('[file received]'))
await page.screenshot({ path:SHOTS + 'e2e-4-outputs.png' })

// ---- persistence ----
await page.waitForTimeout(1200)
await page.reload({ waitUntil:'load' })
await page.waitForTimeout(4000)
const rosterText = await page.locator('nav').first().textContent()
console.log('  after reload, Design Systems present:', rosterText.includes('Design Systems'))
console.log('  after reload, Kira present:', rosterText.includes('Kira'))
assert.ok(rosterText.includes('Design Systems') && rosterText.includes('Kira'))
await page.getByRole('button',{name:/Outputs/}).click()
await page.waitForTimeout(900)
console.log('  after reload, outputs kept:', await page.locator('article').count())
assert.equal(await page.locator('article').count(), 2)
await page.screenshot({ path:SHOTS + 'e2e-5-reload.png' })

// ---- account isolation on a shared browser ----
await page.getByRole('button',{name:/Sign out e2e@autowork.local/}).click()
await page.getByLabel('Email address').fill('family@autowork.local')
await page.locator('input[type="password"]').first().fill('family-test-password')
await page.getByRole('button',{name:/Enter workspace/}).click()
await page.waitForTimeout(1000)
const familyRoster = await page.locator('nav').first().textContent()
assert.ok(!familyRoster.includes('Design Systems') && !familyRoster.includes('Kira'))
step('kept the second account isolated from the first')

console.log('  errors:', errs.length?errs.slice(0,5):'none')
assert.deepEqual(errs, [])
await browser.close()
