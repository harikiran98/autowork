import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, AdaptiveDpr, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { Office } from './Office'
import { Lighting } from './Lighting'
import { OfficeAgent } from './LegoAgent'
import { useWorkspace } from '../state/workspaceStore'
import { useFloorplan } from '../state/useFloorplan'
import { cafeteriaSeat, coffeeSpot, floorplanCentre, meetingRooms, meetingSeat } from '../data/layout'
import type { Seat } from '../data/org'
import { useScenePalette } from '../theme/palette'
import { useMotion } from './motion'
import { SceneProbe } from './SceneProbe'

/** Comfortable viewing distance for the seed floorplan. */
const BASE_DISTANCE = 20.5
/** Fixed viewing direction; only the distance along it is solved for. */
const VIEW_DIR = new THREE.Vector3(0.22, 0.7, 1).normalize()

/**
 * Solves camera distance from the viewport aspect so the office frames itself
 * on a narrow artifact pane as well as on a wide desktop window. A fixed camera
 * position cannot do this: on a narrow pane the horizontal FOV collapses and
 * the agents shrink to specks.
 *
 * Backs off as soon as the user orbits, so resizing never yanks their view.
 */
function ResponsiveFraming({ home, fitWidth }: { home: THREE.Vector3; fitWidth: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  // OrbitControls' event map isn't in three's typed EventDispatcher generics,
  // so this is narrowed to just the listener pair we use.
  const controls = useThree((s) => s.controls) as {
    addEventListener: (t: string, fn: () => void) => void
    removeEventListener: (t: string, fn: () => void) => void
  } | null
  const userMoved = useRef(false)
  const reset = useMotion((s) => s.resetView)
  const focusTarget = useMotion((s) => s.focusTarget)
  const selectedId = useWorkspace((s) => s.selectedId)

  useEffect(() => {
    if (!controls) return
    const onStart = () => {
      userMoved.current = true
      // Manual navigation always releases a clicked area/agent camera lock.
      useMotion.setState({ focusTarget: null })
      useWorkspace.getState().select(null)
    }
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)
  }, [controls])

  /**
   * The framing that has actually been applied, and the viewport it was solved
   * for. Both halves matter: closing the agent panel changes the stage width
   * one commit *after* the reset that closed it, so a reset alone is not proof
   * that the current framing matches the viewport the user is looking at.
   */
  const applied = useRef({ reset: -1, width: 0, height: 0 })

  useEffect(() => {
    // A reset re-arms auto-framing, overriding the drag flag — and it stays
    // armed until the framing has been solved at the size the stage settled
    // on. Without that, double-clicking to reset while an agent panel is open
    // left the office solved for the narrow pane and looking too far away.
    const rearmed = applied.current.reset !== reset
    if (rearmed) userMoved.current = false
    if (selectedId || focusTarget) return
    if (userMoved.current && !rearmed) return
    if (applied.current.reset === reset && applied.current.width === size.width && applied.current.height === size.height) return

    const aspect = size.width / Math.max(1, size.height)
    const vFov = THREE.MathUtils.degToRad(camera.fov)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    // Distance needed for the office to fit across a pane this wide.
    const distH = fitWidth / 2 / Math.tan(hFov / 2)
    // Never closer than the baseline: on a wide window we want the framing to
    // stay put, not to creep in until the room is cropped.
    const dist = Math.max(BASE_DISTANCE, distH * 1.2, fitWidth * 0.85)

    camera.position.copy(home).addScaledVector(VIEW_DIR, dist)
    camera.lookAt(home)
    camera.updateProjectionMatrix()
    applied.current = { reset, width: size.width, height: size.height }
  }, [camera, size, home, fitWidth, reset, selectedId, focusTarget])

  return null
}

/**
 * Eases the orbit target toward whichever agent is selected, so picking someone
 * in the 3D scene (or from the roster in the 2D UI) frames them.
 */
