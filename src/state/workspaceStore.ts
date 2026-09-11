import { create } from 'zustand'
import { AGENT_COLORS, BENCH_ID, DEFAULT_TEAMS, TEAM_TINTS, type Team } from '../data/org'
import { defaultModelFor, isModelValidFor, type ProviderId } from '../data/llm-catalog'
import { ApiError, runAgent as callModel, uploadFile } from '../api/client'
import { useFiles } from './filesStore'
import { buildOutputFile } from '../output/artifacts'

export type AgentStatus = 'idle' | 'working' | 'blocked' | 'break'
export type TaskStatus = 'pending' | 'running' | 'awaiting_approval' | 'done' | 'error'
export type Effort = 'low' | 'medium' | 'high'
export type TeamJobStatus = 'queued' | 'planning' | 'delegated' | 'reviewing' | 'revising' | 'awaiting_approval' | 'done' | 'error'

export interface AgentMemory {
  id: string
  sourceId: string
  lesson: string
  learnedAt: number
}

export interface Task {
  id: string
  text: string
  attachments: string[]
  outputFormat: string
  status: TaskStatus
  output?: string
  error?: string
  finishedAt?: number
  durationMs?: number
  ranWith?: { provider: ProviderId; model: string }
  recoveredFromTimeout?: boolean
  outputFile?: string
  outputFileError?: string
  approvalFeedback?: string
}

export interface Agent {
  id: string
  name: string
  teamId: string
  /** Optional recursive reporting line. The referenced agent is the parent. */
  parentAgentId?: string
  roleName: string
  roleDescription: string
  isTeamLead: boolean
  color: string
  provider: ProviderId
  model: string
  effort: Effort
  systemPrompt: string
  status: AgentStatus
  tasks: Task[]
  memory?: AgentMemory[]
  modelUrl?: string
}

export interface TeamContribution {
  agentId: string
  status: 'queued' | 'working' | 'done' | 'revision' | 'error'
  output?: string
  error?: string
  ranWith?: { provider: ProviderId; model: string }
  recoveredFromTimeout?: boolean
}

export interface TeamJob {
  id: string
  teamId: string
  brief: string
  outputFormat: string
  attachments: string[]
  status: TeamJobStatus
  plan?: string
  contributions: TeamContribution[]
  reviewRound: number
  reviewNotes?: string
  finalOutput?: string
  outputFile?: string
  outputFileError?: string
  error?: string
  createdAt: number
  finishedAt?: number
}

export interface WorkspaceProfile {
  ownerName: string
  workspaceName: string
  email: string
  phone: string
}

interface WorkspaceState {
  teams: Team[]
  agents: Agent[]
  teamJobs: TeamJob[]
  profile: WorkspaceProfile
  selectedId: string | null
  hoveredId: string | null
  showLabels: boolean
  skipApprovals: boolean
  workspaceOnline: boolean
  pausedAgentRuns: string[]
  pausedTeamRuns: string[]
  running: string[]
  runningTeams: string[]
  hydrated: boolean
  select: (id: string | null) => void
  hover: (id: string | null) => void
  toggleLabels: () => void
  setSkipApprovals: (skip: boolean) => void
  setWorkspaceOnline: (online: boolean) => void
  updateProfile: (patch: Partial<WorkspaceProfile>) => void
  createTeam: (name: string, mission?: string) => string
  renameTeam: (id: string, name: string, mission?: string) => void
  deleteTeam: (id: string) => void
  createAgent: (input: { name: string; teamId: string; roleName: string; roleDescription: string; isTeamLead?: boolean; parentAgentId?: string }) => string
  deleteAgent: (id: string) => void
  updateAgent: (id: string, patch: Partial<Omit<Agent, 'id' | 'tasks'>>) => void
  setProvider: (id: string, provider: ProviderId) => void
  assignTeam: (id: string, teamId: string) => void
  assignParent: (id: string, parentAgentId: string | null) => void
  setTeamLead: (id: string, isLead: boolean) => void
  addTask: (agentId: string, text: string, outputFormat?: string, attachments?: string[]) => void
  updateTask: (agentId: string, taskId: string, patch: Partial<Task>) => void
  removeTask: (agentId: string, taskId: string) => void
  resetTask: (agentId: string, taskId: string) => void
  approveTask: (agentId: string, taskId: string) => Promise<void>
  requestTaskRevision: (agentId: string, taskId: string, feedback?: string) => void
  runAgentTasks: (agentId: string) => Promise<void>
  createTeamJob: (teamId: string, brief: string, outputFormat: string, attachments: string[]) => string | null
  runTeamJob: (jobId: string) => Promise<void>
  approveTeamJob: (jobId: string) => Promise<void>
  requestTeamRevision: (jobId: string) => void
  removeTeamJob: (jobId: string) => void
  hydrate: (snapshot: PersistedState | null) => void
}

export interface PersistedState {
  version: 1 | 2 | 3
  teams: Team[]
  agents: Agent[]
  teamJobs?: TeamJob[]
  profile?: WorkspaceProfile
  showLabels: boolean
  skipApprovals?: boolean
  workspaceOnline?: boolean
  pausedAgentRuns?: string[]
  pausedTeamRuns?: string[]
}

