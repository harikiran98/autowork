import { useEffect, useMemo, useState } from 'react'
import { BENCH_ID } from '../data/org'
import { useFiles } from '../state/filesStore'
import { completedTasks, resolveTaskAttachments, useWorkspace } from '../state/workspaceStore'
import { OutputActions, RichOutput } from './RichOutput'

const STAGE_LABEL = {
  queued: 'Ready to start', planning: 'Lead is planning', delegated: 'Team is collaborating',
  reviewing: 'Lead quality review', revising: 'Revisions in progress', awaiting_approval: 'Waiting for your approval', done: 'Delivered', error: 'Needs attention',
} as const

const QUICK_FORMATS = ['Word document', 'PDF report', 'Excel spreadsheet', 'PowerPoint deck', 'Markdown', 'JSON', 'CSV']

export function WorkBoard() {
  const agents = useWorkspace((state) => state.agents)
  const teams = useWorkspace((state) => state.teams)
  const jobs = useWorkspace((state) => state.teamJobs)
  const addTask = useWorkspace((state) => state.addTask)
  const runAgentTasks = useWorkspace((state) => state.runAgentTasks)
  const createTeamJob = useWorkspace((state) => state.createTeamJob)
  const runTeamJob = useWorkspace((state) => state.runTeamJob)
  const removeTeamJob = useWorkspace((state) => state.removeTeamJob)
  const approveTask = useWorkspace((state) => state.approveTask)
  const requestTaskRevision = useWorkspace((state) => state.requestTaskRevision)
  const approveTeamJob = useWorkspace((state) => state.approveTeamJob)
  const requestTeamRevision = useWorkspace((state) => state.requestTeamRevision)
  const skipApprovals = useWorkspace((state) => state.skipApprovals)
  const setSkipApprovals = useWorkspace((state) => state.setSkipApprovals)
  const workspaceOnline = useWorkspace((state) => state.workspaceOnline)
  const files = useFiles((state) => state.files)
  const refreshFiles = useFiles((state) => state.refresh)
  const availableTeams = useMemo(() => teams.filter((team) => team.id !== BENCH_ID && agents.some((agent) => agent.teamId === team.id)), [agents, teams])
  const [mode, setMode] = useState<'individual' | 'team'>('individual')
  const [target, setTarget] = useState(agents[0]?.id ?? '')
  const [brief, setBrief] = useState('')
  const [format, setFormat] = useState('Markdown document with clear headings')
  const [attachments, setAttachments] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const latestIndividual = completedTasks(agents)[0]
  const resolvedAttachments = useMemo(() => resolveTaskAttachments(brief, attachments, files), [brief, attachments, files])

  useEffect(() => { void refreshFiles() }, [refreshFiles])

  const targets = mode === 'individual' ? agents : availableTeams
  const effectiveTarget = targets.some((item) => item.id === target) ? target : targets[0]?.id ?? ''
  const toggleFile = (name: string) => setAttachments((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])
  const submit = async () => {
    if (!workspaceOnline || !brief.trim() || !effectiveTarget) return
    setStarting(true)
    try {
      if (mode === 'individual') {
        addTask(effectiveTarget, brief, format, resolvedAttachments)
        setBrief('')
        setAttachments([])
        await runAgentTasks(effectiveTarget)
      } else {
        const id = createTeamJob(effectiveTarget, brief, format, resolvedAttachments)
        setBrief('')
        setAttachments([])
        if (id) await runTeamJob(id)
      }
    } finally { setStarting(false) }
  }

  return <div className="space-y-5">
    <section className="rounded-[26px] border border-line bg-surface/70 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="group" aria-label="Assignment type">
        {(['individual', 'team'] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setTarget('') }} className={`rounded-xl px-3 py-2 text-xs font-bold capitalize transition-all ${mode === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink'}`}>{value === 'individual' ? 'Individual agent' : 'Entire team'}</button>)}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3"><input type="checkbox" checked={skipApprovals} onChange={(event) => setSkipApprovals(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" /><span><span className="block text-xs font-bold text-ink">Skip my approval</span><span className="mt-0.5 block text-[11px] leading-relaxed text-ink-faint">Off by default. When off, drafts wait for you before they become outputs, shared files, or learning memory.</span></span></label>

      <label className="mt-4 block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Assign to</span><select aria-label="Assign to" value={effectiveTarget} onChange={(event) => setTarget(event.target.value)} className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent-ring">{targets.map((item) => {
        const parent = 'roleName' in item && item.parentAgentId ? agents.find((agent) => agent.id === item.parentAgentId) : undefined
        return <option key={item.id} value={item.id}>{item.name}{'roleName' in item ? ` — ${item.roleName}${parent ? ` · sub-agent of ${parent.name}` : ''}` : ` — ${agents.filter((agent) => agent.teamId === item.id).length} members`}</option>
      })}</select></label>
      {mode === 'team' && effectiveTarget && <p className="mt-2 rounded-2xl bg-accent-ring px-3.5 py-2.5 text-[11px] leading-relaxed text-ink-soft">The team lead plans the split, every member contributes, junior work is reviewed, and unsatisfactory work is automatically returned for revision before final delivery.</p>}

      <label className="mt-4 block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Work brief</span><textarea aria-label="Work brief" rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Describe the result you need, constraints, audience and success criteria…" className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring" /></label>
      <label className="mt-4 block"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Output format</span><input aria-label="Output format" value={format} onChange={(event) => setFormat(event.target.value)} placeholder="PDF report, Word document, spreadsheet, slides, code…" className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring" /></label>
      <div className="mt-2 flex flex-wrap gap-1.5">{QUICK_FORMATS.map((item) => <button key={item} type="button" onClick={() => setFormat(item)} className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 transition-colors ${format === item ? 'bg-solid text-on-solid ring-transparent' : 'bg-surface-2 text-ink-faint ring-line hover:text-ink'}`}>{item}</button>)}</div>
      <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">Answers render as a polished document in Autowork. Download creates the real file type you request.</p>

      {files.length > 0 && <div className="mt-4"><span className="mb-2 block text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Files</span><div className="flex flex-wrap gap-2">{files.map((file) => { const selected = resolvedAttachments.includes(file.name); return <button key={file.name} type="button" aria-pressed={selected} onClick={() => toggleFile(file.name)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ring-1 transition-all ${selected ? 'bg-solid text-on-solid ring-transparent' : 'bg-surface text-ink-soft ring-line hover:text-ink'}`}>{file.name}</button> })}</div><p className="mt-2 text-[10px] leading-relaxed text-ink-faint">Selected files are sent with this assignment. A file is selected automatically when you mention its name; if there is only one file, saying “the uploaded document” also attaches it.</p></div>}

      {!workspaceOnline && <p className="mt-4 rounded-2xl border border-[#d5525f]/30 bg-[#d5525f]/10 px-3.5 py-2.5 text-xs font-semibold text-ink">Workspace is shut down. Your queues and agent memory are preserved.</p>}
      <button type="button" onClick={() => void submit()} disabled={!workspaceOnline || starting || !brief.trim() || !effectiveTarget} className="mt-5 w-full rounded-2xl bg-solid py-3 text-sm font-bold text-on-solid shadow-lg transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">{starting ? (mode === 'team' ? 'Team workflow running…' : 'Agent working…') : workspaceOnline ? 'Assign & start' : 'Workspace is off'}</button>
    </section>

    {latestIndividual && <section>
      <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Latest individual delivery</h3>
      <article className="rounded-[22px] border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-ink">{latestIndividual.agent.name}</span><span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-ink-soft">{latestIndividual.agent.roleName}</span><span className={`ml-auto text-[11px] font-bold ${latestIndividual.task.status === 'done' ? 'text-ok' : latestIndividual.task.status === 'awaiting_approval' ? 'text-accent' : 'text-warn'}`}>{latestIndividual.task.status === 'done' ? 'Delivered' : latestIndividual.task.status === 'awaiting_approval' ? 'Awaiting approval' : 'Needs attention'}</span></div>
        <p className="mt-2 text-xs font-semibold text-ink">{latestIndividual.task.text}</p>
        <div className="mt-3 max-h-96 overflow-auto rounded-2xl bg-surface-2 p-4">{latestIndividual.task.output ? <RichOutput content={latestIndividual.task.output} /> : <p className="text-xs leading-relaxed text-warn">{latestIndividual.task.error}</p>}</div>
        {latestIndividual.task.recoveredFromTimeout && <p className="mt-2 text-[10px] font-semibold text-ink-faint">Recovered automatically with {latestIndividual.task.ranWith?.model} after the original model timed out.</p>}
        {latestIndividual.task.outputFile && <p className="mt-2 rounded-xl bg-ok/10 px-3 py-2 text-[11px] font-semibold text-ink-soft">Saved for all workspace teams as <span className="text-ink">{latestIndividual.task.outputFile}</span></p>}
        {latestIndividual.task.status === 'awaiting_approval' && <div className="mt-3 flex gap-2"><button type="button" onClick={() => void approveTask(latestIndividual.agent.id, latestIndividual.task.id)} className="rounded-full bg-solid px-3 py-1.5 text-[11px] font-bold text-on-solid">Approve, save & learn</button><button type="button" onClick={() => requestTaskRevision(latestIndividual.agent.id, latestIndividual.task.id)} className="rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-ink-soft">Request revision</button></div>}
        {latestIndividual.task.output && <div className="mt-3"><OutputActions compact content={latestIndividual.task.output} format={latestIndividual.task.outputFormat} title={`${latestIndividual.agent.name} ${latestIndividual.task.text}`} /></div>}
      </article>
    </section>}

    {jobs.length > 0 && <section><h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[.09em] text-ink-faint">Team workflows</h3><div className="space-y-2">{jobs.map((job) => {
      const team = teams.find((item) => item.id === job.teamId)
      const done = job.contributions.filter((item) => item.status === 'done').length
      return <article key={job.id} className="rounded-[22px] border border-line bg-surface p-4">
        <div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${job.status === 'done' ? 'bg-ok' : job.status === 'error' ? 'bg-warn' : 'bg-accent'}`} /><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold text-ink">{job.brief}</p><p className="mt-1 text-[11px] text-ink-faint">{team?.name} · {STAGE_LABEL[job.status]} · {done}/{job.contributions.length} contributions{job.reviewRound ? ` · review ${job.reviewRound}` : ''}</p></div><button type="button" onClick={() => removeTeamJob(job.id)} aria-label="Remove team assignment" className="rounded-full px-2 py-1 text-xs text-ink-faint hover:bg-surface-2 hover:text-ink">×</button></div>
        {job.status === 'queued' && <button type="button" disabled={!workspaceOnline} onClick={() => void runTeamJob(job.id)} className="mt-3 rounded-full bg-solid px-3 py-1.5 text-[11px] font-bold text-on-solid disabled:cursor-not-allowed disabled:opacity-45">{workspaceOnline ? 'Start workflow' : 'Workspace is off'}</button>}
        {job.status === 'awaiting_approval' && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void approveTeamJob(job.id)} className="rounded-full bg-solid px-3 py-1.5 text-[11px] font-bold text-on-solid">Approve, share & learn</button><button type="button" onClick={() => requestTeamRevision(job.id)} className="rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-ink-soft">Request another revision</button></div>}
        {job.error && <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">{job.error}</p>}
        {job.outputFile && <p className="mt-3 rounded-xl bg-ok/10 px-3 py-2 text-[11px] font-semibold text-ink-soft">Shared with every team as <span className="text-ink">{job.outputFile}</span></p>}
        {job.outputFileError && <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-[11px] text-warn">Delivery completed, but its shared file could not be created: {job.outputFileError}</p>}
        {job.finalOutput && <details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-accent">View final delivery</summary><div className="mt-2 max-h-[34rem] overflow-auto rounded-2xl bg-surface-2 p-4"><RichOutput content={job.finalOutput} /></div><div className="mt-3"><OutputActions compact content={job.finalOutput} format={job.outputFormat} title={`${team?.name ?? 'Team'} ${job.brief}`} /></div></details>}
      </article>
    })}</div></section>}
  </div>
}
