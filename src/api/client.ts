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
  effort?: 'low' | 'medium' | 'high'
  maxTokens?: number
  /** Workspace filenames; the server reads and appends their contents. */
  attachments?: string[]
  /** Browser-stored files are sent only when they are attached to a task. */
  attachmentContents?: AttachmentContent[]
}

export type FileKind = 'text' | 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'image' | 'audio' | 'video' | 'archive' | 'binary'

export interface WorkspaceFile {
  name: string
  bytes: number
  modified: number
  mimeType: string
  kind: FileKind
}

export interface AttachmentContent {
  name: string
  mimeType: string
  kind: FileKind
  /** Text and Office formats are extracted in the browser before transfer. */
  text?: string
  /** Other formats are transferred as raw base64 for provider-native handling. */
  data?: string
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
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_WORKSPACE_BYTES = 50 * 1024 * 1024
const MAX_TASK_TRANSFER_BYTES = 4 * 1024 * 1024
const MAX_EXTRACTED_TEXT_BYTES = 2 * 1024 * 1024
const ACCESS_KEY = 'agent-workplace:gateway-access'
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'rst', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'xml', 'html', 'htm', 'css', 'scss', 'js', 'mjs', 'cjs',
  'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp',
  'cs', 'php', 'swift', 'sh', 'bash', 'ps1', 'sql', 'graphql', 'log', 'srt', 'vtt',
  'tex', 'env', 'gitignore', 'dockerfile', 'properties', 'conf', 'rtf',
])

const OFFICE_EXTENSIONS = new Set(['docx', 'xlsx', 'xlsm', 'pptx', 'odt', 'ods', 'odp', 'epub'])
const ARCHIVE_EXTENSIONS = new Set(['zip', 'tar', 'gz', 'tgz', '7z', 'rar'])
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroenabled.12',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation', epub: 'application/epub+zip',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', zip: 'application/zip',
}

interface StoredFile extends WorkspaceFile {
  id: string
  namespace: string
  blob: Blob
}

interface LegacyStoredFile {
  name: string
  bytes: number
  modified: number
  content: string
}

const storageAvailable = () => typeof window !== 'undefined' && Boolean(window.localStorage)

function readLegacyFiles(): LegacyStoredFile[] {
  if (!storageAvailable()) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(filesKey()) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeLegacyFiles(files: LegacyStoredFile[]) {
  if (!storageAvailable()) return
  localStorage.setItem(filesKey(), JSON.stringify(files))
}

const extensionOf = (name: string) => name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : name.toLowerCase()

const fileKind = (name: string, mimeType = ''): FileKind => {
  const ext = extensionOf(name)
  const mime = mimeType.toLowerCase()
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'document'
  if (['xls', 'xlsx', 'xlsm', 'ods'].includes(ext)) return 'spreadsheet'
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'presentation'
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive'
  if (TEXT_EXTENSIONS.has(ext) || mime.startsWith('text/') || /json|xml|javascript|yaml/.test(mime)) return 'text'
  return 'binary'
}

const normaliseName = (name: string) =>
  name.replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop()?.trim() ?? ''

const fileId = (name: string, namespace = storageNamespace) => `${namespace}:${name}`
const DB_NAME = 'autowork-workspace-files'
const DB_STORE = 'files'

const openFilesDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('This browser does not support file storage.'))
  const request = indexedDB.open(DB_NAME, 1)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains(DB_STORE)) {
      const store = db.createObjectStore(DB_STORE, { keyPath: 'id' })
      store.createIndex('namespace', 'namespace', { unique: false })
    }
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('Could not open browser file storage.'))
})

const idbRequest = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('Browser file storage failed.'))
})

const idbFiles = async (namespace = storageNamespace): Promise<StoredFile[]> => {
  const db = await openFilesDb()
  try {
    const tx = db.transaction(DB_STORE, 'readonly')
    return await idbRequest(tx.objectStore(DB_STORE).index('namespace').getAll(namespace)) as StoredFile[]
  } finally {
    db.close()
  }
}

const idbPut = async (file: StoredFile) => {
  const db = await openFilesDb()
  try {
    await idbRequest(db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(file))
  } finally {
    db.close()
  }
}

