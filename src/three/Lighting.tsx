import { useScenePalette } from '../theme/palette'

/**
 * Soft, inviting studio lighting: one warm key with a tight shadow camera, a
 * cool hemisphere bounce, and two fills so nothing goes muddy. Kept in its own
 * component so the look can be tuned without touching the scene graph.
 */
export function Lighting() {
  const p = useScenePalette()

  return (
    <>
      <ambientLight intensity={p.ambient} />
      <hemisphereLight args={[p.hemiSky, p.hemiGround, p.hemiIntensity]} />

      <directionalLight
        position={[8, 12, 7]}
        intensity={p.keyIntensity}
        color={p.keyColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      >
        {/* Tight ortho frustum = more shadow-map resolution where it matters. */}
        <orthographicCamera attach="shadow-camera" args={[-16, 16, 14, -14, 0.5, 40]} />
      </directionalLight>

      <directionalLight position={[-10, 8, -6]} intensity={p.fillIntensity} color="#dce8ff" />
      <pointLight position={[0, 4.2, 2]} intensity={p.pointIntensity} distance={16} decay={2} color="#ffffff" />
    </>
  )
}
