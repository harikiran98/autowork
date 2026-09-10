/** Runtime organization primitives. Agent roles are intentionally not a fixed
 * vocabulary: every agent owns a free-form title and description. */

export const AGENT_COLORS = [
  '#6172d9', '#3f9b7a', '#b27643', '#9a63b0', '#b85f68',
  '#4e8ba8', '#71894c', '#a87157', '#6d7892', '#447f79',
]

export type TeamKind = 'pod' | 'lounge'

export interface Seat {
  /** World-space destination of the character root. */
  position: [number, number, number]
  /** Y rotation in radians. Models are authored facing +Z. */
  rotation: number
  pose: 'seated' | 'standing'
  place: 'desk' | 'bench' | 'cafeteria'
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
