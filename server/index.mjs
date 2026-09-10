/**
 * Local API proxy for the AI Agent Workplace.
 *
 * WHY THIS EXISTS: a Vite frontend cannot hold an API key. Anything the browser
 * can read is in the shipped bundle — including `VITE_*` environment variables,
 * which are string-substituted at build time and sit in plain text in the JS.
 * Anyone who opens the page can read the key and spend your credits.
 *
 * So the key lives here, in a process the browser never sees, and the frontend
 * talks to this over /api. Zero npm dependencies: Node's built-in http server
 * and global fetch only.
 *
 * It also owns the two things that must outlive a page refresh:
 *   - data/state.json   teams, agents, task lists and past run outputs
 *   - workspace/        files you upload for agents to work on
 */
import { createServer } from 'node:http'
import {
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename, extname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Minimal .env loader.
 *
 * Node's own --env-file flag exists but its behaviour when the file is missing
 * changed across Node 20/22, and a first-run crash before the user has made a
 * .env is a bad welcome. Ten lines here works the same on every supported Node.
 */
function loadEnv() {
  const file = join(ROOT, '.env')
  if (!existsSync(file)) return
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    // Strip surrounding quotes — pasting a quoted key is a common slip.
    const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && !(key in process.env)) process.env[key] = value
  }
}

loadEnv()

const PORT = Number(process.env.PORT || 8787)
const MAX_BODY_BYTES = 6 * 1024 * 1024
const MAX_FILE_BYTES = 1024 * 1024
const WORKSPACE = join(ROOT, 'workspace')
const DATA_DIR = join(ROOT, 'data')
const STATE_FILE = join(DATA_DIR, 'state.json')
const ANTHROPIC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
/** Mirrors the hosted gateway so a slow model behaves the same in both places. */
const MODEL_TIMEOUT_MS = Math.max(5000, Math.min(120000, Number(process.env.MODEL_TIMEOUT_MS) || 24000))

/** Text formats an LLM can actually read as-is. Anything else is refused. */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rst', '.csv', '.tsv', '.json', '.jsonl',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.xml', '.html', '.htm', '.css',
  '.scss', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go',
  '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.swift',
  '.sh', '.bash', '.ps1', '.sql', '.graphql', '.log', '.srt', '.vtt',
])

/** Called before every write, not just at boot: the folders can be deleted or
 *  moved while the server is running, and an upload should recover rather than
 *  fail with an opaque ENOENT. */
function ensureDirs() {
  for (const dir of [WORKSPACE, DATA_DIR]) if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

ensureDirs()

/* ------------------------------- providers ------------------------------- */

const PROVIDERS = {
  openai: {
    envKey: 'OPENAI_API_KEY',
    // Override to point at Azure OpenAI, a corporate gateway, or a local mock.
    endpoint: `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`,
    headers: (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` }),
    body: ({ model, system, prompt, effort, maxTokens, attachments }) => {
      // o-series reasoning models reject `temperature` and rename the token
      // budget. Sending the chat-model shape to them is a 400.
      const isReasoning = /^o\d/.test(model)
      const content = [
        { type: 'text', text: prompt },
        // Both parts need a full data URL; bare base64 in `file_data` is
        // accepted but unreadable, so the model sees no attachment.
        ...attachments.map((file) => file.mimeType.startsWith('image/')
          ? { type: 'image_url', image_url: { url: `data:${file.mimeType};base64,${file.data}` } }
          : { type: 'file', file: { filename: file.name, file_data: `data:${file.mimeType};base64,${file.data}` } }),
      ]
      return {
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: attachments.length ? content : prompt },
        ],
        ...(isReasoning
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
        reasoning_effort: effort,
      }
    },
    text: (json) => json?.choices?.[0]?.message?.content ?? '',
  },

  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    // Override to point at a gateway or a local mock.
    endpoint: `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'}/messages`,
    headers: (key) => ({
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    body: ({ model, system, prompt, effort, maxTokens, attachments }) => ({
      model,
      max_tokens: maxTokens,
      ...(/(?:-5|4\.[6-9])/.test(model) ? { thinking: { type: 'adaptive' }, output_config: { effort } } : {}),
      ...(system ? { system } : {}),
      messages: [{
        role: 'user',
        content: attachments.length ? [
          ...attachments.map((file) => file.mimeType === 'application/pdf'
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
            : { type: 'image', source: { type: 'base64', media_type: file.mimeType, data: file.data } }),
          { type: 'text', text: prompt },
        ] : prompt,
      }],
    }),
    text: (json) =>
      Array.isArray(json?.content)
        ? json.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
        : '',
  },
}

/* -------------------------------- helpers -------------------------------- */

const json = (res, status, payload) => {
  const data = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
  })
  res.end(data)
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('Body was not valid JSON'))
      }
    })
    req.on('error', reject)
  })

