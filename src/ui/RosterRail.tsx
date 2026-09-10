import { useState } from 'react'
import { pendingCount, useWorkspace, type Agent } from '../state/workspaceStore'
import { useAccentColor, useAvatarStyle } from '../theme/pill'
import { CreateAgentDialog, CreateTeamDialog } from './CreateDialogs'

const STATUS_VAR: Record<Agent['status'], string> = {
  working: 'var(--color-ok)',
  idle: 'var(--color-neutral)',
  blocked: 'var(--color-warn)',
  break: '#c9924c',
}

function PlusIcon() {
  return <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
}

function hierarchyRows(members: Agent[]): Array<{ agent: Agent; depth: number }> {
  const memberIds = new Set(members.map((agent) => agent.id))
  const rows: Array<{ agent: Agent; depth: number }> = []
  const visited = new Set<string>()
  const visit = (agent: Agent, depth: number) => {
    if (visited.has(agent.id)) return
    visited.add(agent.id)
    rows.push({ agent, depth })
    members.filter((child) => child.parentAgentId === agent.id).forEach((child) => visit(child, depth + 1))
  }
  members.filter((agent) => !agent.parentAgentId || !memberIds.has(agent.parentAgentId)).forEach((agent) => visit(agent, 0))
  members.filter((agent) => !visited.has(agent.id)).forEach((agent) => visit(agent, 0))
  return rows
}

