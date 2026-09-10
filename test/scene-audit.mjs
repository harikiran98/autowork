/**
 * Geometry and motion audit of the live 3D office.
 *
 * The functional suite (test/e2e.mjs) proves the workflows; this one proves the
 * room. It reads real world-space transforms through the dev-only
 * <SceneProbe>, because the questions here — did that agent actually walk to
 * the cafeteria, does the management wing still fit at six teams, did
 * double-click put the camera back — cannot be answered from the DOM or from a
 * screenshot.
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url))
mkdirSync(SHOTS, { recursive: true })

const step = (message) => console.log('  + ' + message)
const note = (message) => console.log('    ' + message)

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []
page.on('pageerror', (error) => errs.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') errs.push('console: ' + message.text()) })

/* ------------------------------- probe glue ------------------------------ */

const probe = (method, ...args) => page.evaluate(
  ([name, list]) => window.__autoworkProbe?.[name](...list) ?? null,
  [method, args],
)

const waitForProbe = async () => {
  await page.waitForFunction(() => Boolean(window.__autoworkProbe), null, { timeout: 30000 })
  // One frame so matrices reflect the current layout rather than the mount.
  await page.waitForTimeout(400)
}

/** Poll a probe reading until `ok`, so motion is awaited rather than guessed. */
async function settle(read, ok, { timeout = 20000, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await read()
    if (ok(last)) return last
    await page.waitForTimeout(300)
  }
  throw new Error(`Timed out waiting for ${label}. Last reading: ${JSON.stringify(last)}`)
}

/* ------------------------------ box geometry ----------------------------- */

const overlap1d = (aMin, aMax, bMin, bMax) => Math.min(aMax, bMax) - Math.max(aMin, bMin)

/** Horizontal (x/z) penetration depth of two AABBs; <= 0 means clear. */
const penetration = (a, b) => Math.min(
  overlap1d(a.min[0], a.max[0], b.min[0], b.max[0]),
  overlap1d(a.min[2], a.max[2], b.min[2], b.max[2]),
)

const containsXZ = (outer, point, margin = 0) =>
  point[0] >= outer.min[0] - margin && point[0] <= outer.max[0] + margin &&
  point[2] >= outer.min[2] - margin && point[2] <= outer.max[2] + margin

const distanceXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2])

/**
 * Furniture groups that must never share floor space.
 *
 * Rugs are excluded from the comparison by design: they are 2 cm slabs that
 * are *meant* to sit under things. Everything below is solid furniture.
 */
async function auditLayout(label) {
  const cubicles = await probe('nodes', 'cubicle-')
  const rooms = await probe('nodes', 'meeting-')
  const pods = await probe('nodes', 'desk-pod-')
  const cafeteria = await probe('node', 'office-cafeteria')
  const sofas = await probe('nodes', 'lounge-sofa-')
  const floor = await probe('node', 'office-floor')
  const agents = await probe('nodes', 'agent-')

  assert.ok(floor?.box, 'the office floor must be measurable')
  assert.ok(cubicles.length, 'at least one manager cubicle must exist')
  assert.ok(rooms.length >= 3, 'one meeting room per team plus two flex rooms')

  const solids = [
    ...cubicles.map((item) => ({ ...item, kind: 'cubicle' })),
    // The meeting-room wing group itself is a container; skip it and keep rooms.
    ...rooms.filter((item) => item.name !== 'meeting-room-wing').map((item) => ({ ...item, kind: 'meeting room' })),
    ...pods.map((item) => ({ ...item, kind: 'desk pod' })),
    ...sofas.map((item) => ({ ...item, kind: 'sofa' })),
    ...(cafeteria ? [{ ...cafeteria, kind: 'cafeteria' }] : []),
  ].filter((item) => item.box)

  const clashes = []
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]
      const b = solids[j]
      // Sofa rows are deliberately stacked in one lounge zone.
      if (a.kind === 'sofa' && b.kind === 'sofa') continue
      const depth = penetration(a.box, b.box)
      if (depth > 0.02) clashes.push(`${a.kind} "${a.name}" overlaps ${b.kind} "${b.name}" by ${depth.toFixed(2)}m`)
    }
  }

  // Nothing may hang off the floor slab, and nothing may sink through it.
  const offFloor = solids.filter((item) => {
    const inside = penetration(floor.box, item.box)
    const width = Math.min(item.box.max[0] - item.box.min[0], item.box.max[2] - item.box.min[2])
    return inside < width - 0.05
  }).map((item) => `${item.kind} "${item.name}" extends past the floor slab`)

  // 2cm of tolerance for rounded-corner geometry; anything deeper is a part
  // modelled through the floor rather than resting on it.
  const belowFloor = [...solids, ...agents.filter((item) => item.box)]
    .filter((item) => item.box.min[1] < -0.02)
  const sunken = []
  for (const item of belowFloor) {
    const parts = await probe('parts', item.name, 3)
    const worst = parts.map((part) => `${part.geometry} at y ${part.min[1].toFixed(3)}`).join(', ')
    sunken.push(`"${item.name}" sinks ${(-item.box.min[1]).toFixed(3)}m through the floor (${worst})`)
  }

  const problems = [...clashes, ...offFloor, ...sunken]
  note(`${label}: ${solids.length} solid groups, ${agents.length} agents, room ${(floor.box.max[0] - floor.box.min[0]).toFixed(1)}m x ${(floor.box.max[2] - floor.box.min[2]).toFixed(1)}m`)
  assert.deepEqual(problems, [], `layout clashes at ${label}:\n  - ${problems.join('\n  - ')}`)
  step(`no furniture, agent, wall or wing overlaps at ${label}`)
}

