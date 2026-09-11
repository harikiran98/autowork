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

// A hosted 504 must recover without asking the user to edit the agent. The
// second request is a fresh function invocation using the same provider's fast
// model and low effort, while keeping the original task contract.
if (new URL(BASE).hostname === 'localhost' || new URL(BASE).hostname === '127.0.0.1') {
  const artifacts = await page.evaluate(async () => {
    const api = await import('/src/output/artifacts.ts')
    const formats = ['Word document', 'PDF report', 'Excel spreadsheet', 'PowerPoint deck', 'Markdown', 'JSON', 'CSV', 'HTML']
    return Promise.all(formats.map(async (format) => {
      const file = await api.buildOutputFile('# Delivery\n\n| Item | Value |\n|---|---|\n| Status | Complete |', format, 'Export probe')
      const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer())
      return { format, name: file.name, size: file.size, magic: [...bytes] }
    }))
  })
  assert.ok(artifacts.every((item) => item.size > 20))
  assert.deepEqual(artifacts.find((item) => item.format === 'PDF report').magic, [37, 80, 68, 70])
  for (const format of ['Word document', 'Excel spreadsheet', 'PowerPoint deck']) assert.deepEqual(artifacts.find((item) => item.format === format).magic.slice(0, 2), [80, 75])
  step('built valid downloadable PDF, Word, Excel, PowerPoint, Markdown, JSON, CSV and HTML files')

  const recoveryBodies = []
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON()
    if (!String(body.prompt).includes('timeout recovery probe')) return route.continue()
    recoveryBodies.push(body)
    if (recoveryBodies.length === 1) {
      return route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ error: 'The operation was aborted due to timeout' }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'automatic recovery completed' }) })
  })
  const recovered = await page.evaluate(async () => {
    const api = await import('/src/api/client.ts')
    return api.runAgent({ provider: 'anthropic', model: 'claude-opus-4-1', prompt: 'timeout recovery probe', effort: 'high', maxTokens: 5200 })
  })
  assert.equal(recovered.text, 'automatic recovery completed')
  assert.equal(recovered.model, 'claude-haiku-4-5')
  assert.equal(recovered.recoveredFromTimeout, true)
  assert.equal(recoveryBodies.length, 2)
  assert.equal(recoveryBodies[1].model, 'claude-haiku-4-5')
  assert.equal(recoveryBodies[1].effort, 'low')
  assert.equal(recoveryBodies[1].maxTokens, 1600)
  await page.unroute('**/api/chat')
  step('recovered a hosted 504 automatically with the provider fast model')
}

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

// A sub-agent can report to Kira, and can later receive descendants of its own.
await page.getByRole('button',{name:'New agent'}).click()
await page.getByLabel('Name',{exact:true}).fill('Nova')
await page.locator('[role=dialog]').getByRole('button',{name:'Design Systems',exact:true}).click()
const novaDialog = page.getByRole('dialog', { name: 'New agent' })
const parentOptions = novaDialog.locator('#new-agent-parent option')
const parentLabels = await parentOptions.allTextContents()
const kiraParentIndex = parentLabels.findIndex((label) => label.includes('Kira'))
assert.ok(kiraParentIndex >= 0)
await novaDialog.getByLabel('Reports to').selectOption(await parentOptions.nth(kiraParentIndex).getAttribute('value'))
await novaDialog.getByLabel('Role name').fill('Component researcher')
await novaDialog.getByLabel('Describe the role').fill('Researches component behavior for the parent agent.')
await novaDialog.getByRole('button',{name:'Create agent'}).click()
await page.waitForTimeout(800)
assert.equal(await page.getByRole('button', { name: /Nova.*reports to Kira/ }).count(), 1)
step('created recursive sub-agent "Nova" under Kira')

// Explicit breaks override normal desk, cubicle, and workflow destinations.
await page.getByRole('button',{name:/Kira, Design systems analyst/}).first().click()
await page.locator('aside .overflow-y-auto').first().evaluate(el=>el.scrollTo(0,el.scrollHeight))
await page.getByRole('button',{name:'Take a break'}).click()
await page.getByRole('button',{name:'Return to desk'}).waitFor()
await page.getByRole('button',{name:'Return to desk'}).click()
await page.getByRole('button',{name:'Take a break'}).waitFor()
step('break control sends the agent out and returns it to work')
await page.getByRole('button',{name:'Close'}).click()

// The workspace power state is reversible and keeps queues/memory intact.
await page.getByLabel('Shut down workspace').click()
await page.getByLabel('Turn on workspace').waitFor()
await page.getByLabel('Turn on workspace').click()
await page.getByLabel('Shut down workspace').waitFor()
step('workspace power control shuts down and resumes')

