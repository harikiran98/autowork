import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { strToU8, zipSync } from 'fflate'

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
await page.getByRole('dialog', { name: 'Create your workspace' }).waitFor()
await page.getByLabel('Your name').fill('E2E Owner')
await page.getByLabel('Workspace name').fill('E2E Studio')
await page.getByLabel('Contact number').fill('+91 90000 00000')
await page.getByRole('dialog', { name: 'Create your workspace' }).getByRole('button', { name: 'Enter workspace' }).click()
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
await page.getByLabel('Role name').fill('Design systems analyst')
await page.getByLabel('Describe the role').fill('Turns product needs into component requirements and accessible acceptance criteria.')
await page.getByText('Make this agent the team lead').click()
await page.getByRole('button',{name:'Create agent'}).click()
await page.waitForTimeout(2500)
step('created agent "Kira" in Design Systems')

// ---- upload text extracted from Word, a native PDF, and an arbitrary binary ----
await page.getByRole('button',{name:'Files'}).click()
await page.waitForTimeout(600)
const docx = zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
  'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>We need a date-picker component with range selection.</w:t></w:r></w:p></w:body></w:document>'),
})
await page.setInputFiles('input[type=file]', [
  { name:'brief.docx', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer:Buffer.from(docx) },
  { name:'reference.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF') },
  { name:'design.blend', mimeType:'application/octet-stream', buffer:Buffer.from([1,2,3,4,5]) },
])
// Wait for the upload round-trip rather than guessing at a delay.
await page.locator('li:has-text("design.blend")').first().waitFor({ timeout: 10000 })
assert.equal(await page.locator('li:has-text("reference.pdf")').count(), 1)
assert.equal(await page.locator('li:has-text("design.blend")').count(), 1)
console.log('  Word, PDF, and arbitrary binary files listed')
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
await page.getByRole('button',{name:/brief\.docx/}).first().click()
await page.waitForTimeout(400)
console.log('  attachment label:', await page.locator('button:has-text("1 file attached")').count())

// attach the PDF to the second task; it should use Claude's native document block
await page.getByRole('button',{name:'Attach files'}).first().click()
await page.waitForTimeout(200)
await page.getByRole('button',{name:/reference\.pdf/}).last().click()

// ---- run ----
await page.locator('aside .overflow-y-auto').first().evaluate(el=>el.scrollTo(0,el.scrollHeight))
await page.waitForTimeout(400)
const runBtn = page.getByRole('button',{name:/Run 2 tasks/})
console.log('  run button present:', await runBtn.count())
await runBtn.click()
await page.waitForTimeout(3500)
step('ran tasks')
await page.screenshot({ path:SHOTS + 'e2e-3-run.png' })

// ---- run a collaborative team workflow with lead approval ----
await page.getByRole('button',{name:'Assign',exact:true}).click()
await page.getByRole('button',{name:'Entire team'}).click()
await page.getByLabel('Assign to').selectOption('platform')
await page.getByLabel('Work brief').fill('Produce a concise release readiness checklist for this feature.')
await page.getByLabel('Output format').fill('Markdown checklist with owner and evidence columns')
await page.getByRole('button',{name:'Assign & start'}).click()
const teamCard = page.locator('article').filter({ hasText: 'release readiness checklist' })
await teamCard.getByText(/Delivered/).waitFor({ timeout: 20000 })
assert.match(await teamCard.innerText(), /3\/3 contributions/)
assert.match(await teamCard.innerText(), /Shared with every team as platform-delivery-/)
const sharedDelivery = page.getByRole('button', { name: /platform-delivery-.*\.md/ })
await sharedDelivery.waitFor()
await page.getByLabel('Assign to').selectOption('growth')
assert.equal(await sharedDelivery.isVisible(), true, 'Completed team output must remain attachable after selecting another team')
step('team lead delegated, collected, reviewed, and delivered team work')

// ---- outputs ----
await page.getByRole('button',{name:'Outputs',exact:true}).click()
await page.waitForTimeout(1000)
const bodies = await page.locator('article').allInnerTexts()
console.log('  output cards:', bodies.length)
console.log('  file was received by model:', bodies.join(' ').includes('[file received]'))
assert.equal(bodies.length, 3)
assert.ok(bodies.join(' ').includes('[file received]'))
assert.ok(bodies.join(' ').includes('Mock team delivery'))
await page.screenshot({ path:SHOTS + 'e2e-4-outputs.png' })

// ---- persistence ----
await page.waitForTimeout(1200)
await page.reload({ waitUntil:'load' })
await page.waitForTimeout(4000)
const rosterText = await page.locator('nav').first().textContent()
console.log('  after reload, Design Systems present:', rosterText.includes('Design Systems'))
console.log('  after reload, Kira present:', rosterText.includes('Kira'))
assert.ok(rosterText.includes('Design Systems') && rosterText.includes('Kira'))
await page.getByRole('button',{name:'Outputs',exact:true}).click()
await page.waitForTimeout(900)
console.log('  after reload, outputs kept:', await page.locator('article').count())
assert.equal(await page.locator('article').count(), 3)
await page.screenshot({ path:SHOTS + 'e2e-5-reload.png' })

// ---- account isolation on a shared browser ----
await page.getByRole('button',{name:'Open account menu'}).click()
await page.getByRole('button',{name:'Log out'}).click()
await page.getByLabel('Email address').fill('family@autowork.local')
await page.locator('input[type="password"]').first().fill('family-test-password')
await page.getByRole('button',{name:/Enter workspace/}).click()
await page.getByRole('dialog', { name: 'Create your workspace' }).waitFor()
await page.getByLabel('Your name').fill('Family Member')
await page.getByLabel('Workspace name').fill('Family Studio')
await page.getByRole('dialog', { name: 'Create your workspace' }).getByRole('button', { name: 'Enter workspace' }).click()
await page.waitForTimeout(1500)
const familyRoster = await page.locator('nav').first().textContent()
assert.ok(!familyRoster.includes('Design Systems') && !familyRoster.includes('Kira'))
step('kept the second account isolated from the first')

console.log('  errors:', errs.length?errs.slice(0,5):'none')
assert.deepEqual(errs, [])
await browser.close()