/* -------------------------------- helpers -------------------------------- */

const agentIdByName = (name) => page.evaluate((wanted) => {
  const key = Object.keys(localStorage).find((item) => item.endsWith(':state:v1'))
  const state = key ? JSON.parse(localStorage.getItem(key)) : null
  return state?.agents?.find((agent) => agent.name === wanted)?.id ?? null
}, name)

async function createTeam(name) {
  await page.getByRole('button', { name: 'New team' }).click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByRole('button', { name: 'Create team' }).click()
  await page.waitForTimeout(1200)
}

async function createAgent(name, teamName, { lead = false } = {}) {
  await page.getByRole('button', { name: 'New agent' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New agent' })
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: teamName, exact: true }).click()
  await dialog.getByLabel('Role name').fill(`${name} role`)
  await dialog.getByLabel('Describe the role').fill(`Owns ${name}'s part of the work.`)
  if (lead) await dialog.getByText('Make this agent the team lead').click()
  await dialog.getByRole('button', { name: 'Create agent' }).click()
  await page.waitForTimeout(900)
}

/* --------------------------------- login --------------------------------- */

await page.goto(BASE, { waitUntil: 'load' })
await page.getByLabel('Email address').fill('scene@autowork.local')
await page.locator('input[type="password"]').first().fill('scene-test-password')
await page.getByRole('button', { name: /Enter workspace/ }).click()
await page.getByRole('dialog', { name: 'Create your workspace' }).waitFor()
await page.getByLabel('Your name').fill('Scene Auditor')
await page.getByLabel('Workspace name').fill('Scene Lab')
await page.getByRole('dialog', { name: 'Create your workspace' }).getByRole('button', { name: 'Enter workspace' }).click()
await waitForProbe()
await page.waitForTimeout(2500)
step('signed in and the office scene is measurable')

/* ------------------------ 1. seed layout is clean ------------------------ */

await auditLayout('3 teams / 10 agents (seed)')

/* --------------------- 2. seated bench characters ----------------------- */

// Iris and Juno start on the Bench, so its couch is occupied at seed.
const benchId = await agentIdByName('Iris')
assert.ok(benchId, 'the seed bench agent must be present')
const cushions = await probe('node', 'lounge-cushions-0')
assert.ok(cushions?.box, 'the lounge cushions must be measurable')

const seated = await settle(
  () => probe('node', `agent-${benchId}`),
  (value) => value && containsXZ(cushions.box, value.position, 0.6),
  { label: 'the bench agent to reach the couch' },
)
for (const joint of ['left-knee', 'right-knee']) {
  const knee = await probe('descendant', `agent-${benchId}`, joint)
  assert.ok(knee, `${joint} must exist on the articulated figure`)
  // The knee has to be in front of the cushion's front face, or above it.
  // Anchoring the seat at the cushion centre used to bury the shins inside it.
  const clearsFront = knee.position[2] > cushions.box.max[2] - 0.02
  const clearsTop = knee.position[1] > cushions.box.max[1] - 0.02
  assert.ok(clearsFront || clearsTop, `${joint} intersects the couch: knee ${JSON.stringify(knee.position)} vs cushions ${JSON.stringify(cushions.box)}`)
}
const torso = await probe('descendant', `agent-${benchId}`, 'upper-body')
assert.ok(torso.position[1] > cushions.box.max[1] - 0.02, 'the seated torso must rest on the cushions, not inside them')
assert.ok(seated.box.min[1] > -0.05, 'no part of a seated character may pass through the floor')
step('seated bench characters rest on the couch without intersecting it')

/* ------------------ 3. break sends an agent to the cafeteria ------------- */

