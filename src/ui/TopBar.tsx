import { useState } from 'react'
import { useApiHealth } from '../api/useApiHealth'
import { useTheme } from '../state/themeStore'
import { completedTasks, pendingCount, useWorkspace } from '../state/workspaceStore'
import type { DrawerTab } from './WorkspaceDrawer'
import type { AutoworkUser } from '../auth/AuthGate'
import { AccountPanel } from './AccountPanel'
import { useMotion } from '../three/motion'

function Icon({ name }: { name: 'work' | 'files' | 'outputs' | 'labels' | 'sun' | 'moon' | 'power' }) {
  const common = 'h-[18px] w-[18px]'
  if (name === 'work') return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6M4 7h16v12H4z" /><path d="M4 11.5h16M10 11.5v2h4v-2" /></svg>
  if (name === 'files') return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 7.5h6l2-2h9v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11Z" /><path d="M3.5 10h17" /></svg>
  if (name === 'outputs') return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z" /><path d="m8 9 2.5 3L8 15M13.5 15H17" /></svg>
  if (name === 'labels') return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13.2 12.2 21 3 11.8V4h7.8L20 13.2Z" /><circle cx="7.5" cy="8.5" r="1.2" /></svg>
  if (name === 'sun') return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.5 12h-2M21.5 12h-2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg>
  if (name === 'power') return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.8v8.1" /><path d="M6.4 6.4a8 8 0 1 0 11.2 0" /></svg>
  return <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 15.2A8.4 8.4 0 0 1 8.8 4 8.7 8.7 0 1 0 20 15.2Z" /></svg>
}

