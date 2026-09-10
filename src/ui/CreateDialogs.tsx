import { useState } from 'react'
import { Modal } from './Modal'
import { ROLES, type RoleId } from '../data/org'
import { useWorkspace } from '../state/workspaceStore'
import { useAccentColor } from '../theme/pill'

export function CreateTeamDialog({ onClose }: { onClose: () => void }) {
  const createTeam = useWorkspace((s) => s.createTeam)
  const [name, setName] = useState('')
  const [mission, setMission] = useState('')

  const submit = () => {
    if (!name.trim()) return
    createTeam(name, mission)
    onClose()
  }

  return (
    <Modal title="New team" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div>
          <label htmlFor="team-name" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Name
          </label>
          <input
            id="team-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Design Systems"
            className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink outline-none transition-all duration-200 placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring"
          />
        </div>

        <div>
          <label htmlFor="team-mission" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Mission <span className="normal-case tracking-normal text-ink-faint">(optional)</span>
          </label>
          <textarea
            id="team-mission"
            rows={2}
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            placeholder="What this team is responsible for."
            className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-all duration-200 placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring"
          />
        </div>

        <p className="px-1 text-xs leading-relaxed text-ink-faint">
          A new desk pod is laid out on the floor automatically.
        </p>

        <div className="flex gap-2.5 pt-1">
          <button
            type="submit"
            disabled={!name.trim()}
            className="flex-1 rounded-2xl bg-solid py-3 text-sm font-semibold text-on-solid shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            Create team
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-surface px-5 py-3 text-sm font-semibold text-ink-soft ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function CreateAgentDialog({ onClose }: { onClose: () => void }) {
  const teams = useWorkspace((s) => s.teams)
  const createAgent = useWorkspace((s) => s.createAgent)
  const accent = useAccentColor()

  const [name, setName] = useState('')
  const [teamId, setTeamId] = useState(teams[0]?.id ?? 'bench')
  const [roleId, setRoleId] = useState<RoleId>('full-stack-developer')

  const submit = () => {
    if (!name.trim()) return
    createAgent({ name, teamId, roleId })
    onClose()
  }

  return (
    <Modal title="New agent" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div>
          <label htmlFor="agent-name" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            Name
          </label>
          <input
            id="agent-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kira"
            className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-ink outline-none transition-all duration-200 placeholder:text-ink-faint focus:border-accent focus:ring-4 focus:ring-accent-ring"
          />
        </div>

        <div>
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Team</span>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={t.id === teamId}
                onClick={() => setTeamId(t.id)}
                className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  t.id === teamId
                    ? 'bg-solid text-on-solid shadow-md shadow-black/20'
                    : 'bg-surface text-ink-soft ring-1 ring-line hover:shadow-sm'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent(t.tint) }} />
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Role</span>
          <div className="space-y-1.5">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={r.id === roleId}
                onClick={() => setRoleId(r.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-all duration-200 ${
                  r.id === roleId
                    ? 'bg-surface shadow-md shadow-black/10 ring-2 ring-accent'
                    : 'bg-surface/60 ring-1 ring-line hover:bg-surface'
                }`}
              >
                <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: accent(r.color) }} />
                <span className="text-sm font-semibold text-ink">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            type="submit"
            disabled={!name.trim()}
            className="flex-1 rounded-2xl bg-solid py-3 text-sm font-semibold text-on-solid shadow-lg shadow-black/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            Create agent
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-surface px-5 py-3 text-sm font-semibold text-ink-soft ring-1 ring-line transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
