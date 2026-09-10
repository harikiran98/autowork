import { useEffect, useState } from 'react'
import { getHealth, type HealthReport } from './client'

/**
 * Polls the local proxy once on mount. Deliberately non-fatal: a static build
 * with no server behind it is a valid way to run this app (the office and the
 * config UI work fine), so "not reachable" is a state to display, not an error.
 */
export function useApiHealth(): HealthReport | null {
  const [health, setHealth] = useState<HealthReport | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal).then(setHealth)
    return () => controller.abort()
  }, [])

  return health
}
