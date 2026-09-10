import { Fragment, useEffect, useMemo } from 'react'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { POD_CHAIR_Z, type Floorplan, type ZoneLayout } from '../data/layout'
import type { Team } from '../data/org'
import { useWorkspace, teamHeadcount } from '../state/workspaceStore'
import { useFloorplan } from '../state/useFloorplan'
import { themedTint, useScenePalette, type ScenePalette } from '../theme/palette'

import { useSurfaceTexture } from './materials'
import { ArchitecturalDetails, Block, DeskAccessories } from './InteriorDetails'

/* -------------------------------- rug ---------------------------------- */

/** Rounded rectangle in the XY plane, laid flat by the caller. */
function roundedRectShape(w: number, d: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  const rad = Math.min(r, w / 2, d / 2)
  s.moveTo(x + rad, y)
  s.lineTo(x + w - rad, y)
  s.quadraticCurveTo(x + w, y, x + w, y + rad)
  s.lineTo(x + w, y + d - rad)
  s.quadraticCurveTo(x + w, y + d, x + w - rad, y + d)
  s.lineTo(x + rad, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - rad)
  s.lineTo(x, y + rad)
  s.quadraticCurveTo(x, y, x + rad, y)
  return s
}

/**
 * Zone rug. A flattened <RoundedBox> would need radius < height/2, which at rug
 * thickness means no visible rounding at all — so this is a flat ShapeGeometry
 * instead, which keeps the soft corners without the slab.
 */
function Rug({
  width,
  depth,
  radius,
  color,
  position,
}: {
  width: number
  depth: number
  radius: number
  color: string
  position: [number, number, number]
}) {
  const geometry = useMemo(
    () => new THREE.ShapeGeometry(roundedRectShape(width, depth, radius), 12),
    [width, depth, radius],
  )
  const carpet = useSurfaceTexture('carpet')
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <meshStandardMaterial color={color} map={carpet} roughness={0.98} />
    </mesh>
  )
}

/* ----------------------------- small props ----------------------------- */

function Monitor({
  position,
  rotation = 0,
  p,
}: {
  position: [number, number, number]
  rotation?: number
  tint: string
  p: ScenePalette
}) {
  const screen = useSurfaceTexture('screen')
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 0.025, 20]} />
        <meshStandardMaterial color={p.deskLeg} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.11, 0]} castShadow>
        <boxGeometry args={[0.045, 0.18, 0.045]} />
        <meshStandardMaterial color={p.deskLeg} roughness={0.5} />
      </mesh>
      <RoundedBox args={[0.74, 0.46, 0.045]} radius={0.025} smoothness={4} position={[0, 0.35, 0]} castShadow>
        <meshStandardMaterial color={p.monitorShell} roughness={0.45} />
      </RoundedBox>
      <mesh position={[0, 0.35, 0.024]}>
        <planeGeometry args={[0.68, 0.4]} />
        <meshStandardMaterial map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.4} />
      </mesh>
    </group>
  )
}

function Chair({ position, rotation, p }: { position: [number, number, number]; rotation: number; p: ScenePalette }) {
  return <group position={position} rotation={[0, rotation, 0]}>
    <Block size={[0.55, 0.12, 0.52]} at={[0, 0.52, 0]} color={p.chairSeat} radius={0.055} />
    <group position={[0, 0.88, -0.22]} rotation={[-0.1, 0, 0]}>
      <Block size={[0.51, 0.57, 0.085]} color={p.chairSeat} radius={0.04} />
      {[-0.16, -0.08, 0, 0.08, 0.16].map((x) => <Block key={x} size={[0.015, 0.45, 0.015]} at={[x, 0, 0.049]} color={p.chairBase} radius={0.005} />)}
    </group>
    {[-1, 1].map((side) => <group key={side}>
      <Block size={[0.035, 0.22, 0.035]} at={[side * 0.31, 0.6, 0]} color={p.chairBase} />
      <Block size={[0.07, 0.04, 0.3]} at={[side * 0.31, 0.73, 0]} color={p.chairSeat} radius={0.018} />
    </group>)}
    <mesh position={[0, 0.27, 0]} castShadow><cylinderGeometry args={[0.045, 0.055, 0.45, 12]} /><meshStandardMaterial color={p.deskLeg} metalness={0.7} roughness={0.3} /></mesh>
    {Array.from({ length: 5 }, (_, i) => <group key={i} rotation={[0, i * Math.PI * 2 / 5, 0]}>
      <Block size={[0.045, 0.04, 0.34]} at={[0, 0.085, 0.15]} color={p.chairBase} radius={0.015} />
      <mesh position={[0, 0.046, 0.31]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.045, 0.045, 0.07, 12]} /><meshStandardMaterial color="#242a30" /></mesh>
    </group>)}
  </group>
}