function NavButton({ active, label, icon, count, onClick }: {
  active: boolean
  label: string
  icon: 'work' | 'files' | 'outputs' | 'labels'
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`group flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-all duration-200 active:scale-95 sm:px-3.5 ${
        active
          ? 'bg-solid text-on-solid shadow-lg shadow-black/15'
          : 'soft-button text-ink-soft hover:-translate-y-0.5 hover:text-ink'
      }`}
    >
      <Icon name={icon} />
      <span className="hidden 2xl:inline">{label}</span>
      {count != null && count > 0 && (
        <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-on-solid/15' : 'bg-surface text-ink-faint'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

export function TopBar({ drawer, onDrawer, panelOpen = false, user, onSignOut }: {
  drawer: DrawerTab | null
  onDrawer: (t: DrawerTab | null) => void
  panelOpen?: boolean
  user: AutoworkUser
  onSignOut: () => Promise<void>
}) {
  const agents = useWorkspace((s) => s.agents)
  const teamJobs = useWorkspace((s) => s.teamJobs)
  const profile = useWorkspace((s) => s.profile)
  const showLabels = useWorkspace((s) => s.showLabels)
  const toggleLabels = useWorkspace((s) => s.toggleLabels)
  const workspaceOnline = useWorkspace((s) => s.workspaceOnline)
  const setWorkspaceOnline = useWorkspace((s) => s.setWorkspaceOnline)
  const resolved = useTheme((s) => s.resolved)
  const toggleTheme = useTheme((s) => s.toggle)
  const health = useApiHealth()
  const queued = agents.reduce((n, a) => n + pendingCount(a), 0)
  const outputs = completedTasks(agents).length + teamJobs.filter((job) => job.status === 'awaiting_approval' || job.status === 'done' || job.status === 'error').length
  const active = agents.filter((a) => a.status === 'working').length
  const connected = health?.reachable === true
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  return (
    <header className={`pointer-events-none absolute left-3 right-3 top-3 z-20 transition-[right] duration-300 xl:left-[300px] xl:top-5 ${panelOpen ? 'xl:right-[460px]' : 'xl:right-5'}`}>
      <div className="glass-panel pointer-events-auto mx-auto flex h-[68px] max-w-5xl items-center gap-2 rounded-[26px] px-2.5 sm:gap-3 sm:px-3">
        <div className="flex min-w-0 items-center gap-3 pl-1 sm:pr-2">
          <div className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[17px] bg-solid text-on-solid shadow-lg shadow-black/20">
            <span className="text-[27px] font-bold tracking-[-0.08em]">a.</span>
            <span className={`absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-solid ${workspaceOnline ? 'bg-ok' : 'bg-warn'}`} />
          </div>
          <div className="min-w-0">
            <p className="max-w-44 truncate text-lg font-bold leading-tight tracking-[-0.04em] text-ink" title={profile.workspaceName || 'Workspace'}>{profile.workspaceName || 'Workspace'}</p>
            <p className="mt-0.5 hidden items-center gap-1.5 text-[11px] text-ink-faint md:flex">
              <span className={`live-dot h-1.5 w-1.5 rounded-full ${connected ? 'bg-ok' : 'bg-neutral'}`} />
              {!workspaceOnline ? 'Workspace shut down · memory saved' : connected ? 'Your team, in sync' : 'Your agent workspace'}
            </p>
          </div>
        </div>

        <div className="hidden h-8 w-px bg-line-soft md:block" />
        <div className={`hidden items-center gap-5 px-2 text-xs ${panelOpen ? '' : 'xl:flex'}`}>
          <div><span className="font-bold text-ink">{active}</span><span className="ml-1 text-ink-faint">active</span></div>
          <div><span className="font-bold text-ink">{queued}</span><span className="ml-1 text-ink-faint">queued</span></div>
          <div><span className="font-bold text-ink">{outputs}</span><span className="ml-1 text-ink-faint">outputs</span></div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <NavButton active={drawer === 'work'} label="Assign" icon="work" onClick={() => onDrawer(drawer === 'work' ? null : 'work')} />
          <NavButton active={drawer === 'files'} label="Files" icon="files" onClick={() => onDrawer(drawer === 'files' ? null : 'files')} />
          <NavButton active={drawer === 'outputs'} label="Outputs" icon="outputs" count={outputs} onClick={() => onDrawer(drawer === 'outputs' ? null : 'outputs')} />
          <span className="hidden sm:block"><NavButton active={showLabels} label="Labels" icon="labels" onClick={toggleLabels} /></span>
          <div className="mx-0.5 hidden h-7 w-px bg-line-soft sm:block" />
          <button
            type="button"
            onClick={() => {
              const next = !workspaceOnline
              setWorkspaceOnline(next)
              useMotion.setState({ paused: !next })
            }}
            aria-pressed={workspaceOnline}
            aria-label={workspaceOnline ? 'Shut down workspace' : 'Turn on workspace'}
            title={workspaceOnline ? 'Shut down workspace' : 'Turn on workspace and resume work'}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${workspaceOnline ? 'bg-[#2f9b72] shadow-[#2f9b72]/25' : 'bg-[#d5525f] shadow-[#d5525f]/25'}`}
          >
            <Icon name="power" />
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="soft-button grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft transition-all duration-200 hover:-translate-y-0.5 hover:text-ink active:scale-95"
          >
            <Icon name={resolved === 'dark' ? 'sun' : 'moon'} />
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Open account menu" title={`Signed in as ${user.email}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-xs font-extrabold uppercase text-on-solid shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5 active:scale-95">{(profile.ownerName || user.name).slice(0, 2)}</button>
            {menuOpen && <div className="absolute right-0 top-12 z-50 w-64 rounded-[22px] border border-line bg-glass-strong p-2 shadow-2xl backdrop-blur-xl" style={{ animation: 'popIn 160ms ease-out' }}>
              <div className="px-3 py-2"><p className="truncate text-sm font-bold text-ink">{profile.ownerName || user.name}</p><p className="mt-0.5 truncate text-[11px] text-ink-faint">{user.email}</p></div>
              <button type="button" onClick={() => { setAccountOpen(true); setMenuOpen(false) }} className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink">Account & workspace</button>
              <button type="button" onClick={() => void onSignOut()} className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-warn hover:bg-surface-2">Log out</button>
            </div>}
          </div>
        </div>
      </div>
      {accountOpen && <AccountPanel user={user} onClose={() => setAccountOpen(false)} />}
    </header>
  )
}
