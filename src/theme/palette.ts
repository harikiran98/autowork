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
  background: '#eef1f7',
  fog: [34, 70],
  floor: '#eee6d6',
  wallBack: '#ebe7df',
  wallSide: '#d4d5ce',
  window: '#cfe9fb',
  mullion: '#dfe3ec',
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
  ceilingPanel: '#ffffff',
  ceilingIntensity: 1.1,
  ambient: 0.85,
  hemiSky: '#ffffff',
  hemiGround: '#cbd3e3',
  hemiIntensity: 0.7,
  keyIntensity: 1.55,
  keyColor: '#fff4e0',
  fillIntensity: 0.35,
  pointIntensity: 12,
  contactOpacity: 0.3,
  selectionRing: '#6366f1',
  hoverRing: '#94a3b8',
  tintBase: '#ffffff',
}

const DARK: ScenePalette = {
  background: '#151f25',
  fog: [30, 66],
  floor: '#a99c86',
  wallBack: '#596461',
  wallSide: '#495a55',
  window: '#2c4763',
  mullion: '#243044',
  deskTop: '#ae9473',
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
  ceilingPanel: '#dbe6ff',
  ceilingIntensity: 1.7,
  ambient: 0.9,
  hemiSky: '#9fb4d8',
  hemiGround: '#0f1420',
  hemiIntensity: 1.05,
  keyIntensity: 2.1,
  keyColor: '#cdd9f5',
  fillIntensity: 0.8,
  pointIntensity: 16,
  contactOpacity: 0.4,
  selectionRing: '#a5b4fc',
  hoverRing: '#cbd5e1',
  tintBase: '#212a3b',
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
