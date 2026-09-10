import { useMemo } from 'react'
import { computeFloorplan, seatFor, type Floorplan } from '../data/layout'
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

    const plan = computeFloorplan(teams, counts)
    const seats: Record<string, Seat> = {}
    for (const team of teams) {
      const zone = plan.zones[team.id]
      if (!zone) continue
      agents
        .filter((a) => a.teamId === team.id)
        .forEach((a, i) => {
          seats[a.id] = seatFor(zone, i)
        })
    }
    return { plan, seats }
  }, [teams, agents])
}
