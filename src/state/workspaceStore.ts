import { create } from 'zustand'
import {
  BENCH_ID,
  DEFAULT_TEAMS,
  ROLE_BY_ID,
  TEAM_TINTS,
  type RoleId,
  type Team,
} from '../data/org'
import {
  defaultModelFor,
  isModelValidFor,
  type ProviderId,
} from '../data/llm-catalog'
import { ApiError, runAgent as callModel } from '../api/client'

export type AgentStatus = 'idle' | 'working' | 'blocked'
export type TaskStatus = 'pending' | 'running' | 'done' | 'error'

export interface Task {
  id: string
  text: string
  /** Workspace filenames to inject into the prompt. */
  attachments: string[]
  status: TaskStatus
  output?: string
  error?: string
  finishedAt?: number
  durationMs?: number
  /** Which model actually produced the output, recorded at run time. */
  ranWith?: { provider: ProviderId; model: string }
}

export interface Agent {
  id: string
  name: string
  teamId: string
  roleId: RoleId
  provider: ProviderId
  model: string
  temperature: number
  systemPrompt: string
  status: AgentStatus
  tasks: Task[]
  /** Optional .glb override; falls back to the procedural minifigure. */
  modelUrl?: string
}

interface WorkspaceState {
  teams: Team[]
  agents: Agent[]
  selectedId: string | null
  hoveredId: string | null
  showLabels: boolean
  /** Agent ids with a run in flight. */
  running: string[]
  /** True once state has been loaded (or found absent) — gates autosave. */
  hydrated: boolean

  select: (id: string | null) => void
  hover: (id: string | null) => void
  toggleLabels: () => void

  createTeam: (name: string, mission?: string) => string
  renameTeam: (id: string, name: string, mission?: string) => void
  deleteTeam: (id: string) => void

  createAgent: (input: { name: string; teamId: string; roleId: RoleId }) => string
  deleteAgent: (id: string) => void
  updateAgent: (id: string, patch: Partial<Omit<Agent, 'id' | 'tasks'>>) => void
  setProvider: (id: string, provider: ProviderId) => void
  assignTeam: (id: string, teamId: string) => void
  setRole: (id: string, roleId: RoleId) => void

  addTask: (agentId: string, text: string) => void
  updateTask: (agentId: string, taskId: string, patch: Partial<Task>) => void
  removeTask: (agentId: string, taskId: string) => void
  resetTask: (agentId: string, taskId: string) => void
  runAgentTasks: (agentId: string) => Promise<void>

  hydrate: (snapshot: PersistedState | null) => void
}

/* ------------------------------ persistence ------------------------------ */

export interface PersistedState {
  version: 1
  teams: Team[]
  agents: Agent[]
  showLabels: boolean
}

export const toPersisted = (s: WorkspaceState): PersistedState => ({
  version: 1,
  teams: s.teams,
  // Never persist a "running" task: a refresh mid-run would otherwise leave a
  // task stuck in that state forever with nothing driving it.
  agents: s.agents.map((a) => ({
    ...a,
    tasks: a.tasks.map((t) => (t.status === 'running' ? { ...t, status: 'pending' as const } : t)),
  })),
  showLabels: s.showLabels,
})

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)

/* --------------------------------- seed ---------------------------------- */

const seedAgents: Agent[] = [
  { id: 'a1', name: 'Ada', teamId: 'platform', roleId: 'team-lead', provider: 'anthropic', model: 'claude-opus-5', temperature: 0.3, systemPrompt: 'Coordinate the Platform backlog and unblock the team.', status: 'working', tasks: [] },
  { id: 'a2', name: 'Bruno', teamId: 'platform', roleId: 'full-stack-developer', provider: 'openai', model: 'gpt-5.6-terra', temperature: 0.2, systemPrompt: 'Implement service changes with tests alongside.', status: 'working', tasks: [] },
  { id: 'a3', name: 'Cleo', teamId: 'platform', roleId: 'qa-tester', provider: 'anthropic', model: 'claude-haiku-4.5', temperature: 0.1, systemPrompt: 'Run the regression suite and report failures precisely.', status: 'blocked', tasks: [] },
  { id: 'a4', name: 'Dex', teamId: 'growth', roleId: 'scrum-master', provider: 'openai', model: 'gpt-5.4', temperature: 0.4, systemPrompt: 'Run ceremonies, keep work in flow, surface blockers early.', status: 'working', tasks: [] },
  { id: 'a5', name: 'Esme', teamId: 'growth', roleId: 'business-analyst', provider: 'anthropic', model: 'claude-sonnet-5', temperature: 0.5, systemPrompt: 'Translate product intent into acceptance criteria.', status: 'idle', tasks: [] },
  { id: 'a6', name: 'Finn', teamId: 'growth', roleId: 'full-stack-developer', provider: 'openai', model: 'gpt-5.6-luna', temperature: 0.3, systemPrompt: 'Own the onboarding funnel end to end.', status: 'working', tasks: [] },
  { id: 'a7', name: 'Gia', teamId: 'insights', roleId: 'team-lead', provider: 'anthropic', model: 'claude-fable-5.1', temperature: 0.2, systemPrompt: 'Set the analytics roadmap and review findings.', status: 'working', tasks: [] },
  { id: 'a8', name: 'Hugo', teamId: 'insights', roleId: 'business-analyst', provider: 'openai', model: 'o3', temperature: 0.2, systemPrompt: 'Interrogate the numbers before drawing conclusions.', status: 'idle', tasks: [] },
  { id: 'a9', name: 'Iris', teamId: BENCH_ID, roleId: 'qa-tester', provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.1, systemPrompt: 'Awaiting assignment.', status: 'idle', tasks: [] },
  { id: 'a10', name: 'Juno', teamId: BENCH_ID, roleId: 'full-stack-developer', provider: 'anthropic', model: 'claude-sonnet-5', temperature: 0.3, systemPrompt: 'Awaiting assignment.', status: 'idle', tasks: [] },
]

