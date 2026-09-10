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

export interface MeetingRoomLayout {
  id: string
  teamId?: string
  defaultName: string
  position: [number, number]
}

/** Seated workstation offset from the desk centre line. */
export const POD_AGENT_Z = 1.52
export const POD_CHAIR_Z = POD_AGENT_Z

const POD_SPACING_X = 6.4
const POD_SPACING_Z = 8.2
const POD_COLUMNS = 3
const LOUNGE_PER_ROW = 3

/**
 * Seat for the nth agent in a zone.
 *
 * Capacity is unbounded on purpose: agents 0-3 take the first workstation row,
 * and any beyond that take additional seated rows rather than stacking.
 */
export function seatFor(zone: ZoneLayout, index: number): Seat {
  const [ox, oz] = zone.origin

  if (zone.kind === 'lounge') {
    const row = Math.floor(index / LOUNGE_PER_ROW)
    const col = index % LOUNGE_PER_ROW
    return {
      // The articulated thighs extend toward +Z. Anchoring at the cushion
      // centre put the knees and shins inside the sofa, so seat at its front.
      position: [ox + (col - (Math.min(LOUNGE_PER_ROW, zone.headcount - row * LOUNGE_PER_ROW) - 1) / 2) * 1.35, 0.02, oz - 0.9 + row * 1.75],
      rotation: 0,
      pose: 'seated',
      place: 'bench',
    }
  }

  const row = Math.floor(index / 4)
  const nearSide = Math.floor((index % 4) / 2) === 1
  const col = index % 2
  const depth = POD_AGENT_Z + row * 1.3

  return {
    position: [ox + (col === 0 ? -1.15 : 1.15), 0.02, oz + (nearSide ? depth : -depth)],
    rotation: nearSide ? Math.PI : 0,
    pose: 'seated',
    place: 'desk',
  }
}

/** Dedicated enclosed workstation for a team lead or an agent with reports. */
export function cubicleSeatFor(plan: Floorplan, index: number): Seat {
  const backZ = Math.min(...Object.values(plan.zones).map((zone) => zone.origin[1])) - 4.6
  const col = index % 2
  const row = Math.floor(index / 2)
  return {
    position: [plan.room.width / 2 - 2.05 - col * 3, 0.02, backZ + 2.05 + row * 3],
    rotation: 0,
    pose: 'seated',
    place: 'desk',
  }
}

/**
 * Place every zone. Pods fill a grid left to right and grow backwards toward
 * the window wall; the lounge (the bench) always sits at the front.
 *
 * `counts` lets a busy pod grow its rug so agents queued in the back rows are
 * still standing on it.
 */
export function computeFloorplan(teams: LayoutTeam[], counts: Record<string, number>, managerCount = 0): Floorplan {
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

    // Extra workstation rows need a longer rug under their desks and chairs.
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
    const wide = Math.min(Math.max(seats, 3), LOUNGE_PER_ROW)
    zones[team.id] = {
      id: team.id,
      kind: 'lounge',
      origin: [0, loungeZ + i * 4.4],
      rug: [Math.max(8.6, wide * 1.4 + 2.4), Math.max(3.8, Math.ceil(seats / LOUNGE_PER_ROW) * 1.75 + 2.2)],
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
  const meetingRows = Math.ceil((pods.length + 2) / 2)
  // The room recomputes whenever a reporting line changes, so it expands by
  // the exact number of occupied management rows without leaving dead space.
  const managerReserveRows = Math.max(1, Math.ceil(managerCount / 2))
  const roomDepth = Math.max(contentDepth + 3, meetingRows * 4.1 + 3.5, managerReserveRows * 3 + 6.4)

  return {
    zones,
    // Eight extra metres create a dedicated meeting-room wing. Room count is
    // always active teams + two flex rooms and grows vertically in two columns.
    room: { width: widest + 17, depth: roomDepth },
    bounds: { width: widest + 16.6, depth: roomDepth },
  }
}

export function meetingRooms(plan: Floorplan, teams: Array<LayoutTeam & { name: string }>): MeetingRoomLayout[] {
  const activeTeams = teams.filter((team) => team.kind === 'pod')
  const count = activeTeams.length + 2
  const backZ = Math.min(...Object.values(plan.zones).map((zone) => zone.origin[1])) - 4.6
  return Array.from({ length: count }, (_, index) => {
    const team = activeTeams[index]
    const col = index % 2
    const row = Math.floor(index / 2)
    return {
      id: team ? `meeting-${team.id}` : `meeting-flex-${index - activeTeams.length + 1}`,
      ...(team ? { teamId: team.id } : {}),
      defaultName: team ? 'Available meeting room' : `Flex room ${index - activeTeams.length + 1}`,
      position: [-plan.room.width / 2 + 2.05 + col * 4.3, backZ + 2.05 + row * 4.1],
    }
  })
}

export function meetingSeat(room: MeetingRoomLayout, index: number): Seat {
  const angle = (index % 6) / 6 * Math.PI * 2
  return {
    position: [room.position[0] + Math.cos(angle) * 0.92, 0.02, room.position[1] + Math.sin(angle) * 0.78],
    rotation: Math.atan2(room.position[0] - (room.position[0] + Math.cos(angle) * 0.92), room.position[1] - (room.position[1] + Math.sin(angle) * 0.78)),
    pose: 'seated',
    place: 'cafeteria',
  }
}

/** Centre of everything placed, so the camera can aim at it. */
export function floorplanCentre(plan: Floorplan): [number, number] {
  const zs = Object.values(plan.zones).map((z) => z.origin[1])
  if (!zs.length) return [0, 0]
  const backZ = Math.min(...zs) - 4.6
  return [0, backZ + plan.room.depth / 2]
}

/** Fixed break area beside the bench at the front-right of the office. */
export function cafeteriaOrigin(plan: Floorplan): [number, number] {
  const backZ = Math.min(...Object.values(plan.zones).map((zone) => zone.origin[1])) - 4.6
  return [plan.room.width / 2 - 3.25, backZ + plan.room.depth - 2.8]
}

export function cafeteriaSeat(plan: Floorplan, index: number): Seat {
  const [x, z] = cafeteriaOrigin(plan)
  const spots: Array<[number, number, number]> = [
    [-0.85, -0.55, Math.PI / 4], [0.85, -0.55, -Math.PI / 4],
    [-0.85, 0.7, Math.PI * 3 / 4], [0.85, 0.7, -Math.PI * 3 / 4],
  ]
  const [dx, dz, rotation] = spots[index % spots.length]
  return { position: [x + dx, 0.02, z + dz], rotation, pose: 'seated', place: 'cafeteria' }
}

export function coffeeSpot(plan: Floorplan, index: number): Seat {
  const [x, z] = cafeteriaOrigin(plan)
  return { position: [x + 1.75 + (index % 2) * 0.35, 0.02, z - 1.15], rotation: -Math.PI / 2, pose: 'standing', place: 'cafeteria' }
}
