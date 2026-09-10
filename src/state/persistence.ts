import { useEffect } from 'react'
import { loadState, saveState } from '../api/client'
import { toPersisted, useWorkspace, type PersistedState } from './workspaceStore'

const SAVE_DEBOUNCE_MS = 700

/**
 * Fallback snapshot for a browser whose storage quota is already full.
 *
 * Run transcripts dominate the payload: every team delivery keeps a plan, two
 * review rounds and one output per contributor. Once those exceed the ~5 MB
 * localStorage budget, `setItem` throws and *nothing* is saved — including the
 * profile, so the workspace name reverts to the generic label on the next
 * reload. Dropping the oldest transcripts keeps the structural state saveable.
 */
function compact(snapshot: PersistedState): PersistedState {
  return {
    ...snapshot,
    // teamJobs are newest-first; the newest few keep their full transcript so
    // the Outputs page still shows recent deliveries in full.
    teamJobs: (snapshot.teamJobs ?? []).slice(0, 12).map((job, index) => index < 3 ? job : {
      ...job,
      plan: undefined,
      reviewNotes: undefined,
      contributions: job.contributions.map((item) => ({ ...item, output: undefined })),
    }),
    agents: snapshot.agents.map((agent) => ({
      ...agent,
      tasks: agent.tasks.slice(-24),
      memory: (agent.memory ?? []).slice(-6),
    })),
  }
}

async function persist() {
  const snapshot = toPersisted(useWorkspace.getState())
  if (await saveState(snapshot)) return
  if (await saveState(compact(snapshot))) {
    console.warn('autowork: browser storage is nearly full — older run transcripts were dropped from the saved workspace.')
    return
  }
  console.warn('autowork: could not save the workspace to this browser. Teams, agents and outputs from this session may not survive a reload.')
}

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
    let pending = false

    const unsubscribe = useWorkspace.subscribe((state, prev) => {
      // Only persisted fields should trigger a write — hovering a doll or
      // opening a panel must not hit the disk.
      if (
        state.teams === prev.teams &&
        state.agents === prev.agents &&
        state.teamJobs === prev.teamJobs &&
        state.profile === prev.profile &&
        state.showLabels === prev.showLabels &&
        state.skipApprovals === prev.skipApprovals &&
        state.workspaceOnline === prev.workspaceOnline &&
        state.pausedAgentRuns === prev.pausedAgentRuns &&
        state.pausedTeamRuns === prev.pausedTeamRuns
      ) {
        return
      }
      if (!state.hydrated) return // don't overwrite the file with seed data

      clearTimeout(timer)
      pending = true
      timer = setTimeout(() => { pending = false; void persist() }, SAVE_DEBOUNCE_MS)
    })

    // Flush before the page goes away. Without this, closing or reloading
    // within the debounce window discards the newest change — and the change
    // most likely to be followed by an immediate reload is finishing the
    // first-run dialog, which is exactly how a freshly named workspace came
    // back as the generic label. localStorage writes are synchronous, so this
    // is safe to do from an unload handler.
    const flush = () => {
      if (!pending) return
      clearTimeout(timer)
      pending = false
      void persist()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)

    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}