/**
 * Reduce any client-supplied name to a bare filename inside workspace/.
 * `basename` strips directory components, so "../../.env" becomes ".env" and
 * cannot escape the folder; the leading-dot and extension checks reject it
 * again. Control characters are stripped so a name cannot spoof the listing.
 */
function safeFilename(name) {
  const stripped = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '')
  const base = basename(stripped).trim()
  if (!base || base.startsWith('.')) return null
  if (!TEXT_EXTENSIONS.has(extname(base).toLowerCase())) return null
  return base
}

function cleanAttachment(item) {
  if (!item || typeof item !== 'object') return null
  const name = basename(String(item.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '')).trim()
  const mimeType = String(item.mimeType || 'application/octet-stream').toLowerCase().slice(0, 120)
  const kind = String(item.kind || 'binary').slice(0, 24)
  const text = typeof item.text === 'string' ? item.text : ''
  const data = typeof item.data === 'string' && /^[a-zA-Z0-9+/]*={0,2}$/.test(item.data) ? item.data : ''
  if (!name || name.startsWith('.') || (!text && !data)) return null
  return { name: name.slice(0, 180), mimeType, kind, ...(text ? { text } : { data }) }
}

const listFiles = () => {
  ensureDirs()
  return readdirSync(WORKSPACE)
    .filter((n) => TEXT_EXTENSIONS.has(extname(n).toLowerCase()))
    .map((name) => {
      const s = statSync(join(WORKSPACE, name))
      return { name, bytes: s.size, modified: s.mtimeMs }
    })
    .sort((a, b) => b.modified - a.modified)
}

/** Atomic write, so a crash mid-save can't leave a truncated state file. */
function writeAtomic(file, contents) {
  ensureDirs()
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, contents, 'utf8')
  renameSync(tmp, file)
}

/* --------------------------------- routes -------------------------------- */