function Plant({ position, p }: { position: [number, number, number]; p: ScenePalette }) {
  return <group position={position}>
    <mesh position={[0, 0.26, 0]} castShadow receiveShadow><cylinderGeometry args={[0.25, 0.19, 0.52, 24]} /><meshStandardMaterial color={p.potColor} roughness={0.8} /></mesh>
    <mesh position={[0, 0.525, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.22, 24]} /><meshStandardMaterial color="#443c30" /></mesh>
    {Array.from({ length: 11 }, (_, i) => <group key={i} rotation={[0, i * 2.4, 0]}>
      <mesh position={[0.06, 0.8 + (i % 3) * 0.16, 0]} rotation={[0, 0, -0.18 - (i % 3) * 0.15]} castShadow><cylinderGeometry args={[0.009, 0.015, 0.8, 6]} /><meshStandardMaterial color="#5d7650" /></mesh>
      <mesh position={[0.19, 1.03 + (i % 3) * 0.17, 0]} rotation={[0, 0, -0.65]} scale={[0.13, 0.33, 0.055]} castShadow><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color={p.foliage[i % 2]} roughness={0.7} /></mesh>
    </group>)}
  </group>
}

/* ------------------------------ team zone ------------------------------ */

function DeskPod({ zone, tint, p }: { zone: ZoneLayout; tint: string; p: ScenePalette }) {
  const [x, z] = zone.origin
  const screenTint = themedTint(tint, p, p.privacyMix)
  const oak = useSurfaceTexture('oak')

  return (
    <group position={[x, 0, z]}>
      {/* two desk tops back to back */}
      {[-0.62, 0.62].map((dz) => (
        <Fragment key={dz}>
          <RoundedBox args={[4.2, 0.09, 1.05]} radius={0.035} smoothness={4} position={[0, 1.075, dz]} castShadow receiveShadow>
            <meshStandardMaterial map={oak} color={p.deskTop} roughness={0.58} />
          </RoundedBox>
          {[-1.9, 1.9].map((lx) => (
            <mesh key={lx} position={[lx, 0.52, dz]} castShadow>
              <boxGeometry args={[0.065, 1.04, 0.36]} />
              <meshStandardMaterial color={p.deskLeg} roughness={0.5} metalness={0.15} />
            </mesh>
          ))}
        </Fragment>
      ))}

      {/* privacy screen down the middle — kept below head height on purpose */}
      <RoundedBox args={[4.2, 0.32, 0.07]} radius={0.02} smoothness={4} position={[0, 1.24, 0]} castShadow>
        <meshStandardMaterial color={screenTint} roughness={0.8} />
      </RoundedBox>

      {/* Monitors sit inboard of the standing spots (x = ±1.15) so a screen is
          never directly in front of an agent's head. */}
      <Monitor position={[-1.15, 1.12, -0.4]} rotation={Math.PI} tint={tint} p={p} />
      <Monitor position={[1.15, 1.12, -0.4]} rotation={Math.PI} tint={tint} p={p} />
      <Monitor position={[-1.15, 1.12, 0.4]} tint={tint} p={p} />
      <Monitor position={[1.15, 1.12, 0.4]} tint={tint} p={p} />

      {[-1, 1].flatMap((side) => [-1.15, 1.15].map((x) => <DeskAccessories key={side + ':' + x} x={x} z={side * 1.02} facing={side < 0 ? Math.PI : 0} p={p} />))}
      {/* Chairs are pushed back and outboard — as if the agents stood up to
          work — so they never sit between the camera and a minifigure. */}
      <Chair position={[-2.2, 0, -POD_CHAIR_Z]} rotation={0.35} p={p} />
      <Chair position={[2.2, 0, -POD_CHAIR_Z]} rotation={-0.35} p={p} />
      <Chair position={[-2.2, 0, POD_CHAIR_Z]} rotation={Math.PI - 0.35} p={p} />
      <Chair position={[2.2, 0, POD_CHAIR_Z]} rotation={Math.PI + 0.35} p={p} />
    </group>
  )
}

