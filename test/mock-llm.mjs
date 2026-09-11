// Stand-in for the Anthropic Messages API, so the run loop can be exercised
// end to end in CI without a real key or network access.
import { createServer } from 'node:http'

// Shutdown has to be testable against a request that is genuinely still in
// flight, not one that already resolved. A prompt containing this marker is
// answered slowly so the test can pull the power mid-call.
const SLOW_MARKER = '[[slow]]'
const SLOW_MS = Number(process.env.MOCK_SLOW_MS || 20000)

createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}')
    const isOpenAI = req.url?.includes('/responses')
    const content = isOpenAI
      ? parsed.input?.find((message) => message.role === 'user')?.content ?? ''
      : parsed.messages?.find((message) => message.role === 'user')?.content ?? ''
    const user = Array.isArray(content)
      ? content.filter((part) => part.type === 'text' || part.type === 'input_text').map((part) => part.text).join('\n')
      : content
    const sawFile = user.includes('--- FILE:') || (Array.isArray(content) && content.some((part) => ['document', 'image', 'file', 'image_url', 'input_file', 'input_image'].includes(part.type)))
    const text = user.includes('Review the team\'s work against every requirement')
      ? 'VERDICT: APPROVED\nFINAL:\n# Mock team delivery\n\nThe team lead reviewed and approved this collaborative output.'
      : `MOCK REPLY for "${user.slice(0, 60).replace(/\n/g, ' ')}"${sawFile ? ' [file received]' : ''}`
    const payload = JSON.stringify(isOpenAI
      ? { output: [{ type: 'message', content: [{ type: 'output_text', text, annotations: [] }] }] }
      : { content: [{ type: 'text', text }] })

    const reply = () => {
      if (res.writableEnded) return
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(payload)
    }

    if (!user.includes(SLOW_MARKER)) return reply()
    const timer = setTimeout(reply, SLOW_MS)
    // The proxy drops its socket when the browser aborts. Releasing the timer
    // then keeps the mock from holding the process open after a test run.
    res.on('close', () => clearTimeout(timer))
  })
}).listen(9911, '127.0.0.1', () => console.log('mock llm on 9911'))
