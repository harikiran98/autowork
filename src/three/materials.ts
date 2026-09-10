import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

// Locally generated surface detail: no remote assets or texture downloads.
export function useSurfaceTexture(kind: 'oak' | 'carpet' | 'screen' | 'sign') {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = kind === 'sign' ? 1024 : 512
    canvas.height = kind === 'sign' ? 256 : 512
    const c = canvas.getContext('2d')!
    let seed = 3749
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    if (kind === 'oak') {
      c.fillStyle = '#c1a783'; c.fillRect(0, 0, 512, 512)
      for (let plank = 0; plank < 8; plank++) {
        c.fillStyle = `rgba(${120 + plank * 3}, 89, 57, ${0.04 + random() * 0.11})`
        c.fillRect(0, plank * 64, 512, 64)
        for (let grain = 0; grain < 110; grain++) {
          c.strokeStyle = `rgba(85, 59, 37, ${random() * 0.13})`; c.lineWidth = 0.5 + random()
          const y = plank * 64 + random() * 64
          c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(160, y - 2, 330, y + 3, 512, y); c.stroke()
        }
        c.fillStyle = '#9c856a'; c.fillRect(0, plank * 64, 512, 1)
        c.fillRect((plank % 2) * 256 + 100, plank * 64, 1, 64)
      }
    } else if (kind === 'carpet') {
      c.fillStyle = '#c5c8c7'; c.fillRect(0, 0, 512, 512)
      for (let i = 0; i < 28000; i++) {
        c.fillStyle = random() > 0.5 ? '#b6bbba' : '#d6d9d8'
        c.fillRect(random() * 512, random() * 512, 1, 2)
      }
    } else if (kind === 'screen') {
      c.fillStyle = '#15232e'; c.fillRect(0, 0, 512, 512)
      c.fillStyle = '#253744'; c.fillRect(0, 0, 512, 55); c.fillRect(0, 55, 85, 457)
      c.fillStyle = '#dde9ec'; c.font = 'bold 25px sans-serif'; c.fillText('autowork', 21, 37)
      for (let row = 0; row < 16; row++) {
        c.fillStyle = ['#73c7b4', '#d7c89a', '#849fc9'][row % 3]
        c.fillRect(108 + (row % 3) * 18, 82 + row * 22, 80 + random() * 200, 5)
      }
      c.fillStyle = '#46bda5'; c.fillRect(108, 463, 220, 7)
    } else {
      c.clearRect(0, 0, 1024, 256)
      c.fillStyle = '#f0ede4'; c.font = '600 128px Segoe UI, sans-serif'; c.textAlign = 'center'; c.fillText('autowork', 512, 144)
      c.fillStyle = '#b3c0b9'; c.font = '22px Segoe UI, sans-serif'; c.fillText('A SPACE FOR IDEAS TO BECOME WORK.', 512, 199)
    }
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    result.anisotropy = 8
    if (kind === 'oak' || kind === 'carpet') {
      result.wrapS = result.wrapT = THREE.RepeatWrapping
      result.repeat.set(kind === 'oak' ? 3 : 2, kind === 'oak' ? 3 : 2)
    }
    return result
  }, [kind])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}
