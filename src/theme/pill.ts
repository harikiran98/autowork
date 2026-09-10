import type { CSSProperties } from 'react'
import { useTheme } from '../state/themeStore'
import { mixHex } from './palette'

/**
 * Data-driven accent chips (role, team, model tier, provider) are generated
 * from a single hex rather than hand-written Tailwind classes.
 *
 * Why: those chips carry arbitrary colours from `org.ts` / `llm-catalog.ts`. If
 * each one shipped its own light and dark class pair, adding a role would mean
 * hand-checking contrast again. Deriving both the fill and the text from one
 * hex with fixed mix ratios means every chip lands in the same measured
 * contrast band, whatever colour is added later.
 */
/**
 * Ratios are tuned so the *worst* hue in the palette still clears WCAG AA for
 * small text (4.5:1) in both themes — verified by the contrast audit rather
 * than by eye. Raising `text` or `fill` past these values starts to fail on the
 * lightest team tint (light) and the violet tier badge (dark).
 */
const RATIOS = {
  light: { fill: 0.12, text: 0.5, fillBase: '#ffffff', textBase: '#0a0f1a' },
  dark: { fill: 0.19, text: 0.55, fillBase: '#1b2231', textBase: '#ffffff' },
} as const

export function usePillStyle(): (hex: string) => CSSProperties {
  const resolved = useTheme((s) => s.resolved)
  const r = RATIOS[resolved]
  return (hex: string) => ({
    backgroundColor: mixHex(hex, r.fillBase, r.fill),
    color: mixHex(hex, r.textBase, r.text),
  })
}

/** Solid accent bar / dot — the raw colour, lightened a little on dark. */
export function useAccentColor(): (hex: string) => string {
  const resolved = useTheme((s) => s.resolved)
  return (hex: string) => (resolved === 'dark' ? mixHex(hex, '#ffffff', 0.82) : hex)
}

/** Solid role avatar with whichever text colour has the higher WCAG contrast. */
export function useAvatarStyle(): (hex: string) => CSSProperties {
  const resolved = useTheme((s) => s.resolved)
  return (hex: string) => {
    // A 4% lift avoids the narrow middle-luminance band where neither white
    // nor near-black text reaches 4.5:1 on colors such as violet and rose.
    const backgroundColor = resolved === 'dark' ? mixHex(hex, '#ffffff', 0.82) : mixHex(hex, '#ffffff', 0.94)
    const value = backgroundColor.replace('#', '')
    const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    const linear = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
    )
    const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    const whiteRatio = 1.05 / (luminance + 0.05)
    const darkRatio = (luminance + 0.05) / 0.052
    return { backgroundColor, color: whiteRatio >= darkRatio ? '#ffffff' : '#0a0f1a' }
  }
}
