import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html, Line, OrbitControls, RoundedBox, Sparkles, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { useTheme } from '../state/themeStore'
import { useWorkspace, type Agent } from '../state/workspaceStore'
import { useMotion } from './motion'
import { useScenePalette, type ScenePalette } from '../theme/palette'
import { SceneProbe } from './SceneProbe'

type Point = [number, number, number]

/** Authored opening view. Double-click returns the camera to exactly this. */
const NEURAL_HOME: Point = [0, .4, 13.4]
const NEURAL_TARGET: Point = [0, -.25, 0]

/** The slice of OrbitControls this view drives; drei does not type `controls`. */
interface OrbitLike {
  target: THREE.Vector3
  enableDamping: boolean
  update: () => void
  saveState: () => void
  reset: () => void
}

/**
 * Restores the opening view when the shared motion store reports a reset.
 *
 * This used to be done by remounting <NeuralCanvas> with a changing `key`,
 * which threw away the WebGL context on every double-click — a visible flash,
 * a full scene rebuild, and enough context churn to hit the browser's live-
 * context limit in a long session. Moving the camera is the whole job.
 */
function CameraHome() {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as OrbitLike | null
  const reset = useMotion((state) => state.resetView)
  const taught = useRef(false)

  useEffect(() => {
    if (!controls) return
    // Teach the controls what "home" is once, then let them restore it.
    if (!taught.current) {
      camera.position.set(...NEURAL_HOME)
      controls.target.set(...NEURAL_TARGET)
      camera.lookAt(...NEURAL_TARGET)
      camera.updateProjectionMatrix()
      controls.update()
      controls.saveState()
      taught.current = true
      return
    }
    // Setting the transform is not enough on its own. OrbitControls keeps the
    // drag's leftover inertia in its own damping state, and reset() does not
    // clear it — so every frame afterwards re-applied a decaying slice of that
    // drag and the camera crawled away from home instead of snapping to it.
    // One update with damping off flushes the residual to zero; reset() then
    // restores the saved view against a clean slate.
    controls.enableDamping = false
    controls.update()
    controls.reset()
    controls.enableDamping = true
  }, [reset, camera, controls])

  return null
}

function Glow({ color, size = 1, opacity = .1 }: { color: string; size?: number; opacity?: number }) {
  return <Billboard><mesh scale={size}><circleGeometry args={[1, 48]} /><meshBasicMaterial color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh></Billboard>
}

function FlowLink({ from, to, color, delay, strong = false }: { from: Point; to: Point; color: string; delay: number; strong?: boolean }) {
  const signal = useRef<THREE.Mesh>(null)
  const elapsed = useRef(delay)
  const curve = useMemo(() => {
    const start = new THREE.Vector3(...from)
    const end = new THREE.Vector3(...to)
    const middle = start.clone().lerp(end, .5)
    middle.z += Math.max(.35, start.distanceTo(end) * .12)
    middle.y += Math.sin(delay * Math.PI * 2) * .28
    return new THREE.QuadraticBezierCurve3(start, middle, end)
  }, [from, to, delay])
  const points = useMemo(() => curve.getPoints(30), [curve])
  useFrame((_, delta) => {
    if (!signal.current || useMotion.getState().paused) return
    elapsed.current = (elapsed.current + delta * (strong ? .24 : .17)) % 1
    curve.getPoint(elapsed.current, signal.current.position)
    signal.current.scale.setScalar(.7 + Math.sin(elapsed.current * Math.PI) * .75)
  })
  return <group>
    <Line points={points} color={color} lineWidth={strong ? 1.35 : .72} transparent opacity={strong ? .48 : .25} depthWrite={false} />
    <mesh ref={signal}><sphereGeometry args={[strong ? .065 : .045, 12, 9]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
  </group>
}

function Core({ light, workspaceName }: { light: boolean; workspaceName: string }) {
  const shell = useRef<THREE.Group>(null)
  const heart = useRef<THREE.Mesh>(null)
  useFrame((state, delta) => {
    if (useMotion.getState().paused) return
    if (shell.current) { shell.current.rotation.y += delta * .09; shell.current.rotation.x -= delta * .035 }
    if (heart.current) heart.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 1.2) * .055)
  })
  return <group name="neural-core">
    <Glow color="#76b9aa" size={2.15} opacity={light ? .08 : .14} />
    <mesh ref={heart}><icosahedronGeometry args={[.62, 3]} /><meshPhysicalMaterial color="#91c7ba" emissive="#4b8c80" emissiveIntensity={light ? .45 : .9} roughness={.16} metalness={.08} clearcoat={1} clearcoatRoughness={.2} /></mesh>
    <group ref={shell}>
      <mesh rotation={[Math.PI / 2.6, 0, .15]}><torusGeometry args={[.98, .018, 8, 100]} /><meshBasicMaterial color="#9eadd4" transparent opacity={.75} /></mesh>
      <mesh rotation={[.2, Math.PI / 2.2, 0]}><torusGeometry args={[1.2, .01, 8, 100]} /><meshBasicMaterial color="#75ad9f" transparent opacity={.55} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, Math.PI / 2]}><torusGeometry args={[1.42, .007, 8, 100]} /><meshBasicMaterial color="#c6b08c" transparent opacity={.35} /></mesh>
    </group>
    <Html center position={[0, -1.35, 0]} style={{ pointerEvents: 'none' }}><div className="neural-label neural-core-label"><span className="neural-status-dot" style={{ background: '#78b9a9' }} />{workspaceName} coordination core</div></Html>
  </group>
}

