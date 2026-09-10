import { useEffect, useState } from 'react'
import { getAccessCode, setAccessCode } from '../api/client'
import { useApiHealth } from '../api/useApiHealth'
import { useFiles } from '../state/filesStore'
import { pendingCount, useWorkspace, type Agent, type Task } from '../state/workspaceStore'

const STATUS_LABEL: Record<Task['status'], string> = {
  pending: 'Queued',
  running: 'Running',
  awaiting_approval: 'Awaiting your approval',
  done: 'Done',
  error: 'Failed',
}

const STATUS_VAR: Record<Task['status'], string> = {
  pending: 'var(--color-neutral)',
  running: 'var(--color-accent)',
  awaiting_approval: 'var(--color-accent)',
  done: 'var(--color-ok)',
  error: 'var(--color-warn)',
}

function AttachmentPicker({ agentId, task }: { agentId: string; task: Task }) {
  const files = useFiles((s) => s.files)
  const updateTask = useWorkspace((s) => s.updateTask)
  const [open, setOpen] = useState(false)

  if (!files.length) return null

  const toggle = (name: string) => {
    const next = task.attachments.includes(name)
      ? task.attachments.filter((n) => n !== name)
      : [...task.attachments, name]
    updateTask(agentId, task.id, { attachments: next })
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft transition-colors hover:text-ink"
      >
        {task.attachments.length
          ? `${task.attachments.length} file${task.attachments.length > 1 ? 's' : ''} attached`
          : 'Attach files'}
      </button>

      {open && (
        <div className="mt-2 space-y-1 rounded-2xl border border-line bg-surface p-2">
          {files.map((f) => {
            const on = task.attachments.includes(f.name)
            return (
              <button
                key={f.name}
                type="button"
                onClick={() => toggle(f.name)}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors ${
                  on ? 'bg-surface-2 font-semibold text-ink' : 'text-ink-soft hover:bg-surface-2'
                }`}
              >
                <span
                  className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[5px] border"
                  style={{
                    borderColor: on ? 'var(--color-accent)' : 'var(--color-line)',
                    background: on ? 'var(--color-accent)' : 'transparent',
                  }}
                >
                  {on && (
                    <svg viewBox="0 0 20 20" className="h-2.5 w-2.5 text-on-solid" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m4.5 10.5 4 4 7-8" />
                    </svg>
                  )}
                </span>
                <span className="truncate">{f.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskRow({ agentId, task }: { agentId: string; task: Task }) {
  const removeTask = useWorkspace((s) => s.removeTask)
  const resetTask = useWorkspace((s) => s.resetTask)
  const approveTask = useWorkspace((s) => s.approveTask)
  const requestTaskRevision = useWorkspace((s) => s.requestTaskRevision)
  const [expanded, setExpanded] = useState(false)
  const hasResult = task.status === 'awaiting_approval' || task.status === 'done' || task.status === 'error'

  return (
    <li className="rounded-2xl border border-line bg-surface/60 p-3">
      <div className="flex items-start gap-2.5">
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ background: STATUS_VAR[task.status] }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-ink">{task.text}</p>
          <p className="mt-1 text-[11px] text-ink-faint">
            {STATUS_LABEL[task.status]}
            {task.durationMs != null && ` · ${(task.durationMs / 1000).toFixed(1)}s`}
            {task.ranWith && ` · ${task.ranWith.model}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => removeTask(agentId, task.id)}
          aria-label={`Remove task: ${task.text.slice(0, 40)}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </button>
      </div>

      {task.status === 'pending' && <AttachmentPicker agentId={agentId} task={task} />}

      {hasResult && (
        <div className="mt-2.5 space-y-2">
          {task.status === 'awaiting_approval' && <div className="rounded-2xl border border-accent/30 bg-accent-ring p-3"><p className="text-xs font-semibold text-ink">Draft ready. Review it before this agent learns from it.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => approveTask(agentId, task.id)} className="rounded-full bg-solid px-3 py-1.5 text-[11px] font-bold text-on-solid">Approve & learn</button><button type="button" onClick={() => requestTaskRevision(agentId, task.id)} className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold text-ink-soft ring-1 ring-line">Request revision</button></div></div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              {expanded ? 'Hide output' : 'Show output'}
            </button>
            <button
              type="button"
              onClick={() => resetTask(agentId, task.id)}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-soft transition-colors hover:text-ink"
            >
              Re-queue
            </button>
          </div>
          {expanded && (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-surface px-3.5 py-3 text-xs leading-relaxed text-ink">
              {task.output ?? task.error}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Task queue for one agent, plus the button that runs it.
 *
 * The run button is the only place that triggers model calls, and it reports
 * honestly why it is disabled — no server, no key, or nothing queued — rather
 * than failing on click.
 */
export function TaskList({ agent }: { agent: Agent }) {
  const addTask = useWorkspace((s) => s.addTask)
  const runAgentTasks = useWorkspace((s) => s.runAgentTasks)
  const isRunning = useWorkspace((s) => s.running.includes(agent.id))
  const workspaceOnline = useWorkspace((s) => s.workspaceOnline)
  const refreshFiles = useFiles((s) => s.refresh)
  const health = useApiHealth()
  const [draft, setDraft] = useState('')
  const [accessDraft, setAccessDraft] = useState(() => getAccessCode())
  const [accessReady, setAccessReady] = useState(() => Boolean(getAccessCode()))

  useEffect(() => {
    void refreshFiles()
  }, [refreshFiles])

  const queued = pendingCount(agent)
  const serverDown = health !== null && !health.reachable
  const keyMissing = health?.reachable === true && health.providers[agent.provider] === false

  let blocked: string | null = null
  if (!workspaceOnline) blocked = 'Workspace is shut down. Turn on the red power button to resume queued work with its saved memory.'
  else if (serverDown) blocked = 'Model gateway unavailable. Start "npm run dev" locally, or check the Netlify function deployment.'
  else if (keyMissing) blocked = `No key for this provider. Add it to .env locally or to Netlify environment variables.`
  else if (health?.requiresAccess && !accessReady) blocked = 'This deployment is protected. Enter its access code to run model tasks.'

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Tasks</h3>
        {agent.tasks.length > 0 && (
          <span className="text-[11px] text-ink-faint">
            {queued} queued · {agent.tasks.length} total
          </span>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          addTask(agent.id, draft)
          setDraft('')
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Assign a task…"
          aria-label="New task"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm text-ink outline-none transition-all duration-200 placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="shrink-0 rounded-2xl bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft ring-1 ring-line transition-all duration-200 hover:text-ink hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {agent.tasks.length > 0 && (
        <ul className="space-y-2">
          {agent.tasks.map((t) => (
            <TaskRow key={t.id} agentId={agent.id} task={t} />
          ))}
        </ul>
      )}

      {blocked && (
        <p className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          {blocked}
        </p>
      )}

      {health?.requiresAccess && (
        <form
          className="flex gap-2 rounded-[18px] border border-line-soft bg-surface/60 p-2"
          onSubmit={(event) => {
            event.preventDefault()
            setAccessCode(accessDraft)
            setAccessReady(Boolean(accessDraft.trim()))
          }}
        >
          <input
            type="password"
            autoComplete="current-password"
            value={accessDraft}
            onChange={(event) => setAccessDraft(event.target.value)}
            placeholder="Deployment access code"
            aria-label="Deployment access code"
            className="min-w-0 flex-1 rounded-xl bg-transparent px-2 text-xs text-ink outline-none placeholder:text-ink-faint"
          />
          <button type="submit" disabled={!accessDraft.trim()} className="rounded-xl bg-solid px-3 py-2 text-[11px] font-bold text-on-solid disabled:opacity-45">
            {accessReady ? 'Update' : 'Unlock'}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => void runAgentTasks(agent.id)}
        disabled={isRunning || queued === 0 || Boolean(blocked)}
        className="w-full rounded-2xl bg-solid py-3 text-sm font-semibold text-on-solid shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {isRunning
          ? 'Running…'
          : queued === 0
            ? 'No tasks queued'
            : `Run ${queued} task${queued > 1 ? 's' : ''}`}
      </button>
    </section>
  )
}
