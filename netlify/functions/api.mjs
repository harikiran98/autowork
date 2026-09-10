/**
 * Netlify model gateway. API keys live in Netlify environment variables and
 * are read only inside this function; the Vite bundle never receives them.
 */
import { getUser } from '@netlify/identity'

const MAX_BODY_BYTES = 3 * 1024 * 1024
const MAX_ATTACHMENTS = 12

const PROVIDERS = {
  openai: {
    envKey: 'OPENAI_API_KEY',
    endpoint: () => `${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`,
    headers: (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` }),
    body: ({ model, system, prompt, temperature, maxTokens }) => {
      const isReasoning = /^o\d/.test(model)
      return {
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
        ...(isReasoning ? { max_completion_tokens: maxTokens } : { temperature, max_tokens: maxTokens }),
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
    body: ({ model, system, prompt, temperature, maxTokens }) => ({
      model,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
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
  const content = String(item.content ?? '')
  if (!name || !content) return null
  return { name: name.slice(0, 180), content }
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
      temperature = 0.3,
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
    const fullPrompt = attachments.reduce(
      (text, file) => `${text}\n\n--- FILE: ${file.name} ---\n${file.content}`,
      String(prompt),
    )

    const upstream = await fetch(adapter.endpoint(), {
      method: 'POST',
      headers: adapter.headers(key),
      body: JSON.stringify(adapter.body({
        model: String(model),
        system: String(system),
        prompt: fullPrompt,
        temperature: Math.max(0, Math.min(1, Number(temperature) || 0)),
        maxTokens: Math.max(1, Math.min(8192, Number(maxTokens) || 2048)),
      })),
      signal: AbortSignal.timeout(26000),
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
    return response(message.includes('timeout') ? 504 : 400, { error: message })
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