function CameraRig({ home }: { home: THREE.Vector3 }) {
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null
  const selectedId = useWorkspace((s) => s.selectedId)
  const focusTarget = useMotion((s) => s.focusTarget)
  const { seats, plan } = useFloorplan()
  const desired = useRef(new THREE.Vector3())
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  useEffect(() => {
    const seat = selectedId ? seats[selectedId] : undefined
    if ((!seat && !focusTarget) || !controls) return
    const target = seat ? new THREE.Vector3(seat.position[0], 1.05, seat.position[2]) : new THREE.Vector3(...focusTarget!)
    controls.target.copy(target)
    // Look from the aisle, not through the opposite desk's monitors.
    const direction = new THREE.Vector3(1, 0.45, seat && seat.rotation === 0 && seat.position[2] < 3 ? -0.6 : 0.6).normalize()
    camera.position.copy(target).addScaledVector(direction, Math.max(5.1, 4.8 * size.height / Math.max(size.width, 1)))
    const backWall = Math.min(...Object.values(plan.zones).map((zone) => zone.origin[1])) - 4.6
    camera.position.z = Math.max(camera.position.z, backWall + 0.55)
    controls.update()
  }, [selectedId, focusTarget, seats, plan, camera, controls, size.width, size.height])

  useFrame((_, delta) => {
    if (!controls) return
    const seat = selectedId ? seats[selectedId] : undefined
    if (seat) desired.current.set(seat.position[0], 1.05, seat.position[2])
    else if (focusTarget) desired.current.set(...focusTarget)
    else desired.current.copy(home)
    controls.target.lerp(desired.current, 1 - Math.pow(0.02, delta))
    controls.update()
  })

  return null
}

function Agents() {
  const agents = useWorkspace((s) => s.agents)
  const teams = useWorkspace((s) => s.teams)
  const teamJobs = useWorkspace((s) => s.teamJobs)
  const { seats, plan } = useFloorplan()
  const rooms = meetingRooms(plan, teams)
  const reviewSpot = (managerSeat: Seat, index: number): Seat => {
    const forwardX = Math.sin(managerSeat.rotation)
    const forwardZ = Math.cos(managerSeat.rotation)
    const side = (index % 3 - 1) * .48
    return { position: [managerSeat.position[0] + forwardX * 1.25 + forwardZ * side, 0.02, managerSeat.position[2] + forwardZ * 1.25 - forwardX * side], rotation: managerSeat.rotation + Math.PI, pose: 'standing', place: 'cafeteria' }
  }
  return (
    <>
      {agents.map((agent, index) => {
        const teamMembers = agents.filter((item) => item.teamId === agent.teamId)
        const memberIndex = teamMembers.findIndex((item) => item.id === agent.id)
        const meetingJob = teamJobs.find((job) => job.teamId === agent.teamId && (job.status === 'planning' || job.status === 'delegated'))
        const reviewJob = teamJobs.find((job) => job.teamId === agent.teamId && (job.status === 'reviewing' || job.status === 'revising'))
        const room = meetingJob ? rooms.find((item) => item.teamId === agent.teamId) : undefined
        const lead = teamMembers.find((item) => item.isTeamLead)
        const manager = agent.parentAgentId ? agents.find((item) => item.id === agent.parentAgentId) : lead
        const managerSeat = reviewJob && manager && manager.id !== agent.id ? seats[manager.id] : undefined
        const workflowSeat = room ? meetingSeat(room, memberIndex) : managerSeat ? reviewSpot(managerSeat, memberIndex) : undefined
        const isManager = agent.isTeamLead || agents.some((child) => child.parentAgentId === agent.id)
        return seats[agent.id] ? <OfficeAgent key={agent.id} agent={agent} seat={seats[agent.id]} breakSeat={cafeteriaSeat(plan, index)} coffeeSeat={coffeeSpot(plan, index)} workflowSeat={workflowSeat} syncSeatMovement={isManager} /> : null
      })}
    </>
  )
}

export function OfficeCanvas() {
  const select = useWorkspace((s) => s.select)
  const p = useScenePalette()
  const { plan } = useFloorplan()

  // Home target and framing follow the floorplan, so adding a fourth team (or
  // a second row of pods) reframes the office instead of cropping it.
  const [cx, cz] = floorplanCentre(plan)
  const home = useMemo(() => new THREE.Vector3(cx, 0.7, cz - 0.3), [cx, cz])
  // Keep the operational centre readable even when side wings expand. Users
  // can pan into either wing or click an area to focus it directly.
  const fitWidth = Math.max(20.5, Math.min(plan.bounds.width, 26))

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 9.6, 19.8], fov: 44, near: 0.1, far: 160 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
      // Clicking empty floor clears the selection. Every agent calls
      // stopPropagation() on click so this only fires on a genuine miss.
      onPointerMissed={() => { select(null); useMotion.getState().focus(null) }}
      className="h-full w-full"
    >
      <color attach="background" args={[p.background]} />

      <Lighting />

      <Suspense fallback={null}>
        <Office />
        <Agents />
        <Preload all />
      </Suspense>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={120}
        maxPolarAngle={Math.PI / 2.35}
        minPolarAngle={0.18}
        target={home.clone()}
        screenSpacePanning
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />
      <ResponsiveFraming home={home} fitWidth={fitWidth} />
      <CameraRig home={home} />
      <SceneProbe view="office" />
      <AdaptiveDpr pixelated />
    </Canvas>
  )
}
