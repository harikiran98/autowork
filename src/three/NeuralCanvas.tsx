import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html, OrbitControls, Sparkles, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { ROLE_BY_ID } from '../data/org'
import { useWorkspace, type Agent } from '../state/workspaceStore'
import { useMotion } from './motion'

type Point = [number, number, number]

function Beam({ from, to, color, opacity = 0.3 }: { from: Point; to: Point; color: string; opacity?: number }) {
  const { midpoint, length, rotation } = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
    const direction = b.clone().sub(a)
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
    return { midpoint: a.add(b).multiplyScalar(.5), length: direction.length(), rotation: new THREE.Euler().setFromQuaternion(quaternion) }
  }, [from, to])
  return <mesh position={midpoint} rotation={rotation}>
    <cylinderGeometry args={[.012, .012, length, 7]} />
    <meshBasicMaterial color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
  </mesh>
}

function Signal({ from, to, color, delay }: { from: Point; to: Point; color: string; delay: number }) {
  const ref = useRef<THREE.Mesh>(null)
  const elapsed = useRef(delay)
  useFrame((_, delta) => {
    if (!ref.current || useMotion.getState().paused) return
    elapsed.current = (elapsed.current + delta * .22) % 1
    const t = 1 - Math.pow(1 - elapsed.current, 1.4)
    ref.current.position.lerpVectors(new THREE.Vector3(...from), new THREE.Vector3(...to), t)
    ref.current.scale.setScalar(.7 + Math.sin(t * Math.PI) * .8)
  })
  return <mesh ref={ref}>
    <sphereGeometry args={[.055, 10, 8]} />
    <meshBasicMaterial color={color} blending={THREE.AdditiveBlending} toneMapped={false} />
  </mesh>
}

function Halo({ color, scale = 1 }: { color: string; scale?: number }) {
  return <Billboard><mesh scale={scale}>
    <circleGeometry args={[1, 48]} />
    <meshBasicMaterial color={color} transparent opacity={.075} blending={THREE.AdditiveBlending} depthWrite={false} />
  </mesh></Billboard>
}

function Core() {
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Mesh>(null)
  useFrame((state, delta) => {
    if (useMotion.getState().paused) return
    if (outer.current) { outer.current.rotation.x += delta * .08; outer.current.rotation.y -= delta * .12 }
    if (inner.current) inner.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 1.3) * .06)
  })
  return <group name="neural-core">
    <Halo color="#55e6c1" scale={1.9} /><Halo color="#8177ff" scale={1.3} />
    <mesh ref={inner}><icosahedronGeometry args={[.62, 2]} /><meshStandardMaterial color="#63e6c7" emissive="#37bda2" emissiveIntensity={2.4} roughness={.18} metalness={.2} /></mesh>
    <group ref={outer}>
      <mesh rotation={[Math.PI / 2.7, 0, 0]}><torusGeometry args={[.96, .015, 8, 96]} /><meshBasicMaterial color="#a59fff" transparent opacity={.8} /></mesh>
      <mesh rotation={[0, Math.PI / 2.4, 0]}><torusGeometry args={[1.18, .008, 8, 96]} /><meshBasicMaterial color="#55e6c1" transparent opacity={.45} /></mesh>
    </group>
    <Html center position={[0, -1.38, 0]} style={{ pointerEvents: 'none' }}><div className="neural-label neural-core-label"><span className="neural-status-dot bg-emerald-400" />autowork core</div></Html>
  </group>
}

function AgentNode({ agent, position, index }: { agent: Agent; position: Point; index: number }) {
  const group = useRef<THREE.Group>(null)
  const rings = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const selected = useWorkspace(s => s.selectedId === agent.id)
  const select = useWorkspace(s => s.select)
  const role = ROLE_BY_ID[agent.roleId]
  useCursor(hovered)
  const glow = agent.status === 'working' ? '#51dfbd' : agent.status === 'blocked' ? '#ff6b86' : '#7f89a4'
  useFrame((state, delta) => {
    if (!group.current || useMotion.getState().paused) return
    const t = state.clock.elapsedTime + index * .7
    group.current.position.y = position[1] + Math.sin(t * .75) * .08
    if (rings.current) rings.current.rotation.z += delta * (agent.status === 'working' ? .45 : .16)
  })
  return <group ref={group} name={`neural-agent-${agent.id}`} position={position}>
    <Halo color={role.color} scale={selected ? .9 : .65} />
    <mesh onPointerOver={e => { e.stopPropagation(); setHovered(true) }} onPointerOut={() => setHovered(false)} onClick={e => { e.stopPropagation(); select(agent.id) }} scale={selected || hovered ? 1.18 : 1}>
      <icosahedronGeometry args={[.28, 1]} />
      <meshStandardMaterial color={role.color} emissive={role.color} emissiveIntensity={agent.status === 'working' ? 1.3 : .65} roughness={.25} metalness={.25} />
    </mesh>
    <mesh><sphereGeometry args={[.095, 14, 10]} /><meshBasicMaterial color="#f4fffd" toneMapped={false} /></mesh>
    <group ref={rings} rotation={[Math.PI / 2.8, 0, index]}>
      <mesh><torusGeometry args={[.43, selected ? .024 : .012, 6, 48]} /><meshBasicMaterial color={selected ? '#ffffff' : glow} transparent opacity={selected ? .95 : .55} /></mesh>
    </group>
    {(hovered || selected) && <Html center position={[0, .72, 0]} style={{ pointerEvents: 'none' }}><div className="neural-label"><span className="neural-status-dot" style={{ background: glow }} /><strong>{agent.name}</strong><span>{role.label}</span></div></Html>}
  </group>
}

