import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html, Line, OrbitControls, Sparkles, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { useTheme } from '../state/themeStore'
import { useWorkspace, type Agent } from '../state/workspaceStore'
import { useMotion } from './motion'

type Point = [number, number, number]

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

function DataPlane({ light }: { light: boolean }) {
  const grid = useRef<THREE.GridHelper>(null)
  useFrame((_, delta) => { if (grid.current && !useMotion.getState().paused) grid.current.position.z = (grid.current.position.z + delta * .035) % .5 })
  return <group position={[0, -4.25, -2.8]} rotation={[Math.PI / 2, 0, 0]}><gridHelper ref={grid} args={[26, 52, light ? '#a4b1ad' : '#40514e', light ? '#c4cecb' : '#293936']} material-transparent material-opacity={light ? .22 : .3} /></group>
}

function NeuralGraph({ light }: { light: boolean }) {
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
    <ambientLight intensity={light ? 1.15 : .55} /><pointLight color="#88bbae" intensity={light ? 10 : 18} distance={13} position={[0, 2, 3]} /><pointLight color="#8c9abe" intensity={light ? 7 : 13} distance={14} position={[-5, -2, 4]} />
    <Sparkles count={light ? 80 : 125} scale={[15, 9, 12]} size={light ? .65 : .9} speed={.16} opacity={light ? .24 : .35} color={light ? '#829691' : '#a8bab5'} />
    <DataPlane light={light} /><Core light={light} workspaceName={workspaceName} />
    {[...teamPoints.entries()].map(([id, point], index) => {
      const team = teams.find((item) => item.id === id)!
      const members = agents.filter((agent) => agent.teamId === id)
      return <group key={id}><FlowLink from={[0, 0, 0]} to={point} color={team.tint} delay={(index * .23) % 1} strong /><TeamNode name={team.name} tint={team.tint} position={point} count={members.length} working={members.filter((agent) => agent.status === 'working').length} /></group>
    })}
    {agents.map((agent, index) => {
      const from = teamPoints.get(agent.teamId) ?? [0, 0, 0]
      const to = agentPoints.get(agent.id)!
      return <group key={agent.id}><FlowLink from={from} to={to} color={agent.color} delay={(index * .137) % 1} strong={agent.status === 'working'} /><AgentNode agent={agent} position={to} index={index} light={light} /></group>
    })}
  </>
}

export function NeuralCanvas() {
  const select = useWorkspace((state) => state.select)
  const agents = useWorkspace((state) => state.agents)
  const teams = useWorkspace((state) => state.teams)
  const light = useTheme((state) => state.resolved) === 'light'
  const background = light ? '#d6dfdc' : '#17211f'
  const active = agents.filter((agent) => agent.status === 'working').length
  return <div className="relative h-full w-full overflow-hidden" style={{ background }}>
    <div className="pointer-events-none absolute inset-0 z-10 neural-vignette" />
    <div className="pointer-events-none absolute left-5 top-40 z-20 max-w-[270px] rounded-[22px] border border-line-soft bg-glass px-4 py-3 shadow-xl backdrop-blur-xl xl:left-7"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-ink-faint">Live collaboration map</p><p className="mt-1 text-sm font-bold text-ink">{teams.filter((team) => agents.some((agent) => agent.teamId === team.id)).length} connected teams</p><p className="mt-1 text-xs leading-relaxed text-ink-soft">{active ? `${active} agents are actively exchanging work.` : 'The network is ready for its next assignment.'}</p></div>
    <Canvas camera={{ position: [0, .4, 13.4], fov: 43, near: .1, far: 80 }} dpr={[1, 1.5]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: light ? .95 : 1.05 }} onPointerMissed={() => select(null)}>
      <color attach="background" args={[background]} /><fog attach="fog" args={[background, 18, 34]} /><NeuralGraph light={light} /><OrbitControls makeDefault enableDamping dampingFactor={.07} minDistance={7} maxDistance={24} maxPolarAngle={Math.PI * .8} target={[0, 0, 0]} />
    </Canvas>
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 rounded-full border border-line-soft bg-glass px-4 py-2 text-[11px] font-medium text-ink-soft shadow-xl backdrop-blur-xl sm:block">Drag to explore · scroll to zoom · select a node for details</div>
  </div>
}