const server = createServer(async (req, res) => {
  // Only the local dev frontend talks to this. Keep it that way.
  const origin = req.headers.origin
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-headers', 'content-type')
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS')
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  try {
    /* ------------------------------ health ------------------------------ */
    // Never returns the keys themselves — only whether each one is present,
    // so the UI can show an honest status.
    if (req.method === 'GET' && path === '/api/health') {
      json(res, 200, {
        ok: true,
        providers: Object.fromEntries(
          Object.entries(PROVIDERS).map(([id, p]) => [id, Boolean(process.env[p.envKey])]),
        ),
        workspace: { files: listFiles().length, maxFileBytes: MAX_FILE_BYTES },
        requiresAccess: Boolean(process.env.WORKPLACE_ACCESS_CODE),
      })
      return
    }

    /* ------------------------------- state ------------------------------ */
    if (req.method === 'GET' && path === '/api/state') {
      if (!existsSync(STATE_FILE)) {
        json(res, 200, { state: null })
        return
      }
      try {
        json(res, 200, { state: JSON.parse(readFileSync(STATE_FILE, 'utf8')) })
      } catch {
        // A corrupt state file should not brick the app — start fresh instead.
        json(res, 200, { state: null, warning: 'state.json was unreadable and has been ignored' })
      }
      return
    }

    if (req.method === 'PUT' && path === '/api/state') {
      const body = await readBody(req)
      writeAtomic(STATE_FILE, JSON.stringify(body.state ?? {}, null, 2))
      json(res, 200, { ok: true })
      return
    }

    /* ------------------------------- files ------------------------------ */
    if (req.method === 'GET' && path === '/api/files') {
      json(res, 200, { files: listFiles() })
      return
    }

    if (req.method === 'GET' && path === '/api/files/content') {
      const name = safeFilename(url.searchParams.get('name'))
      if (!name || !existsSync(join(WORKSPACE, name))) {
        json(res, 404, { error: 'File not found' })
        return
      }
      json(res, 200, { name, content: readFileSync(join(WORKSPACE, name), 'utf8') })
      return
    }

    if (req.method === 'POST' && path === '/api/files') {
      const body = await readBody(req)
      const name = safeFilename(body.name)
      if (!name) {
        json(res, 400, {
          error: `"${body.name}" is not a supported text file. Allowed extensions: ${[...TEXT_EXTENSIONS].join(' ')}`,
        })
        return
      }
      const content = String(body.content ?? '')
      if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
        json(res, 413, { error: `${name} is larger than ${MAX_FILE_BYTES / 1024}KB` })
        return
      }
      ensureDirs()
      writeFileSync(join(WORKSPACE, name), content, 'utf8')
      json(res, 200, { ok: true, name })
      return
    }

    if (req.method === 'DELETE' && path === '/api/files') {
      const name = safeFilename(url.searchParams.get('name'))
      if (!name || !existsSync(join(WORKSPACE, name))) {
        json(res, 404, { error: 'File not found' })
        return
      }
      unlinkSync(join(WORKSPACE, name))
      json(res, 200, { ok: true })
      return
    }

    /* -------------------------------- chat ------------------------------ */
    if (req.method === 'POST' && path === '/api/chat') {
      if (process.env.WORKPLACE_ACCESS_CODE && req.headers['x-workplace-access'] !== process.env.WORKPLACE_ACCESS_CODE) {
        json(res, 401, { error: 'This workspace is locked. Enter the deployment access code and try again.' })
        return
      }
      const body = await readBody(req)
      const {
        provider,
        model,
        prompt,
        system = '',
        effort = 'medium',
        maxTokens = 2048,
        attachments = [],
        attachmentContents = [],
      } = body

      const adapter = PROVIDERS[provider]
      if (!adapter) {
        json(res, 400, { error: `Unknown provider "${provider}"` })
        return
      }
      if (!model || !prompt) {
        json(res, 400, { error: 'Both "model" and "prompt" are required' })
        return
      }

      const key = process.env[adapter.envKey]
      if (!key) {
        json(res, 503, {
          error: `No API key for ${provider}. Add ${adapter.envKey} to your .env file and restart the server.`,
          missingKey: adapter.envKey,
        })
        return
      }

      // Attached workspace files are read here, not in the browser — their
      // content never has to make a round trip through the client.
      let fullPrompt = prompt
      const used = []
      for (const raw of Array.isArray(attachments) ? attachments.slice(0, 12) : []) {
        const name = safeFilename(raw)
        if (!name) continue
        const file = join(WORKSPACE, name)
        if (!existsSync(file)) continue
        used.push(name)
        fullPrompt += `\n\n--- FILE: ${name} ---\n${readFileSync(file, 'utf8')}`
      }

      // The deployable client keeps files in IndexedDB because a Netlify
      // function has no durable disk. Accept extracted text and native binary
      // payloads locally so development and production share one contract.
      const prepared = Array.isArray(attachmentContents)
        ? attachmentContents.slice(0, 12).map(cleanAttachment).filter(Boolean)
        : []
      for (const item of prepared.filter((file) => file.text)) {
        if (used.includes(item.name)) continue
        used.push(item.name)
        fullPrompt += `\n\n--- FILE: ${item.name} (${item.mimeType}) ---\n${item.text}`
      }
      const nativeAttachments = prepared.filter((file) => file.data && !used.includes(file.name))
      if (provider === 'anthropic') {
        const unsupported = nativeAttachments.filter((file) => file.mimeType !== 'application/pdf' && !ANTHROPIC_IMAGE_TYPES.has(file.mimeType))
        if (unsupported.length) {
          json(res, 415, { error: `Claude cannot read ${unsupported.map((file) => file.name).join(', ')} in its original binary format. Use a modern DOCX/XLSX/PPTX file, convert it to PDF, or run this task with an OpenAI agent.` })
          return
        }
      }
      used.push(...nativeAttachments.map((file) => file.name))

      try {
        const upstream = await fetch(adapter.endpoint, {
          method: 'POST',
          headers: adapter.headers(key),
          body: JSON.stringify(
            adapter.body({ model, system, prompt: fullPrompt, effort: ['low', 'medium', 'high'].includes(effort) ? effort : 'medium', maxTokens, attachments: nativeAttachments }),
          ),
          // Same budget as the hosted gateway, so a model that is too slow for
          // production fails the same way here instead of hanging forever.
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        })
        const data = await upstream.json().catch(() => ({}))

        if (!upstream.ok) {
          // Surface the provider's own message — usually "model not found" or a
          // billing problem, and far more useful than a generic failure.
          const detail = data?.error?.message || data?.message || upstream.statusText
          json(res, upstream.status, { error: `${provider} returned ${upstream.status}: ${detail}` })
          return
        }

        json(res, 200, { text: adapter.text(data), provider, model, attachmentsUsed: used })
      } catch (err) {
        json(res, 502, { error: `Could not reach ${provider}: ${err.message}` })
      }
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (err) {
    json(res, 400, { error: err.message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const configured = Object.entries(PROVIDERS)
    .filter(([, p]) => process.env[p.envKey])
    .map(([id]) => id)

  console.log(`\n  API proxy   http://localhost:${PORT}`)
  console.log(
    configured.length
      ? `  keys found  ${configured.join(', ')}`
      : `  keys found  none — copy .env.example to .env and add a key`,
  )
  console.log(`  workspace   ${WORKSPACE}`)
  console.log(`  state       ${STATE_FILE}\n`)
})
