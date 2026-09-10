import { useTheme, type Resolved } from '../state/themeStore'

/** Linear interpolation between two hex colours. t = 1 keeps `a`. */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const v = h.replace('#', '')
    const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
  }
  const [r1, g1, b1] = parse(a)
  const [r2, g2, b2] = parse(b)
  const ch = (x: number, y: number) =>
    Math.round(x * t + y * (1 - t))
      .toString(16)
      .padStart(2, '0')
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`
}

export interface ScenePalette {
  background: string
  fog: [number, number]
  floor: string
  wallBack: string
  wallSide: string
  window: string
  mullion: string
  deskTop: string
  deskLeg: string
  chairSeat: string
  chairBase: string
  sofa: string
  sofaBack: string
  privacyMix: number
  rugMix: number
  monitorShell: string
  potColor: string
  foliage: [string, string]
  legColor: string
  ceilingPanel: string
  ceilingIntensity: number
  ambient: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  keyIntensity: number
  keyColor: string
  fillIntensity: number
  pointIntensity: number
  contactOpacity: number
  selectionRing: string
  hoverRing: string
  /** Base the rug / privacy tints are mixed toward so they don't glare. */
  tintBase: string
}

const LIGHT: ScenePalette = {
  background: '#dce3e0',
  fog: [34, 70],
  floor: '#d7d0c2',
  wallBack: '#d8d7d0',
  wallSide: '#c7ccc7',
  window: '#bad2dc',
  mullion: '#c7cece',
  deskTop: '#d9c5a5',
  deskLeg: '#b8bfd0',
  chairSeat: '#59637d',
  chairBase: '#3f4658',
  sofa: '#718f81',
  sofaBack: '#92ab9c',
  privacyMix: 0.45,
  rugMix: 0.22,
  monitorShell: '#3b4256',
  potColor: '#d98f6b',
  foliage: ['#4fa070', '#5cb37e'],
  legColor: '#2b3550',
  ceilingPanel: '#e7ebe7',
  ceilingIntensity: .85,
  ambient: 0.72,
  hemiSky: '#e6ece9',
  hemiGround: '#cbd3e3',
  hemiIntensity: 0.7,
  keyIntensity: 1.25,
  keyColor: '#e6dfd1',
  fillIntensity: 0.35,
  pointIntensity: 12,
  contactOpacity: 0.3,
  selectionRing: '#6366f1',
  hoverRing: '#94a3b8',
  tintBase: '#e5e9e6',
}

const DARK: ScenePalette = {
  background: '#1a2422',
  fog: [30, 66],
  floor: '#746f64',
  wallBack: '#45514d',
  wallSide: '#3c4945',
  window: '#344d59',
  mullion: '#243044',
  deskTop: '#89765f',
  deskLeg: '#4a5468',
  chairSeat: '#3d475d',
  chairBase: '#2b3244',
  sofa: '#405f55',
  sofaBack: '#648578',
  // Rugs and privacy screens are pulled toward the floor colour so the pastel
  // team tints read as surfaces rather than as glowing panels.
  privacyMix: 0.5,
  rugMix: 0.18,
  monitorShell: '#2a3143',
  potColor: '#a86b4e',
  foliage: ['#3c7c57', '#478c63'],
  legColor: '#536b84',
  ceilingPanel: '#9da9a4',
  ceilingIntensity: 1.15,
  ambient: 0.72,
  hemiSky: '#859994',
  hemiGround: '#0f1420',
  hemiIntensity: .82,
  keyIntensity: 1.55,
  keyColor: '#aab9b4',
  fillIntensity: 0.6,
  pointIntensity: 12,
  contactOpacity: 0.4,
  selectionRing: '#a5b4fc',
  hoverRing: '#cbd5e1',
  tintBase: '#303b37',
}

export const PALETTES: Record<Resolved, ScenePalette> = { light: LIGHT, dark: DARK }

/** Scene colours for the active theme. */
export const useScenePalette = (): ScenePalette => PALETTES[useTheme((s) => s.resolved)]

/**
 * Tint a team colour for the current theme. In dark mode the saturated pastel
 * is blended toward the floor so it stops glowing.
 */
export const themedTint = (hex: string, p: ScenePalette, strength = p.rugMix): string =>
  strength >= 1 ? hex : mixHex(hex, p.tintBase, strength)