export const toPersisted = (state: WorkspaceState): PersistedState => ({
  version: 3,
  teams: state.teams,
  agents: state.agents.map((agent) => ({
    ...agent,
    status: agent.status === 'working' ? 'idle' : agent.status,
    tasks: agent.tasks.map((task) => task.status === 'running' ? { ...task, status: 'pending' as const } : task),
  })),
  teamJobs: state.teamJobs.map((job) => ['planning', 'delegated', 'reviewing', 'revising'].includes(job.status)
    ? { ...job, status: 'queued' as const, contributions: job.contributions.map((item) => ({ ...item, status: 'queued' as const })) }
    : job),
  profile: state.profile,
  showLabels: state.showLabels,
  skipApprovals: state.skipApprovals,
  workspaceOnline: state.workspaceOnline,
  pausedAgentRuns: state.pausedAgentRuns,
  pausedTeamRuns: state.pausedTeamRuns,
})

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
const EMPTY_PROFILE: WorkspaceProfile = { ownerName: '', workspaceName: '', email: '', phone: '' }

const seedAgents: Agent[] = [
  { id: 'a1', name: 'Ada', teamId: 'platform', roleName: 'Platform Lead', roleDescription: 'Coordinates architecture, delivery and technical review.', isTeamLead: true, color: AGENT_COLORS[0], provider: 'anthropic', model: 'claude-sonnet-4-5', effort: 'high', systemPrompt: 'Coordinate the Platform backlog and unblock the team.', status: 'idle', tasks: [] },
  { id: 'a2', name: 'Bruno', teamId: 'platform', parentAgentId: 'a1', roleName: 'Backend Engineer', roleDescription: 'Builds reliable services, APIs and tests.', isTeamLead: false, color: AGENT_COLORS[1], provider: 'openai', model: 'gpt-5.6-terra', effort: 'medium', systemPrompt: 'Implement service changes with tests alongside.', status: 'idle', tasks: [] },
  { id: 'a3', name: 'Cleo', teamId: 'platform', parentAgentId: 'a2', roleName: 'Quality Engineer', roleDescription: 'Finds failure modes and verifies releases.', isTeamLead: false, color: AGENT_COLORS[4], provider: 'anthropic', model: 'claude-haiku-4-5', effort: 'low', systemPrompt: 'Run the regression suite and report failures precisely.', status: 'idle', tasks: [] },
  { id: 'a4', name: 'Dex', teamId: 'growth', roleName: 'Growth Lead', roleDescription: 'Owns customer outcomes and reviews team delivery.', isTeamLead: true, color: AGENT_COLORS[3], provider: 'openai', model: 'gpt-5.4', effort: 'high', systemPrompt: 'Keep work focused on measurable customer outcomes.', status: 'idle', tasks: [] },
  { id: 'a5', name: 'Esme', teamId: 'growth', parentAgentId: 'a4', roleName: 'Product Analyst', roleDescription: 'Turns user intent into precise requirements.', isTeamLead: false, color: AGENT_COLORS[2], provider: 'anthropic', model: 'claude-sonnet-4-5', effort: 'medium', systemPrompt: 'Translate product intent into acceptance criteria.', status: 'idle', tasks: [] },
  { id: 'a6', name: 'Finn', teamId: 'growth', parentAgentId: 'a4', roleName: 'Frontend Engineer', roleDescription: 'Builds accessible, polished customer experiences.', isTeamLead: false, color: AGENT_COLORS[5], provider: 'openai', model: 'gpt-5.6-luna', effort: 'medium', systemPrompt: 'Own the onboarding funnel end to end.', status: 'idle', tasks: [] },
  { id: 'a7', name: 'Gia', teamId: 'insights', roleName: 'Insights Lead', roleDescription: 'Sets the analytical direction and signs off findings.', isTeamLead: true, color: AGENT_COLORS[7], provider: 'anthropic', model: 'claude-sonnet-4-5', effort: 'high', systemPrompt: 'Set the analytics roadmap and review findings.', status: 'idle', tasks: [] },
  { id: 'a8', name: 'Hugo', teamId: 'insights', parentAgentId: 'a7', roleName: 'Data Investigator', roleDescription: 'Interrogates evidence and explains business drivers.', isTeamLead: false, color: AGENT_COLORS[6], provider: 'openai', model: 'o3', effort: 'medium', systemPrompt: 'Interrogate the numbers before drawing conclusions.', status: 'idle', tasks: [] },
  { id: 'a9', name: 'Iris', teamId: BENCH_ID, roleName: 'Release Specialist', roleDescription: 'Available for release validation assignments.', isTeamLead: false, color: AGENT_COLORS[8], provider: 'openai', model: 'gpt-5.4-mini', effort: 'low', systemPrompt: 'Awaiting assignment.', status: 'idle', tasks: [] },
  { id: 'a10', name: 'Juno', teamId: BENCH_ID, parentAgentId: 'a9', roleName: 'Software Generalist', roleDescription: 'Available for implementation assignments.', isTeamLead: false, color: AGENT_COLORS[9], provider: 'anthropic', model: 'claude-sonnet-4-5', effort: 'medium', systemPrompt: 'Awaiting assignment.', status: 'idle', tasks: [] },
]

