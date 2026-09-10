import { useMemo, useState } from 'react'
import { BENCH_ID } from '../data/org'
import { useFiles } from '../state/filesStore'
import { completedTasks, useWorkspace } from '../state/workspaceStore'

const STAGE_LABEL = {
  queued: 'Ready to start', planning: 'Lead is planning', delegated: 'Team is collaborating',
  reviewing: 'Lead quality review', revising: 'Revisions in progress', done: 'Delivered', error: 'Needs attention',
} as const

export function WorkBoard() {
  const agents = useWorkspace((state) => state.agents)
  const teams = useWorkspace((state) => state.teams)
  const jobs = useWorkspace((state) => state.teamJobs)
  const addTask = useWorkspace((state) => state.addTask)
  const runAgentTasks = useWorkspace((state) => state.runAgentTasks)
  const createTeamJob = useWorkspace((state) => state.createTeamJob)
  const runTeamJob = useWorkspace((state) => state.runTeamJob)
  const removeTeamJob = useWorkspace((state) => state.removeTeamJob)
  const files = useFiles((state) => state.files)
  const availableTeams = useMemo(() => teams.filter((team) => team.id !== BENCH_ID && agents.some((agent) => agent.teamId === team.id)), [agents, teams])
  const [mode, setMode] = useState<'individual' | 'team'>('individual')
  const [target, setTarget] = useState(agents[0]?.id ?? '')
  const [brief, setBrief] = useState('')
  const [format, setFormat] = useState('Markdown document with clear headings')
  const [attachments, setAttachments] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  const latestIndividual = completedTasks(agents)[0]

  const targets = mode === 'individual' ? agents : availableTeams
  const effectiveTarget = targets.some((item) => item.id === target) ? target : targets[0]?.id ?? ''
  const toggleFile = (name: string) => setAttachments((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])
  const copyLatest = async () => {
    if (!latestIndividual) return
    try {
      await navigator.clipboard.writeText(latestIndividual.task.output ?? latestIndividual.task.error ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { setCopied(false) }
  }

  const submit = async () => {
    if (!brief.trim() || !effectiveTarget) return
    setStarting(true)
    try {
      if (mode === 'individual') {
        addTask(effectiveTarget, brief, format, attachments)
        setBrief('')
        await runAgentTasks(effectiveTarget)
      } else {
        const id = createTeamJob(effectiveTarget, brief, format, attachments)
        setBrief('')
        if (id) await runTeamJob(id)
      }
    } finally { setStarting(false) }
  }

  return <div className="space-y-5">
    <section className="rounded-[26px] border border-line bg-surface/70 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="group" aria-label="Assignment type">
        {(['individual', 'team'] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setTarget('') }} className={`rounded-xl px-3 py-2 text-xs font-bold capitalize transition-all ${mode === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink'}`}>{value === 'individual' ? 'Individual agent' : 'Entire team'}</button>)}
      </div>

      <label className="mt-4 block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Assign to</span><select aria-label="Assign to" value={effectiveTarget} onChange={(event) => setTarget(event.target.value)} className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent-ring">{targets.map((item) => <option key={item.id} value={item.id}>{item.name}{'roleName' in item ? ` — ${item.roleName}` : ` — ${agents.filter((agent) => agent.teamId === item.id).length} members`}</option>)}</select></label>
      {mode === 'team' && effectiveTarget && <p className="mt-2 rounded-2xl bg-accent-ring px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-soft">The team lead plans the split, every member contributes, junior work is reviewed, and unsatisfactory work is automatically returned for revision before final delivery.</p>}

      <label className="mt-4 block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Work brief</span><textarea aria-label="Work brief" rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Describe the result you need, constraints, audience and success criteria…" className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring" /></label>
      <label className="mt-4 block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Output format</span><input aria-label="Output format" value={format} onChange={(event) => setFormat(event.target.value)} placeholder="PDF-ready report, JSON, email, table, code…" className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring" /></label>

      {files.length > 0 && <div className="mt-4"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Files</span><div className="flex flex-wrap gap-2">{files.map((file) => <button key={file.name} type="button" aria-pressed={attachments.includes(file.name)} onClick={() => toggleFile(file.name)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 transition-all ${attachments.includes(file.name) ? 'bg-solid text-on-solid ring-transparent' : 'bg-surface text-ink-soft ring-line hover:text-ink'}`}>{file.name}</button>)}</div></div>}

      <button type="button" onClick={() => void submit()} disabled={starting || !brief.trim() || !effectiveTarget} className="mt-5 w-full rounded-2xl bg-solid py-3 text-sm font-bold text-on-solid shadow-lg transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">{starting ? (mode === 'team' ? 'Team workflow running…' : 'Agent working…') : 'Assign & start'}</button>
    </section>

    {latestIndividual && <section>
      <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Latest individual delivery</h3>
      <article className="rounded-[22px] border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-ink">{latestIndividual.agent.name}</span><span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-ink-soft">{latestIndividual.agent.roleName}</span><span className={`ml-auto text-[11px] font-bold ${latestIndividual.task.status === 'done' ? 'text-ok' : 'text-warn'}`}>{latestIndividual.task.status === 'done' ? 'Delivered' : 'Needs attention'}</span></div>
        <p className="mt-2 text-xs font-semibold text-ink">{latestIndividual.task.text}</p>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-surface-2 p-3 font-sans text-xs leading-relaxed text-ink">{latestIndividual.task.output ?? latestIndividual.task.error}</pre>
        <div className="mt-2 flex items-center justify-between gap-2"><span className="truncate text-[10px] text-ink-faint">{latestIndividual.task.outputFormat}</span><button type="button" onClick={() => void copyLatest()} className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[10px] font-bold text-ink-soft hover:text-ink">{copied ? 'Copied' : 'Copy output'}</button></div>
      </article>
    </section>}

    {jobs.length > 0 && <section><h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Team workflows</h3><div className="space-y-2">{jobs.map((job) => {
      const team = teams.find((item) => item.id === job.teamId)
      const done = job.contributions.filter((item) => item.status === 'done').length
      return <article key={job.id} className="rounded-[22px] border border-line bg-surface p-4">
        <div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${job.status === 'done' ? 'bg-ok' : job.status === 'error' ? 'bg-warn' : 'bg-accent'}`} /><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold text-ink">{job.brief}</p><p className="mt-1 text-[11px] text-ink-faint">{team?.name} · {STAGE_LABEL[job.status]} · {done}/{job.contributions.length} contributions{job.reviewRound ? ` · review ${job.reviewRound}` : ''}</p></div><button type="button" onClick={() => removeTeamJob(job.id)} aria-label="Remove team assignment" className="rounded-full px-2 py-1 text-xs text-ink-faint hover:bg-surface-2 hover:text-ink">×</button></div>
        {job.status === 'queued' && <button type="button" onClick={() => void runTeamJob(job.id)} className="mt-3 rounded-full bg-solid px-3 py-1.5 text-[11px] font-bold text-on-solid">Start workflow</button>}
        {job.error && <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">{job.error}</p>}
        {job.outputFile && <p className="mt-3 rounded-xl bg-ok/10 px-3 py-2 text-[11px] font-semibold text-ink-soft">Shared with every team as <span className="text-ink">{job.outputFile}</span></p>}
        {job.outputFileError && <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-[11px] text-warn">Delivery completed, but its shared file could not be created: {job.outputFileError}</p>}
        {job.finalOutput && <details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-accent">View final delivery</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-surface-2 p-3 font-sans text-xs leading-relaxed text-ink">{job.finalOutput}</pre></details>}
      </article>
    })}</div></section>}
  </div>
}
