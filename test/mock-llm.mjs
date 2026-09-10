// Stand-in for the Anthropic Messages API, so the run loop can be exercised
// end to end in CI without a real key or network access.
import { createServer } from 'node:http'
createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}')
    const content = parsed.messages?.find((message) => message.role === 'user')?.content ?? ''
    const user = Array.isArray(content)
      ? content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
      : content
    const sawFile = user.includes('--- FILE:') || (Array.isArray(content) && content.some((part) => ['document', 'image', 'file', 'image_url'].includes(part.type)))
    const text = user.includes('Review the team\'s work against every requirement')
      ? 'VERDICT: APPROVED\nFINAL:\n# Mock team delivery\n\nThe team lead reviewed and approved this collaborative output.'
      : `MOCK REPLY for "${user.slice(0, 60).replace(/\n/g, ' ')}"${sawFile ? ' [file received]' : ''}`
    const isOpenAI = req.url?.includes('chat/completions')
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(isOpenAI
      ? { choices: [{ message: { role: 'assistant', content: text } }] }
      : { content: [{ type: 'text', text }] }))
  })
}).listen(9911, '127.0.0.1', () => console.log('mock llm on 9911'))
