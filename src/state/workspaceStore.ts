import { create } from 'zustand'
import { AGENT_COLORS, BENCH_ID, DEFAULT_TEAMS, TEAM_TINTS, type Team } from '../data/org'
import { defaultModelFor, isModelValidFor, type ProviderId } from '../data/llm-catalog'
import { ApiError, runAgent as callModel, uploadFile } from '../api/client'
import { useFiles } from './filesStore'

export type AgentStatus = 'idle' | 'working' | 'blocked' | 'break'
export type TaskStatus = 'pending' | 'running' | 'done' | 'error'
export type Effort = 'low' | 'medium' | 'high'
export type TeamJobStatus = 'queued' | 'planning' | 'delegated' | 'reviewing' | 'revising' | 'done' | 'error'

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
}

export interface Agent {
  id: string
  name: string
  teamId: string
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
  modelUrl?: string
}

export interface TeamContribution {
  agentId: string
  status: 'queued' | 'working' | 'done' | 'revision' | 'error'
  output?: string
  error?: string
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
  running: string[]
  runningTeams: string[]
  hydrated: boolean
  select: (id: string | null) => void
  hover: (id: string | null) => void
  toggleLabels: () => void
  updateProfile: (patch: Partial<WorkspaceProfile>) => void
  createTeam: (name: string, mission?: string) => string
  renameTeam: (id: string, name: string, mission?: string) => void
  deleteTeam: (id: string) => void
  createAgent: (input: { name: string; teamId: string; roleName: string; roleDescription: string; isTeamLead?: boolean }) => string
  deleteAgent: (id: string) => void
  updateAgent: (id: string, patch: Partial<Omit<Agent, 'id' | 'tasks'>>) => void
  setProvider: (id: string, provider: ProviderId) => void
  assignTeam: (id: string, teamId: string) => void
  setTeamLead: (id: string, isLead: boolean) => void
  addTask: (agentId: string, text: string, outputFormat?: string, attachments?: string[]) => void
  updateTask: (agentId: string, taskId: string, patch: Partial<Task>) => void
  removeTask: (agentId: string, taskId: string) => void
  resetTask: (agentId: string, taskId: string) => void
  runAgentTasks: (agentId: string) => Promise<void>
  createTeamJob: (teamId: string, brief: string, outputFormat: string, attachments: string[]) => string | null
  runTeamJob: (jobId: string) => Promise<void>
  removeTeamJob: (jobId: string) => void
  hydrate: (snapshot: PersistedState | null) => void
}

export interface PersistedState {
  version: 1 | 2
  teams: Team[]
  agents: Agent[]
  teamJobs?: TeamJob[]
  profile?: WorkspaceProfile
  showLabels: boolean
}

export const toPersisted = (state: WorkspaceState): PersistedState => ({
  version: 2,
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
})

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
const EMPTY_PROFILE: WorkspaceProfile = { ownerName: '', workspaceName: '', email: '', phone: '' }