const statusColor = (agent: Agent) => agent.status === 'working' ? '#6eb39e' : agent.status === 'blocked' ? '#c77b7b' : agent.status === 'break' ? '#c0a169' : '#899994'

function AgentNode({ agent, position, index, light }: { agent: Agent; position: Point; index: number; light: boolean }) {
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const selected = useWorkspace((state) => state.selectedId === agent.id)
  const select = useWorkspace((state) => state.select)
  const status = statusColor(agent)
  useCursor(hovered)
  useFrame((state, delta) => {
    if (!group.current || useMotion.getState().paused) return
    group.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * .72 + index * .68) * .075
    if (ring.current) ring.current.rotation.z += delta * (agent.status === 'working' ? .52 : .16)
  })
  return <group ref={group} name={`neural-agent-${agent.id}`} position={position}>
    <Glow color={agent.color} size={selected ? .92 : .7} opacity={light ? .06 : .1} />
    <mesh scale={selected || hovered ? 1.16 : 1} onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }} onPointerOut={() => setHovered(false)} onClick={(event) => { event.stopPropagation(); select(agent.id) }}>
      <dodecahedronGeometry args={[.29, 1]} /><meshStandardMaterial color={agent.color} emissive={agent.color} emissiveIntensity={light ? .18 : agent.status === 'working' ? .72 : .38} roughness={.34} metalness={.12} />
    </mesh>
    <mesh><sphereGeometry args={[.082, 14, 10]} /><meshBasicMaterial color={light ? '#f4f7f5' : '#e4eeeb'} toneMapped={false} /></mesh>
    <mesh ref={ring} rotation={[Math.PI / 2.6, 0, index * .7]}><torusGeometry args={[.43, selected ? .024 : .012, 6, 60]} /><meshBasicMaterial color={selected ? (light ? '#3d4b47' : '#eef5f3') : status} transparent opacity={selected ? .9 : .62} /></mesh>
    {(hovered || selected) && <Html center position={[0, .72, 0]} style={{ pointerEvents: 'none' }}><div className="neural-label"><span className="neural-status-dot" style={{ background: status }} /><strong>{agent.name}</strong><span>{agent.roleName}</span></div></Html>}
  </group>
}

function TeamNode({ name, tint, position, count, working }: { name: string; tint: string; position: Point; count: number; working: number }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => { if (ring.current && !useMotion.getState().paused) ring.current.rotation.z -= delta * (working ? .22 : .09) })
  return <group name={`neural-team-${name.toLowerCase().replace(/\s+/g, '-')}`} position={position}>
    <Glow color={tint} size={1.2} opacity={.08} />
    <mesh><octahedronGeometry args={[.4, 2]} /><meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={working ? .65 : .28} roughness={.42} metalness={.08} /></mesh>
    <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[.68, .014, 6, 72]} /><meshBasicMaterial color={tint} transparent opacity={.58} /></mesh>
    <Html center position={[0, -.86, 0]} style={{ pointerEvents: 'none' }}><div className="neural-label"><strong>{name}</strong><span>{working ? `${working} active · ` : ''}{count} agents</span></div></Html>
  </group>
}

