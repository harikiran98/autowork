import { useEffect } from 'react'
import { loadState, saveState } from '../api/client'
import { toPersisted, useWorkspace, type PersistedState } from './workspaceStore'

const SAVE_DEBOUNCE_MS = 700

/**
 * Loads saved state once on boot, then writes it back on change.
 *
 * Debounced because typing in the system-prompt box fires a store update per
 * keystroke. The primary snapshot is browser-local; the development server
 * also receives a best-effort backup when it is available.
 */
export function usePersistence() {
  const hydrate = useWorkspace((s) => s.hydrate)

  useEffect(() => {
    let cancelled = false
    loadState<PersistedState>().then((snapshot) => {
      if (!cancelled) hydrate(snapshot)
    })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    const unsubscribe = useWorkspace.subscribe((state, prev) => {
      // Only persisted fields should trigger a write — hovering a doll or
      // opening a panel must not hit the disk.
      if (
        state.teams === prev.teams &&
        state.agents === prev.agents &&
        state.teamJobs === prev.teamJobs &&
        state.profile === prev.profile &&
        state.showLabels === prev.showLabels
      ) {
        return
      }
      if (!state.hydrated) return // don't overwrite the file with seed data

      clearTimeout(timer)
      timer = setTimeout(() => void saveState(toPersisted(useWorkspace.getState())), SAVE_DEBOUNCE_MS)
    })

    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}
