import { RoundedBox } from '@react-three/drei'
import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { useSurfaceTexture } from './materials'
import type { ScenePalette } from '../theme/palette'

export function Block({ size, at = [0, 0, 0], color, radius = 0.025, metal = 0 }: {
  size: [number, number, number]; at?: [number, number, number]; color: string; radius?: number; metal?: number
}) {
  return <RoundedBox args={size} position={at} radius={Math.min(radius, Math.min(...size) / 2)} smoothness={2} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={metal ? 0.35 : 0.72} metalness={metal} />
  </RoundedBox>
}

function KeyboardKeys() {
  const keys = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4()
    for (let row = 0; row < 3; row++) for (let col = 0; col < 10; col++) {
      matrix.makeTranslation(-0.184 + col * 0.041, 0.019, -0.054 + row * 0.038)
      keys.current!.setMatrixAt(row * 10 + col, matrix)
    }
    keys.current!.instanceMatrix.needsUpdate = true
  }, [])
  return <instancedMesh ref={keys} args={[undefined, undefined, 30]}>
    <boxGeometry args={[0.031, 0.01, 0.025]} />
    <meshStandardMaterial color="#88949f" roughness={0.8} />
  </instancedMesh>
}

export function DeskAccessories({ x, z, facing, p }: { x: number; z: number; facing: number; p: ScenePalette }) {
  return <group position={[x, 1.13, z]} rotation={[0, facing, 0]}>
    <Block size={[0.65, 0.008, 0.24]} color="#374652" radius={0.003} />
    <Block size={[0.44, 0.025, 0.16]} color="#d7dce0" radius={0.01} />
    <KeyboardKeys />
    <Block size={[0.08, 0.035, 0.13]} at={[0.28, 0.015, 0]} color="#d8dfe2" radius={0.024} />
    <group position={[-0.43, 0.075, -0.22]}>
      <mesh castShadow><cylinderGeometry args={[0.065, 0.052, 0.15, 20, 1, true]} /><meshStandardMaterial color={p.potColor} roughness={0.4} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.055, 0.065, 20]} /><meshStandardMaterial color={p.potColor} roughness={0.4} /></mesh>
      <mesh position={[0, 0.066, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.061, 20]} /><meshStandardMaterial color="#442e23" /></mesh>
      <mesh position={[-0.075, 0, 0]}><torusGeometry args={[0.042, 0.012, 8, 16]} /><meshStandardMaterial color={p.potColor} /></mesh>
    </group>
    <group position={[0.46, 0, -0.17]} rotation={[0, 0.18, 0]}>
      <Block size={[0.23, 0.03, 0.3]} color="#687f74" radius={0.007} />
      <Block size={[0.012, 0.016, 0.2]} at={[0.04, 0.025, 0]} color="#c4a36f" radius={0.005} />
    </group>
  </group>
}

export function ArchitecturalDetails({ width, back, p }: { width: number; back: number; p: ScenePalette }) {
  const sign = useSurfaceTexture('sign')
  return <group>
    {/* Solid timber brand wall with vertical acoustic battens. */}
    <Block size={[6.1, 3.7, 0.18]} at={[0, 1.85, back + 0.12]} color="#31463f" />
    {Array.from({ length: 26 }, (_, i) => <Block key={i} size={[0.045, 3.7, 0.07]} at={[-3 + i * 0.24, 1.85, back + 0.24]} color="#6e7060" radius={0.006} />)}
    <mesh position={[0, 2.55, back + 0.3]}><planeGeometry args={[5.6, 1.4]} /><meshBasicMaterial map={sign} transparent depthWrite={false} /></mesh>
    <Block size={[5.1, 0.78, 0.72]} at={[0, 0.4, back + 0.56]} color={p.deskTop} radius={0.045} />
    {[-1.7, -0.57, 0.57, 1.7].map((x) => <Block key={x} size={[1.08, 0.65, 0.03]} at={[x, 0.42, back + 0.935]} color="#b5a78f" radius={0.008} />)}
    {/* Books and a coffee machine on the shared credenza. */}
    <Block size={[0.65, 0.06, 0.39]} at={[-1.5, 0.84, back + 0.6]} color="#d0d7ce" />
    <Block size={[0.57, 0.06, 0.37]} at={[-1.47, 0.9, back + 0.6]} color="#74857b" />
    <Block size={[0.43, 0.48, 0.41]} at={[1.55, 1.05, back + 0.6]} color="#303943" radius={0.045} />
    <Block size={[0.3, 0.16, 0.05]} at={[1.55, 1.06, back + 0.83]} color="#bac4c7" radius={0.02} />
    {/* Perimeter skirting and a visible return wall make this a cutaway interior. */}
    <Block size={[width, 0.12, 0.08]} at={[0, 0.065, back + 0.12]} color={p.mullion} radius={0.01} />
  </group>
}
