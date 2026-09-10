/**
 * Netlify model gateway. API keys live in Netlify environment variables and
 * are read only inside this function; the Vite bundle never receives them.
 */
import { getUser } from '@netlify/identity'

const MAX_BODY_BYTES = 6 * 1024 * 1024
const MAX_ATTACHMENTS = 12

/**
 * Upstream model budget, deliberately kept *below* Netlify's own synchronous
 * function timeout.
 *
 * That platform limit is 10 seconds by default and 26 seconds at the very
 * most, and Netlify enforces it by killing the invocation. A budget above the
 * ceiling therefore does the opposite of what it looks like: the function is
 * terminated before it can return the explanatory error below, so the browser
 * receives a bare gateway 504 with no JSON body at all. Team assignments hit
 * this first because the lead's planning and review calls are the largest and
 * highest-effort requests the app makes.
 *
 * Set MODEL_TIMEOUT_MS if Netlify has granted this site a different ceiling.
 */
const MODEL_TIMEOUT_MS = Math.max(5000, Math.min(120000, Number(process.env.MODEL_TIMEOUT_MS) || 24000))
const ANTHROPIC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

const PROVIDERS = {
  openai: {
    envKey: 'OPENAI_API_KEY',
    endpoint: () => `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`,
    headers: (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` }),
    body: ({ model, system, prompt, effort, maxTokens, attachments }) => {
      const isReasoning = /^o\d/.test(model)
      const content = [
        { type: 'text', text: prompt },
        // Both parts need a full data URL. Passing bare base64 as `file_data`
        // is accepted but unreadable, so the model answered as though nothing
        // had been attached at all.
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
        ...(isReasoning ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
        reasoning_effort: effort,
      }
    },
    text: (data) => data?.choices?.[0]?.message?.content ?? '',
  },
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    endpoint: () => `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'}/messages`,
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
    text: (data) => Array.isArray(data?.content)
      ? data.content.filter((part) => part.type === 'text').map((part) => part.text).join('')
      : '',
  },
}

const response = (statusCode, payload) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(payload),
})

const parseBody = (event) => {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : event.body ?? '{}'
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new Error('Request body is too large.')
  return JSON.parse(raw || '{}')
}

const cleanAttachment = (item) => {
  if (!item || typeof item !== 'object') return null
  const name = String(item.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop()?.trim()
  const mimeType = String(item.mimeType || 'application/octet-stream').toLowerCase().slice(0, 120)
  const kind = String(item.kind || 'binary').slice(0, 24)
  const text = typeof item.text === 'string' ? item.text : ''
  const data = typeof item.data === 'string' && /^[a-zA-Z0-9+/]*={0,2}$/.test(item.data) ? item.data : ''
  if (!name || (!text && !data)) return null
  return { name: name.slice(0, 180), mimeType, kind, ...(text ? { text } : { data }) }
}

const handleEvent = async (event, authenticated = true) => {
  const action = String(event.path ?? '').split('/').filter(Boolean).pop()

  if (event.httpMethod === 'GET' && action === 'health') {
    return response(200, {
      ok: true,
      providers: Object.fromEntries(
        Object.entries(PROVIDERS).map(([id, provider]) => [id, Boolean(process.env[provider.envKey])]),
      ),
      requiresAccess: Boolean(process.env.WORKPLACE_ACCESS_CODE),
      authentication: 'netlify-identity',
      runtime: 'netlify-functions',
    })
  }

  if (event.httpMethod !== 'POST' || action !== 'chat') {
    return response(404, { error: 'Not found' })
  }

  try {
    if (!authenticated) {
      return response(401, { error: 'Your session has expired. Sign in to autowork again.' })
    }
    const expectedAccess = process.env.WORKPLACE_ACCESS_CODE
    const suppliedAccess = event.headers?.['x-workplace-access'] || event.headers?.['X-Workplace-Access']
    if (expectedAccess && suppliedAccess !== expectedAccess) {
      return response(401, { error: 'This workspace is locked. Enter the deployment access code and try again.' })
    }

    const body = parseBody(event)
    const {
      provider,
      model,
      prompt,
      system = '',
      effort = 'medium',
      maxTokens = 2048,
      attachmentContents = [],
    } = body
    const adapter = PROVIDERS[provider]

    if (!adapter) return response(400, { error: `Unknown provider "${provider}".` })
    if (!model || !prompt) return response(400, { error: 'Both "model" and "prompt" are required.' })

    const key = process.env[adapter.envKey]
    if (!key) {
      return response(503, {
        error: `No API key is configured for ${provider}. Add ${adapter.envKey} in Netlify environment variables and redeploy.`,
        missingKey: adapter.envKey,
      })
    }

    const attachments = Array.isArray(attachmentContents)
      ? attachmentContents.slice(0, MAX_ATTACHMENTS).map(cleanAttachment).filter(Boolean)
      : []
    const fullPrompt = attachments.filter((file) => file.text).reduce(
      (text, file) => `${text}\n\n--- FILE: ${file.name} (${file.mimeType}) ---\n${file.text}`,
      String(prompt),
    )
    const nativeAttachments = attachments.filter((file) => file.data)
    if (provider === 'anthropic') {
      const unsupported = nativeAttachments.filter((file) => file.mimeType !== 'application/pdf' && !ANTHROPIC_IMAGE_TYPES.has(file.mimeType))
      if (unsupported.length) {
        return response(415, {
          error: `Claude cannot read ${unsupported.map((file) => file.name).join(', ')} in its original binary format. Use a modern DOCX/XLSX/PPTX file, convert it to PDF, or run this task with an OpenAI agent.`,
        })
      }
    }

    const upstream = await fetch(adapter.endpoint(), {
      method: 'POST',
      headers: adapter.headers(key),
      body: JSON.stringify(adapter.body({
        model: String(model),
        system: String(system),
        prompt: fullPrompt,
        attachments: nativeAttachments,
        effort: ['low', 'medium', 'high'].includes(effort) ? effort : 'medium',
        maxTokens: Math.max(1, Math.min(8192, Number(maxTokens) || 2048)),
      })),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    })
    const data = await upstream.json().catch(() => ({}))

    if (!upstream.ok) {
      const detail = data?.error?.message || data?.message || upstream.statusText
      return response(upstream.status, { error: `${provider} returned ${upstream.status}: ${detail}` })
    }

    return response(200, {
      text: adapter.text(data),
      provider,
      model,
      attachmentsUsed: attachments.map((file) => file.name),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed.'
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || message.toLowerCase().includes('timeout'))
    return response(timedOut ? 504 : 400, {
      error: timedOut
        ? `This model did not finish within the ${Math.round(MODEL_TIMEOUT_MS / 1000)}-second hosted response window. Retry with lower effort or a faster model; your task remains available to re-run.`
        : message,
    })
  }
}

/**
 * Modern Netlify Function entry point. `getUser()` verifies the signed Identity
 * cookie inside Netlify's runtime before a request can spend a paid model key.
 */
export default async (request) => {
  const url = new URL(request.url)
  const user = await getUser()
  const result = await handleEvent({
    httpMethod: request.method,
    path: url.pathname,
    headers: Object.fromEntries(request.headers),
    body: request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text(),
    isBase64Encoded: false,
  }, Boolean(user))
  return new Response(result.body, { status: result.statusCode, headers: result.headers })
}

// Deterministic contract-test adapter; Netlify uses the default Fetch-style
// export above in production.
export const handleEventForTests = (event) => handleEvent(event, true)