function TeamAnchor({ name, tint, position, count }: { name: string; tint: string; position: Point; count: number }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => { if (ring.current && !useMotion.getState().paused) ring.current.rotation.z -= delta * .12 })
  return <group name={`neural-team-${name.toLowerCase().replace(/\s+/g, '-')}`} position={position}>
    <Halo color={tint} scale={1.15} />
    <mesh><octahedronGeometry args={[.42, 1]} /><meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={.8} roughness={.32} /></mesh>
    <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.69, .015, 6, 64]} /><meshBasicMaterial color={tint} transparent opacity={.65} /></mesh>
    <Html center position={[0, -.92, 0]} style={{ pointerEvents: 'none' }}><div className="neural-label"><strong>{name}</strong><span>{count} nodes</span></div></Html>
  </group>
}

function NeuralGraph() {
  const agents = useWorkspace(s => s.agents)
  const teams = useWorkspace(s => s.teams)
  const aspect = useThree(s => s.size.width / Math.max(1, s.size.height))
  const compact = aspect < .72
  const teamPoints = useMemo(() => {
    const visible = teams.filter(team => agents.some(agent => agent.teamId === team.id))
    return new Map(visible.map((team, i) => {
      const a = i / visible.length * Math.PI * 2 + Math.PI / 4
      return [team.id, [Math.cos(a) * (compact ? 2.05 : 4.2), Math.sin(a) * 2.75, Math.sin(a * 2) * .45] as Point]
    }))
  }, [agents, teams, compact])
  const agentPoints = useMemo(() => new Map(agents.map((agent) => {
    const center = teamPoints.get(agent.teamId) ?? [0, 0, 0]
    const siblings = agents.filter(item => item.teamId === agent.teamId)
    const i = siblings.findIndex(item => item.id === agent.id)
    const angle = i / Math.max(1, siblings.length) * Math.PI * 2 + .45
    return [agent.id, [center[0] + Math.cos(angle) * (compact ? .72 : 1.22), center[1] + Math.sin(angle) * .92, center[2] + Math.sin(angle * 1.7) * .42] as Point]
  })), [agents, teamPoints, compact])

  return <>
    <ambientLight intensity={.45} /><pointLight color="#61e7ca" intensity={24} distance={12} position={[0, 2, 1]} /><pointLight color="#756cff" intensity={18} distance={12} position={[-4, -2, 4]} />
    <Sparkles count={150} scale={[15, 9, 12]} size={1.2} speed={.25} opacity={.45} color="#b9d9ff" />
    <Core />
    {[...teamPoints.entries()].map(([id, point], index) => {
      const team = teams.find(item => item.id === id)!
      const count = agents.filter(agent => agent.teamId === id).length
      return <group key={id}><Beam from={[0,0,0]} to={point} color={team.tint} opacity={.28} /><Signal from={[0,0,0]} to={point} color={team.tint} delay={(index * .23) % 1} /><TeamAnchor name={team.name} tint={team.tint} position={point} count={count} /></group>
    })}
    {agents.map((agent, index) => {
      const from = teamPoints.get(agent.teamId) ?? [0,0,0]
      const to = agentPoints.get(agent.id)!
      const role = ROLE_BY_ID[agent.roleId]
      return <group key={agent.id}><Beam from={from} to={to} color={role.color} opacity={.38} /><Signal from={from} to={to} color={role.color} delay={(index * .137) % 1} /><AgentNode agent={agent} position={to} index={index} /></group>
    })}
  </>
}

export function NeuralCanvas() {
  const select = useWorkspace(s => s.select)
  return <div className="relative h-full w-full overflow-hidden bg-[#091119]">
    <div className="pointer-events-none absolute inset-0 z-10 neural-vignette" />
    <Canvas camera={{ position: [0, .5, 13.2], fov: 43, near: .1, far: 80 }} dpr={[1, 1.5]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }} onPointerMissed={() => select(null)}>
      <color attach="background" args={['#091119']} /><fog attach="fog" args={['#091119', 18, 35]} />
      <NeuralGraph />
      <OrbitControls makeDefault enableDamping dampingFactor={.07} minDistance={7} maxDistance={24} maxPolarAngle={Math.PI * .82} target={[0, 0, 0]} />
    </Canvas>
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 rounded-full border border-white/10 bg-[#101a26]/80 px-4 py-2 text-[11px] font-medium text-slate-300 shadow-xl backdrop-blur-xl sm:block">Drag to explore · scroll to zoom · select a node for details</div>
  </div>
}
