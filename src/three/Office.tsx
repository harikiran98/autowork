import { Fragment, useEffect, useMemo } from 'react'
import { Html, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { cafeteriaOrigin, meetingRooms, POD_CHAIR_Z, type Floorplan, type ZoneLayout } from '../data/layout'
import type { Seat, Team } from '../data/org'
import { useWorkspace, teamHeadcount } from '../state/workspaceStore'
import { useFloorplan } from '../state/useFloorplan'
import { themedTint, useScenePalette, type ScenePalette } from '../theme/palette'
import { useMotion } from './motion'

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
  workspaceName,
  p,
}: {
  position: [number, number, number]
  rotation?: number
  workspaceName: string
  tint: string
  p: ScenePalette
}) {
  const screen = useSurfaceTexture('screen', workspaceName)
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
      {/* Radius stays below half the 45mm panel depth, or the shell inflates. */}
      <RoundedBox args={[0.74, 0.46, 0.045]} radius={0.02} smoothness={4} position={[0, 0.35, 0]} castShadow>
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

/* ------------------------------ team zone ------------------------------ */

function DeskPod({ zone, tint, p, workspaceName }: { zone: ZoneLayout; tint: string; p: ScenePalette; workspaceName: string }) {
  const [x, z] = zone.origin
  const screenTint = themedTint(tint, p, p.privacyMix)
  const oak = useSurfaceTexture('oak')
  const workstationRows = Math.max(1, Math.ceil(zone.headcount / 4))

  return (
    <group position={[x, 0, z]} name={`desk-pod-${zone.id}`}>
      {/* Each group of four teammates gets a complete back-to-back desk row.
          This keeps dynamically-added agents seated at real workstations. */}
      {Array.from({ length: workstationRows }, (_, row) => row).flatMap((row) => [-1, 1].map((side) => {
        const dz = side * (0.62 + row * 1.3)
        return (
        <Fragment key={`${row}:${side}`}>
          <RoundedBox args={[4.2, 0.09, 1.05]} radius={0.035} smoothness={4} position={[0, 1.075, dz]} castShadow receiveShadow>
            <meshStandardMaterial map={oak} color={p.deskTop} roughness={0.58} />
          </RoundedBox>
          {[-1.9, 1.9].map((lx) => (
            <mesh key={lx} position={[lx, 0.52, dz]} castShadow>
              <boxGeometry args={[0.065, 1.04, 0.36]} />
              <meshStandardMaterial color={p.deskLeg} roughness={0.5} metalness={0.15} />
            </mesh>
          ))}
          <Monitor position={[-1.15, 1.12, dz - side * .22]} rotation={side < 0 ? Math.PI : 0} workspaceName={workspaceName} tint={tint} p={p} />
          <Monitor position={[1.15, 1.12, dz - side * .22]} rotation={side < 0 ? Math.PI : 0} workspaceName={workspaceName} tint={tint} p={p} />
          {[-1.15, 1.15].map((accessoryX) => <DeskAccessories key={accessoryX} x={accessoryX} z={dz + side * .4} facing={side < 0 ? Math.PI : 0} p={p} />)}
        </Fragment>
      )}))}

      {/* privacy screen down the middle — kept below head height on purpose */}
      <RoundedBox args={[4.2, 0.32, 0.07]} radius={0.02} smoothness={4} position={[0, 1.24, 0]} castShadow>
        <meshStandardMaterial color={screenTint} roughness={0.8} />
      </RoundedBox>

      {/* Every active teammate has a real chair, including dynamically-added rows. */}
      {Array.from({ length: workstationRows }, (_, row) => row).flatMap((row) => [-1, 1].flatMap((side) => [-1.15, 1.15].map((chairX) => {
        const chairZ = side * (POD_CHAIR_Z + row * 1.3)
        return <Chair key={`${row}:${side}:${chairX}`} position={[chairX, 0, chairZ]} rotation={side > 0 ? Math.PI : 0} p={p} />
      })))}
    </group>
  )
}

function Lounge({ zone, p }: { zone: ZoneLayout; p: ScenePalette }) {
  const [x, z] = zone.origin
  return <group position={[x, 0, z]}>
    {Array.from({ length: Math.max(1, Math.ceil(zone.headcount / 3)) }, (_, row) => <group key={row} name={`lounge-sofa-${row}`} position={[0, 0, -1.2 + row * 1.75]}>
      {/* Seating surface only, grouped so the scene audit can assert that a
          seated character's thighs and shins clear it instead of sinking in. */}
      <group name={`lounge-cushions-${row}`}>
        <Block size={[4.8, 0.32, 0.86]} at={[0, 0.36, 0]} color={p.sofa} radius={0.12} />
        {[-1.55, 0, 1.55].map((lx) => <Block key={lx} size={[1.47, 0.13, 0.7]} at={[lx, 0.55, 0.03]} color={p.sofaBack} radius={0.05} />)}
      </group>
      <Block size={[4.8, 0.62, 0.22]} at={[0, 0.66, -0.34]} color={p.sofaBack} radius={0.09} />
      {[-2.36, 2.36].map((lx) => <Block key={lx} size={[0.22, 0.5, 0.92]} at={[lx, 0.48, 0]} color={p.sofaBack} radius={0.08} />)}
      {[-2.1, 2.1].flatMap((lx) => [-0.28, 0.28].map((lz) => <Block key={lx + ':' + lz} size={[0.08, 0.24, 0.08]} at={[lx, 0.12, lz]} color={p.deskLeg} />))}
      {[-1.8, 1.8].map((lx) => <group key={lx} position={[lx, 0.78, -0.03]} rotation={[-0.2, 0, lx * 0.06]}><Block size={[0.46, 0.43, 0.15]} color={lx < 0 ? '#b18c64' : '#809b8d'} radius={0.065} /></group>)}
    </group>)}
    <group position={[3.65, 0, 0.1]}>
      <mesh position={[0, 0.43, 0]} castShadow receiveShadow><cylinderGeometry args={[0.65, 0.65, 0.09, 40]} /><meshStandardMaterial color={p.deskTop} roughness={0.5} /></mesh>
      {[-0.36, 0.36].map((lx) => <Block key={lx} size={[0.07, 0.4, 0.55]} at={[lx, 0.2, 0]} color={p.deskLeg} />)}
      <Block size={[0.4, 0.025, 0.28]} at={[0, 0.49, 0]} color="#688376" radius={0.006} />
    </group>
  </group>
}

function Cafeteria({ plan, p }: { plan: Floorplan; p: ScenePalette }) {
  const [x, z] = cafeteriaOrigin(plan)
  return <group position={[x, 0, z]} name="office-cafeteria">
    <Rug width={5.8} depth={4.1} radius={0.65} color={themedTint('#d7b887', p, 0.28)} position={[0, 0.018, 0]} />
    {/* Kitchenette: fridge, counter, sink, coffee machine and stocked shelves. */}
    <Block size={[0.85, 2.0, 0.72]} at={[2.05, 1, -1.5]} color={p.mullion} radius={0.08} metal={0.25} />
    <Block size={[0.06, 0.34, 0.035]} at={[1.7, 1.18, -1.12]} color={p.chairBase} radius={0.012} />
    <Block size={[2.75, 0.78, 0.7]} at={[0.48, 0.39, -1.62]} color={p.sofaBack} radius={0.08} />
    <Block size={[2.9, 0.09, 0.82]} at={[0.48, 0.82, -1.62]} color={p.deskTop} radius={0.035} />
    <Block size={[0.68, 0.52, 0.48]} at={[1.58, 1.13, -1.58]} color="#343c43" radius={0.07} />
    <Block size={[0.4, 0.16, 0.04]} at={[1.58, 1.15, -1.32]} color="#aab6b6" radius={0.02} />
    <mesh position={[1.58, 0.9, -1.28]}><cylinderGeometry args={[0.05, 0.045, 0.11, 16]} /><meshStandardMaterial color="#d8c6aa" /></mesh>
    <Block size={[0.72, 0.035, 0.48]} at={[-0.2, 0.87, -1.59]} color="#647b80" radius={0.04} metal={0.45} />
    <mesh position={[-0.2, 1.05, -1.56]} rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.14, 0.022, 8, 24, Math.PI]} /><meshStandardMaterial color={p.mullion} metalness={0.8} roughness={0.25} /></mesh>
    {[-0.55, 0.25, 1.05].map((sx, index) => <group key={sx} position={[sx, 1.72, -1.84]}>
      <Block size={[0.65, 0.05, 0.28]} color={p.deskTop} radius={0.015} />
      {[0, 1, 2].map((jar) => <mesh key={jar} position={[-0.2 + jar * 0.2, 0.15, 0]}><cylinderGeometry args={[0.055, 0.055, 0.24, 12]} /><meshStandardMaterial color={['#a6b7a4', '#c8ad84', '#9ca9bb'][(index + jar) % 3]} roughness={0.5} /></mesh>)}
    </group>)}
    {/* Cafe table and four upholstered stools align with the break destinations. */}
    <mesh position={[0, 0.7, 0.08]} castShadow receiveShadow><cylinderGeometry args={[0.78, 0.78, 0.1, 40]} /><meshStandardMaterial color={p.deskTop} roughness={0.55} /></mesh>
    <mesh position={[0, 0.35, 0.08]} castShadow><cylinderGeometry args={[0.08, 0.12, 0.68, 16]} /><meshStandardMaterial color={p.deskLeg} metalness={0.45} roughness={0.35} /></mesh>
    {[[-0.85, -0.55], [0.85, -0.55], [-0.85, 0.7], [0.85, 0.7]].map(([sx, sz], index) => <group key={index} position={[sx, 0, sz]}>
      <mesh position={[0, 0.52, 0]} castShadow><cylinderGeometry args={[0.3, 0.3, 0.12, 24]} /><meshStandardMaterial color={index % 2 ? p.sofa : p.sofaBack} roughness={0.7} /></mesh>
      <mesh position={[0, 0.26, 0]} castShadow><cylinderGeometry args={[0.045, 0.07, 0.48, 12]} /><meshStandardMaterial color={p.deskLeg} metalness={0.5} roughness={0.35} /></mesh>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.18, 0.025, 8, 24]} /><meshStandardMaterial color={p.deskLeg} metalness={0.5} /></mesh>
    </group>)}
    <Html center position={[0, 2.15, -1.7]} style={{ pointerEvents: 'none' }}><div aria-hidden className="whitespace-nowrap rounded-full border border-line bg-glass-strong px-3 py-1 text-[9px] font-bold tracking-[.08em] text-ink shadow-md"><span className="uppercase">Cafeteria</span><span className="ml-1.5 font-medium normal-case tracking-normal text-ink-faint">coffee & reset</span></div></Html>
  </group>
}