// ---- upload text extracted from Word, a native PDF, and an arbitrary binary ----
await page.getByRole('button',{name:'Files'}).click()
await page.waitForTimeout(600)
const docx = zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
  'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>We need a date-picker component with range selection.</w:t></w:r></w:p></w:body></w:document>'),
})
await page.setInputFiles('input[type=file]', [
  { name:'AS_IS_Spot Billing_V1.2.docx', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer:Buffer.from(docx) },
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
await taskInput.fill('Review AS_IS_Spot Billing_V1.2 and write acceptance criteria for the date picker.')
await page.getByRole('button',{name:'Add',exact:true}).click()
await page.waitForTimeout(300)
await taskInput.fill('List the edge cases QA should cover.')
await page.getByRole('button',{name:'Add',exact:true}).click()
await page.waitForTimeout(500)
step('added 2 tasks')

// Mentioning a workspace filename attaches it automatically—uploading to the
// Files library must not require a second, easy-to-miss manual action.
await page.waitForTimeout(400)
assert.ok(await page.locator('button:has-text("1 file attached")').count() >= 1)
step('matched the mentioned Word file to the individual task automatically')

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
await page.getByText('Awaiting your approval').first().waitFor()
while (await page.getByRole('button', { name: 'Approve, save & learn' }).count()) {
  await page.getByRole('button', { name: 'Approve, save & learn' }).first().click()
  await page.waitForTimeout(400)
}
// Case-insensitive: the section heading is rendered through `uppercase`, and
// innerText reports the transformed text.
const memoryPanel = await page.locator('aside').first().innerText()
assert.match(memoryPanel, /approved learning memory/i)
assert.match(memoryPanel, /the approved approach\/output was/i)
step('approved individual drafts and stored learning memory')
await page.screenshot({ path:SHOTS + 'e2e-3-run.png' })

// ---- run a collaborative team workflow with lead approval ----
await page.getByRole('button',{name:'Assign',exact:true}).click()
await page.getByRole('button',{name:'Entire team'}).click()
await page.getByLabel('Assign to').selectOption('platform')
await page.getByLabel('Work brief').fill('Produce a concise release readiness checklist for this feature.')
await page.getByLabel('Output format').fill('Markdown checklist with owner and evidence columns')
await page.getByRole('button',{name:'Assign & start'}).click()
const teamCard = page.locator('article').filter({ hasText: 'release readiness checklist' })
await teamCard.getByText(/Waiting for your approval/).waitFor({ timeout: 20000 })
assert.match(await teamCard.innerText(), /3\/3 contributions/)
assert.doesNotMatch(await teamCard.innerText(), /Shared with every team as/)
await teamCard.getByRole('button', { name: 'Approve, share & learn' }).click()
await teamCard.getByText(/Delivered/).waitFor()
assert.match(await teamCard.innerText(), /Shared with every team as platform-/)
const sharedDelivery = page.getByRole('button', { name: /platform-.*\.md/ })
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

// The workspace name has to come back with it. A profile that was stored while
// still unnamed used to defeat the hydrate fallback, so the header showed the
// generic "Workspace" label and the first-run dialog reopened over a workspace
// that already existed.
assert.equal(await page.getByRole('dialog', { name: 'Create your workspace' }).count(), 0)
// The header prints the name and mirrors it into `title`, falling back to the
// generic "Workspace" when the profile is empty — so this reads the exact
// element that regressed.
const workspaceLabel = page.locator('header p[title]').first()
assert.equal(await workspaceLabel.getAttribute('title'), 'E2E Studio')
assert.equal((await workspaceLabel.innerText()).trim(), 'E2E Studio')
const savedProfile = await page.evaluate(() => {
  const key = Object.keys(localStorage).find((name) => name.endsWith(':state:v1'))
  return key ? JSON.parse(localStorage.getItem(key)).profile : null
})
assert.equal(savedProfile?.workspaceName, 'E2E Studio')
assert.equal(savedProfile?.ownerName, 'E2E Owner')
step('workspace name and owner survived the reload')

// ---- shutting down while a model request is genuinely in flight ----
// The mock holds a [[slow]] prompt open, so the power button has to interrupt
// a live call rather than one that already resolved.
await page.getByRole('button',{name:'Close panel'}).click()
await page.getByRole('button',{name:/Kira, Design systems analyst/}).first().click()
await page.waitForTimeout(1200)
await page.getByLabel('New task').fill('Draft the rollout note. [[slow]]')
await page.getByRole('button',{name:'Add',exact:true}).click()
await page.waitForTimeout(400)
await page.locator('aside .overflow-y-auto').first().evaluate(el=>el.scrollTo(0,el.scrollHeight))
await page.getByRole('button',{name:/Run 1 task/}).click()
await page.getByRole('button',{name:/^Running/}).waitFor({ timeout: 15000 })
step('a model request is in flight')

await page.getByLabel('Shut down workspace').click()
await page.getByLabel('Turn on workspace').waitFor()
await page.waitForTimeout(1500)
const panelWhileOff = await page.locator('aside').first().innerText()
// Interrupted work must return to a resumable queued state, never to a failure.
assert.match(panelWhileOff, /Workspace is shut down/)
assert.match(panelWhileOff, /Queued/)
assert.doesNotMatch(panelWhileOff, /Failed/)
step('shutdown aborted the live request and requeued the task')

// ---- power state survives a reload, and restoring it resumes the run ----
await page.waitForTimeout(1200)
await page.reload({ waitUntil:'load' })
await page.waitForTimeout(4000)
await page.getByLabel('Turn on workspace').waitFor({ timeout: 15000 })
assert.equal(await page.locator('header p[title]').first().getAttribute('title'), 'E2E Studio')
step('power state and workspace name persisted across the reload')

await page.getByLabel('Turn on workspace').click()
await page.getByLabel('Shut down workspace').waitFor()
await page.getByRole('button',{name:'Outputs',exact:true}).click()
await page.locator('article').filter({ hasText: 'Draft the rollout note' }).first()
  .waitFor({ timeout: 45000 })
assert.equal(await page.locator('article').count(), 4)
step('restoring power resumed the interrupted run from its queued stage')

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

const unexpectedErrors = errs.filter((message) => !message.includes('status of 504 (Gateway Timeout)'))
console.log('  errors:', unexpectedErrors.length ? unexpectedErrors.slice(0, 5) : 'none')
assert.deepEqual(unexpectedErrors, [])
await browser.close()