function Lounge({ zone, p }: { zone: ZoneLayout; p: ScenePalette }) {
  const [x, z] = zone.origin
  return <group position={[x, 0, z]}>
    <group position={[0, 0, -1.2]}>
      <Block size={[4.8, 0.32, 0.86]} at={[0, 0.36, 0]} color={p.sofa} radius={0.12} />
      <Block size={[4.8, 0.62, 0.22]} at={[0, 0.66, -0.34]} color={p.sofaBack} radius={0.09} />
      {[-2.36, 2.36].map((lx) => <Block key={lx} size={[0.22, 0.5, 0.92]} at={[lx, 0.48, 0]} color={p.sofaBack} radius={0.08} />)}
      {[-1.55, 0, 1.55].map((lx) => <Block key={lx} size={[1.47, 0.13, 0.7]} at={[lx, 0.55, 0.03]} color={p.sofaBack} radius={0.05} />)}
      {[-2.1, 2.1].flatMap((lx) => [-0.28, 0.28].map((lz) => <Block key={lx + ':' + lz} size={[0.08, 0.24, 0.08]} at={[lx, 0.12, lz]} color={p.deskLeg} />))}
      {[-1.8, 1.8].map((lx) => <group key={lx} position={[lx, 0.78, -0.03]} rotation={[-0.2, 0, lx * 0.06]}><Block size={[0.46, 0.43, 0.15]} color={lx < 0 ? '#b18c64' : '#809b8d'} radius={0.065} /></group>)}
    </group>
    <group position={[3.65, 0, 0.1]}>
      <mesh position={[0, 0.43, 0]} castShadow receiveShadow><cylinderGeometry args={[0.65, 0.65, 0.09, 40]} /><meshStandardMaterial color={p.deskTop} roughness={0.5} /></mesh>
      {[-0.36, 0.36].map((lx) => <Block key={lx} size={[0.07, 0.4, 0.55]} at={[lx, 0.2, 0]} color={p.deskLeg} />)}
      <Block size={[0.4, 0.025, 0.28]} at={[0, 0.49, 0]} color="#688376" radius={0.006} />
    </group>
  </group>
}

function TeamZone({
  team,
  zone,
  headcount,
  p,
}: {
  team: Team
  zone: ZoneLayout
  headcount: number
  p: ScenePalette
}) {
  const [x, z] = zone.origin
  const selected = useWorkspace((s) => s.selectedId)

  return (
    <group>
      {/* rug — keeps the "no sharp edges" language on the floor too */}
      <Rug
        width={zone.rug[0]}
        depth={zone.rug[1]}
        radius={0.6}
        color={themedTint(team.tint, p)}
        position={[x, 0.015, z]}
      />

      {zone.kind === 'pod' ? <DeskPod zone={zone} tint={team.tint} p={p} /> : <Lounge zone={zone} p={p} />}

      {/* Zone signage. drei's <Text> would pull a font over the network, so the
          label is plain DOM projected into the scene instead. */}
      {!selected && <Html
        center
        position={[x, 0.04, z + zone.rug[1] / 2 - 0.2]}
        zIndexRange={[10, 0]}
        // Signage is decoration, not a control: keeping it out of the pointer
        // and accessibility trees stops it swallowing canvas clicks.
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          aria-hidden
          className="hidden sm:flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-glass-strong px-3 py-1 text-xs shadow-sm"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: team.tint }} />
          <span className="text-sm font-semibold tracking-wide text-ink">{team.name}</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-soft">
            {headcount}
          </span>
        </div>
      </Html>}
    </group>
  )
}

