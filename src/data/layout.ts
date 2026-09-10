import type { Seat, TeamKind } from './org'

/**
 * The floorplan used to be hand-authored constants. Now that teams are created
 * at runtime, zone positions, seats and room size are all computed from the
 * current team list instead — one function so the 3D scene, the camera framing
 * and the roster never disagree about where a desk is.
 */

export interface ZoneLayout {
  id: string
  kind: TeamKind
  /** Zone centre on the floor. */
  origin: [number, number]
  rug: [number, number]
  signHeight: number
  headcount: number
}

export interface Floorplan {
  zones: Record<string, ZoneLayout>
  room: { width: number; depth: number }
  /** Bounding width/depth of everything placed, used to frame the camera. */
  bounds: { width: number; depth: number }
}

export interface LayoutTeam {
  id: string
  kind: TeamKind
}

/** Standing spot offset from the desk centre line. */
export const POD_AGENT_Z = 1.45
export const POD_CHAIR_Z = 2.45

const POD_SPACING_X = 6.4
const POD_SPACING_Z = 8.2
const POD_COLUMNS = 3
const LOUNGE_PER_ROW = 8

/**
 * Seat for the nth agent in a zone.
 *
 * Capacity is unbounded on purpose: agents 0-3 take the desk, and any beyond
 * that queue in rows behind it rather than stacking on one spot. Creating a
 * sixth teammate should never make one of them invisible.
 */
export function seatFor(zone: ZoneLayout, index: number): Seat {
  const [ox, oz] = zone.origin

  if (zone.kind === 'lounge') {
    const row = Math.floor(index / LOUNGE_PER_ROW)
    const col = index % LOUNGE_PER_ROW
    return {
      position: [ox + (col - (Math.min(LOUNGE_PER_ROW, zone.headcount - row * LOUNGE_PER_ROW) - 1) / 2) * 1.2, 0.02, oz + row * 1.5],
      rotation: 0,
    }
  }

  const row = Math.floor(index / 4)
  const nearSide = Math.floor((index % 4) / 2) === 1
  const col = index % 2
  const depth = POD_AGENT_Z + row * 1.3

  return {
    position: [ox + (col === 0 ? -1.15 : 1.15), 0.02, oz + (nearSide ? depth : -depth)],
    rotation: nearSide ? Math.PI : 0,
  }
}

/**
 * Place every zone. Pods fill a grid left to right and grow backwards toward
 * the window wall; the lounge (the bench) always sits at the front.
 *
 * `counts` lets a busy pod grow its rug so agents queued in the back rows are
 * still standing on it.
 */
export function computeFloorplan(teams: LayoutTeam[], counts: Record<string, number>): Floorplan {
  const pods = teams.filter((t) => t.kind === 'pod')
  const lounges = teams.filter((t) => t.kind === 'lounge')

  const columns = Math.min(Math.max(pods.length, 1), POD_COLUMNS)
  const rows = Math.max(1, Math.ceil(pods.length / columns))

  const zones: Record<string, ZoneLayout> = {}

  pods.forEach((team, i) => {
    const col = i % columns
    const row = Math.floor(i / columns)
    const x = (col - (columns - 1) / 2) * POD_SPACING_X
    const z = -1 - row * POD_SPACING_Z

    // Extra rows of standing agents need a longer rug under them.
    const extraRows = Math.max(0, Math.ceil((counts[team.id] ?? 0) / 4) - 1)
    zones[team.id] = {
      id: team.id,
      kind: 'pod',
      origin: [x, z],
      rug: [5.5, 6.9 + extraRows * 1.3],
      signHeight: 3.3,
      headcount: counts[team.id] ?? 0,
    }
  })

  const backmost = -1 - (rows - 1) * POD_SPACING_Z
  const loungeZ = 5.2

  lounges.forEach((team, i) => {
    const seats = counts[team.id] ?? 0
    const wide = Math.min(Math.max(seats, 4), LOUNGE_PER_ROW)
    zones[team.id] = {
      id: team.id,
      kind: 'lounge',
      origin: [0, loungeZ + i * 4.4],
      rug: [Math.max(8.6, wide * 1.4 + 2.4), 3.4],
      signHeight: 2.2,
      headcount: seats,
    }
  })

  const widest = Math.max(
    columns * POD_SPACING_X,
    ...Object.values(zones).map((z) => z.rug[0] + Math.abs(z.origin[0]) * 2),
  )
  const frontEdge = loungeZ + Math.max(0, lounges.length - 1) * 4.4 + 2.4
  const contentDepth = frontEdge - (backmost - 3.6)

  return {
    zones,
    room: { width: widest + 3, depth: contentDepth + 3 },
    bounds: { width: widest + 2.6, depth: contentDepth },
  }
}

/** Centre of everything placed, so the camera can aim at it. */
export function floorplanCentre(plan: Floorplan): [number, number] {
  const zs = Object.values(plan.zones).map((z) => z.origin[1])
  if (!zs.length) return [0, 0]
  return [0, (Math.min(...zs) + Math.max(...zs)) / 2]
}
