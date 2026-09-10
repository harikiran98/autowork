/**
 * Fixed vocabulary: the roles an agent can hold, and the seed teams.
 *
 * Teams themselves are no longer defined here — they live in the store because
 * you can create them at runtime. What stays static is the role list (a job
 * title vocabulary) and the tint palette new teams draw from.
 */

export type RoleId =
  | 'team-lead'
  | 'scrum-master'
  | 'business-analyst'
  | 'full-stack-developer'
  | 'qa-tester'

export interface Role {
  id: RoleId
  label: string
  blurb: string
  /**
   * Minifigure torso colour, and the single hex every role chip in the 2D UI
   * is derived from (see theme/pill.ts). One value, both themes.
   */
  color: string
  /** Prepended to the agent's own system prompt when a task runs. */
  charter: string
}

export const ROLES: Role[] = [
  {
    id: 'team-lead',
    label: 'Team Lead',
    blurb: 'Owns delivery, unblocks the team, signs off on work.',
    color: '#4f5bd5',
    charter:
      'You are a team lead. Prioritise ruthlessly, call out risks and dependencies, and end with a clear decision or recommendation.',
  },
  {
    id: 'scrum-master',
    label: 'Scrum Master',
    blurb: 'Runs ceremonies, protects focus, tracks flow.',
    color: '#c65cd4',
    charter:
      'You are a scrum master. Break work into small increments, surface blockers early, and keep output concrete and actionable.',
  },
  {
    id: 'business-analyst',
    label: 'Business Analyst',
    blurb: 'Turns intent into requirements and acceptance criteria.',
    color: '#f0a830',
    charter:
      'You are a business analyst. Turn intent into numbered requirements with testable acceptance criteria. Flag ambiguities rather than guessing.',
  },
  {
    id: 'full-stack-developer',
    label: 'Full Stack Developer',
    blurb: 'Implements features end to end, front and back.',
    color: '#2fa96b',
    charter:
      'You are a full stack developer. Produce working, complete code with brief reasoning. State assumptions explicitly instead of inventing requirements.',
  },
  {
    id: 'qa-tester',
    label: 'QA Tester',
    blurb: 'Writes and runs tests, guards the release gate.',
    color: '#e2555f',
    charter:
      'You are a QA tester. Write concrete test cases including edge cases and failure modes, and say plainly what you could not verify.',
  },
]

export const ROLE_BY_ID = Object.fromEntries(ROLES.map((r) => [r.id, r])) as Record<RoleId, Role>

export type TeamKind = 'pod' | 'lounge'

export interface Seat {
  /** World-space position of the minifigure's feet. */
  position: [number, number, number]
  /** Y rotation in radians. Models are authored facing +Z. */
  rotation: number
}

export interface Team {
  id: string
  name: string
  mission: string
  /** Hex for the zone rug and signage in 3D, and for the team chip in 2D. */
  tint: string
  kind: TeamKind
  /** The bench cannot be renamed or deleted; it is where orphaned agents land. */
  system?: boolean
}

/** New teams cycle through these so two teams are never the same colour. */
export const TEAM_TINTS = [
  '#7fc4e8',
  '#8fd6a6',
  '#f3cf86',
  '#d5a8ea',
  '#f0a3a3',
  '#89d8d0',
  '#b8c48f',
  '#e8b183',
]

export const BENCH_ID = 'bench'

export const DEFAULT_TEAMS: Team[] = [
  {
    id: 'platform',
    name: 'Platform',
    mission: 'Core services, infrastructure and developer tooling.',
    tint: TEAM_TINTS[0],
    kind: 'pod',
  },
  {
    id: 'growth',
    name: 'Growth',
    mission: 'Onboarding, activation and the customer-facing surface.',
    tint: TEAM_TINTS[1],
    kind: 'pod',
  },
  {
    id: 'insights',
    name: 'Insights',
    mission: 'Analytics, reporting and decision support.',
    tint: TEAM_TINTS[2],
    kind: 'pod',
  },
  {
    id: BENCH_ID,
    name: 'Bench',
    mission: 'Idle agents waiting for an assignment.',
    tint: '#cfd6e4',
    kind: 'lounge',
    system: true,
  },
]
