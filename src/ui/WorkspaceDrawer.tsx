import { useEffect, useRef, useState } from 'react'
import { useFiles } from '../state/filesStore'
import { completedTasks, useWorkspace } from '../state/workspaceStore'
import { ROLE_BY_ID } from '../data/org'
import { useAccentColor, usePillStyle } from '../theme/pill'

export type DrawerTab = 'files' | 'outputs'

const formatBytes = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)
const formatTime = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString() : '')

/* -------------------------------- files ---------------------------------- */

function FilesTab() {
  const { files, error, refresh, add, remove } = useFiles()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const accept = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) await add(file)
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void accept(e.dataTransfer.files)
        }}
        className={`rounded-3xl border-2 border-dashed px-6 py-7 text-center transition-colors duration-200 ${
          dragging ? 'border-accent bg-surface-2' : 'border-line bg-surface/50'
        }`}
      >
        <p className="text-sm font-semibold text-ink">Drop text or code files here</p>
        <p className="mt-1 text-xs text-ink-faint">
          Kept privately in this browser, up to 512 KB each.
        </p>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="mt-3 rounded-2xl bg-surface px-4 py-2 text-sm font-semibold text-ink-soft ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 hover:text-ink hover:shadow-md active:translate-y-0"
        >
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void accept(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <p className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          {error}
        </p>
      )}

      {files.length === 0 ? (
        <p className="px-1 py-2 text-xs text-ink-faint">No files yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.name}</span>
              <span className="shrink-0 text-xs text-ink-faint">{formatBytes(f.bytes)}</span>
              <button
                type="button"
                onClick={() => void remove(f.name)}
                aria-label={`Delete ${f.name}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M6 6l8 8M14 6l-8 8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------- outputs --------------------------------- */

function OutputsTab() {
  const agents = useWorkspace((s) => s.agents)
  const select = useWorkspace((s) => s.select)
  const results = completedTasks(agents)
  const pill = usePillStyle()
  const accent = useAccentColor()
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  if (!results.length) {
    return (
      <p className="px-1 py-6 text-center text-sm text-ink-faint">
        No completed tasks yet. Assign tasks to an agent and press Run.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {results.map(({ agent, task }) => {
        const role = ROLE_BY_ID[agent.roleId]
        const body = task.output ?? task.error ?? ''
        return (
          <article key={task.id} className="rounded-3xl border border-line bg-surface p-4">
            <header className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => select(agent.id)}
                className="flex items-center gap-2 rounded-full px-1 text-sm font-bold text-ink transition-colors hover:text-accent"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent(role.color) }} />
                {agent.name}
              </button>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={pill(role.color)}>
                {role.label}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={pill(task.status === 'done' ? '#10b981' : '#f43f5e')}
              >
                {task.status === 'done' ? 'Done' : 'Failed'}
              </span>
              <span className="ml-auto text-[11px] text-ink-faint">{formatTime(task.finishedAt)}</span>
            </header>

            <p className="mt-2.5 text-sm font-semibold text-ink">{task.text}</p>
            {task.attachments.length > 0 && (
              <p className="mt-1 text-[11px] text-ink-faint">Files: {task.attachments.join(', ')}</p>
            )}

            <p className="mt-2.5 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink">
              {body}
            </p>

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copy(task.id, body)}
                className="rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:text-ink"
              >
                {copied === task.id ? 'Copied' : 'Copy output'}
              </button>
              {task.ranWith && (
                <span className="text-[11px] text-ink-faint">
                  {task.ranWith.model}
                  {task.durationMs != null && ` · ${(task.durationMs / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

/* -------------------------------- drawer --------------------------------- */

/**
 * Bottom sheet holding the two things that belong to the whole workspace
 * rather than to one agent: uploaded files, and every finished task output.
 */
export function WorkspaceDrawer({
  tab,
  onTab,
  onClose,
  /** True while the agent panel is open, so the sheet steps aside for it. */
  panelOpen = false,
}: {
  tab: DrawerTab
  onTab: (t: DrawerTab) => void
  onClose: () => void
  panelOpen?: boolean
}) {
  const agents = useWorkspace((s) => s.agents)
  const fileCount = useFiles((s) => s.files.length)
  const outputCount = completedTasks(agents).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabs: Array<{ id: DrawerTab; label: string; count: number }> = [
    { id: 'files', label: 'Files', count: fileCount },
    { id: 'outputs', label: 'Outputs', count: outputCount },
  ]

  return (
    <aside
      className={`glass-panel pointer-events-auto absolute bottom-[72px] left-3 right-3 z-40 mx-auto flex max-h-[70vh] w-auto max-w-4xl flex-col overflow-hidden rounded-[30px] transition-[margin] duration-300 xl:bottom-5 xl:left-[300px] xl:right-5 ${
        panelOpen ? 'xl:mr-[450px]' : ''
      }`}
      style={{ animation: 'riseIn 260ms cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <header className="flex shrink-0 items-center gap-2 px-5 pb-3 pt-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
              tab === t.id ? 'bg-solid text-on-solid shadow-md shadow-black/20' : 'bg-surface-2 text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                tab === t.id ? 'bg-on-solid/15 text-on-solid' : 'bg-surface text-ink-faint'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-soft transition-all duration-200 hover:scale-105 hover:text-ink active:scale-95"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {tab === 'files' ? <FilesTab /> : <OutputsTab />}
      </div>
    </aside>
  )
}
