import { useEffect, useState } from 'react'
import { RoundedSelect, type SelectOption } from './RoundedSelect'
import {
  PROVIDERS,
  PROVIDER_BY_ID,
  TIER_COLORS,
  modelsFor,
  type ProviderId,
} from '../data/llm-catalog'
import { ROLES, ROLE_BY_ID } from '../data/org'
import { useWorkspace, type Agent } from '../state/workspaceStore'
import { useAccentColor, useAvatarStyle, usePillStyle } from '../theme/pill'
import { TaskList } from './TaskList'

/** Chip colours are plain hexes so `pill()` can derive both themes from them. */
const STATUS_HEX: Record<Agent['status'], string> = {
  working: '#10b981',
  idle: '#8394ab',
  blocked: '#f43f5e',
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
  const setRole = useWorkspace((s) => s.setRole)
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

  const role = ROLE_BY_ID[agent.roleId]
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
          style={{ background: `radial-gradient(120% 80% at 50% 0%, ${role.color}44 0%, transparent 70%)` }}
        />
        <div className="relative flex items-start gap-4">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center rounded-[20px] text-lg font-bold shadow-lg"
            style={{ ...avatar(role.color), boxShadow: `0 10px 24px -8px ${role.color}` }}
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
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={pill(role.color)}>
                {role.label}
              </span>
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

        {/* Role */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Role</h3>
          <div className="space-y-2">
            {ROLES.map((r) => {
              const isActive = r.id === agent.roleId
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setRole(agent.id, r.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-200 ${
                    isActive
                      ? 'bg-surface shadow-md shadow-black/10 ring-2 ring-accent'
                      : 'bg-surface/60 ring-1 ring-line hover:bg-surface hover:shadow-sm'
                  }`}
                >
                  <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: accent(r.color) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{r.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-faint">{r.blurb}</span>
                  </span>
                  {isActive && (
                    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m4.5 10.5 4 4 7-8" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
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

          {/* Temperature */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="temperature" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                Temperature
              </label>
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
                {agent.temperature.toFixed(2)}
              </span>
            </div>
            <input
              id="temperature"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={agent.temperature}
              onChange={(e) => updateAgent(agent.id, { temperature: Number(e.target.value) })}
              className="slider w-full"
              style={{ ['--pct' as string]: `${agent.temperature * 100}%` }}
            />
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
            onClick={() =>
              updateAgent(agent.id, { status: agent.status === 'working' ? 'idle' : 'working' })
            }
            className="flex-1 rounded-[18px] bg-solid py-3 text-sm font-semibold text-on-solid shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
          >
            {agent.status === 'working' ? 'Pause agent' : 'Deploy agent'}
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
