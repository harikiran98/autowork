import { useMemo, useRef, type MutableRefObject } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CHARACTER, gaitPose, useMotion } from './motion'

export interface FigureMotion { distance: number; speed: number; pose?: 'seated' | 'standing'; seatLift?: number; carryingCoffee?: boolean }
export interface FigureProps {
  torsoColor: string
  legColor?: string
  skinColor?: string
  animate?: boolean
  activity?: 'idle' | 'working' | 'blocked'
  variant?: number
  motion?: MutableRefObject<FigureMotion>
}

const SKINS = ['#d7a57e', '#a56f50', '#efc2a0', '#81533c', '#c28c66']
const HAIR = ['#30241e', '#1c2028', '#644632', '#493128', '#251c18']

function Part({ size, at = [0, 0, 0], color, radius = 0.03 }: {
  size: [number, number, number]; at?: [number, number, number]; color: string; radius?: number
}) {
  return <RoundedBox args={size} position={at} radius={radius} smoothness={3} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={0.72} />
  </RoundedBox>
}

/** Articulated studio characters, in metres: feet at zero, waist at .86m. */
export function DetailedFigure({ torsoColor, legColor = '#415269', skinColor, activity = 'idle', variant = 0, animate = true, motion }: FigureProps) {
  const body = useRef<THREE.Group>(null)
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  const leftKnee = useRef<THREE.Group>(null)
  const rightKnee = useRef<THREE.Group>(null)
  const arms = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const elbows = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const head = useRef<THREE.Group>(null)
  const coffee = useRef<THREE.Group>(null)
  const time = useRef(variant * 0.83)
  const skin = skinColor ?? SKINS[variant % SKINS.length]
  const hair = HAIR[variant % HAIR.length]
  const trim = useMemo(() => new THREE.Color(torsoColor).multiplyScalar(0.7), [torsoColor])

  useFrame((_, delta) => {
    if (useMotion.getState().paused || !animate) return
    time.current += Math.min(delta, 0.05)
    const t = time.current
    const amount = Math.min(1, (motion?.current.speed ?? 0) / 0.45)
    const pose = gaitPose(motion?.current.distance ?? 0, amount)
    const seated = motion?.current.pose === 'seated' && amount < 0.15
    // Sitting drops the root so the pelvis lands on a cushion. The exact value
    // is set by the legs, not by the seat: with the seated hip/knee angles
    // below, a .28 drop pushed the shoes 6cm through the floor and buried the
    // pelvis 5cm inside the chair. At .21 the soles rest on the floor and the
    // pelvis sits on top of the 58cm chair cushion.
    if (body.current) body.current.position.y = (seated ? -0.21 + (motion?.current.seatLift ?? 0) : 0) + pose.bob
    if (left.current) left.current.rotation.x = seated ? -1.18 : pose.left
    if (right.current) right.current.rotation.x = seated ? -1.18 : pose.right
    if (leftKnee.current) leftKnee.current.rotation.x = seated ? 1.34 : pose.leftKnee
    if (rightKnee.current) rightKnee.current.rotation.x = seated ? 1.34 : pose.rightKnee
    for (let i = 0; i < 2; i++) {
      const arm = arms[i].current
      const elbow = elbows[i].current
      const working = activity === 'working' && seated
      if (arm) {
        arm.rotation.x = working ? -0.55 + Math.sin(t * 5 + i * Math.PI) * 0.035 : (i ? pose.left : pose.right) * 0.8
        arm.rotation.z = (i ? -1 : 1) * 0.035
      }
      if (elbow) elbow.rotation.x = working ? -1 + Math.sin(t * 5 + i * Math.PI) * 0.055 : -0.15
    }
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.6) * 0.09
      head.current.rotation.x = activity === 'working' ? 0.06 : Math.sin(t * 0.8) * 0.025
    }
    if (coffee.current) coffee.current.visible = Boolean(motion?.current.carryingCoffee) && amount < 0.2
  })

  return <group ref={body} name="character-body">
    {[-1, 1].map((side, i) => <group key={side} ref={i ? right : left} name={i ? 'right-hip' : 'left-hip'} position={[side * 0.125, CHARACTER.hip, 0]}>
      <Part size={[0.19, 0.37, 0.23]} at={[0, -0.185, 0]} color={legColor} radius={0.045} />
      <group ref={i ? rightKnee : leftKnee} name={i ? 'right-knee' : 'left-knee'} position={[0, -CHARACTER.thigh, 0]}>
        <Part size={[0.17, 0.36, 0.2]} at={[0, -0.18, 0]} color={legColor} radius={0.04} />
        <Part size={[0.19, 0.04, 0.21]} at={[0, -0.33, 0]} color="#66758a" radius={0.012} />
        <Part size={[0.215, 0.115, 0.34]} at={[0, -0.415, 0.055]} color="#ece7dc" radius={0.045} />
        <Part size={[0.22, 0.028, 0.345]} at={[0, -0.477, 0.055]} color="#b6bcc2" radius={0.012} />
        {[0, 1, 2].map((lace) => <Part key={lace} size={[0.12, 0.008, 0.011]} at={[0, -0.356, 0.06 + lace * 0.03]} color="#ffffff" radius={0.003} />)}
      </group>
    </group>)}
    <Part size={[0.44, 0.14, 0.27]} at={[0, 0.86, 0]} color={legColor} radius={0.05} />
    <Part size={[0.45, 0.045, 0.28]} at={[0, 0.92, 0]} color="#303742" radius={0.015} />
    <Part size={[0.05, 0.04, 0.012]} at={[0, 0.92, 0.146]} color="#aab6bb" radius={0.006} />
    <group name="upper-body" position={[0, 0.93, 0]}>
      <Part size={[0.48, 0.48, 0.29]} at={[0, 0.24, 0]} color={torsoColor} radius={0.085} />
      <Part size={[0.021, 0.38, 0.015]} at={[0, 0.24, 0.147]} color={trim.getStyle()} radius={0.004} />
      <Part size={[0.11, 0.12, 0.014]} at={[-0.13, 0.28, 0.149]} color={trim.getStyle()} radius={0.012} />
      <Part size={[0.072, 0.09, 0.016]} at={[-0.13, 0.29, 0.16]} color="#eeede5" radius={0.006} />
      {[-1, 1].map((side) => <group key={side} position={[side * 0.065, 0.465, 0.105]} rotation={[0, 0, side * 0.4]}>
        <Part size={[0.09, 0.1, 0.04]} color="#e9e5dc" radius={0.018} />
      </group>)}
      {[-1, 1].map((side, i) => <group key={side} ref={arms[i]} position={[side * 0.285, 0.4, 0]}>
        <Part size={[0.16, 0.28, 0.19]} at={[0, -0.1, 0]} color={torsoColor} radius={0.065} />
        <group ref={elbows[i]} position={[0, -0.245, 0]}>
          <Part size={[0.135, 0.22, 0.15]} at={[0, -0.1, 0]} color={torsoColor} radius={0.05} />
          <Part size={[0.14, 0.04, 0.155]} at={[0, -0.205, 0]} color={trim.getStyle()} radius={0.016} />
          <Part size={[0.12, 0.135, 0.1]} at={[0, -0.29, 0.018]} color={skin} radius={0.04} />
          <Part size={[0.045, 0.07, 0.06]} at={[-side * 0.055, -0.265, 0.04]} color={skin} radius={0.022} />
          {i === 0 && <Part size={[0.14, 0.04, 0.035]} at={[0, -0.225, 0.087]} color="#232c39" radius={0.014} />}
          {i === 0 && <group ref={coffee} position={[0, -0.37, 0.12]} visible={false}>
            <mesh castShadow><cylinderGeometry args={[0.045, 0.037, 0.1, 16]} /><meshStandardMaterial color="#d8c6aa" roughness={0.45} /></mesh>
            <mesh position={[0.052, 0, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.027, 0.008, 6, 14]} /><meshStandardMaterial color="#d8c6aa" /></mesh>
          </group>}
        </group>
      </group>)}
      <mesh position={[0, 0.505, 0]} castShadow><cylinderGeometry args={[0.074, 0.08, 0.11, 16]} /><meshStandardMaterial color={skin} roughness={0.65} /></mesh>
      <group ref={head} position={[0, 0.71, 0]}>
        <Part size={[0.32, 0.36, 0.29]} color={skin} radius={0.12} />
        {[-1, 1].map((side) => <mesh key={side} position={[side * 0.164, 0, 0]} scale={[0.5, 0.85, 0.55]} castShadow><sphereGeometry args={[0.065, 12, 8]} /><meshStandardMaterial color={skin} roughness={0.68} /></mesh>)}
        <Part size={[0.34, 0.15, 0.3]} at={[0, 0.15, -0.01]} color={hair} radius={0.067} />
        <Part size={[0.335, 0.18, 0.075]} at={[0, 0.045, -0.13]} color={hair} radius={0.03} />
        <group position={[-0.07, 0.14, 0.12]} rotation={[0, 0, -0.2]}><Part size={[0.22, 0.09, 0.065]} color={hair} radius={0.035} /></group>
        {variant % 3 === 1 && <mesh position={[0, 0.08, -0.2]} castShadow><sphereGeometry args={[0.105, 14, 10]} /><meshStandardMaterial color={hair} roughness={0.85} /></mesh>}
        {[-1, 1].map((side) => <group key={side} position={[side * 0.069, 0.026, 0.146]}>
          <mesh><sphereGeometry args={[0.019, 12, 8]} /><meshStandardMaterial color="#faf7ef" /></mesh>
          <mesh position={[0, 0, 0.016]}><sphereGeometry args={[0.01, 10, 8]} /><meshStandardMaterial color="#25252b" /></mesh>
          <Part size={[0.058, 0.012, 0.009]} at={[0, 0.043, 0]} color={hair} radius={0.005} />
          {variant % 3 === 0 && <mesh position={[0, 0, 0.027]} scale={[1.15, 0.85, 1]}><torusGeometry args={[0.038, 0.006, 6, 16]} /><meshStandardMaterial color="#343c43" metalness={0.4} roughness={0.3} /></mesh>}
        </group>)}
        {variant % 3 === 0 && <Part size={[0.06, 0.008, 0.01]} at={[0, 0.028, 0.174]} color="#343c43" radius={0.003} />}
        <Part size={[0.045, 0.065, 0.065]} at={[0, -0.015, 0.147]} color={skin} radius={0.022} />
        <mesh position={[0, -0.072, 0.147]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.04, 0.005, 6, 16, Math.PI]} /><meshStandardMaterial color="#795244" /></mesh>
      </group>
    </group>
  </group>
}
