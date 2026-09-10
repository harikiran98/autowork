import type { ProviderId } from '../data/llm-catalog'

/**
 * Thin client for the local API proxy (server/index.mjs).
 *
 * The frontend never holds a key and never talks to a model vendor directly —
 * it only knows about /api. That is what makes it safe to build and host this
 * bundle anywhere: there is nothing secret in it.
 */

export interface HealthReport {
  reachable: boolean
  providers: Partial<Record<ProviderId, boolean>>
  workspace?: { files: number; maxFileBytes: number }
  requiresAccess?: boolean
}

export interface ChatRequest {
  provider: ProviderId
  model: string
  prompt: string
  system?: string
  temperature?: number
  maxTokens?: number
  /** Workspace filenames; the server reads and appends their contents. */
  attachments?: string[]
  /** Browser-stored files are sent only when they are attached to a task. */
  attachmentContents?: Array<{ name: string; content: string }>
}

export interface WorkspaceFile {
  name: string
  bytes: number
  modified: number
}

export class ApiError extends Error {
  readonly missingKey?: string
  constructor(message: string, missingKey?: string) {
    super(message)
    this.name = 'ApiError'
    this.missingKey = missingKey
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; missingKey?: string }
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data.missingKey)
  return data
}

const unreachable = () =>
  new ApiError(
    'Could not reach the model gateway. Start the local server with "npm run dev", or check the Netlify function deployment.',
  )

let storageNamespace = 'guest'
export const setStorageNamespace = (value: string) => { storageNamespace = value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'guest' }
const stateKey = () => `autowork:${storageNamespace}:state:v1`
const filesKey = () => `autowork:${storageNamespace}:files:v1`
const MAX_FILE_BYTES = 512 * 1024
const MAX_WORKSPACE_BYTES = 2 * 1024 * 1024
const ACCESS_KEY = 'agent-workplace:gateway-access'
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'rst', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'xml', 'html', 'htm', 'css', 'scss', 'js', 'mjs', 'cjs',
  'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp',
  'cs', 'php', 'swift', 'sh', 'bash', 'ps1', 'sql', 'graphql', 'log', 'srt', 'vtt',
])

interface StoredFile extends WorkspaceFile {
  content: string
}

const storageAvailable = () => typeof window !== 'undefined' && Boolean(window.localStorage)

function readFiles(): StoredFile[] {
  if (!storageAvailable()) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(filesKey()) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeFiles(files: StoredFile[]) {
  if (!storageAvailable()) return
  localStorage.setItem(filesKey(), JSON.stringify(files))
}

export const getAccessCode = () =>
  typeof window === 'undefined' ? '' : window.sessionStorage.getItem(ACCESS_KEY) ?? ''

export const setAccessCode = (value: string) => {
  if (typeof window === 'undefined') return
  const clean = value.trim()
  if (clean) window.sessionStorage.setItem(ACCESS_KEY, clean)
  else window.sessionStorage.removeItem(ACCESS_KEY)
}

/* -------------------------------- health --------------------------------- */

/**
 * Is the proxy running, and which providers have a key?
 *
 * A static build of this app (no server alongside it) is a supported state:
 * this resolves to `reachable: false` and the UI explains itself rather than
 * throwing.
 */
export async function getHealth(signal?: AbortSignal): Promise<HealthReport> {
  try {
    const res = await fetch('/api/health', { signal })
    if (!res.ok) return { reachable: false, providers: {} }
    const data = (await res.json()) as Omit<HealthReport, 'reachable'>
    return {
      reachable: true,
      providers: data.providers ?? {},
      workspace: data.workspace,
      requiresAccess: data.requiresAccess,
    }
  } catch {
    return { reachable: false, providers: {} }
  }
}

/* --------------------------------- chat ---------------------------------- */

export async function runAgent(req: ChatRequest, signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    const attachmentContents = await Promise.all(
      (req.attachments ?? []).slice(0, 12).map(async (name) => ({ name, content: await readFile(name) })),
    )
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(getAccessCode() ? { 'x-workplace-access': getAccessCode() } : {}),
      },
      body: JSON.stringify({ ...req, attachments: [], attachmentContents }),
      signal,
    })
  } catch {
    throw unreachable()
  }
  const data = await parse<{ text?: string }>(res)
  return data.text ?? ''
}

/* --------------------------------- state --------------------------------- */

export async function loadState<T>(): Promise<T | null> {
  if (storageAvailable()) {
    try {
      const local = localStorage.getItem(stateKey())
      if (local) return JSON.parse(local) as T
    } catch {
      localStorage.removeItem(stateKey())
    }
  }
  return null
}

export async function saveState<T>(state: T): Promise<boolean> {
  try {
    if (storageAvailable()) localStorage.setItem(stateKey(), JSON.stringify(state))
  } catch {
    return false
  }

  // Local development keeps the original disk snapshot as a convenient
  // backup. Deployed workspaces intentionally remain private to this browser.
  if (typeof location !== 'undefined' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    return true
  }
  try {
    const res = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
    })
    return res.ok
  } catch {
    return false
  }
}

/* --------------------------------- files --------------------------------- */

export async function listFiles(signal?: AbortSignal): Promise<WorkspaceFile[]> {
  if (signal?.aborted) return []
  return readFiles()
    .map(({ name, bytes, modified }) => ({ name, bytes, modified }))
    .sort((a, b) => b.modified - a.modified)
}

export async function uploadFile(name: string, content: string): Promise<string> {
  const safeName = name.replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop()?.trim() ?? ''
  const extension = safeName.split('.').pop()?.toLowerCase() ?? ''
  if (!safeName || safeName.startsWith('.') || !TEXT_EXTENSIONS.has(extension)) {
    throw new ApiError(`"${name}" is not a supported text or code file.`)
  }
  const bytes = new TextEncoder().encode(content).byteLength
  if (bytes > MAX_FILE_BYTES) throw new ApiError(`${safeName} is larger than 512 KB.`)

  const current = readFiles().filter((file) => file.name !== safeName)
  const total = current.reduce((sum, file) => sum + file.bytes, 0) + bytes
  if (total > MAX_WORKSPACE_BYTES) throw new ApiError('This browser workspace is limited to 2 MB of files.')
  writeFiles([{ name: safeName, content, bytes, modified: Date.now() }, ...current])
  return safeName
}

export async function deleteFile(name: string): Promise<void> {
  writeFiles(readFiles().filter((file) => file.name !== name))
}

export async function readFile(name: string): Promise<string> {
  return readFiles().find((file) => file.name === name)?.content ?? ''
}