function DataPlane({ light, palette }: { light: boolean; palette: ScenePalette }) {
  const grid = useRef<THREE.GridHelper>(null)
  useFrame((_, delta) => { if (grid.current && !useMotion.getState().paused) grid.current.position.z = (grid.current.position.z + delta * .035) % .5 })
  return <group position={[0, -4.02, -2.8]}><gridHelper ref={grid} args={[26, 52, palette.sofaBack, palette.wallSide]} material-transparent material-opacity={light ? .16 : .2} /></group>
}

/** A physical visualization room keeps this graph in the office's visual world. */
function CollaborationRoom({ light, palette }: { light: boolean; palette: ScenePalette }) {
  return <group name="neural-collaboration-room">
    <mesh position={[0, -4.12, -1.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[28, 24]} />
      <meshStandardMaterial color={palette.floor} roughness={.88} />
    </mesh>
    <mesh position={[0, 1.8, -8.2]} receiveShadow>
      <planeGeometry args={[28, 13]} />
      <meshStandardMaterial color={palette.wallBack} roughness={.92} />
    </mesh>
    {[-7.1, -3.55, 0, 3.55, 7.1].map((x) => <group key={x} position={[x, 2.1, -8.08]}>
      {/* Radius stays under half the 12cm panel depth so the glazing keeps its
          thickness instead of inflating into a slab. */}
      <RoundedBox args={[3.2, 5.35, .12]} radius={.055} smoothness={4}>
        <meshStandardMaterial color={palette.window} roughness={.38} metalness={.08} />
      </RoundedBox>
      <mesh position={[0, 0, .075]}><boxGeometry args={[.065, 5.2, .07]} /><meshStandardMaterial color={palette.mullion} /></mesh>
      <mesh position={[0, 0, .075]}><boxGeometry args={[3.05, .065, .07]} /><meshStandardMaterial color={palette.mullion} /></mesh>
    </group>)}
    <RoundedBox args={[19, .2, .22]} radius={.06} smoothness={4} position={[0, -1, -7.95]} castShadow>
      <meshStandardMaterial color={palette.deskTop} roughness={.62} />
    </RoundedBox>
    <mesh position={[0, -3.91, -.2]} receiveShadow castShadow>
      <cylinderGeometry args={[3.55, 3.72, .32, 64]} />
      <meshStandardMaterial color={palette.deskLeg} roughness={.5} metalness={.18} />
    </mesh>
    <mesh position={[0, -3.71, -.2]} receiveShadow>
      <cylinderGeometry args={[3.36, 3.36, .1, 64]} />
      <meshPhysicalMaterial color={palette.sofa} transparent opacity={light ? .5 : .42} roughness={.22} metalness={.08} transmission={.08} />
    </mesh>
    <mesh position={[0, -1.82, -.2]}>
      <cylinderGeometry args={[.025, .16, 3.7, 20, 1, true]} />
      <meshBasicMaterial color={palette.sofaBack} transparent opacity={light ? .16 : .24} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    <pointLight color={palette.keyColor} intensity={light ? 7 : 10} distance={18} position={[0, 6, 2]} />
  </group>
}

function NeuralGraph({ light, palette }: { light: boolean; palette: ScenePalette }) {
  const agents = useWorkspace((state) => state.agents)
  const teams = useWorkspace((state) => state.teams)
  const workspaceName = useWorkspace((state) => state.profile.workspaceName || 'Workspace')
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height))
  const compact = aspect < .72
  const visibleTeams = useMemo(() => teams.filter((team) => agents.some((agent) => agent.teamId === team.id)), [agents, teams])
  const teamPoints = useMemo(() => new Map(visibleTeams.map((team, index) => {
    const angle = index / Math.max(1, visibleTeams.length) * Math.PI * 2 + Math.PI / 5
    return [team.id, [Math.cos(angle) * (compact ? 2.05 : 4.25), Math.sin(angle) * 2.7, Math.sin(angle * 2) * .6] as Point]
  })), [visibleTeams, compact])
  const agentPoints = useMemo(() => new Map(agents.map((agent) => {
    const center = teamPoints.get(agent.teamId) ?? [0, 0, 0]
    const siblings = agents.filter((item) => item.teamId === agent.teamId)
    const index = siblings.findIndex((item) => item.id === agent.id)
    const angle = index / Math.max(1, siblings.length) * Math.PI * 2 + .4
    return [agent.id, [center[0] + Math.cos(angle) * (compact ? .76 : 1.28), center[1] + Math.sin(angle) * .88, center[2] + Math.sin(angle * 1.65) * .5] as Point]
  })), [agents, teamPoints, compact])
  return <>
    <ambientLight intensity={palette.ambient} /><hemisphereLight args={[palette.hemiSky, palette.hemiGround, palette.hemiIntensity]} /><pointLight color={palette.sofaBack} intensity={light ? 8 : 13} distance={13} position={[0, 2, 3]} /><pointLight color={palette.chairSeat} intensity={light ? 5 : 8} distance={14} position={[-5, -2, 4]} />
    <CollaborationRoom light={light} palette={palette} />
    <Sparkles count={light ? 24 : 36} scale={[14, 7, 10]} size={light ? .45 : .58} speed={.12} opacity={light ? .12 : .18} color={palette.ceilingPanel} />
    <DataPlane light={light} palette={palette} /><Core light={light} workspaceName={workspaceName} />
    {[...teamPoints.entries()].map(([id, point], index) => {
      const team = teams.find((item) => item.id === id)!
      const members = agents.filter((agent) => agent.teamId === id)
      return <group key={id}><FlowLink from={[0, 0, 0]} to={point} color={team.tint} delay={(index * .23) % 1} strong /><TeamNode name={team.name} tint={team.tint} position={point} count={members.length} working={members.filter((agent) => agent.status === 'working').length} /></group>
    })}
    {agents.map((agent, index) => {
      // Recursive reporting lines are visible directly: top-level agents link
      // to their team, while every deeper agent links to its immediate parent.
      const from = (agent.parentAgentId ? agentPoints.get(agent.parentAgentId) : undefined) ?? teamPoints.get(agent.teamId) ?? [0, 0, 0]
      const to = agentPoints.get(agent.id)!
      return <group key={agent.id}><FlowLink from={from} to={to} color={agent.color} delay={(index * .137) % 1} strong={agent.status === 'working' || Boolean(agent.parentAgentId)} /><AgentNode agent={agent} position={to} index={index} light={light} /></group>
    })}
  </>
}

