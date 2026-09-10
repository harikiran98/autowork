import { create } from 'zustand'

const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const useMotion = create<{ paused: boolean; toggle: () => void; resetView: number; home: () => void }>((set) => ({
  paused: reduced,
  toggle: () => set((s) => ({ paused: !s.paused })),
  resetView: 0,
  home: () => set((s) => ({ resetView: s.resetView + 1 })),
}))

// All animation is relative to these authored joint origins, never world zero.
export const CHARACTER = { hip: 0.86, thigh: 0.37, shin: 0.36, shoe: 0.13, height: 1.86 }

export function gaitPose(distance: number, amount: number) {
  const phase = distance * Math.PI * 2 / 0.85
  return {
    left: Math.sin(phase) * 0.38 * amount,
    right: -Math.sin(phase) * 0.38 * amount,
    leftKnee: Math.max(0, -Math.sin(phase)) * 0.58 * amount,
    rightKnee: Math.max(0, Math.sin(phase)) * 0.58 * amount,
    bob: Math.abs(Math.sin(phase)) * 0.023 * amount,
  }
}