const effortTokens: Record<Effort, number> = { low: 1600, medium: 3600, high: 6000 }
const agentSystem = (agent: Agent, extra = '') => [
  `Your role is ${agent.roleName}.`, agent.roleDescription,
  agent.isTeamLead ? 'You are the team lead: coordinate collaborators, review their work rigorously, and own the final quality.' : 'You are a contributing team member. Deliver your assigned part and make it easy for the team lead to integrate.',
  agent.systemPrompt,
  agent.memory?.length ? `Approved learning memory. Reuse these lessons only while completing work the user has explicitly assigned:\n${agent.memory.map((item) => `- ${item.lesson}`).join('\n')}` : '',
  'Quality standard: deliver a complete, accurate, client-ready answer. Ground claims in attached files first, distinguish facts from assumptions, preserve document names and versions, and verify that every requested requirement is covered before answering.',
  'You may use read-only web research when it materially improves the assigned work. Cite useful web sources with descriptive links. Never take an external action, publish, purchase, send, or modify another system without the workspace owner’s approval.',
  extra,
].filter(Boolean).join('\n\n')
const formattedPrompt = (brief: string, outputFormat: string) => `${brief}\n\nREQUIRED DELIVERY FORMAT\n${outputFormat || 'Use the clearest appropriate format.'}\n\nDELIVERY RULES\n- Return the finished deliverable itself, never a plan for doing it or a request to re-upload a file that is attached.\n- Read all attached content and use it as primary evidence.\n- Produce polished Markdown structure internally (headings, lists, tables and links as useful); Autowork will render it and create the requested downloadable file.\n- Be specific, substantive and concise. Do not pad the answer with generic disclaimers.\n- If information is genuinely missing, state the exact gap after completing everything that can be completed.`

const searchWords = (value: string, stripFileExtension = false) => (stripFileExtension
  ? value.replace(/\.[a-z0-9]{1,8}$/i, '')
  : value
).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Uploaded files remain opt-in, but mentioning a file by name attaches it
 * automatically. If the workspace contains only one file, phrases such as
 * "the uploaded document" also resolve to it. This closes the common gap
 * between adding a file to the Files library and remembering a second click
 * while assigning the work.
 */
export function resolveTaskAttachments(brief: string, selected: string[], available = useFiles.getState().files): string[] {
  if (selected.length) return [...new Set(selected)].slice(0, 12)
  const request = searchWords(brief)
  const mentioned = available.filter((file) => {
    const full = searchWords(file.name, true)
    return full.length >= 3 && request.includes(full)
  }).map((file) => file.name)
  if (mentioned.length) return mentioned.slice(0, 12)
  if (available.length === 1 && /\b(file|document|attachment|upload|uploaded|pdf|word|spreadsheet|presentation)\b/i.test(brief)) {
    return [available[0].name]
  }
  return []
}

async function invoke(agent: Agent, prompt: string, attachments: string[], extraSystem = '', signal?: AbortSignal) {
  return callModel({ provider: agent.provider, model: agent.model, system: agentSystem(agent, extraSystem), prompt, effort: agent.effort, maxTokens: effortTokens[agent.effort], attachments, webAccess: true }, signal ?? agentControllers.get(agent.id)?.signal)
}

const agentControllers = new Map<string, AbortController>()
const teamControllers = new Map<string, AbortController>()

const legacyRoles: Record<string, { name: string; description: string }> = {
  'team-lead': { name: 'Team Lead', description: 'Coordinates delivery, unblocks the team and signs off work.' },
  'scrum-master': { name: 'Delivery Coordinator', description: 'Organizes collaborative work and keeps it moving.' },
  'business-analyst': { name: 'Business Analyst', description: 'Turns intent into requirements and acceptance criteria.' },
  'full-stack-developer': { name: 'Software Engineer', description: 'Implements complete solutions across the stack.' },
  'qa-tester': { name: 'Quality Engineer', description: 'Tests work, identifies edge cases and guards quality.' },
}

function migrateAgent(raw: unknown, index: number): Agent {
  const value = raw as Partial<Agent> & { roleId?: string; temperature?: number }
  const legacy = legacyRoles[value.roleId ?? '']
  return {
    id: value.id || uid('agent'), name: value.name || 'Agent', teamId: value.teamId || BENCH_ID,
    ...(typeof value.parentAgentId === 'string' ? { parentAgentId: value.parentAgentId } : {}),
    roleName: value.roleName || legacy?.name || 'Specialist', roleDescription: value.roleDescription || legacy?.description || value.systemPrompt || 'Describe this agent’s responsibilities.',
    isTeamLead: value.isTeamLead ?? value.roleId === 'team-lead', color: value.color || AGENT_COLORS[index % AGENT_COLORS.length],
    provider: value.provider || 'anthropic', model: value.model && isModelValidFor(value.provider || 'anthropic', value.model) ? value.model : defaultModelFor(value.provider || 'anthropic'),
    effort: value.effort || (typeof value.temperature === 'number' && value.temperature < .2 ? 'low' : typeof value.temperature === 'number' && value.temperature > .45 ? 'high' : 'medium'),
    systemPrompt: value.systemPrompt || '', status: value.status === 'working' ? 'idle' : value.status || 'idle',
    tasks: Array.isArray(value.tasks) ? value.tasks.map((task) => ({ ...task, outputFormat: task.outputFormat || 'Use the clearest appropriate format.' })) : [],
    memory: Array.isArray(value.memory) ? value.memory.slice(-12) : [],
    ...(value.modelUrl ? { modelUrl: value.modelUrl } : {}),
  }
}

