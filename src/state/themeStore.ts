import { create } from 'zustand'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type Resolved = 'light' | 'dark'

interface ThemeState {
  /** What the user picked in this app. 'system' defers to the host/OS. */
  choice: ThemeChoice
  /** What is actually rendered right now. */
  resolved: Resolved
  setChoice: (c: ThemeChoice) => void
  toggle: () => void
  /** Recompute from the host attribute / OS query. Called by the watcher. */
  syncFromEnvironment: () => void
}

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches

/**
 * A host page (for example an embedding viewer) may stamp `data-theme` on the
 * root element. We honour it when the user hasn't chosen explicitly, and we
 * never write to that attribute ourselves — this app writes `data-app-theme`,
 * so the two can coexist without fighting.
 */
const hostTheme = (): Resolved | null => {
  if (typeof document === 'undefined') return null
  const v = document.documentElement.dataset.theme
  return v === 'dark' || v === 'light' ? v : null
}

const resolve = (choice: ThemeChoice): Resolved => {
  if (choice !== 'system') return choice
  return hostTheme() ?? (prefersDark() ? 'dark' : 'light')
}

const apply = (resolved: Resolved) => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.appTheme = resolved
  // Keeps native form controls, scrollbars and focus rings in the right mode.
  document.documentElement.style.colorScheme = resolved
}

const initialChoice: ThemeChoice = 'system'
const initialResolved = resolve(initialChoice)
apply(initialResolved)

export const useTheme = create<ThemeState>((set, get) => ({
  choice: initialChoice,
  resolved: initialResolved,

  setChoice: (choice) => {
    const resolved = resolve(choice)
    apply(resolved)
    set({ choice, resolved })
  },

  toggle: () => get().setChoice(get().resolved === 'dark' ? 'light' : 'dark'),

  syncFromEnvironment: () => {
    const { choice, resolved } = get()
    if (choice !== 'system') return
    const next = resolve('system')
    if (next === resolved) return
    apply(next)
    set({ resolved: next })
  },
}))

/** Wire up host-attribute and OS-preference watching. Call once, from main. */
export function watchTheme(): () => void {
  if (typeof window === 'undefined') return () => {}
  const sync = () => useTheme.getState().syncFromEnvironment()

  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', sync)

  const observer = new MutationObserver(sync)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  return () => {
    mq.removeEventListener('change', sync)
    observer.disconnect()
  }
}
