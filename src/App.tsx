import { useState } from 'react'
import { OfficeCanvas } from './three/OfficeCanvas'
import { NeuralCanvas } from './three/NeuralCanvas'
import { AgentConfigOverlay } from './ui/AgentConfigOverlay'
import { RosterRail } from './ui/RosterRail'
import { TopBar } from './ui/TopBar'
import { WorkspaceDrawer, type DrawerTab } from './ui/WorkspaceDrawer'
import { usePersistence } from './state/persistence'
import { useWorkspace } from './state/workspaceStore'
import { useMotion } from './three/motion'
import type { AutoworkUser } from './auth/AuthGate'
import { AccountPanel } from './ui/AccountPanel'

/**
 * Layout is deliberately flat: one full-bleed <Canvas> with the 2D chrome
 * absolutely positioned on top of it as ordinary DOM siblings.
 *
 * Nothing is passed between the two trees as props — the zustand store is the
 * only bridge, so a click inside the Canvas and a click in the roster rail take
 * exactly the same path.
 */
export default function App({ user, onSignOut }: { user: AutoworkUser; onSignOut: () => Promise<void> }) {
  usePersistence()
  const hasSelection = useWorkspace((s) => s.selectedId !== null)
  const [drawer, setDrawer] = useState<DrawerTab | null>(null)
  const motion = useMotion()
  const select = useWorkspace((s) => s.select)
  const [view, setView] = useState<'office' | 'neural'>('office')
  const hydrated = useWorkspace((s) => s.hydrated)
  const workspaceName = useWorkspace((s) => s.profile.workspaceName)

  return (
    <main className="app-shell relative h-dvh w-screen overflow-hidden bg-canvas antialiased">
      <div
        className={`scene-stage absolute inset-0 xl:left-[284px] ${hasSelection ? 'xl:right-[444px]' : ''}`}
        onDoubleClick={(event) => {
          if (event.button !== 0) return
          select(null)
          // One reset path for both views. `motion.home()` bumps the shared
          // resetView counter, which the office reframes on and the neural
          // view's <CameraHome> restores from — neither remounts its canvas.
          motion.home()
        }}
      >
        {view === 'office' ? <OfficeCanvas /> : <NeuralCanvas />}
      </div>

      <div className="scene-vignette pointer-events-none absolute inset-0 z-10" aria-hidden />

      <TopBar drawer={drawer} onDrawer={setDrawer} panelOpen={hasSelection} user={user} onSignOut={onSignOut} />
      <RosterRail />
      <AgentConfigOverlay />
      <div className="pointer-events-auto absolute left-4 top-[94px] z-20 flex gap-2 xl:left-[304px] xl:top-[104px]">
        <div className="glass-panel flex rounded-full p-1" role="group" aria-label="Workspace view">
          <button aria-pressed={view === 'office'} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${view === 'office' ? 'bg-solid text-on-solid shadow-md' : 'text-ink-soft hover:text-ink'}`} onClick={() => { setView('office'); select(null); motion.home() }}><span aria-hidden>⌂</span> Office</button>
          <button aria-pressed={view === 'neural'} className={`rounded-full px-3 py-1.5 text-xs font-bold transition-all ${view === 'neural' ? 'bg-solid text-on-solid shadow-md' : 'text-ink-soft hover:text-ink'}`} onClick={() => { setView('neural'); select(null) }}><span aria-hidden>✣</span> Neural</button>
        </div>
        <button className="glass-panel rounded-full px-3 py-2 text-xs font-semibold text-ink-soft" aria-pressed={motion.paused} onClick={motion.toggle}>{motion.paused ? '▶ Resume motion' : 'Ⅱ Pause motion'}</button>
      </div>

      {drawer && (
        <WorkspaceDrawer
          tab={drawer}
          onTab={setDrawer}
          onClose={() => setDrawer(null)}
          panelOpen={hasSelection}
        />
      )}

      {!hasSelection && !drawer && view === 'office' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[84px] z-20 flex justify-center px-4 xl:bottom-7 xl:pl-80">
          <div className="glass-panel flex items-center gap-3 rounded-full px-4 py-2.5 text-xs font-medium text-ink-soft">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-on-solid shadow-md shadow-accent/20">
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 4 7 6-7 6V4Z" />
              </svg>
            </span>
            <span><span className="font-semibold text-ink">Select an agent</span> to open their command center</span>
            <span className="hidden text-ink-faint sm:inline">· drag to move · right-drag to orbit · scroll to zoom · double-click to reset</span>
          </div>
        </div>
      )}
      {hydrated && !workspaceName && <AccountPanel user={user} firstRun onClose={() => undefined} />}
    </main>
  )
}
