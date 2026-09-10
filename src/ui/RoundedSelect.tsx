import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption {
  value: string
  label: string
  /** Secondary line under the label. */
  hint?: string
  /** Small pill on the right of the row. Styled from a themed colour pair. */
  badge?: { text: string; style: CSSProperties }
  /** Colour dot on the left of the row. */
  dot?: string
}

interface Props {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

/**
 * A listbox rather than a native <select>, because a native select can't carry
 * the two-line rows / badges the model picker needs, and can't be given the
 * rounded look. Closes on outside click and Escape; arrow keys move the
 * highlight, Enter commits.
 */
export function RoundedSelect({ label, value, options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; drop: 'down' | 'up' } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const labelId = `${id}-label`
  const valueId = `${id}-value`

  const selected = options.find((o) => o.value === value) ?? options[0]

  /**
   * The panel is portalled to <body> with fixed positioning. Rendering it as a
   * child of the trigger would get it clipped by the config panel's own
   * `overflow-y-auto` — which is exactly what happens to the last dropdown in
   * a scrolling form.
   */
  const measure = useCallback(() => {
    const el = trigger.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const drop: 'down' | 'up' = spaceBelow < 260 && r.top > spaceBelow ? 'up' : 'down'
    setRect({
      top: drop === 'down' ? r.bottom + 8 : Math.max(8, r.top - 8),
      left: r.left,
      width: r.width,
      drop,
    })
  }, [])

  useLayoutEffect(() => {
    if (open) measure()
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))

    const onDocPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (root.current?.contains(t) || panel.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape dismisses the dropdown ONLY. The overlay also listens for Escape
      // (to close the whole panel) on window; document fires first, so stopping
      // propagation here keeps the two layers in the right order.
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('keydown', onKey)
    // `true` = capture phase, so the panel follows an ancestor scrolling too.
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, options, value, measure])

  const commit = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + options.length) % options.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit(options[active].value)
    }
  }

  return (
    <div className="relative" ref={root}>
      <label id={labelId} htmlFor={id} className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </label>

      <button
        id={id}
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        /* Name the trigger "<label> <current value>" so the selection is
           announced too; htmlFor alone would read only the label. */
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-sm shadow-black/5 transition-all duration-200 hover:border-accent/50 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selected?.dot && (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selected.dot }} />
        )}
        <span className="min-w-0 flex-1">
          <span id={valueId} className="block truncate text-sm font-semibold text-ink">
            {selected?.label}
          </span>
          {selected?.hint && <span className="mt-0.5 block truncate text-xs text-ink-faint">{selected.hint}</span>}
        </span>
        {selected?.badge && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={selected.badge.style}
          >
            {selected.badge.text}
          </span>
        )}
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>

      {open && rect &&
        createPortal(
          <div
            ref={panel}
            role="listbox"
            className="fixed z-[100] max-h-64 overflow-y-auto rounded-3xl border border-line bg-glass-strong p-2 shadow-2xl shadow-black/25 backdrop-blur-xl"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              transform: rect.drop === 'up' ? 'translateY(-100%)' : undefined,
              animation: 'popIn 160ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
          {options.map((o, i) => {
            const isSelected = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(o.value)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-150 ${
                  i === active ? 'bg-surface-2' : 'bg-transparent'
                }`}
              >
                {o.dot && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.dot }} />}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${isSelected ? 'font-semibold text-accent' : 'font-medium text-ink'}`}>
                    {o.label}
                  </span>
                  {o.hint && <span className="mt-0.5 block truncate text-xs text-ink-faint">{o.hint}</span>}
                </span>
                {o.badge && (
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
                    style={o.badge.style}
                  >
                    {o.badge.text}
                  </span>
                )}
                {isSelected && (
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4.5 10.5 4 4 7-8" />
                  </svg>
                )}
              </button>
            )
          })}
          </div>,
          document.body,
        )}
    </div>
  )
}