export function RosterRail() {
  const agents = useWorkspace((s) => s.agents)
  const selectedId = useWorkspace((s) => s.selectedId)
  const teams = useWorkspace((s) => s.teams)
  const select = useWorkspace((s) => s.select)
  const hover = useWorkspace((s) => s.hover)
  const deleteTeam = useWorkspace((s) => s.deleteTeam)
  const accent = useAccentColor()
  const avatar = useAvatarStyle()
  const [dialog, setDialog] = useState<'team' | 'agent' | null>(null)
  const active = agents.filter((a) => a.status === 'working').length

  return (
    <>
      <nav className="pointer-events-none absolute bottom-5 left-5 top-5 z-20 hidden w-[260px] xl:block">
        <div className="glass-panel pointer-events-auto flex h-full flex-col overflow-hidden rounded-[32px]">
          <header className="panel-header-line shrink-0 px-5 pb-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-faint">Workspace</p>
                <h1 className="mt-1 text-xl font-bold tracking-[-0.04em] text-ink">Mission control</h1>
              </div>
              <button
                type="button"
                onClick={() => setDialog('agent')}
                aria-label="New agent"
                className="grid h-10 w-10 place-items-center rounded-[15px] bg-solid text-on-solid shadow-lg shadow-black/15 transition-transform hover:-translate-y-0.5 active:scale-95"
              >
                <PlusIcon />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[18px] bg-surface/55 px-3 py-2.5 ring-1 ring-line-soft">
                <p className="text-lg font-bold tabular-nums text-ink">{agents.length}</p>
                <p className="text-[10px] font-medium text-ink-faint">total agents</p>
              </div>
              <div className="rounded-[18px] bg-surface/55 px-3 py-2.5 ring-1 ring-line-soft">
                <p className="flex items-center gap-2 text-lg font-bold tabular-nums text-ink"><span className="live-dot h-2 w-2 rounded-full bg-ok" />{active}</p>
                <p className="text-[10px] font-medium text-ink-faint">active now</p>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {teams.map((team) => {
              const members = agents.filter((a) => a.teamId === team.id)
              if (!members.length && team.system) return null
              return (
                <section key={team.id}>
                  <div className="group mb-1.5 flex items-center gap-2 px-2">
                    <span className="h-2 w-2 rounded-full shadow-sm" style={{ background: accent(team.tint) }} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.1em] text-ink-faint">{team.name}</span>
                    <span className="text-[10px] font-semibold tabular-nums text-ink-faint">{members.length}</span>
                    {!team.system && (
                      <button
                        type="button"
                        onClick={() => deleteTeam(team.id)}
                        aria-label={`Delete team ${team.name}`}
                        title="Delete team (members move to the Bench)"
                        className="grid h-5 w-5 place-items-center rounded-full text-ink-faint opacity-0 transition-all hover:bg-surface-2 hover:text-warn focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {hierarchyRows(members).map(({ agent, depth }) => {
                      const isActive = agent.id === selectedId
                      const queued = pendingCount(agent)
                      const parent = agents.find((item) => item.id === agent.parentAgentId)
                      return (
                        <button
                          key={agent.id}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => select(agent.id)}
                          onMouseEnter={() => hover(agent.id)}
                          onMouseLeave={() => hover(null)}
                          aria-label={`${agent.name}, ${agent.roleName}${parent ? `, reports to ${parent.name}` : ''}`}
                          style={{ marginLeft: depth ? Math.min(depth, 5) * 12 : 0, width: depth ? `calc(100% - ${Math.min(depth, 5) * 12}px)` : '100%' }}
                          className={`group relative flex items-center gap-3 rounded-[18px] px-2.5 py-2 text-left transition-all duration-200 ${
                            isActive ? 'bg-solid text-on-solid shadow-lg shadow-black/15' : 'hover:bg-surface/70'
                          }`}
                        >
                          {depth > 0 && <span aria-hidden className={`absolute -left-2 top-1/2 h-px w-2 ${isActive ? 'bg-on-solid/35' : 'bg-line'}`} />}
                          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[13px] text-[11px] font-bold shadow-sm" style={avatar(agent.color)}>
                            {agent.name.slice(0, 2).toUpperCase()}
                            <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ${isActive ? 'ring-solid' : 'ring-surface'}`} style={{ background: STATUS_VAR[agent.status] }} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] font-bold ${isActive ? 'text-on-solid' : 'text-ink'}`}>{agent.name}</span>
                            <span className={`mt-0.5 block truncate text-[10px] ${isActive ? 'text-on-solid/60' : 'text-ink-faint'}`}>{depth ? `${'Sub · '.repeat(Math.min(depth, 2))}` : ''}{agent.roleName}{agent.isTeamLead ? ' · Lead' : ''}</span>
                          </span>
                          {queued > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-on-solid/15 text-on-solid' : 'bg-surface-2 text-ink-soft'}`}>{queued}</span>}
                        </button>
                      )
                    })}
                    {!members.length && <p className="px-2.5 py-2 text-[11px] text-ink-faint">No agents in this team</p>}
                  </div>
                </section>
              )
            })}
          </div>

          <footer className="panel-header-line shrink-0 border-t border-line-soft p-3">
            <button type="button" onClick={() => setDialog('team')} className="soft-button flex w-full items-center justify-center gap-2 rounded-[18px] py-2.5 text-xs font-bold text-ink-soft transition-all hover:-translate-y-0.5 hover:text-ink">
              <PlusIcon /> New team
            </button>
          </footer>
        </div>
      </nav>

      <nav className="pointer-events-none absolute bottom-3 left-3 right-3 z-30 xl:hidden">
        <div className="glass-panel pointer-events-auto flex items-center gap-2 overflow-x-auto rounded-[24px] p-2">
          {agents.map((agent) => {
            const selected = selectedId === agent.id
            return (
              <button key={agent.id} type="button" aria-label={`${agent.name}, ${agent.roleName}`} aria-pressed={selected} onClick={() => select(agent.id)} className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-[16px] text-[11px] font-bold shadow-sm transition-all ${selected ? 'scale-105 ring-2 ring-accent ring-offset-2 ring-offset-canvas' : 'opacity-80'}`} style={avatar(agent.color)}>
                {agent.name.slice(0, 2).toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ background: STATUS_VAR[agent.status] }} />
              </button>
            )
          })}
          <button type="button" onClick={() => setDialog('agent')} aria-label="New agent" className="soft-button grid h-11 w-11 shrink-0 place-items-center rounded-[16px] text-ink-soft"><PlusIcon /></button>
        </div>
      </nav>

      {dialog === 'team' && <CreateTeamDialog onClose={() => setDialog(null)} />}
      {dialog === 'agent' && <CreateAgentDialog onClose={() => setDialog(null)} />}
    </>
  )
}