const seedAgents: Agent[] = [
  { id: 'a1', name: 'Ada', teamId: 'platform', roleName: 'Platform Lead', roleDescription: 'Coordinates architecture, delivery and technical review.', isTeamLead: true, color: AGENT_COLORS[0], provider: 'anthropic', model: 'claude-opus-5', effort: 'high', systemPrompt: 'Coordinate the Platform backlog and unblock the team.', status: 'idle', tasks: [] },
  { id: 'a2', name: 'Bruno', teamId: 'platform', roleName: 'Backend Engineer', roleDescription: 'Builds reliable services, APIs and tests.', isTeamLead: false, color: AGENT_COLORS[1], provider: 'openai', model: 'gpt-5.6-terra', effort: 'medium', systemPrompt: 'Implement service changes with tests alongside.', status: 'idle', tasks: [] },
  { id: 'a3', name: 'Cleo', teamId: 'platform', roleName: 'Quality Engineer', roleDescription: 'Finds failure modes and verifies releases.', isTeamLead: false, color: AGENT_COLORS[4], provider: 'anthropic', model: 'claude-haiku-4.5', effort: 'low', systemPrompt: 'Run the regression suite and report failures precisely.', status: 'idle', tasks: [] },
  { id: 'a4', name: 'Dex', teamId: 'growth', roleName: 'Growth Lead', roleDescription: 'Owns customer outcomes and reviews team delivery.', isTeamLead: true, color: AGENT_COLORS[3], provider: 'openai', model: 'gpt-5.4', effort: 'high', systemPrompt: 'Keep work focused on measurable customer outcomes.', status: 'idle', tasks: [] },
  { id: 'a5', name: 'Esme', teamId: 'growth', roleName: 'Product Analyst', roleDescription: 'Turns user intent into precise requirements.', isTeamLead: false, color: AGENT_COLORS[2], provider: 'anthropic', model: 'claude-sonnet-5', effort: 'medium', systemPrompt: 'Translate product intent into acceptance criteria.', status: 'idle', tasks: [] },
  { id: 'a6', name: 'Finn', teamId: 'growth', roleName: 'Frontend Engineer', roleDescription: 'Builds accessible, polished customer experiences.', isTeamLead: false, color: AGENT_COLORS[5], provider: 'openai', model: 'gpt-5.6-luna', effort: 'medium', systemPrompt: 'Own the onboarding funnel end to end.', status: 'idle', tasks: [] },
  { id: 'a7', name: 'Gia', teamId: 'insights', roleName: 'Insights Lead', roleDescription: 'Sets the analytical direction and signs off findings.', isTeamLead: true, color: AGENT_COLORS[7], provider: 'anthropic', model: 'claude-fable-5.1', effort: 'high', systemPrompt: 'Set the analytics roadmap and review findings.', status: 'idle', tasks: [] },
  { id: 'a8', name: 'Hugo', teamId: 'insights', roleName: 'Data Investigator', roleDescription: 'Interrogates evidence and explains business drivers.', isTeamLead: false, color: AGENT_COLORS[6], provider: 'openai', model: 'o3', effort: 'medium', systemPrompt: 'Interrogate the numbers before drawing conclusions.', status: 'idle', tasks: [] },
  { id: 'a9', name: 'Iris', teamId: BENCH_ID, roleName: 'Release Specialist', roleDescription: 'Available for release validation assignments.', isTeamLead: false, color: AGENT_COLORS[8], provider: 'openai', model: 'gpt-5.4-mini', effort: 'low', systemPrompt: 'Awaiting assignment.', status: 'idle', tasks: [] },
  { id: 'a10', name: 'Juno', teamId: BENCH_ID, roleName: 'Software Generalist', roleDescription: 'Available for implementation assignments.', isTeamLead: false, color: AGENT_COLORS[9], provider: 'anthropic', model: 'claude-sonnet-5', effort: 'medium', systemPrompt: 'Awaiting assignment.', status: 'idle', tasks: [] },
]

const effortTokens: Record<Effort, number> = { low: 1200, medium: 2600, high: 5200 }
const agentSystem = (agent: Agent, extra = '') => [
  `Your role is ${agent.roleName}.`, agent.roleDescription,
  agent.isTeamLead ? 'You are the team lead: coordinate collaborators, review their work rigorously, and own the final quality.' : 'You are a contributing team member. Deliver your assigned part and make it easy for the team lead to integrate.',
  agent.systemPrompt, extra,
].filter(Boolean).join('\n\n')
const formattedPrompt = (brief: string, outputFormat: string) => `${brief}\n\nRequired output format: ${outputFormat || 'Use the clearest appropriate format.'}\nReturn the deliverable directly; do not describe what you would do.`

