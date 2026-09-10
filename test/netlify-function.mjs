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

const originalFetch = globalThis.fetch
let upstreamBody
globalThis.fetch = async (_url, options) => {
  upstreamBody = JSON.parse(options.body)
  return new Response(JSON.stringify({ content: [{ type: 'text', text: 'document received' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
process.env.ANTHROPIC_API_KEY = 'test-key'

const documentRequest = await handleEventForTests({
  httpMethod: 'POST', path: '/api/chat', headers: {},
  body: JSON.stringify({
    provider: 'anthropic', model: 'test-model', prompt: 'Review these files',
    attachmentContents: [
      { name: 'brief.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document', text: 'Extracted Word content' },
      { name: 'reference.pdf', mimeType: 'application/pdf', kind: 'pdf', data: 'JVBERi0xLjQ=' },
    ],
  }),
})
assert.equal(documentRequest.statusCode, 200)
assert.ok(upstreamBody.messages[0].content.some((part) => part.type === 'document'))
assert.ok(upstreamBody.messages[0].content.some((part) => part.type === 'text' && part.text.includes('Extracted Word content')))

const unsupportedClaudeFile = await handleEventForTests({
  httpMethod: 'POST', path: '/api/chat', headers: {},
  body: JSON.stringify({
    provider: 'anthropic', model: 'test-model', prompt: 'Review this binary',
    attachmentContents: [{ name: 'scene.blend', mimeType: 'application/octet-stream', kind: 'binary', data: 'AQID' }],
  }),
})
assert.equal(unsupportedClaudeFile.statusCode, 415)

delete process.env.ANTHROPIC_API_KEY
globalThis.fetch = originalFetch
console.log('Netlify function contract passed')