const idbDelete = async (id: string) => {
  const db = await openFilesDb()
  try {
    await idbRequest(db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(id))
  } finally {
    db.close()
  }
}

const decodeXmlEntities = (value: string) => value
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const xmlText = (xml: string) => decodeXmlEntities(xml
  .replace(/<\/(?:w:p|a:p|text:p|text:h|p)>/g, '\n')
  .replace(/<\/(?:w:tc|a:tc|table:table-cell)>/g, '\t')
  .replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()

const capText = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength <= MAX_EXTRACTED_TEXT_BYTES) return text
  return `${new TextDecoder().decode(bytes.slice(0, MAX_EXTRACTED_TEXT_BYTES))}\n\n[Content truncated to fit the task attachment limit.]`
}

const numericPart = (name: string) => Number(name.match(/(\d+)(?=\.xml$)/)?.[1] ?? 0)

async function extractZipDocument(name: string, blob: Blob): Promise<string> {
  const { strFromU8, unzipSync } = await import('fflate')
  const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  const ext = extensionOf(name)
  const read = (path: string) => zip[path] ? strFromU8(zip[path]) : ''

  if (ext === 'docx') {
    const parts = Object.keys(zip)
      .filter((path) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(path))
      .sort((a, b) => a.includes('document') ? -1 : b.includes('document') ? 1 : a.localeCompare(b))
    return capText(parts.map((path) => xmlText(read(path))).filter(Boolean).join('\n\n'))
  }

  if (ext === 'pptx') {
    const slides = Object.keys(zip).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a, b) => numericPart(a) - numericPart(b))
    return capText(slides.map((path, index) => `[Slide ${index + 1}]\n${xmlText(read(path))}`).join('\n\n'))
  }

  if (ext === 'xlsx' || ext === 'xlsm') {
    const sharedXml = read('xl/sharedStrings.xml')
    const shared = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1]))
    const sheets = Object.keys(zip).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path)).sort((a, b) => numericPart(a) - numericPart(b))
    const output = sheets.map((path, sheetIndex) => {
      const rows = [...read(path).matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].map((row) => {
        const values = [...row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map((cell) => {
          const type = /\bt="([^"]+)"/.exec(cell[1])?.[1]
          const raw = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? xmlText(cell[2])
          return type === 's' ? shared[Number(raw)] ?? raw : type === 'b' ? (raw === '1' ? 'TRUE' : 'FALSE') : decodeXmlEntities(raw)
        })
        return values.join('\t')
      })
      return `[Sheet ${sheetIndex + 1}]\n${rows.join('\n')}`
    })
    return capText(output.join('\n\n'))
  }

  if (['odt', 'ods', 'odp'].includes(ext)) return capText(xmlText(read('content.xml')))

  if (ext === 'epub') {
    const pages = Object.keys(zip).filter((path) => /\.(?:xhtml|html|htm)$/i.test(path)).sort()
    return capText(pages.map((path) => xmlText(read(path))).filter(Boolean).join('\n\n'))
  }

  // ZIP workspaces are useful to coding agents: extract readable members and
  // provide a manifest for the rest without trying to interpret binaries.
  const entries = Object.keys(zip).filter((path) => !path.endsWith('/')).sort()
  const chunks = entries.slice(0, 200).map((path) => {
    const extName = extensionOf(path)
    if (!TEXT_EXTENSIONS.has(extName) || zip[path].byteLength > 512 * 1024) return `[Binary member: ${path} · ${zip[path].byteLength} bytes]`
    return `--- ${path} ---\n${strFromU8(zip[path])}`
  })
  return capText(chunks.join('\n\n'))
}

const blobToBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

