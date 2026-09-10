import { useMemo } from 'react'
import { computeFloorplan, cubicleSeatFor, seatFor, type Floorplan } from '../data/layout'
import type { Seat } from '../data/org'
import { useWorkspace } from './workspaceStore'

export interface FloorplanView {
  plan: Floorplan
  /** Agent id -> where that agent stands. */
  seats: Record<string, Seat>
}

/**
 * Derives the whole floorplan from the current teams and agents.
 *
 * Seats are positional: an agent's spot is its index within its team, so
 * nothing has to store or reconcile a seat number, and adding or removing a
 * teammate simply re-flows the pod.
 */
export function useFloorplan(): FloorplanView {
  const teams = useWorkspace((s) => s.teams)
  const agents = useWorkspace((s) => s.agents)

  return useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of teams) counts[t.id] = agents.filter((a) => a.teamId === t.id).length

    const managerCount = agents.filter((agent) => agent.isTeamLead || agents.some((child) => child.parentAgentId === agent.id)).length
    const plan = computeFloorplan(teams, counts, managerCount)
    const seats: Record<string, Seat> = {}
    let cubicleIndex = 0
    for (const team of teams) {
      const zone = plan.zones[team.id]
      if (!zone) continue
      const members = agents.filter((agent) => agent.teamId === team.id)
      if (zone.kind === 'lounge') {
        members.forEach((agent, index) => { seats[agent.id] = seatFor(zone, index) })
        continue
      }
      const managers = members.filter((agent) => agent.isTeamLead || members.some((child) => child.parentAgentId === agent.id))
      const contributors = members.filter((agent) => !managers.some((manager) => manager.id === agent.id))
      managers.forEach((agent) => { seats[agent.id] = cubicleSeatFor(plan, cubicleIndex++) })
      contributors.forEach((agent, index) => { seats[agent.id] = seatFor(zone, index) })
    }
    return { plan, seats }
  }, [teams, agents])
}
