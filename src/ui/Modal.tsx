import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Rounded dialog shell. Portalled to <body> so it is never clipped by the
 * panel it was opened from, and closes on Escape or backdrop click.
 */
export function Modal({
  title,
  onClose,
  children,
  dismissible = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  dismissible?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !dismissible) return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, dismissible])

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/40 p-5 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md overflow-hidden rounded-[2rem] border border-line bg-surface shadow-2xl shadow-black/30"
        style={{ animation: 'popIn 200ms cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {dismissible && <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-ink-soft transition-all duration-200 hover:scale-105 hover:text-ink active:scale-95"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l8 8M14 6l-8 8" />
            </svg>
          </button>}
        </div>
        <div className="px-6 pb-6 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