async function prepareAttachment(file: StoredFile): Promise<AttachmentContent> {
  const ext = extensionOf(file.name)
  if (file.kind === 'text') {
    let text = await file.blob.text()
    if (ext === 'rtf') text = text.replace(/\\'[0-9a-f]{2}/gi, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '')
    return { name: file.name, mimeType: file.mimeType, kind: file.kind, text: capText(text) }
  }
  if (OFFICE_EXTENSIONS.has(ext) || ext === 'zip') {
    try {
      const text = await extractZipDocument(file.name, file.blob)
      if (text) return { name: file.name, mimeType: file.mimeType, kind: file.kind, text }
    } catch {
      // Corrupt, encrypted, or legacy Office files can still be sent natively
      // to providers that support their binary format.
    }
  }
  return { name: file.name, mimeType: file.mimeType, kind: file.kind, data: await blobToBase64(file.blob) }
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
  let attachmentContents: AttachmentContent[]
  try {
    attachmentContents = await Promise.all(
      (req.attachments ?? []).slice(0, 12).map(async (name) => {
        const stored = await readStoredFile(name)
        if (!stored) throw new ApiError(`The attached file "${name}" is no longer in this browser workspace.`)
        return prepareAttachment(stored)
      }),
    )
    const transferBytes = attachmentContents.reduce((sum, file) => {
      if (file.text) return sum + new TextEncoder().encode(file.text).byteLength
      return sum + Math.ceil((file.data?.length ?? 0) * 0.75)
    }, 0)
    if (transferBytes > MAX_TASK_TRANSFER_BYTES) {
      throw new ApiError('Attached content is larger than 4 MB. Attach fewer files or split large PDFs before running the task.')
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error instanceof Error ? `Could not prepare attachments: ${error.message}` : 'Could not prepare attachments.')
  }

  let res: Response
  try {
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
  const modern = await idbFiles().catch(() => [])
  const modernNames = new Set(modern.map((file) => file.name))
  const legacy = readLegacyFiles()
    .filter((file) => !modernNames.has(file.name))
    .map((file): WorkspaceFile => ({
      name: file.name,
      bytes: file.bytes,
      modified: file.modified,
      mimeType: MIME_BY_EXTENSION[extensionOf(file.name)] ?? 'text/plain',
      kind: fileKind(file.name, 'text/plain'),
    }))
  return [
    ...modern.map(({ name, bytes, modified, mimeType, kind }) => ({ name, bytes, modified, mimeType, kind })),
    ...legacy,
  ]
    .sort((a, b) => b.modified - a.modified)
}

export async function uploadFile(file: File): Promise<string> {
  const safeName = normaliseName(file.name)
  if (!safeName || safeName.startsWith('.')) throw new ApiError(`"${file.name}" is not a valid filename.`)
  if (file.size > MAX_FILE_BYTES) throw new ApiError(`${safeName} is larger than 10 MB.`)

  const current = await listFiles()
  const total = current.filter((entry) => entry.name !== safeName).reduce((sum, entry) => sum + entry.bytes, 0) + file.size
  if (total > MAX_WORKSPACE_BYTES) throw new ApiError('This browser workspace is limited to 50 MB of files.')
  const mimeType = file.type || MIME_BY_EXTENSION[extensionOf(safeName)] || 'application/octet-stream'
  const namespace = storageNamespace
  await idbPut({
    id: fileId(safeName, namespace),
    namespace,
    name: safeName,
    bytes: file.size,
    modified: file.lastModified || Date.now(),
    mimeType,
    kind: fileKind(safeName, mimeType),
    blob: file,
  })
  writeLegacyFiles(readLegacyFiles().filter((entry) => entry.name !== safeName))
  return safeName
}

export async function deleteFile(name: string): Promise<void> {
  await idbDelete(fileId(name)).catch(() => undefined)
  writeLegacyFiles(readLegacyFiles().filter((file) => file.name !== name))
}

async function readStoredFile(name: string): Promise<StoredFile | null> {
  const db = await openFilesDb().catch(() => null)
  if (db) {
    try {
      const file = await idbRequest(db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(fileId(name))) as StoredFile | undefined
      if (file) return file
    } finally {
      db.close()
    }
  }
  const legacy = readLegacyFiles().find((file) => file.name === name)
  if (!legacy) return null
  const mimeType = MIME_BY_EXTENSION[extensionOf(name)] ?? 'text/plain'
  return {
    id: fileId(name), namespace: storageNamespace, name, bytes: legacy.bytes, modified: legacy.modified,
    mimeType, kind: fileKind(name, mimeType), blob: new Blob([legacy.content], { type: mimeType }),
  }
}