async function invoke(agent: Agent, prompt: string, attachments: string[], extraSystem = '') {
  return callModel({ provider: agent.provider, model: agent.model, system: agentSystem(agent, extraSystem), prompt, effort: agent.effort, maxTokens: effortTokens[agent.effort], attachments })
}

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
    roleName: value.roleName || legacy?.name || 'Specialist', roleDescription: value.roleDescription || legacy?.description || value.systemPrompt || 'Describe this agent’s responsibilities.',
    isTeamLead: value.isTeamLead ?? value.roleId === 'team-lead', color: value.color || AGENT_COLORS[index % AGENT_COLORS.length],
    provider: value.provider || 'anthropic', model: value.model || defaultModelFor(value.provider || 'anthropic'),
    effort: value.effort || (typeof value.temperature === 'number' && value.temperature < .2 ? 'low' : typeof value.temperature === 'number' && value.temperature > .45 ? 'high' : 'medium'),
    systemPrompt: value.systemPrompt || '', status: value.status === 'working' ? 'idle' : value.status || 'idle',
    tasks: Array.isArray(value.tasks) ? value.tasks.map((task) => ({ ...task, outputFormat: task.outputFormat || 'Use the clearest appropriate format.' })) : [],
    ...(value.modelUrl ? { modelUrl: value.modelUrl } : {}),
  }
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  teams: DEFAULT_TEAMS, agents: seedAgents, teamJobs: [], profile: EMPTY_PROFILE,
  selectedId: null, hoveredId: null, showLabels: false, running: [], runningTeams: [], hydrated: false,
  select: (id) => set({ selectedId: id }), hover: (id) => set({ hoveredId: id }),
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
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

  createAgent: ({ name, teamId, roleName, roleDescription, isTeamLead = false }) => {
    const id = uid('agent'); const color = AGENT_COLORS[get().agents.length % AGENT_COLORS.length]
    const willLead = teamId !== BENCH_ID && (isTeamLead || !get().agents.some((agent) => agent.teamId === teamId))
    set((state) => ({ agents: [...state.agents.map((agent) => willLead && agent.teamId === teamId ? { ...agent, isTeamLead: false } : agent), { id, name: name.trim() || 'New agent', teamId, roleName: roleName.trim() || 'Specialist', roleDescription: roleDescription.trim() || 'Owns assigned work for the team.', isTeamLead: willLead, color, provider: 'anthropic', model: defaultModelFor('anthropic'), effort: 'medium', systemPrompt: '', status: 'idle', tasks: [] }], selectedId: id }))
    return id
  },
  deleteAgent: (id) => set((state) => {
    const removed = state.agents.find((agent) => agent.id === id)
    const filtered = state.agents.filter((agent) => agent.id !== id)
    const replacement = removed?.isTeamLead && removed.teamId !== BENCH_ID
      ? filtered.find((agent) => agent.teamId === removed.teamId)
      : undefined
    const remaining = replacement ? filtered.map((agent) => agent.id === replacement.id ? { ...agent, isTeamLead: true } : agent) : filtered
    return { agents: remaining, selectedId: state.selectedId === id ? null : state.selectedId }
  }),
  updateAgent: (id, patch) => set((state) => ({ agents: state.agents.map((agent) => agent.id === id ? { ...agent, ...patch } : agent) })),
  setProvider: (id, provider) => set((state) => ({ agents: state.agents.map((agent) => agent.id === id ? { ...agent, provider, model: isModelValidFor(provider, agent.model) ? agent.model : defaultModelFor(provider) } : agent) })),
  assignTeam: (id, teamId) => set((state) => {
    const selected = state.agents.find((agent) => agent.id === id)
    if (!selected || selected.teamId === teamId) return state
    const targetHasLead = state.agents.some((agent) => agent.id !== id && agent.teamId === teamId && agent.isTeamLead)
    const oldReplacement = selected.isTeamLead
      ? state.agents.find((agent) => agent.id !== id && agent.teamId === selected.teamId)
      : undefined
    return { agents: state.agents.map((agent) => {
      if (agent.id === id) return { ...agent, teamId, isTeamLead: teamId !== BENCH_ID && !targetHasLead }
      if (agent.id === oldReplacement?.id) return { ...agent, isTeamLead: true }
      return agent
    }) }
  }),
  setTeamLead: (id, isLead) => set((state) => {
    const selected = state.agents.find((agent) => agent.id === id)
    if (!selected || selected.teamId === BENCH_ID) return state
    const replacement = !isLead ? state.agents.find((agent) => agent.id !== id && agent.teamId === selected.teamId) : undefined
    return { agents: state.agents.map((agent) => agent.id === id
      ? { ...agent, isTeamLead: isLead || !replacement }
      : agent.teamId === selected.teamId
        ? { ...agent, isTeamLead: agent.id === replacement?.id }
        : agent) }
  }),

  addTask: (agentId, text, outputFormat = 'Use the clearest appropriate format.', attachments = []) => { const trimmed = text.trim(); if (!trimmed) return; set((state) => ({ agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, tasks: [...agent.tasks, { id: uid('task'), text: trimmed, attachments, outputFormat, status: 'pending' }] } : agent) })) },
  updateTask: (agentId, taskId, patch) => set((state) => ({ agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, tasks: agent.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) } : agent) })),
  removeTask: (agentId, taskId) => set((state) => ({ agents: state.agents.map((agent) => agent.id === agentId ? { ...agent, tasks: agent.tasks.filter((task) => task.id !== taskId) } : agent) })),
  resetTask: (agentId, taskId) => get().updateTask(agentId, taskId, { status: 'pending', output: undefined, error: undefined, finishedAt: undefined, durationMs: undefined }),
  runAgentTasks: async (agentId) => {
    const agent = get().agents.find((item) => item.id === agentId); if (!agent || get().running.includes(agentId)) return
    const queue = agent.tasks.filter((task) => task.status === 'pending' || task.status === 'error'); if (!queue.length) return
    set((state) => ({ running: [...state.running, agentId] })); get().updateAgent(agentId, { status: 'working' })
    for (const queued of queue) {
      const live = get().agents.find((item) => item.id === agentId); const current = live?.tasks.find((task) => task.id === queued.id); if (!live || !current) continue
      get().updateTask(agentId, current.id, { status: 'running', output: undefined, error: undefined }); const startedAt = Date.now()
      try { const text = await invoke(live, formattedPrompt(current.text, current.outputFormat), current.attachments); get().updateTask(agentId, current.id, { status: 'done', output: text || '(the model returned an empty response)', finishedAt: Date.now(), durationMs: Date.now() - startedAt, ranWith: { provider: live.provider, model: live.model } }) }
      catch (error) { get().updateTask(agentId, current.id, { status: 'error', error: error instanceof ApiError ? error.message : 'Run failed.', finishedAt: Date.now(), durationMs: Date.now() - startedAt }); break }
    }
    const failed = get().agents.find((item) => item.id === agentId)?.tasks.some((task) => task.status === 'error'); set((state) => ({ running: state.running.filter((item) => item !== agentId) })); get().updateAgent(agentId, { status: failed ? 'blocked' : 'idle' })
  },

  createTeamJob: (teamId, brief, outputFormat, attachments) => {
    const members = get().agents.filter((agent) => agent.teamId === teamId); if (!brief.trim() || !members.length || teamId === BENCH_ID) return null
    const id = uid('teamjob'); set((state) => ({ teamJobs: [{ id, teamId, brief: brief.trim(), outputFormat: outputFormat.trim() || 'Use the clearest appropriate format.', attachments, status: 'queued', contributions: members.map((agent) => ({ agentId: agent.id, status: 'queued' })), reviewRound: 0, createdAt: Date.now() }, ...state.teamJobs] })); return id
  },
  runTeamJob: async (jobId) => {
    const initial = get().teamJobs.find((job) => job.id === jobId); if (!initial || get().runningTeams.includes(jobId) || initial.status === 'done') return
    const members = get().agents.filter((agent) => agent.teamId === initial.teamId); if (!members.length) return
    const lead = members.find((agent) => agent.isTeamLead) ?? members[0]; const contributors = [...members.filter((agent) => agent.id !== lead.id), lead]
    const patchJob = (patch: Partial<TeamJob>) => set((state) => ({ teamJobs: state.teamJobs.map((job) => job.id === jobId ? { ...job, ...patch } : job) }))
    const patchContribution = (agentId: string, patch: Partial<TeamContribution>) => set((state) => ({ teamJobs: state.teamJobs.map((job) => job.id === jobId ? { ...job, contributions: job.contributions.map((item) => item.agentId === agentId ? { ...item, ...patch } : item) } : job) }))
    set((state) => ({ runningTeams: [...state.runningTeams, jobId] })); patchJob({ status: 'planning', error: undefined }); members.forEach((agent) => get().updateAgent(agent.id, { status: 'working' }))
    try {
      const roster = members.map((agent, index) => `${index + 1}. ${agent.name} — ${agent.roleName}: ${agent.roleDescription}`).join('\n')
      const plan = await invoke(lead, `You are delegating a team assignment. Divide it fairly across every listed member, including yourself. Make responsibilities complementary and explicitly describe how the members should combine their work.\n\nASSIGNMENT\n${initial.brief}\n\nTEAM\n${roster}\n\nOUTPUT FORMAT\n${initial.outputFormat}\n\nReturn a concise delegation plan.`, initial.attachments)
      patchJob({ status: 'delegated', plan }); const collected: Array<{ agent: Agent; output: string }> = []
      for (let index = 0; index < contributors.length; index++) {
        const member = contributors[index]; patchContribution(member.id, { status: 'working', error: undefined }); const prior = collected.length ? `\n\nWORK ALREADY CONTRIBUTED\n${collected.map((item) => `${item.agent.name}:\n${item.output}`).join('\n\n')}` : ''
        try { const output = await invoke(member, `Collaborate on this team assignment as member ${index + 1} of ${contributors.length}. Follow the lead's delegation plan, build on prior contributions, and complete your own responsibility.\n\nASSIGNMENT\n${initial.brief}\n\nDELEGATION PLAN\n${plan}${prior}\n\nTARGET OUTPUT FORMAT\n${initial.outputFormat}`, initial.attachments); collected.push({ agent: member, output }); patchContribution(member.id, { status: 'done', output }) }
        catch (error) { patchContribution(member.id, { status: 'error', error: error instanceof Error ? error.message : 'Contribution failed.' }); throw error }
      }
      let finalOutput = ''; let reviewNotes = ''
      for (let round = 1; round <= 2; round++) {
        patchJob({ status: 'reviewing', reviewRound: round }); const packet = collected.map((item) => `### ${item.agent.name} — ${item.agent.roleName}\n${item.output}`).join('\n\n')
        const review = await invoke(lead, `Review the team's work against every requirement. If it is satisfactory, begin with "VERDICT: APPROVED" and put the polished, fully integrated deliverable after "FINAL:". If substantive work remains, begin with "VERDICT: REVISE" and give exact correction instructions after "FEEDBACK:".\n\nORIGINAL ASSIGNMENT\n${initial.brief}\n\nREQUIRED OUTPUT FORMAT\n${initial.outputFormat}\n\nTEAM CONTRIBUTIONS\n${packet}`, initial.attachments, 'Act as a strict quality gate. Never approve incomplete, inconsistent, or incorrectly formatted work.')
        reviewNotes = review; if (/VERDICT:\s*APPROVED/i.test(review)) { finalOutput = review.split(/FINAL:/i).slice(1).join('FINAL:').trim() || review; break }
        if (round < 2) { patchJob({ status: 'revising', reviewNotes: review }); for (const member of contributors.filter((agent) => agent.id !== lead.id)) { patchContribution(member.id, { status: 'revision' }); const existing = collected.find((item) => item.agent.id === member.id); const revised = await invoke(member, `Revise your contribution using the team lead's review. Resolve every issue relevant to your role and return replacement work.\n\nASSIGNMENT\n${initial.brief}\n\nYOUR PREVIOUS WORK\n${existing?.output || ''}\n\nTEAM LEAD FEEDBACK\n${review}`, initial.attachments); if (existing) existing.output = revised; patchContribution(member.id, { status: 'done', output: revised }) } }
      }
      if (!finalOutput) { const packet = collected.map((item) => `${item.agent.name}:\n${item.output}`).join('\n\n'); finalOutput = await invoke(lead, `Produce the final client-ready deliverable now. Correct the remaining review issues yourself, integrate the team work, follow the requested format exactly, and do not include process commentary.\n\nASSIGNMENT\n${initial.brief}\n\nFORMAT\n${initial.outputFormat}\n\nLATEST TEAM WORK\n${packet}\n\nLAST REVIEW\n${reviewNotes}`, initial.attachments) }
      const teamName = get().teams.find((team) => team.id === initial.teamId)?.name ?? 'Team'
      const outputFile = `${slug(teamName) || 'team'}-delivery-${jobId.slice(-7)}.md`
      try {
        const artifact = `# ${teamName} delivery\n\n**Assignment:** ${initial.brief}\n\n**Requested format:** ${initial.outputFormat}\n\n---\n\n${finalOutput}`
        await uploadFile(new File([artifact], outputFile, { type: 'text/markdown', lastModified: Date.now() }))
        await useFiles.getState().refresh()
        patchJob({ outputFile, outputFileError: undefined })
      } catch (error) {
        patchJob({ outputFileError: error instanceof Error ? error.message : 'Could not add the team output to shared files.' })
      }
      patchJob({ status: 'done', finalOutput, reviewNotes, finishedAt: Date.now() }); members.forEach((agent) => get().updateAgent(agent.id, { status: 'idle' }))
    } catch (error) { patchJob({ status: 'error', error: error instanceof Error ? error.message : 'Team workflow failed.', finishedAt: Date.now() }); members.forEach((agent) => get().updateAgent(agent.id, { status: 'blocked' })) }
    finally { set((state) => ({ runningTeams: state.runningTeams.filter((id) => id !== jobId) })) }
  },
  removeTeamJob: (jobId) => set((state) => ({ teamJobs: state.teamJobs.filter((job) => job.id !== jobId) })),
  hydrate: (snapshot) => {
    if (!snapshot || !Array.isArray(snapshot.teams)) { set({ teams: DEFAULT_TEAMS, agents: seedAgents, teamJobs: [], profile: EMPTY_PROFILE, selectedId: null, hoveredId: null, showLabels: false, running: [], runningTeams: [], hydrated: true }); return }
    const teams = snapshot.teams.some((team) => team.id === BENCH_ID) ? snapshot.teams : [...snapshot.teams, DEFAULT_TEAMS[DEFAULT_TEAMS.length - 1]]; const ids = new Set(teams.map((team) => team.id))
    set({ teams, agents: (snapshot.agents ?? []).map(migrateAgent).map((agent) => ({ ...agent, teamId: ids.has(agent.teamId) ? agent.teamId : BENCH_ID })), teamJobs: Array.isArray(snapshot.teamJobs) ? snapshot.teamJobs : [], profile: snapshot.profile ?? { ...EMPTY_PROFILE, workspaceName: 'My autowork office' }, selectedId: null, hoveredId: null, showLabels: Boolean(snapshot.showLabels), running: [], runningTeams: [], hydrated: true })
  },
}))

export const teamHeadcount = (agents: Agent[], teams: Team[]): Record<string, number> => Object.fromEntries(teams.map((team) => [team.id, agents.filter((agent) => agent.teamId === team.id).length]))
export const pendingCount = (agent: Agent): number => agent.tasks.filter((task) => task.status === 'pending' || task.status === 'error').length
export const completedTasks = (agents: Agent[]) => agents.flatMap((agent) => agent.tasks.filter((task) => task.status === 'done' || task.status === 'error').map((task) => ({ agent, task }))).sort((a, b) => (b.task.finishedAt ?? 0) - (a.task.finishedAt ?? 0))
