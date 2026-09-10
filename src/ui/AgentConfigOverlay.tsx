import { useEffect, useState } from 'react'
import { RoundedSelect, type SelectOption } from './RoundedSelect'
import {
  PROVIDERS,
  PROVIDER_BY_ID,
  TIER_COLORS,
  modelsFor,
  type ProviderId,
} from '../data/llm-catalog'
import { BENCH_ID } from '../data/org'
import { useWorkspace, type Agent, type Effort } from '../state/workspaceStore'
import { useAccentColor, useAvatarStyle, usePillStyle } from '../theme/pill'
import { TaskList } from './TaskList'

/** Chip colours are plain hexes so `pill()` can derive both themes from them. */
const STATUS_HEX: Record<Agent['status'], string> = {
  working: '#10b981',
  idle: '#8394ab',
  blocked: '#f43f5e',
  break: '#d49a45',
}

/**
 * Lives OUTSIDE the <Canvas>, as a normal DOM sibling. It reads the selected
 * agent straight from the store, so nothing has to be threaded through the 3D
 * tree — see the note in App.tsx for why this beats drei's <Html> here.
 */
export function AgentConfigOverlay() {
  const selectedId = useWorkspace((s) => s.selectedId)
  const agent = useWorkspace((s) => s.agents.find((a) => a.id === s.selectedId))
  const select = useWorkspace((s) => s.select)
  const setTeamLead = useWorkspace((s) => s.setTeamLead)
  const assignTeam = useWorkspace((s) => s.assignTeam)
  const setProvider = useWorkspace((s) => s.setProvider)
  const updateAgent = useWorkspace((s) => s.updateAgent)
  const deleteAgent = useWorkspace((s) => s.deleteAgent)
  const teams = useWorkspace((s) => s.teams)

  const pill = usePillStyle()
  const accent = useAccentColor()
  const avatar = useAvatarStyle()
  // Two-step delete: a stray click should not remove an agent and its outputs.
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  if (!agent || !selectedId) return null

  const team = teams.find((t) => t.id === agent.teamId) ?? teams[0]
  const provider = PROVIDER_BY_ID[agent.provider]

  const providerOptions: SelectOption[] = PROVIDERS.map((p) => ({
    value: p.id,
    label: p.label,
    hint: `${p.models.length} models available`,
    dot: accent(p.accent),
  }))

  // The model list is derived from the currently selected provider, so it
  // re-populates the moment the provider changes.
  const modelOptions: SelectOption[] = modelsFor(agent.provider).map((m) => ({
    value: m.id,
    label: m.id,
    hint: m.note,
    badge: { text: m.tier, style: pill(TIER_COLORS[m.tier]) },
  }))

  return (
    <aside
      className="glass-panel pointer-events-auto absolute bottom-[72px] left-3 right-3 top-[92px] z-40 flex w-auto flex-col overflow-hidden rounded-[30px] xl:bottom-5 xl:left-auto xl:right-5 xl:top-5 xl:w-[420px] xl:max-w-[calc(100vw-2.5rem)]"
      style={{ animation: 'slideIn 300ms cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      {/* ------------------------------ header ------------------------------ */}
      <header className="panel-header-line relative shrink-0 px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
        <div
          className="absolute inset-x-0 top-0 h-28 opacity-45"
          style={{ background: `radial-gradient(120% 80% at 50% 0%, ${agent.color}44 0%, transparent 70%)` }}
        />
        <div className="relative flex items-start gap-4">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center rounded-[20px] text-lg font-bold shadow-lg"
            style={{ ...avatar(agent.color), boxShadow: `0 10px 24px -8px ${agent.color}` }}
          >
            {agent.name.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={agent.name}
              aria-label="Agent name"
              onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
              className="w-full rounded-xl bg-transparent text-xl font-bold tracking-[-0.04em] text-ink outline-none transition-colors focus:bg-surface focus:px-2 focus:ring-4 focus:ring-accent-ring"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={pill(team.tint)}>
                {team.name}
              </span>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={pill(agent.color)}>
                {agent.roleName}
              </span>
              {agent.isTeamLead && <span className="rounded-full bg-accent-ring px-2.5 py-1 text-[11px] font-bold text-accent">Team lead</span>}
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize"
                style={pill(STATUS_HEX[agent.status])}
              >
                {agent.status}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => select(null)}
            aria-label="Close"
            className="soft-button grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-all duration-200 hover:scale-105 hover:text-ink active:scale-95"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>
        </div>
      </header>

      {/* ------------------------------- body ------------------------------- */}
      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-6 sm:pb-6">
        {/* Team */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Team</h3>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => {
              const isActive = t.id === agent.teamId
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => assignTeam(agent.id, t.id)}
                  className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 ${
                    isActive
                      ? 'bg-solid text-on-solid shadow-lg shadow-black/20'
                      : 'bg-surface text-ink-soft shadow-sm ring-1 ring-line hover:shadow-md'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent(t.tint) }} />
                  {t.name}
                </button>
              )
            })}
          </div>
          <p className="mt-2.5 px-1 text-xs leading-relaxed text-ink-faint">{team.mission}</p>
        </section>

        {/* Custom role */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Custom role</h3>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-soft">Role name</span><input value={agent.roleName} onChange={(e) => updateAgent(agent.id, { roleName: e.target.value })} className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent-ring" /></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-ink-soft">Role description</span><textarea rows={3} value={agent.roleDescription} onChange={(e) => updateAgent(agent.id, { roleDescription: e.target.value })} className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink outline-none focus:border-accent focus:ring-4 focus:ring-accent-ring" /></label>
          {agent.teamId !== BENCH_ID && <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3"><input type="checkbox" checked={agent.isTeamLead} onChange={(e) => setTeamLead(agent.id, e.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" /><span className="text-sm font-semibold text-ink">Team lead and final reviewer</span></label>}
        </section>

        {/* Model */}
        <section className="space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Language model</h3>

          <RoundedSelect
            label="Provider"
            value={agent.provider}
            options={providerOptions}
            onChange={(v) => setProvider(agent.id, v as ProviderId)}
          />

          <RoundedSelect
            label="Model"
            value={agent.model}
            options={modelOptions}
            onChange={(v) => updateAgent(agent.id, { model: v })}
          />

          {/* Effort */}
          <div>
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Effort</span>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="group" aria-label="Reasoning effort">
              {(['low', 'medium', 'high'] as Effort[]).map((effort) => <button key={effort} type="button" aria-pressed={agent.effort === effort} onClick={() => updateAgent(agent.id, { effort })} className={`rounded-xl px-2 py-2 text-xs font-bold capitalize transition-all ${agent.effort === effort ? 'bg-surface text-ink shadow-sm' : 'text-ink-faint hover:text-ink'}`}>{effort}</button>)}
            </div>
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-faint">Low uses a smaller reasoning and output budget. High spends more tokens for complex work.</p>
          </div>

          {/* System prompt */}
          <div>
            <label htmlFor="system-prompt" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
              System prompt
            </label>
            <textarea
              id="system-prompt"
              rows={3}
              value={agent.systemPrompt}
              onChange={(e) => updateAgent(agent.id, { systemPrompt: e.target.value })}
              className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink shadow-sm outline-none transition-all duration-200 placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring"
              placeholder="Describe how this agent should behave…"
            />
          </div>
        </section>

        <TaskList agent={agent} />
      </div>

      {/* ------------------------------ footer ------------------------------ */}
      <footer className="shrink-0 border-t border-line-soft bg-surface/30 px-5 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-ink-faint">Runs on</span>
          <span className="rounded-full px-2.5 py-1 font-semibold" style={pill(provider.accent)}>
            {provider.label} · {agent.model}
          </span>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={agent.status === 'working'}
            onClick={() => updateAgent(agent.id, { status: agent.status === 'break' ? 'idle' : 'break' })}
            className="flex-1 rounded-[18px] bg-solid py-3 text-sm font-semibold text-on-solid shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
          >
            {agent.status === 'working' ? 'Working…' : agent.status === 'break' ? 'Return to desk' : 'Take a break'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirmDelete) deleteAgent(agent.id)
              else setConfirmDelete(true)
            }}
            onBlur={() => setConfirmDelete(false)}
            className="rounded-[18px] bg-surface px-5 py-3 text-sm font-semibold text-ink-soft ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
          >
            {confirmDelete ? 'Sure?' : 'Delete'}
          </button>
        </div>
      </footer>
    </aside>
  )
}
