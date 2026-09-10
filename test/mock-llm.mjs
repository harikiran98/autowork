// Stand-in for the Anthropic Messages API, so the run loop can be exercised
// end to end in CI without a real key or network access.
import { createServer } from 'node:http'
createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}')
    const user = parsed.messages?.[0]?.content ?? ''
    const sawFile = user.includes('--- FILE:')
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        content: [
          {
            type: 'text',
            text: `MOCK REPLY for "${user.slice(0, 60).replace(/\n/g, ' ')}"${sawFile ? ' [file received]' : ''}`,
          },
        ],
      }),
    )
  })
}).listen(9911, '127.0.0.1', () => console.log('mock llm on 9911'))
