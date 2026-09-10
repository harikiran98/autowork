import assert from 'node:assert/strict'
import netlifyApi, { handleEventForTests } from '../netlify/functions/api.mjs'

process.env.WORKPLACE_ACCESS_CODE = 'test-access'

const unauthenticated = await netlifyApi(new Request('https://autowork.example/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ provider: 'openai', model: 'test', prompt: 'hello' }),
}))
assert.equal(unauthenticated.status, 401)

const health = await handleEventForTests({ httpMethod: 'GET', path: '/api/health', headers: {} })
assert.equal(health.statusCode, 200)
assert.equal(JSON.parse(health.body).requiresAccess, true)

const locked = await handleEventForTests({
  httpMethod: 'POST',
  path: '/api/chat',
  headers: {},
  body: JSON.stringify({ provider: 'openai', model: 'test', prompt: 'hello' }),
})
assert.equal(locked.statusCode, 401)

const invalidProvider = await handleEventForTests({
  httpMethod: 'POST',
  path: '/api/chat',
  headers: { 'x-workplace-access': 'test-access' },
  body: JSON.stringify({ provider: 'unknown', model: 'test', prompt: 'hello' }),
})
assert.equal(invalidProvider.statusCode, 400)

delete process.env.WORKPLACE_ACCESS_CODE
console.log('Netlify function contract passed')