/* --------------------------------- store --------------------------------- */

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  teams: DEFAULT_TEAMS,
  agents: seedAgents,
  selectedId: null,
  hoveredId: null,
  showLabels: false,
  running: [],
  hydrated: false,

  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),

  /* ------------------------------- teams ------------------------------- */

  createTeam: (name, mission = '') => {
    const trimmed = name.trim() || 'New team'
    const existing = new Set(get().teams.map((t) => t.id))
    let id = slug(trimmed) || uid('team')
    // Two teams called "Design" must not collide on the same generated id.
    if (existing.has(id)) id = `${id}-${Math.random().toString(36).slice(2, 5)}`

    const pods = get().teams.filter((t) => t.kind === 'pod').length
    set((s) => ({
      teams: [
        ...s.teams.filter((t) => t.kind === 'pod'),
        { id, name: trimmed, mission, tint: TEAM_TINTS[pods % TEAM_TINTS.length], kind: 'pod' },
        ...s.teams.filter((t) => t.kind !== 'pod'),
      ],
    }))
    return id
  },

  renameTeam: (id, name, mission) =>
    set((s) => ({
      teams: s.teams.map((t) =>
        t.id === id ? { ...t, name: name.trim() || t.name, mission: mission ?? t.mission } : t,
      ),
    })),

  // Deleting a team must not delete the people in it — they go to the bench.
  deleteTeam: (id) =>
    set((s) => {
      const team = s.teams.find((t) => t.id === id)
      if (!team || team.system) return s
      return {
        teams: s.teams.filter((t) => t.id !== id),
        agents: s.agents.map((a) => (a.teamId === id ? { ...a, teamId: BENCH_ID } : a)),
      }
    }),

  /* ------------------------------- agents ------------------------------ */

  createAgent: ({ name, teamId, roleId }) => {
    const id = uid('agent')
    const role = ROLE_BY_ID[roleId]
    set((s) => ({
      agents: [
        ...s.agents,
        {
          id,
          name: name.trim() || 'New agent',
          teamId,
          roleId,
          provider: 'anthropic',
          model: defaultModelFor('anthropic'),
          temperature: 0.3,
          systemPrompt: role.blurb,
          status: 'idle',
          tasks: [],
        },
      ],
      selectedId: id,
    }))
    return id
  },

  deleteAgent: (id) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  updateAgent: (id, patch) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),

  // Changing provider must also repair the model, or the second dropdown
  // would be left pointing at a model the new provider does not serve.
  setProvider: (id, provider) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === id
          ? {
              ...a,
              provider,
              model: isModelValidFor(provider, a.model) ? a.model : defaultModelFor(provider),
            }
          : a,
      ),
    })),

  setRole: (id, roleId) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, roleId } : a)) })),

  // Seats are derived from an agent's index within its team, so reassigning is
  // just a field change — the doll walks to whatever seat it now resolves to.
  assignTeam: (id, teamId) =>
    set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, teamId } : a)) })),

  /* -------------------------------- tasks ------------------------------ */

  addTask: (agentId, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              tasks: [...a.tasks, { id: uid('task'), text: trimmed, attachments: [], status: 'pending' }],
            }
          : a,
      ),
    }))
  },

  updateTask: (agentId, taskId, patch) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId
          ? { ...a, tasks: a.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }
          : a,
      ),
    })),

  removeTask: (agentId, taskId) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, tasks: a.tasks.filter((t) => t.id !== taskId) } : a,
      ),
    })),

  resetTask: (agentId, taskId) =>
    get().updateTask(agentId, taskId, {
      status: 'pending',
      output: undefined,
      error: undefined,
      finishedAt: undefined,
      durationMs: undefined,
    }),

  /**
   * Runs an agent's pending tasks one after another.
   *
   * Sequential rather than parallel on purpose: tasks in a list usually depend
   * on each other conceptually, and firing eight requests at once is the
   * fastest way to hit a rate limit. Each task is an independent call — no
   * conversation is carried between them.
   */
  runAgentTasks: async (agentId) => {
    const state = get()
    if (state.running.includes(agentId)) return

    const agent = state.agents.find((a) => a.id === agentId)
    if (!agent) return
    const queue = agent.tasks.filter((t) => t.status === 'pending' || t.status === 'error')
    if (!queue.length) return

    set((s) => ({ running: [...s.running, agentId] }))
    get().updateAgent(agentId, { status: 'working' })

    for (const task of queue) {
      // Re-read each iteration: the task may have been edited or deleted while
      // an earlier one was still in flight.
      const live = get().agents.find((a) => a.id === agentId)
      const current = live?.tasks.find((t) => t.id === task.id)
      if (!live || !current) continue

      get().updateTask(agentId, task.id, {
        status: 'running',
        output: undefined,
        error: undefined,
      })
      const startedAt = Date.now()

      try {
        const role = ROLE_BY_ID[live.roleId]
        const text = await callModel({
          provider: live.provider,
          model: live.model,
          system: `${role.charter}\n\n${live.systemPrompt}`.trim(),
          prompt: current.text,
          temperature: live.temperature,
          attachments: current.attachments,
        })
        get().updateTask(agentId, task.id, {
          status: 'done',
          output: text || '(the model returned an empty response)',
          finishedAt: Date.now(),
          durationMs: Date.now() - startedAt,
          ranWith: { provider: live.provider, model: live.model },
        })
      } catch (err) {
        get().updateTask(agentId, task.id, {
          status: 'error',
          error: err instanceof ApiError ? err.message : 'Run failed.',
          finishedAt: Date.now(),
          durationMs: Date.now() - startedAt,
        })
        // Stop the queue: if the key is missing or the model name is wrong,
        // every remaining task fails the same way and burns the same time.
        break
      }
    }

    const after = get().agents.find((a) => a.id === agentId)
    const failed = after?.tasks.some((t) => t.status === 'error')
    set((s) => ({ running: s.running.filter((r) => r !== agentId) }))
    get().updateAgent(agentId, { status: failed ? 'blocked' : 'idle' })
  },

  /* ------------------------------ hydration ---------------------------- */

  hydrate: (snapshot) => {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.teams)) {
      // Authenticated accounts are namespaced in browser storage. Reset every
      // field when a new account has no snapshot so a shared computer can never
      // show the previous member's in-memory workspace after sign-out/sign-in.
      set({
        teams: DEFAULT_TEAMS,
        agents: seedAgents,
        selectedId: null,
        hoveredId: null,
        showLabels: false,
        running: [],
        hydrated: true,
      })
      return
    }
    // Guarantee the bench survives whatever is in the saved file, or agents
    // could be stranded in a team that no longer exists.
    const teams = snapshot.teams.some((t) => t.id === BENCH_ID)
      ? snapshot.teams
      : [...snapshot.teams, DEFAULT_TEAMS[DEFAULT_TEAMS.length - 1]]
    const ids = new Set(teams.map((t) => t.id))

    set({
      teams,
      agents: (snapshot.agents ?? []).map((a) => ({
        ...a,
        teamId: ids.has(a.teamId) ? a.teamId : BENCH_ID,
        tasks: Array.isArray(a.tasks) ? a.tasks : [],
      })),
      showLabels: Boolean(snapshot.showLabels),
      hydrated: true,
    })
  },
}))

/* ------------------------------- selectors ------------------------------- */

export const teamHeadcount = (agents: Agent[], teams: Team[]): Record<string, number> =>
  Object.fromEntries(teams.map((t) => [t.id, agents.filter((a) => a.teamId === t.id).length]))

export const pendingCount = (agent: Agent): number =>
  agent.tasks.filter((t) => t.status === 'pending' || t.status === 'error').length

export const completedTasks = (agents: Agent[]) =>
  agents
    .flatMap((a) => a.tasks.filter((t) => t.status === 'done' || t.status === 'error').map((t) => ({ agent: a, task: t })))
    .sort((x, y) => (y.task.finishedAt ?? 0) - (x.task.finishedAt ?? 0))
