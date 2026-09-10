import { useMemo, useRef, useState } from 'react'
import { Html, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { Minifigure } from './Minifigure'
import { ROLE_BY_ID, type Seat } from '../data/org'
import { useWorkspace, type Agent } from '../state/workspaceStore'
import { useScenePalette } from '../theme/palette'
import { useMotion } from './motion'

/** Metre-scaled characters: 1.86m tall beside 1.12m standing desks. */
const FIGURE_SCALE = 1

const STATUS_VAR: Record<Agent['status'], string> = {
  working: 'var(--color-ok)',
  idle: 'var(--color-neutral)',
  blocked: 'var(--color-warn)',
}

interface Props {
  agent: Agent
  /** Where this agent stands, derived from its index within its team. */
  seat: Seat
}

/**
 * One clickable office character. Owns its own hover state locally (so hovering never
 * re-renders the whole scene) and pushes selection up to the store, which is
 * what the 2D overlay outside the Canvas listens to.
 */
export function LegoAgent({ agent, seat }: Props) {
  const group = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  const select = useWorkspace((s) => s.select)
  const hover = useWorkspace((s) => s.hover)
  const showLabels = useWorkspace((s) => s.showLabels)
  const isSelected = useWorkspace((s) => s.selectedId === agent.id)

  const role = ROLE_BY_ID[agent.roleId]
  const palette = useScenePalette()
  const target = useRef(new THREE.Vector3())
  const activityRing = useRef<THREE.Mesh>(null)
  const motion = useRef({ distance: 0, speed: 0 })
  const time = useRef(0)
  // Stable per-agent phase: movement stays organic without jumping after a render.
  const phase = useMemo(
    () => [...agent.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.173,
    [agent.id],
  )

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const paused = useMotion.getState().paused
    if (paused) { motion.current.speed = 0; return }
    time.current += Math.min(delta, 0.05)
    const t = time.current + phase
    const focusScale = hovered || isSelected ? 0.28 : 1
    let dx = 0
    let dz = 0
    let facing = seat.rotation

    // Every status has a readable physical behaviour. Working agents shift at
    // their station, idle agents take a slow loop, and blocked agents pace.
    if (agent.status === 'working') {
      dx = 0
      dz = 0
      facing += Math.sin(t * 0.75) * 0.045
    } else if (agent.status === 'idle') {
      dx = Math.cos(t * 0.55) * 0.4 * focusScale
      dz = Math.sin(t * 0.55) * 0.12 * focusScale
      facing = Math.atan2(-Math.sin(t * 0.55) * 0.22, Math.cos(t * 0.55) * 0.066)
    } else {
      dx = Math.sin(t * 0.65) * 0.45 * focusScale
      dz = 0
      facing = Math.atan2(Math.cos(t * 0.65), 0.03)
    }

    // Reassigning a team changes `seat`; the same damped movement carries the
    // figure to its new home instead of teleporting it.
    target.current.set(seat.position[0] + dx, seat.position[1], seat.position[2] + dz)
    const beforeX = g.position.x
    const beforeZ = g.position.z
    g.position.lerp(target.current, 1 - Math.pow(0.001, delta))
    const travelled = Math.hypot(g.position.x - beforeX, g.position.z - beforeZ)
    motion.current.distance += travelled
    motion.current.speed = paused ? 0 : travelled / Math.max(delta, 0.001)

    // Shortest-path rotation toward the movement or workstation.
    const dr = Math.atan2(Math.sin(facing - g.rotation.y), Math.cos(facing - g.rotation.y))
    g.rotation.y += dr * (1 - Math.pow(0.002, delta))

    // Keep shoes grounded; selection is indicated by the ring, not levitation.
    g.position.y = seat.position[1]

    if (activityRing.current) {
      const pulse = 1 + Math.sin(t * 2.2) * 0.04
      activityRing.current.scale.setScalar(pulse)
      activityRing.current.rotation.z = t * 0.16
    }
  })

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation() // otherwise the desk behind the agent also reports a hover
    setHovered(true)
    hover(agent.id)
  }
  const onOut = () => {
    setHovered(false)
    hover(null)
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation() // keeps Canvas onPointerMissed from immediately deselecting
    select(agent.id)
  }

  const labelVisible = showLabels || hovered || isSelected

  return (
    <group ref={group} name={`agent-${agent.id}`} position={seat.position} rotation={[0, seat.rotation, 0]} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
      {/* Invisible capsule enlarges the hit area — clicking a 12cm arm is fiddly. */}
      <mesh position={[0, 0.82, 0]} visible={false} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
        <capsuleGeometry args={[0.42, 1.05, 4, 12]} />
      </mesh>

      <group scale={FIGURE_SCALE}>
        <Minifigure
          torsoColor={role.color}
          legColor={palette.legColor}
          animate
          activity={agent.status}
          variant={Number(agent.id.replace(/\D/g, '').slice(-3)) || 0}
          motion={motion}
          modelUrl={agent.modelUrl}
        />
      </group>

      {/* Always-on ground disc. Keeps every agent legible against a busy rug,
          and gives the hover/selection rings something to sit on. */}
      <mesh ref={activityRing} position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.56, 40]} />
        <meshBasicMaterial color={role.color} transparent opacity={0.16} depthWrite={false} />
      </mesh>

      {/* Selection ring on the floor */}
      {isSelected && (
        <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 56]} />
          <meshBasicMaterial color={palette.selectionRing} transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
      {hovered && !isSelected && (
        <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.58, 56]} />
          <meshBasicMaterial color={palette.hoverRing} transparent opacity={0.75} depthWrite={false} />
        </mesh>
      )}

      {/* Floating name tag: the one place drei's <Html> earns its cost, because
          it has to track a moving 3D point. The config panel does not. */}
      {labelVisible && (
        <Html
          center
          position={[0, 2.25, 0]}
          // No distanceFactor on purpose: these are UI pins, not scene objects,
          // so they hold a constant, readable size at any zoom level.
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-glass-strong px-3 py-1.5 shadow-lg shadow-black/20 backdrop-blur">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_VAR[agent.status] }} />
            <span className="text-[13px] font-semibold text-ink">{agent.name}</span>
            <span className="text-[12px] text-ink-faint">{role.label}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
