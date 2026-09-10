import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const output = fileURLToPath(new URL('./screenshots/', import.meta.url))
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light' })
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
try {
  await page.goto(process.env.BASE_URL || 'http://localhost:5173/')
  await page.screenshot({ path: output + 'autowork-login.png' })
  await page.getByLabel('Email address').fill('visual@autowork.local')
  await page.locator('input[type="password"]').first().fill('visual-test-password')
  await page.getByRole('button', { name: /Enter workspace/ }).click()
  await page.waitForTimeout(3500)
  assert.match(await page.title(), /autowork/)
  await page.screenshot({ path: output + 'autowork-office-light.png' })
  await page.getByRole('button', { name: /Ada/ }).first().click()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: output + 'autowork-agent-closeup.png' })
  // Verify actual rendered joint origins after animation has run, not a static snapshot.
  const anatomy = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas')
    const moduleURL = performance.getEntriesByType('resource').find(e => /\/deps\/@react-three_fiber\.js/.test(e.name))?.name
    if (!moduleURL) throw new Error('Cannot find rendered React Three Fiber root')
    const { _roots } = await import(moduleURL)
    const scene = _roots.get(canvas)?.store.getState().scene
    if (!scene) throw new Error('Scene unavailable: anatomy was not verified')
    window.reviewScene = scene
    window.reviewState = _roots.get(canvas).store.getState()
    if (Math.abs(scene.getObjectByName('agent-a9').position.x) > 2) throw new Error('Lounge seating is not centered: check stale floorplan cache')
    const figures = []
    scene.traverse(node => {
      if (node.name !== 'character-body') return
      const upper = node.getObjectByName('upper-body')
      const left = node.getObjectByName('left-hip')
      const right = node.getObjectByName('right-hip')
      figures.push({ upper: upper.position.y, leftHip: left.position.y, rightHip: right.position.y, hasKnees: Boolean(left.getObjectByName('left-knee') && right.getObjectByName('right-knee')) })
    })
    return { figures }
  })
  console.log('Animated anatomy:', JSON.stringify(anatomy))
  assert.equal(anatomy.figures.length, 10)
  for (const f of anatomy.figures) { assert.ok(f.upper > f.leftHip); assert.ok(f.hasKnees) }
  const transforms = () => page.evaluate(() => {
    const nodes = []
    window.reviewScene.traverse(n => { if (/^(agent-|character-body|left-hip|right-hip|left-knee|right-knee)/.test(n.name)) nodes.push([n.name, ...n.position.toArray(), ...n.rotation.toArray()]) })
    return nodes
  })
  const beforeWalk = await transforms()
  await page.waitForTimeout(1000)
  assert.notDeepEqual(await transforms(), beforeWalk, 'Agents must actually move')
  await page.getByRole('button', { name: 'Office', exact: true }).click()
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await page.waitForTimeout(1400)
  await page.screenshot({ path: output + 'autowork-office-dark.png' })
  await page.getByRole('button', { name: /Iris/ }).first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: output + 'autowork-walking-closeup.png' })
  await page.getByRole('button', { name: /Pause motion/ }).click()
  await page.waitForTimeout(600)
  const pausedTransforms = await transforms()
  await page.screenshot({ path: output + 'autowork-pause-a.png' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: output + 'autowork-pause-b.png' })
  assert.deepEqual(await transforms(), pausedTransforms, 'Pause must freeze characters and joint transforms')
  await page.getByRole('button', { name: /Resume motion/ }).click()
  await page.waitForTimeout(800)
  assert.notDeepEqual(await transforms(), pausedTransforms, 'Resume must restart motion')
  await page.getByRole('button', { name: 'Neural', exact: true }).click()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: output + 'autowork-neural.png' })
  const neural = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas')
    const moduleURL = performance.getEntriesByType('resource').find(e => /\/deps\/@react-three_fiber\.js/.test(e.name))?.name
    const { _roots } = await import(moduleURL)
    const scene = _roots.get(canvas)?.store.getState().scene
    return { agents: scene.children.length && [...Array(10)].filter((_, i) => scene.getObjectByName(`neural-agent-a${i + 1}`)).length, core: Boolean(scene.getObjectByName('neural-core')) }
  })
  assert.deepEqual(neural, { agents: 10, core: true })
  await page.getByRole('button', { name: 'Office', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: output + 'autowork-mobile.png' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile overflow')
  await page.getByRole('button', { name: 'Neural', exact: true }).click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: output + 'autowork-neural-mobile.png' })
  await page.getByRole('button', { name: 'Office', exact: true }).click()
  await page.getByRole('button', { name: /Iris/ }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: output + 'autowork-mobile-selected.png' })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: /Ada/ }).first().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: output + 'autowork-laptop-selected.png' })
  const visibleTarget = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas')
    const moduleURL = performance.getEntriesByType('resource').find(e => /\/deps\/@react-three_fiber\.js/.test(e.name))?.name
    const { _roots } = await import(moduleURL)
    const { scene, camera, raycaster } = _roots.get(canvas).store.getState()
    const chest = scene.getObjectByName('agent-a1').position.clone().setY(1.2)
    raycaster.set(camera.position, chest.sub(camera.position).normalize())
    const hit = raycaster.intersectObjects(scene.children, true).find(hit => {
      for (let node = hit.object; node; node = node.parent) if (!node.visible) return false
      return true
    })
    for (let node = hit?.object; node; node = node.parent) if (node.name.startsWith('agent-')) return node.name
    return 'occluded by furniture or wall'
  })
  assert.equal(visibleTarget, 'agent-a1', 'Selected agent must be visible, not behind a wall')
  assert.equal(await page.evaluate(() => document.querySelector('header').scrollWidth > document.querySelector('header').clientWidth), false, 'Header overflow on laptop')
  const reduced = await browser.newPage({ reducedMotion: 'reduce' })
  await reduced.goto(process.env.BASE_URL || 'http://localhost:5173/')
  await reduced.getByLabel('Email address').fill('reduced@autowork.local')
  await reduced.locator('input[type="password"]').first().fill('reduced-test-password')
  await reduced.getByRole('button', { name: /Enter workspace/ }).click()
  await reduced.getByRole('button', { name: /Resume motion/ }).waitFor()
  await reduced.close()
  await page.getByRole('button', { name: /Sign out visual@autowork.local/ }).click()
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor()
  console.log('PASS: login/logout, ten articulated figures, neural graph, movement, pause/resume, reduced motion, mobile/laptop layout, branding')
  console.log('Browser errors:', errors)
  assert.deepEqual(errors, [])
} finally { await browser.close() }