/* -------------------------------- room -------------------------------- */

function Room({ plan, p }: { plan: Floorplan; p: ScenePalette }) {
  const W = plan.room.width
  const D = plan.room.depth
  const backZ = Math.min(...Object.values(plan.zones).map((z) => z.origin[1])) - 4.6
  const centreZ = backZ + D / 2
  const wood = useSurfaceTexture('oak')
  return <group>
    <RoundedBox args={[W, 0.22, D]} radius={0.1} position={[0, -0.115, centreZ]} receiveShadow>
      <meshStandardMaterial map={wood} color={p.floor} roughness={0.68} />
    </RoundedBox>
    <Block size={[W, 3.8, 0.16]} at={[0, 1.9, backZ]} color={p.wallBack} radius={0.03} />
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side * (W / 4 + 1.3), 2.05, backZ + 0.095]}>
        <planeGeometry args={[W / 2 - 3.4, 2.65]} />
        <meshStandardMaterial color={p.window} emissive={p.window} emissiveIntensity={0.5} roughness={0.15} metalness={0.1} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => <Block key={i} size={[0.045, 2.75, 0.075]} at={[side * (3.3 + i * (W / 2 - 3.7) / 5), 2.05, backZ + 0.15]} color={p.mullion} radius={0.005} />)}
      <Block size={[W / 2 - 3.35, 0.08, 0.32]} at={[side * (W / 4 + 1.3), 0.72, backZ + 0.17]} color={p.deskTop} radius={0.015} />
      {/* Low return walls preserve the view of the people and furniture. */}
      <Block size={[0.16, 0.72, D]} at={[side * W / 2, 0.36, centreZ]} color={p.wallSide} radius={0.035} />
    </group>)}
    <ArchitecturalDetails width={W} back={backZ} p={p} />
    {Object.values(plan.zones).filter((z) => z.kind === 'pod').map((z) => <group key={z.id} position={[z.origin[0], 3.55, z.origin[1]]}>
      <Block size={[3.8, 0.07, 0.15]} color="#3c4947" radius={0.025} />
      <mesh position={[0, -0.043, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[3.65, 0.09]} /><meshBasicMaterial color="#fff1d2" side={THREE.DoubleSide} /></mesh>
      {[-1.5, 1.5].map((x) => <Block key={x} size={[0.014, 0.65, 0.014]} at={[x, 0.36, 0]} color={p.mullion} radius={0.004} />)}
    </group>)}
  </group>
}

/* ------------------------------- export -------------------------------- */

export function Office() {
  const agents = useWorkspace((s) => s.agents)
  const teams = useWorkspace((s) => s.teams)
  const { plan } = useFloorplan()
  const p = useScenePalette()
  const counts = useMemo(() => teamHeadcount(agents, teams), [agents, teams])

  const halfW = plan.room.width / 2
  const backZ = Math.min(...Object.values(plan.zones).map((z) => z.origin[1])) - 4.4

  return (
    <group>
      <Room plan={plan} p={p} />
      {teams.map((team) => {
        const zone = plan.zones[team.id]
        if (!zone) return null
        return <TeamZone key={team.id} team={team} zone={zone} headcount={counts[team.id] ?? 0} p={p} />
      })}
      <Plant position={[-halfW + 1.6, 0, backZ + 3]} p={p} />
      <Plant position={[halfW - 1.6, 0, backZ + 3]} p={p} />
      <Plant position={[-halfW + 1.9, 0, backZ + plan.room.depth - 4]} p={p} />
      <Plant position={[halfW - 1.9, 0, backZ + plan.room.depth - 4]} p={p} />
    </group>
  )
}