function TeamZone({
  team,
  zone,
  headcount,
  p,
  workspaceName,
}: {
  team: Team
  zone: ZoneLayout
  headcount: number
  p: ScenePalette
  workspaceName: string
}) {
  const [x, z] = zone.origin
  const selected = useWorkspace((s) => s.selectedId)

  return (
    <group name={`team-zone-${team.id}`} onClick={(event) => { event.stopPropagation(); useWorkspace.getState().select(null); useMotion.getState().focus([x, 1, z]) }}>
      {/* rug — keeps the "no sharp edges" language on the floor too */}
      <Rug
        width={zone.rug[0]}
        depth={zone.rug[1]}
        radius={0.6}
        color={themedTint(team.tint, p)}
        position={[x, 0.015, z]}
      />

      {zone.kind === 'pod' ? <DeskPod zone={zone} tint={team.tint} p={p} workspaceName={workspaceName} /> : <Lounge zone={zone} p={p} />}

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

function ManagerCubicles({ agents, seats, p, workspaceName }: { agents: ReturnType<typeof useWorkspace.getState>['agents']; seats: Record<string, Seat>; p: ScenePalette; workspaceName: string }) {
  const managers = agents.filter((agent) => agent.isTeamLead || agents.some((child) => child.parentAgentId === agent.id))
  return <group name="manager-cubicles">{managers.map((agent) => {
    const seat = seats[agent.id]
    if (!seat || seat.place === 'bench') return null
    return <group key={agent.id} name={`cubicle-${agent.id}`} position={seat.position} rotation={[0, seat.rotation, 0]} onClick={(event) => { event.stopPropagation(); useWorkspace.getState().select(agent.id); useMotion.getState().focus([seat.position[0], 1, seat.position[2]]) }}>
      <RoundedBox args={[1.8, 1.52, .1]} radius={.045} smoothness={4} position={[0, .78, -.8]} castShadow><meshStandardMaterial color={p.sofaBack} roughness={.78} /></RoundedBox>
      {[-1, 1].map((side) => <RoundedBox key={side} args={[.1, 1.52, 1.7]} radius={.045} smoothness={4} position={[side * .85, .78, 0]} castShadow><meshStandardMaterial color={p.sofa} roughness={.8} /></RoundedBox>)}
      {/* The corner radius must stay under half the thinnest dimension. At the
          old .08 on a 45mm mat, RoundedBox over-extruded it into a 34cm slab
          that sank through the floor and stepped up under the chair. */}
      <RoundedBox args={[1.82, .045, 1.72]} radius={.02} smoothness={4} position={[0, .025, 0]} receiveShadow><meshStandardMaterial color={p.rugMix > .2 ? p.ceilingPanel : p.wallSide} roughness={.95} /></RoundedBox>
      <RoundedBox args={[1.5, .09, .68]} radius={.04} smoothness={4} position={[0, 1.04, .52]} castShadow receiveShadow><meshStandardMaterial color={p.deskTop} roughness={.58} /></RoundedBox>
      {[-.58, .58].map((x) => <Block key={x} size={[.06, 1, .34]} at={[x, .52, .54]} color={p.deskLeg} radius={.018} />)}
      <Monitor position={[0, 1.08, .51]} rotation={Math.PI} workspaceName={workspaceName} tint={agent.color} p={p} />
      <Chair position={[0, 0, 0]} rotation={seat.rotation} p={p} />
      <Html center distanceFactor={6} position={[0, 1.72, -.81]} style={{ pointerEvents: 'none' }}><div aria-hidden className="whitespace-nowrap rounded-full border border-line bg-glass-strong px-2.5 py-1 text-[9px] font-bold text-ink shadow-md">{agent.name} · {agent.isTeamLead ? 'team lead' : 'manager'}</div></Html>
    </group>
  })}</group>
}

function MeetingRooms({ plan, teams, p }: { plan: Floorplan; teams: Team[]; p: ScenePalette }) {
  const jobs = useWorkspace((state) => state.teamJobs)
  const rooms = meetingRooms(plan, teams)
  return <group name="meeting-room-wing">{rooms.map((room) => {
    const team = room.teamId ? teams.find((item) => item.id === room.teamId) : undefined
    const active = Boolean(team && jobs.some((job) => job.teamId === team.id && (job.status === 'planning' || job.status === 'delegated')))
    const label = active && team ? team.name : room.defaultName
    return <group key={room.id} name={room.id} position={[room.position[0], 0, room.position[1]]} onClick={(event) => { event.stopPropagation(); useWorkspace.getState().select(null); useMotion.getState().focus([room.position[0], 1, room.position[1]]) }}>
      <Rug width={3.25} depth={3.25} radius={.28} color={themedTint(team?.tint ?? '#9ca9bb', p, .2)} position={[0, .018, 0]} />
      <RoundedBox args={[3.3, 1.35, .07]} radius={.035} smoothness={4} position={[0, .7, -1.58]} castShadow><meshPhysicalMaterial color={p.window} transparent opacity={.54} roughness={.2} /></RoundedBox>
      {[-1, 1].map((side) => <RoundedBox key={side} args={[.07, 1.35, 3.2]} radius={.035} smoothness={4} position={[side * 1.62, .7, 0]} castShadow><meshPhysicalMaterial color={p.window} transparent opacity={.42} roughness={.22} /></RoundedBox>)}
      <mesh position={[0, .72, 0]} castShadow receiveShadow><cylinderGeometry args={[.73, .73, .09, 40]} /><meshStandardMaterial color={p.deskTop} roughness={.55} /></mesh>
      <mesh position={[0, .36, 0]} castShadow><cylinderGeometry args={[.08, .12, .7, 16]} /><meshStandardMaterial color={p.deskLeg} metalness={.35} roughness={.4} /></mesh>
      {Array.from({ length: 6 }, (_, chair) => {
        const angle = chair / 6 * Math.PI * 2
        return <Chair key={chair} position={[Math.cos(angle) * .92, 0, Math.sin(angle) * .78]} rotation={Math.atan2(-Math.cos(angle), -Math.sin(angle))} p={p} />
      })}
      <Html center distanceFactor={7} position={[0, 1.72, -1.56]} style={{ pointerEvents: 'none' }}><div aria-hidden className={`whitespace-nowrap rounded-full border px-3 py-1 text-[9px] font-bold shadow-md ${active ? 'border-accent bg-solid text-on-solid' : 'border-line bg-glass-strong text-ink-soft'}`}>{active ? `${label} · meeting` : label}</div></Html>
      {active && <mesh position={[0, .04, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.3, 1.38, 48]} /><meshBasicMaterial color={team?.tint ?? '#8fd6a6'} transparent opacity={.6} /></mesh>}
      <pointLight color={p.keyColor} intensity={active ? 5 : 2.5} distance={5} position={[0, 2.7, 0]} />
    </group>
  })}</group>
}

function Room({ plan, p, workspaceName }: { plan: Floorplan; p: ScenePalette; workspaceName: string }) {
  const W = plan.room.width
  const D = plan.room.depth
  const backZ = Math.min(...Object.values(plan.zones).map((z) => z.origin[1])) - 4.6
  const centreZ = backZ + D / 2
  const wood = useSurfaceTexture('oak')
  return <group>
    {/* Named so the scene audit can assert every wing stays on the floor
        instead of hanging over an edge as the room grows. */}
    <RoundedBox name="office-floor" args={[W, 0.22, D]} radius={0.1} position={[0, -0.115, centreZ]} receiveShadow>
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
    <ArchitecturalDetails width={W} back={backZ} p={p} workspaceName={workspaceName} />
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
  const workspaceName = useWorkspace((s) => s.profile.workspaceName || 'Workspace')
  const { plan, seats } = useFloorplan()
  const p = useScenePalette()
  const counts = useMemo(() => teamHeadcount(agents, teams), [agents, teams])

  return (
    <group>
      <Room plan={plan} p={p} workspaceName={workspaceName} />
      {teams.map((team) => {
        const zone = plan.zones[team.id]
        if (!zone) return null
        return <TeamZone key={team.id} team={team} zone={zone} headcount={counts[team.id] ?? 0} p={p} workspaceName={workspaceName} />
      })}
      <ManagerCubicles agents={agents} seats={seats} p={p} workspaceName={workspaceName} />
      <MeetingRooms plan={plan} teams={teams} p={p} />
      <Cafeteria plan={plan} p={p} />
    </group>
  )
}