export function NeuralCanvas() {
  const select = useWorkspace((state) => state.select)
  const agents = useWorkspace((state) => state.agents)
  const teams = useWorkspace((state) => state.teams)
  const light = useTheme((state) => state.resolved) === 'light'
  const palette = useScenePalette()
  const background = palette.background
  const active = agents.filter((agent) => agent.status === 'working').length
  return <div className="relative h-full w-full overflow-hidden" style={{ background }}>
    <div className="pointer-events-none absolute inset-0 z-10 neural-vignette" />
    <div className="pointer-events-none absolute left-5 top-40 z-20 max-w-[270px] rounded-[22px] border border-line-soft bg-glass px-4 py-3 shadow-xl backdrop-blur-xl xl:left-7"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink-faint">Live collaboration map</p><p className="mt-1 text-sm font-bold text-ink">{teams.filter((team) => agents.some((agent) => agent.teamId === team.id)).length} connected teams</p><p className="mt-1 text-xs leading-relaxed text-ink-soft">{active ? `${active} agents are actively exchanging work.` : 'The network is ready for its next assignment.'}</p></div>
    <Canvas camera={{ position: NEURAL_HOME, fov: 43, near: .1, far: 80 }} dpr={[1, 1.5]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: light ? .95 : 1.05 }} onPointerMissed={() => select(null)}>
      <color attach="background" args={[background]} /><fog attach="fog" args={[background, 20, 39]} /><NeuralGraph light={light} palette={palette} /><OrbitControls makeDefault enableDamping dampingFactor={.07} minDistance={7} maxDistance={24} maxPolarAngle={Math.PI * .72} target={NEURAL_TARGET} /><CameraHome /><SceneProbe view="neural" />
    </Canvas>
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 rounded-full border border-line-soft bg-glass px-4 py-2 text-[11px] font-medium text-ink-soft shadow-xl backdrop-blur-xl sm:block">Drag to explore · scroll to zoom · select a node for details</div>
  </div>
}