function descendantIds(agents: Agent[], rootId: string): Set<string> {
  const found = new Set<string>()
  const queue = [rootId]
  while (queue.length) {
    const parentId = queue.shift()!
    for (const agent of agents) {
      if (agent.parentAgentId === parentId && !found.has(agent.id)) {
        found.add(agent.id)
        queue.push(agent.id)
      }
    }
  }
  return found
}

function reportingPath(agent: Agent, agents: Agent[]): string {
  const names = [agent.name]
  const seen = new Set([agent.id])
  let parentId = agent.parentAgentId
  while (parentId && !seen.has(parentId)) {
    const parent = agents.find((item) => item.id === parentId)
    if (!parent) break
    seen.add(parent.id)
    names.unshift(parent.name)
    parentId = parent.parentAgentId
  }
  return names.join(' → ')
}

function learnedAgent(agent: Agent, sourceId: string, brief: string, output: string): Agent {
  const lesson = `For “${brief.slice(0, 180)}”, the approved approach/output was: ${output.replace(/\s+/g, ' ').slice(0, 700)}`
  const memory = [...(agent.memory ?? []).filter((item) => item.sourceId !== sourceId), { id: uid('memory'), sourceId, lesson, learnedAt: Date.now() }].slice(-12)
  return { ...agent, memory }
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  teams: DEFAULT_TEAMS, agents: seedAgents, teamJobs: [], profile: EMPTY_PROFILE,
  selectedId: null, hoveredId: null, showLabels: false, skipApprovals: false, workspaceOnline: true, pausedAgentRuns: [], pausedTeamRuns: [], running: [], runningTeams: [], hydrated: false,
  select: (id) => set({ selectedId: id }), hover: (id) => set({ hoveredId: id }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  setSkipApprovals: (skipApprovals) => set({ skipApprovals }),
  setWorkspaceOnline: (workspaceOnline) => {
    if (workspaceOnline === get().workspaceOnline) return
    if (!workspaceOnline) {
      const pausedAgentRuns = [...get().running]
      const pausedTeamRuns = [...get().runningTeams]
      agentControllers.forEach((controller) => controller.abort())
      teamControllers.forEach((controller) => controller.abort())
      set((state) => ({
        workspaceOnline: false,
        pausedAgentRuns,
        pausedTeamRuns,
        running: [],
        runningTeams: [],
        agents: state.agents.map((agent) => ({ ...agent, status: agent.status === 'working' ? 'idle' : agent.status, tasks: agent.tasks.map((task) => task.status === 'running' ? { ...task, status: 'pending' } : task) })),
        teamJobs: state.teamJobs.map((job) => ['planning', 'delegated', 'reviewing', 'revising'].includes(job.status) ? { ...job, status: 'queued', contributions: job.contributions.map((item) => item.status === 'working' || item.status === 'revision' ? { ...item, status: 'queued' } : item) } : job),
      }))
      return
    }
    const agentsToResume = [...get().pausedAgentRuns]
    const teamsToResume = [...get().pausedTeamRuns]
    set({ workspaceOnline: true, pausedAgentRuns: [], pausedTeamRuns: [] })
    queueMicrotask(() => {
      agentsToResume.forEach((id) => void get().runAgentTasks(id))
      teamsToResume.forEach((id) => void get().runTeamJob(id))
    })
  },
  updateProfile: (patch) => set((state) => ({ profile: { ...state.profile, ...patch } })),

  createTeam: (name, mission = '') => {
    const trimmed = name.trim() || 'New team'; const existing = new Set(get().teams.map((team) => team.id)); let id = slug(trimmed) || uid('team')
    if (existing.has(id)) id = `${id}-${Math.random().toString(36).slice(2, 5)}`
    const pods = get().teams.filter((team) => team.kind === 'pod').length
    set((state) => ({ teams: [...state.teams.filter((team) => team.kind === 'pod'), { id, name: trimmed, mission, tint: TEAM_TINTS[pods % TEAM_TINTS.length], kind: 'pod' }, ...state.teams.filter((team) => team.kind !== 'pod')] }))
    return id
  },
  renameTeam: (id, name, mission) => set((state) => ({ teams: state.teams.map((team) => team.id === id ? { ...team, name: name.trim() || team.name, mission: mission ?? team.mission } : team) })),
  deleteTeam: (id) => set((state) => {
    const team = state.teams.find((item) => item.id === id); if (!team || team.system) return state
    return { teams: state.teams.filter((item) => item.id !== id), agents: state.agents.map((agent) => agent.teamId === id ? { ...agent, teamId: BENCH_ID, isTeamLead: false } : agent) }
  }),

  createAgent: ({ name, teamId, roleName, roleDescription, isTeamLead = false, parentAgentId }) => {
    const id = uid('agent'); const color = AGENT_COLORS[get().agents.length % AGENT_COLORS.length]
    const parent = get().agents.find((agent) => agent.id === parentAgentId)
    const effectiveTeamId = parent?.teamId ?? teamId
    const willLead = !parent && effectiveTeamId !== BENCH_ID && (isTeamLead || !get().agents.some((agent) => agent.teamId === effectiveTeamId))
    set((state) => ({ agents: [...state.agents.map((agent) => willLead && agent.teamId === effectiveTeamId ? { ...agent, isTeamLead: false } : agent), { id, name: name.trim() || 'New agent', teamId: effectiveTeamId, ...(parent ? { parentAgentId: parent.id } : {}), roleName: roleName.trim() || 'Specialist', roleDescription: roleDescription.trim() || 'Owns assigned work for the team.', isTeamLead: willLead, color, provider: 'anthropic', model: defaultModelFor('anthropic'), effort: 'medium', systemPrompt: '', status: 'idle', tasks: [] }], selectedId: id }))
    return id
  },
  deleteAgent: (id) => set((state) => {
    const removed = state.agents.find((agent) => agent.id === id)
    const filtered = state.agents.filter((agent) => agent.id !== id)
    const replacement = removed?.isTeamLead && removed.teamId !== BENCH_ID
      ? filtered.find((agent) => agent.teamId === removed.teamId)
      : undefined
    const reparented = filtered.map((agent) => agent.parentAgentId === id ? { ...agent, parentAgentId: removed?.parentAgentId } : agent)
    const remaining = replacement ? reparented.map((agent) => agent.id === replacement.id ? { ...agent, isTeamLead: true } : agent) : reparented
    return { agents: remaining, selectedId: state.selectedId === id ? null : state.selectedId }
  }),
  updateAgent: (id, patch) => set((state) => ({ agents: state.agents.map((agent) => agent.id === id ? { ...agent, ...patch } : agent) })),
  setProvider: (id, provider) => set((state) => ({ agents: state.agents.map((agent) => agent.id === id ? { ...agent, provider, model: isModelValidFor(provider, agent.model) ? agent.model : defaultModelFor(provider) } : agent) })),
  assignTeam: (id, teamId) => set((state) => {
    const selected = state.agents.find((agent) => agent.id === id)
    if (!selected || selected.teamId === teamId) return state
    const moving = descendantIds(state.agents, id); moving.add(id)
    const targetHasLead = state.agents.some((agent) => !moving.has(agent.id) && agent.teamId === teamId && agent.isTeamLead)
    const oldReplacement = selected.isTeamLead
      ? state.agents.find((agent) => !moving.has(agent.id) && agent.teamId === selected.teamId)
      : undefined
    return { agents: state.agents.map((agent) => {
      if (agent.id === id) return { ...agent, teamId, parentAgentId: undefined, isTeamLead: teamId !== BENCH_ID && !targetHasLead }
      if (moving.has(agent.id)) return { ...agent, teamId, isTeamLead: false }
      if (agent.id === oldReplacement?.id) return { ...agent, isTeamLead: true }
      return agent
    }) }
  }),
  assignParent: (id, parentAgentId) => set((state) => {
    const selected = state.agents.find((agent) => agent.id === id)
    if (!selected) return state
    const parent = parentAgentId ? state.agents.find((agent) => agent.id === parentAgentId) : undefined
    if (parentAgentId && (!parent || parent.id === id || descendantIds(state.agents, id).has(parent.id))) return state
    const teamId = parent?.teamId ?? selected.teamId
    const replacement = parent && selected.isTeamLead
      ? state.agents.find((agent) => agent.id !== id && agent.teamId === selected.teamId && !agent.parentAgentId)
      : undefined
    return { agents: state.agents.map((agent) => agent.id === id
      ? { ...agent, teamId, parentAgentId: parent?.id, isTeamLead: parent ? false : agent.isTeamLead }
      : agent.id === replacement?.id ? { ...agent, isTeamLead: true } : agent) }
  }),
  setTeamLead: (id, isLead) => set((state) => {
    const selected = state.agents.find((agent) => agent.id === id)
    if (!selected || selected.teamId === BENCH_ID || selected.parentAgentId) return state
    const replacement = !isLead ? state.agents.find((agent) => agent.id !== id && agent.teamId === selected.teamId) : undefined
    return { agents: state.agents.map((agent) => agent.id === id
      ? { ...agent, isTeamLead: isLead || !replacement }
      : agent.teamId === selected.teamId
        ? { ...agent, isTeamLead: agent.id === replacement?.id }
        : agent) }
  }),

  addTask: (agentId, text, outputFormat = 'Use the clearest appropriate format.', attachments = []) => { const trimmed = text.trim(); if (!trimmed) return; const resolved = resolveTaskAttachments(trimmed, attachments); set((state) => ({ agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, tasks: [...agent.tasks, { id: uid('task'), text: trimmed, attachments: resolved, outputFormat, status: 'pending' }] } : agent) })) },
  updateTask: (agentId, taskId, patch) => set((state) => ({ agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, tasks: agent.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) } : agent) })),
  removeTask: (agentId, taskId) => set((state) => ({ agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, tasks: agent.tasks.filter((task) => task.id !== taskId) } : agent) })),
  resetTask: (agentId, taskId) => get().updateTask(agentId, taskId, { status: 'pending', output: undefined, error: undefined, outputFile: undefined, outputFileError: undefined, finishedAt: undefined, durationMs: undefined }),
  approveTask: async (agentId, taskId) => {
    const agent = get().agents.find((item) => item.id === agentId)
    const task = agent?.tasks.find((item) => item.id === taskId)
    if (!agent || !task || task.status !== 'awaiting_approval' || !task.output) return
    let outputFile: string | undefined
    let outputFileError: string | undefined
    try {
      const file = await buildOutputFile(task.output, task.outputFormat, `${agent.name} ${task.text.slice(0, 48)}`)
      outputFile = await uploadFile(file)
      await useFiles.getState().refresh()
    } catch (error) { outputFileError = error instanceof Error ? error.message : 'Could not create the requested output file.' }
    set((state) => ({ agents: state.agents.map((item) => {
      if (item.id !== agentId) return item
      return { ...learnedAgent(item, task.id, task.text, task.output!), tasks: item.tasks.map((current) => current.id === taskId ? { ...current, status: 'done', outputFile, outputFileError } : current) }
    }) }))
  },
  requestTaskRevision: (agentId, taskId, feedback = '') => set((state) => ({ agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, tasks: agent.tasks.map((task) => task.id === taskId ? { ...task, status: 'pending', approvalFeedback: feedback.trim() || 'Revise this draft and improve its completeness, accuracy, and requested formatting.', output: undefined, error: undefined } : task) } : agent) })),
  runAgentTasks: async (agentId) => {
    const agent = get().agents.find((item) => item.id === agentId); if (!get().workspaceOnline || !agent || get().running.includes(agentId)) return
    const queue = agent.tasks.filter((task) => task.status === 'pending' || task.status === 'error'); if (!queue.length) return
    const controller = new AbortController(); agentControllers.set(agentId, controller)
    set((state) => ({ running: [...state.running, agentId] })); get().updateAgent(agentId, { status: 'working' })
    for (const queued of queue) {
      const live = get().agents.find((item) => item.id === agentId); const current = live?.tasks.find((task) => task.id === queued.id); if (!live || !current) continue
      get().updateTask(agentId, current.id, { status: 'running', output: undefined, error: undefined }); const startedAt = Date.now()
      try {
        const manager = get().agents.find((item) => item.id === live.parentAgentId)
        const revision = current.approvalFeedback ? `\n\nThe user requested these changes to the previous draft: ${current.approvalFeedback}` : ''
        const result = await invoke(live, formattedPrompt(current.text + revision, current.outputFormat), current.attachments, manager ? `You are a sub-agent reporting to ${manager.name} (${manager.roleName}). Complete this directly assigned task within that reporting context.` : '')
        get().updateTask(agentId, current.id, { status: 'awaiting_approval', approvalFeedback: undefined, output: result.text || '(the model returned an empty response)', finishedAt: Date.now(), durationMs: Date.now() - startedAt, ranWith: { provider: result.provider, model: result.model }, recoveredFromTimeout: result.recoveredFromTimeout })
        if (get().skipApprovals) await get().approveTask(agentId, current.id)
      }
      catch (error) {
        if (!get().workspaceOnline || controller.signal.aborted) break
        get().updateTask(agentId, current.id, { status: 'error', error: error instanceof ApiError ? error.message : 'Run failed.', finishedAt: Date.now(), durationMs: Date.now() - startedAt }); break
      }
    }
    // A shutdown immediately followed by a resume can start a fresh run for
    // this agent while this invocation is still unwinding from its aborted
    // request. The resumed run installs its own controller, so anything that
    // no longer owns the map entry must leave the store alone — otherwise it
    // clears `running` and marks the agent idle while a request is in flight.
    if (agentControllers.get(agentId) !== controller) return
    agentControllers.delete(agentId)
    const failed = get().agents.find((item) => item.id === agentId)?.tasks.some((task) => task.status === 'error'); set((state) => ({ running: state.running.filter((item) => item !== agentId) })); get().updateAgent(agentId, { status: failed ? 'blocked' : 'idle' })
  },

  createTeamJob: (teamId, brief, outputFormat, attachments) => {
    const members = get().agents.filter((agent) => agent.teamId === teamId); if (!brief.trim() || !members.length || teamId === BENCH_ID) return null
    const id = uid('teamjob'); const resolved = resolveTaskAttachments(brief, attachments); set((state) => ({ teamJobs: [{ id, teamId, brief: brief.trim(), outputFormat: outputFormat.trim() || 'Use the clearest appropriate format.', attachments: resolved, status: 'queued', contributions: members.map((agent) => ({ agentId: agent.id, status: 'queued' })), reviewRound: 0, createdAt: Date.now() }, ...state.teamJobs] })); return id
  },
  runTeamJob: async (jobId) => {
    const initial = get().teamJobs.find((job) => job.id === jobId); if (!get().workspaceOnline || !initial || get().runningTeams.includes(jobId) || initial.status === 'done') return
    const members = get().agents.filter((agent) => agent.teamId === initial.teamId); if (!members.length) return
    const lead = members.find((agent) => agent.isTeamLead) ?? members[0]; const contributors = [...members.filter((agent) => agent.id !== lead.id), lead]
    const controller = new AbortController(); teamControllers.set(jobId, controller); members.forEach((agent) => agentControllers.set(agent.id, controller))
    const patchJob = (patch: Partial<TeamJob>) => set((state) => ({ teamJobs: state.teamJobs.map((job) => job.id === jobId ? { ...job, ...patch } : job) }))
    const patchContribution = (agentId: string, patch: Partial<TeamContribution>) => set((state) => ({ teamJobs: state.teamJobs.map((job) => job.id === jobId ? { ...job, contributions: job.contributions.map((item) => item.agentId === agentId ? { ...item, ...patch } : item) } : job) }))
    set((state) => ({ runningTeams: [...state.runningTeams, jobId] })); patchJob({ status: 'planning', error: undefined }); members.forEach((agent) => get().updateAgent(agent.id, { status: 'working' }))
    try {
      const roster = members.map((agent, index) => `${index + 1}. ${reportingPath(agent, members)} — ${agent.roleName}: ${agent.roleDescription}`).join('\n')
      const planResult = await invoke(lead, `You are delegating a team assignment through a recursive agent hierarchy. Divide it fairly across every listed member, including yourself. Respect the reporting paths: managers coordinate their direct sub-agents, who may coordinate deeper sub-agents. Make responsibilities complementary and explicitly describe how the members should combine their work.\n\nASSIGNMENT\n${initial.brief}\n\nTEAM HIERARCHY\n${roster}\n\nOUTPUT FORMAT\n${initial.outputFormat}\n\nReturn a concise delegation plan.`, initial.attachments)
      const plan = planResult.text
      patchJob({ status: 'delegated', plan }); const collected: Array<{ agent: Agent; output: string }> = []
      for (let index = 0; index < contributors.length; index++) {
        const member = contributors[index]; patchContribution(member.id, { status: 'working', error: undefined }); const prior = collected.length ? `\n\nWORK ALREADY CONTRIBUTED\n${collected.map((item) => `${item.agent.name}:\n${item.output}`).join('\n\n')}` : ''
        try { const result = await invoke(member, `Collaborate on this team assignment as member ${index + 1} of ${contributors.length}. Your reporting path is ${reportingPath(member, members)}. Follow the lead's delegation plan, coordinate through your immediate manager or sub-agents where applicable, build on prior contributions, and complete your own responsibility.\n\nASSIGNMENT\n${initial.brief}\n\nDELEGATION PLAN\n${plan}${prior}\n\nTARGET OUTPUT FORMAT\n${initial.outputFormat}`, initial.attachments); const output = result.text; collected.push({ agent: member, output }); patchContribution(member.id, { status: 'done', output, ranWith: { provider: result.provider, model: result.model }, recoveredFromTimeout: result.recoveredFromTimeout }) }
        catch (error) { patchContribution(member.id, { status: 'error', error: error instanceof Error ? error.message : 'Contribution failed.' }); throw error }
      }
      let finalOutput = ''; let reviewNotes = ''
      for (let round = 1; round <= 2; round++) {
        patchJob({ status: 'reviewing', reviewRound: round }); const packet = collected.map((item) => `### ${item.agent.name} — ${item.agent.roleName}\n${item.output}`).join('\n\n')
        const reviewResult = await invoke(lead, `Review the team's work against every requirement. If it is satisfactory, begin with "VERDICT: APPROVED" and put the polished, fully integrated deliverable after "FINAL:". If substantive work remains, begin with "VERDICT: REVISE" and give exact correction instructions after "FEEDBACK:".\n\nORIGINAL ASSIGNMENT\n${initial.brief}\n\nREQUIRED OUTPUT FORMAT\n${initial.outputFormat}\n\nTEAM CONTRIBUTIONS\n${packet}`, initial.attachments, 'Act as a strict quality gate. Never approve incomplete, inconsistent, or incorrectly formatted work.')
        const review = reviewResult.text
        reviewNotes = review; if (/VERDICT:\s*APPROVED/i.test(review)) { finalOutput = review.split(/FINAL:/i).slice(1).join('FINAL:').trim() || review; break }
        if (round < 2) { patchJob({ status: 'revising', reviewNotes: review }); for (const member of contributors.filter((agent) => agent.id !== lead.id)) { patchContribution(member.id, { status: 'revision' }); const existing = collected.find((item) => item.agent.id === member.id); const revisedResult = await invoke(member, `Revise your contribution using the team lead's review. Resolve every issue relevant to your role and return replacement work.\n\nASSIGNMENT\n${initial.brief}\n\nYOUR PREVIOUS WORK\n${existing?.output || ''}\n\nTEAM LEAD FEEDBACK\n${review}`, initial.attachments); const revised = revisedResult.text; if (existing) existing.output = revised; patchContribution(member.id, { status: 'done', output: revised, ranWith: { provider: revisedResult.provider, model: revisedResult.model }, recoveredFromTimeout: revisedResult.recoveredFromTimeout }) } }
      }
      if (!finalOutput) { const packet = collected.map((item) => `${item.agent.name}:\n${item.output}`).join('\n\n'); finalOutput = (await invoke(lead, `Produce the final client-ready deliverable now. Correct the remaining review issues yourself, integrate the team work, follow the requested format exactly, and do not include process commentary.\n\nASSIGNMENT\n${initial.brief}\n\nFORMAT\n${initial.outputFormat}\n\nLATEST TEAM WORK\n${packet}\n\nLAST REVIEW\n${reviewNotes}`, initial.attachments)).text }
      patchJob({ status: 'awaiting_approval', finalOutput, reviewNotes }); members.forEach((agent) => get().updateAgent(agent.id, { status: 'idle' }))
      if (get().skipApprovals) await get().approveTeamJob(jobId)
    } catch (error) {
      if (get().workspaceOnline && !controller.signal.aborted) { patchJob({ status: 'error', error: error instanceof Error ? error.message : 'Team workflow failed.', finishedAt: Date.now() }); members.forEach((agent) => get().updateAgent(agent.id, { status: 'blocked' })) }
    }
    // Same ownership guard as runAgentTasks: a resume that restarts this job
    // registers its own controller, and this unwinding invocation must not
    // remove the newer run from `runningTeams`.
    finally { if (teamControllers.get(jobId) === controller) { teamControllers.delete(jobId); members.forEach((agent) => { if (agentControllers.get(agent.id) === controller) agentControllers.delete(agent.id) }); set((state) => ({ runningTeams: state.runningTeams.filter((id) => id !== jobId) })) } }
  },
  approveTeamJob: async (jobId) => {
    const job = get().teamJobs.find((item) => item.id === jobId)
    if (!job || job.status !== 'awaiting_approval' || !job.finalOutput) return
    const teamName = get().teams.find((team) => team.id === job.teamId)?.name ?? 'Team'
    let outputFile: string | undefined
    let outputFileError: string | undefined
    try {
      const artifact = await buildOutputFile(job.finalOutput, job.outputFormat, `${teamName} ${job.brief.slice(0, 48)}`)
      outputFile = await uploadFile(artifact)
      await useFiles.getState().refresh()
    } catch (error) { outputFileError = error instanceof Error ? error.message : 'Could not add the team output to shared files.' }
    set((state) => ({
      teamJobs: state.teamJobs.map((item) => item.id === jobId ? { ...item, status: 'done', outputFile: outputFileError ? undefined : outputFile, outputFileError, finishedAt: Date.now() } : item),
      agents: state.agents.map((agent) => agent.teamId === job.teamId ? learnedAgent(agent, job.id, job.brief, job.finalOutput!) : agent),
    }))
  },
  requestTeamRevision: (jobId) => set((state) => ({ teamJobs: state.teamJobs.map((job) => job.id === jobId && job.status === 'awaiting_approval' ? { ...job, status: 'queued', reviewNotes: 'The workspace owner requested another revision before approval.', finalOutput: undefined } : job) })),
  removeTeamJob: (jobId) => set((state) => ({ teamJobs: state.teamJobs.filter((job) => job.id !== jobId) })),
  hydrate: (snapshot) => {
    if (!snapshot || !Array.isArray(snapshot.teams)) { set({ teams: DEFAULT_TEAMS, agents: seedAgents, teamJobs: [], profile: EMPTY_PROFILE, selectedId: null, hoveredId: null, showLabels: false, skipApprovals: false, workspaceOnline: true, pausedAgentRuns: [], pausedTeamRuns: [], running: [], runningTeams: [], hydrated: true }); return }
    const teams = snapshot.teams.some((team) => team.id === BENCH_ID) ? snapshot.teams : [...snapshot.teams, DEFAULT_TEAMS[DEFAULT_TEAMS.length - 1]]; const ids = new Set(teams.map((team) => team.id))
    set({ teams, agents: (snapshot.agents ?? []).map(migrateAgent).map((agent) => ({ ...agent, teamId: ids.has(agent.teamId) ? agent.teamId : BENCH_ID })), teamJobs: Array.isArray(snapshot.teamJobs) ? snapshot.teamJobs : [], profile: snapshot.profile ?? { ...EMPTY_PROFILE, workspaceName: 'My autowork office' }, selectedId: null, hoveredId: null, showLabels: Boolean(snapshot.showLabels), skipApprovals: Boolean(snapshot.skipApprovals), workspaceOnline: snapshot.workspaceOnline !== false, pausedAgentRuns: snapshot.pausedAgentRuns ?? [], pausedTeamRuns: snapshot.pausedTeamRuns ?? [], running: [], runningTeams: [], hydrated: true })
  },
}))

export const teamHeadcount = (agents: Agent[], teams: Team[]): Record<string, number> => Object.fromEntries(teams.map((team) => [team.id, agents.filter((agent) => agent.teamId === team.id).length]))
export const pendingCount = (agent: Agent): number => agent.tasks.filter((task) => task.status === 'pending' || task.status === 'error').length
export const completedTasks = (agents: Agent[]) => agents.flatMap((agent) => agent.tasks.filter((task) => task.status === 'awaiting_approval' || task.status === 'done' || task.status === 'error').map((task) => ({ agent, task }))).sort((a, b) => (b.task.finishedAt ?? 0) - (a.task.finishedAt ?? 0))