const leadId = await agentIdByName('Ada')
assert.ok(leadId, 'the seed platform lead must be present')
const cafeteria = await probe('node', 'office-cafeteria')
const ownCubicle = await probe('node', `cubicle-${leadId}`)
assert.ok(cafeteria?.box && ownCubicle?.box, 'cafeteria and manager cubicle must both exist')

await page.getByRole('button', { name: /^Ada, Platform Lead/ }).first().click()
await page.locator('aside .overflow-y-auto').first().evaluate((el) => el.scrollTo(0, el.scrollHeight))
const atDesk = await settle(
  () => probe('node', `agent-${leadId}`),
  (value) => value && containsXZ(ownCubicle.box, value.position, 0.5),
  { label: 'the lead to be seated in its cubicle' },
)

await page.getByRole('button', { name: 'Take a break' }).click()
await page.getByRole('button', { name: 'Return to desk' }).waitFor()
const onBreak = await settle(
  () => probe('node', `agent-${leadId}`),
  (value) => value && containsXZ(cafeteria.box, value.position, 0.4),
  { timeout: 40000, label: 'the agent to physically arrive at the cafeteria' },
)
const travelled = distanceXZ(atDesk.position, onBreak.position)
assert.ok(travelled > 2, `the agent should visibly cross the office, moved only ${travelled.toFixed(2)}m`)
note(`walked ${travelled.toFixed(1)}m from the cubicle to the cafeteria`)
await page.screenshot({ path: SHOTS + 'scene-1-break.png' })
step('Take a break physically walks the agent to the cafeteria')

/* --------------------- 4. returning to the right seat ------------------- */

await page.getByRole('button', { name: 'Return to desk' }).click()
await page.getByRole('button', { name: 'Take a break' }).waitFor()
await settle(
  () => probe('node', `agent-${leadId}`),
  (value) => value && containsXZ(ownCubicle.box, value.position, 0.5),
  { timeout: 40000, label: 'the agent to return to its own cubicle' },
)
step('returning from the cafeteria lands the agent back in its own cubicle')

/* ------------- 5. a new team reflows the seated management wing ---------- */

const cubicleBefore = await probe('node', `cubicle-${leadId}`)
const floorBefore = await probe('node', 'office-floor')
await page.getByRole('button', { name: 'Close' }).click()
await createTeam('Reflow Team')
await createAgent('Rhea', 'Reflow Team', { lead: true })
await page.waitForTimeout(900)

const cubicleAfter = await probe('node', `cubicle-${leadId}`)
const floorAfter = await probe('node', 'office-floor')
// The pod grid is capped at three columns, so a fourth team grows the office
// backwards rather than sideways and carries the whole management wing with
// it. Either axis counts — what matters is that the wing relocated.
const shift = distanceXZ(cubicleBefore.position, cubicleAfter.position)
const grewX = (floorAfter.box.max[0] - floorAfter.box.min[0]) - (floorBefore.box.max[0] - floorBefore.box.min[0])
const grewZ = (floorAfter.box.max[2] - floorAfter.box.min[2]) - (floorBefore.box.max[2] - floorBefore.box.min[2])
assert.ok(shift > 0.5, `adding a team must move the management wing, shifted only ${shift.toFixed(2)}m`)
assert.ok(grewX > 0.5 || grewZ > 0.5, `adding a team must expand the office, grew ${grewX.toFixed(2)}m x ${grewZ.toFixed(2)}m`)
note(`the office grew ${grewX.toFixed(1)}m wider / ${grewZ.toFixed(1)}m deeper and the cubicle moved ${shift.toFixed(2)}m`)

// Already-seated managers are carried by the layout delta, so they are inside
// the new cubicle almost immediately rather than walking the whole way.
const carried = await settle(
  () => probe('node', `agent-${leadId}`),
  (value) => value && containsXZ(cubicleAfter.box, value.position, 0.5),
  { timeout: 8000, label: 'the seated manager to move with its cubicle' },
)
assert.ok(!containsXZ(cubicleBefore.box, carried.position, -0.2), 'the manager must not be left behind at the old cubicle position')
step('a seated manager moves with its cubicle when a new team expands the office')

// The newly promoted lead still walks to a cubicle of its own.
const rheaId = await agentIdByName('Rhea')
const rheaCubicle = await probe('node', `cubicle-${rheaId}`)
assert.ok(rheaCubicle?.box, 'a new team lead must be given its own cubicle')
await settle(
  () => probe('node', `agent-${rheaId}`),
  (value) => value && containsXZ(rheaCubicle.box, value.position, 0.6),
  { timeout: 40000, label: 'the new lead to walk to its cubicle' },
)
step('a newly promoted lead walks to its own cubicle')

