import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useMotion } from './motion'

/**
 * Development-only measurement bridge for `test/scene-audit.mjs`.
 *
 * The questions the audit has to answer are all about real world-space
 * transforms — did that agent actually walk to the cafeteria, do two cubicles
 * overlap at four teams, did double-click put the camera back — and those
 * values only exist inside the react-three-fiber render tree. A screenshot
 * cannot answer them and the store does not know them.
 *
 * `import.meta.env.DEV` is a compile-time constant, so the whole body below
 * (and the window handle it installs) is eliminated from production bundles.
 */
export function SceneProbe({ view }: { view: 'office' | 'neural' }) {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as { target: THREE.Vector3 } | null

  useEffect(() => {
    if (!import.meta.env.DEV) return

    const round = (value: number) => Math.round(value * 1000) / 1000
    const triple = (vector: THREE.Vector3) => [round(vector.x), round(vector.y), round(vector.z)] as const

    /**
     * World-space AABB of an object's own visible geometry.
     *
     * `Box3.setFromObject` is not usable here: it ignores the `visible` flag,
     * so every agent would be measured by its invisible click-capsule rather
     * than by the character inside it.
     */
    const measure = (object: THREE.Object3D | null) => {
      if (!object) return null
      const box = new THREE.Box3()
      object.traverseVisible((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh || !mesh.geometry) return
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        const bounds = mesh.geometry.boundingBox
        if (!bounds) return
        box.union(bounds.clone().applyMatrix4(mesh.matrixWorld))
      })
      return box.isEmpty() ? null : { min: triple(box.min), max: triple(box.max) }
    }

    const describe = (object: THREE.Object3D | null) => object && ({
      name: object.name,
      position: triple(object.getWorldPosition(new THREE.Vector3())),
      rotationY: round(object.rotation.y),
      box: measure(object),
    })

    const probe = {
      view,

      /** One named object, or null when it is not in the scene. */
      node(name: string) {
        scene.updateMatrixWorld(true)
        return describe(scene.getObjectByName(name) ?? null)
      },

      /** Every named object whose name starts with `prefix`. */
      nodes(prefix: string) {
        scene.updateMatrixWorld(true)
        const found: Array<ReturnType<typeof describe>> = []
        scene.traverse((object) => {
          if (object.name && object.name.startsWith(prefix)) found.push(describe(object))
        })
        return found.filter(Boolean)
      },

      /**
       * A descendant of one named object. Character joint groups reuse the
       * same names on every agent, so they can only be addressed through the
       * agent group that owns them.
       */
      descendant(rootName: string, childName: string) {
        scene.updateMatrixWorld(true)
        const root = scene.getObjectByName(rootName)
        return root ? describe(root.getObjectByName(childName) ?? null) : null
      },

      /**
       * Per-mesh boxes inside one named object, lowest first.
       *
       * When the audit reports that something dips below the floor, this is
       * what names the offending part instead of leaving it to guesswork.
       */
      parts(name: string, limit = 8) {
        scene.updateMatrixWorld(true)
        const root = scene.getObjectByName(name)
        if (!root) return []
        const found: Array<{ geometry: string; min: readonly number[]; max: readonly number[] }> = []
        root.traverseVisible((child) => {
          const mesh = child as THREE.Mesh
          if (!mesh.isMesh || !mesh.geometry) return
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
          const bounds = mesh.geometry.boundingBox
          if (!bounds) return
          const world = bounds.clone().applyMatrix4(mesh.matrixWorld)
          found.push({ geometry: mesh.geometry.type, min: triple(world.min), max: triple(world.max) })
        })
        return found.sort((a, b) => a.min[1] - b.min[1]).slice(0, limit)
      },

      /** Exact object names present, for asserting the scene graph's shape. */
      names() {
        const found: string[] = []
        scene.traverse((object) => { if (object.name) found.push(object.name) })
        return found
      },

      camera() {
        return {
          position: triple(camera.position),
          target: controls ? triple(controls.target) : null,
          // Distinguishes "the double-click never reached the stage" from
          // "the camera ignored the reset" when the audit fails.
          resetView: useMotion.getState().resetView,
          hasControls: Boolean(controls),
        }
      },
    }

    const handle = window as unknown as { __autoworkProbe?: typeof probe }
    handle.__autoworkProbe = probe
    return () => { if (handle.__autoworkProbe === probe) delete handle.__autoworkProbe }
  }, [scene, camera, controls, view])

  return null
}
