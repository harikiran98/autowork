import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DetailedFigure, type FigureProps } from './DetailedFigure'

export interface AgentFigureProps extends FigureProps { modelUrl?: string }

function GltfAgentFigure({ modelUrl, torsoColor }: AgentFigureProps & { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl)

  // useGLTF caches by URL, so every agent must render its own clone or they
  // would all share (and fight over) one object3D.
  const model = useMemo(() => {
    const copy = cloneSkinned(scene)
    copy.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.castShadow = true
      child.receiveShadow = true
      // Recolour by material name so role colour still drives the torso.
      const mat = child.material as THREE.MeshStandardMaterial
      if (mat?.name?.toLowerCase().includes('torso')) {
        child.material = mat.clone()
        ;(child.material as THREE.MeshStandardMaterial).color = new THREE.Color(torsoColor)
      }
    })
    return copy
  }, [scene, torsoColor])

  return <primitive object={model} />
}

/**
 * Public entry point. Renders the .glb when one is configured and falls back to
 * the procedural figure while it streams in (or if none is set at all).
 */
export function AgentFigure(props: AgentFigureProps) {
  if (!props.modelUrl) return <DetailedFigure {...props} />
  return (
    <Suspense fallback={<DetailedFigure {...props} />}>
      <GltfAgentFigure {...props} modelUrl={props.modelUrl} />
    </Suspense>
  )
}

/** Call at module scope for models you know you'll need: preloadAgentFigure('/models/agent.glb') */
export const preloadAgentFigure = (url: string) => useGLTF.preload(url)