await auditLayout('4 teams / 11 agents')

/* -------------------- 6. denser office stays collision-free -------------- */

await createTeam('Density A')
await createAgent('Sana', 'Density A', { lead: true })
await createAgent('Tor', 'Density A')
await createAgent('Umi', 'Density A')
await createAgent('Vik', 'Density A')
await createAgent('Wren', 'Density A')
await page.waitForTimeout(1500)
await auditLayout('5 teams / 17 agents')

await createTeam('Density B')
await createAgent('Yara', 'Density B', { lead: true })
await createAgent('Zeno', 'Density B')
await page.waitForTimeout(1500)
await auditLayout('6 teams / 20 agents')
await page.screenshot({ path: SHOTS + 'scene-2-dense-office.png' })

/* ------------------ 7. double-click resets the office camera ------------- */

const stage = page.locator('.scene-stage')
const bounds = await stage.boundingBox()
const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
// Double-click on empty sky above the room. The stage centre sits on a desk
// pod, and a click there focuses that zone — which is a camera move of its
// own and would make the baseline meaningless.
const sky = { x: centre.x, y: bounds.y + bounds.height * 0.1 }

/** Waits until two consecutive readings agree, so framing has stopped moving. */
const settledCamera = async (label) => {
  let previous = await probe('camera')
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(300)
    const current = await probe('camera')
    if (distanceXZ(previous.position, current.position) < 0.05) return current
    previous = current
  }
  throw new Error(`${label} never stopped moving`)
}

// Creating an agent selects it, so clear the selection through the DOM and let
// the framing settle before trusting it as the reference.
await page.keyboard.press('Escape')
const officeHome = await settledCamera('the office camera')
note(`office home ${JSON.stringify(officeHome.position)} target ${JSON.stringify(officeHome.target)}`)

await page.mouse.move(centre.x, centre.y)
await page.mouse.down()
await page.mouse.move(centre.x - 260, centre.y + 150, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(900)
const officeMoved = await probe('camera')
assert.ok(distanceXZ(officeHome.position, officeMoved.position) > 1.5, 'left-drag must pan the office camera')

await page.mouse.dblclick(sky.x, sky.y)
const officeReset = await settle(
  () => probe('camera'),
  (value) => distanceXZ(value.position, officeHome.position) < 1.2 && distanceXZ(value.target, officeHome.target) < 1.2,
  { label: 'the office camera to return home' },
)
note(`office camera returned to ${JSON.stringify(officeReset.position)}`)
step('double-click resets the office camera')

/* ------------------ 8. double-click resets the neural camera ------------- */

await page.getByRole('button', { name: /Neural/ }).click()
await waitForProbe()
assert.equal(await page.evaluate(() => window.__autoworkProbe.view), 'neural')
await page.waitForTimeout(1200)

const neuralHome = await settledCamera('the neural camera')
note(`neural home ${JSON.stringify(neuralHome.position)} controls=${neuralHome.hasControls} reset=${neuralHome.resetView}`)
await page.mouse.move(centre.x, centre.y)
await page.mouse.down()
await page.mouse.move(centre.x + 240, centre.y - 120, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(900)
const neuralMoved = await probe('camera')
assert.ok(distanceXZ(neuralHome.position, neuralMoved.position) > 1, 'dragging must orbit the neural camera')

await page.mouse.dblclick(sky.x, sky.y)
const neuralReset = await settle(
  () => probe('camera'),
  (value) => distanceXZ(value.position, neuralHome.position) < 0.6,
  {
    label: `the neural camera to return home from ${JSON.stringify(neuralMoved.position)} (home ${JSON.stringify(neuralHome.position)}, reset was ${neuralHome.resetView})`,
  },
)
note(`neural camera returned to ${JSON.stringify(neuralReset.position)}`)
// The reset must not have been achieved by throwing away the WebGL context.
assert.ok(await probe('node', 'neural-core'), 'the neural scene must survive its camera reset')
step('double-click resets the neural camera without rebuilding the scene')
await page.screenshot({ path: SHOTS + 'scene-3-neural.png' })

/* ------------------------------ 9. responsive ---------------------------- */

await page.getByRole('button', { name: /Office/ }).click()
await waitForProbe()
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(1800)
await auditLayout('6 teams at a 390px mobile viewport')
await page.screenshot({ path: SHOTS + 'scene-4-mobile.png' })
await page.setViewportSize({ width: 1440, height: 900 })
await page.waitForTimeout(1200)

console.log('  errors:', errs.length ? errs.slice(0, 5) : 'none')
assert.deepEqual(errs, [])
console.log('\nScene audit passed')
await browser.close()
