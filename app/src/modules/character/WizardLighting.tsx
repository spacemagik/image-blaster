/**
 * Character-following sun + fill rig — ported from
 * `Desktop/Astronaut/src/main.ts` (lines 322–395, `syncLightingAndShadowsFromTuning`).
 *
 * In wizard mode, this provides a directional light that tracks the wizard's feet
 * each frame, keeping the shadow camera centered on the character so the shadow map
 * stays high-res near the player (vs. a static scene-wide sun where the player ends
 * up on the edge of the shadow frustum and looks blurry).
 *
 * Reads:
 *   - All Lighting / Shadows fields from `useWizardTuning` (sun pos/color/intensity,
 *     fill, shadow camera extents/bias/radius/map size/type, follow-character toggle).
 *   - `wizardFeetPos` (live world-space feet position written by WizardController).
 *
 * Doesn't render anything visible by itself — drops a `<directionalLight>` for the sun
 * (with shadow camera), one for the fill, and a `<primitive>` for the sun's target so
 * its world matrix updates when we move it. Returns the JSX to mount inside the Canvas.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useWizardTuning, type ShadowMapType } from './wizardTuning'
import { wizardFeetPos } from './WizardController'

const SHADOW_TYPE_MAP: Record<ShadowMapType, THREE.ShadowMapType> = {
  BasicShadowMap: THREE.BasicShadowMap,
  PCFShadowMap: THREE.PCFShadowMap,
  PCFSoftShadowMap: THREE.PCFSoftShadowMap,
  VSMShadowMap: THREE.VSMShadowMap,
}

function colorTupleToHex([r, g, b]: [number, number, number]): THREE.Color {
  return new THREE.Color(r, g, b)
}

export function WizardLighting() {
  const { gl } = useThree()
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const fillRef = useRef<THREE.DirectionalLight>(null)

  // Stable target object the sun aims at; we move it each frame.
  const sunTarget = useMemo(() => new THREE.Object3D(), [])

  // Snapshot map-size + map-type so we only blow away the shadow map texture when those
  // expensive resources actually change (the per-frame tuning read is otherwise cheap).
  const shadowMapSize = useWizardTuning((s) => s.shadowMapSize)
  const shadowMapType = useWizardTuning((s) => s.shadowMapType)

  // Re-allocate the shadow texture only on map-size / type changes.
  useEffect(() => {
    const sun = sunRef.current
    if (!sun) return
    const clamped = Math.min(4096, Math.max(256, Math.round(shadowMapSize / 128) * 128))
    if (sun.shadow.mapSize.width !== clamped) {
      sun.shadow.map?.dispose()
      sun.shadow.map = null
      sun.shadow.mapSize.set(clamped, clamped)
    }
    gl.shadowMap.type = SHADOW_TYPE_MAP[shadowMapType]
    gl.shadowMap.needsUpdate = true
  }, [gl, shadowMapSize, shadowMapType])

  useFrame(() => {
    const sun = sunRef.current
    const fill = fillRef.current
    if (!sun || !fill) return
    const t = useWizardTuning.getState()

    // ── Sun position + target ────────────────────────────────────────────────
    if (t.sunShadowFollowCharacter) {
      sun.target.position.copy(wizardFeetPos)
      sun.position.set(
        wizardFeetPos.x + t.sunPosX,
        wizardFeetPos.y + t.sunPosY,
        wizardFeetPos.z + t.sunPosZ,
      )
    } else {
      sun.target.position.set(0, 0, 0)
      sun.position.set(t.sunPosX, t.sunPosY, t.sunPosZ)
    }
    sun.target.updateMatrixWorld()

    sun.color.copy(colorTupleToHex(t.sunColor))
    sun.intensity = t.sunIntensity

    // ── Shadow camera bounds + filter params ────────────────────────────────
    const shadowCam = sun.shadow.camera as THREE.OrthographicCamera
    shadowCam.near = t.shadowCameraNear
    shadowCam.far = t.shadowCameraFar
    const half = t.shadowCameraHalfExtent
    shadowCam.left = -half
    shadowCam.right = half
    shadowCam.top = half
    shadowCam.bottom = -half
    shadowCam.updateProjectionMatrix()

    sun.shadow.bias = t.shadowBias
    sun.shadow.normalBias = t.shadowNormalBias
    sun.shadow.radius = t.shadowRadius
    sun.shadow.intensity = t.shadowIntensity
    sun.shadow.blurSamples = Math.round(Math.min(32, Math.max(4, t.shadowBlurSamples)))

    // ── Fill light ──────────────────────────────────────────────────────────
    fill.color.copy(colorTupleToHex(t.fillColor))
    fill.intensity = t.fillIntensity
    fill.position.set(t.fillPosX, t.fillPosY, t.fillPosZ)
  })

  return (
    <>
      <directionalLight ref={sunRef} castShadow color="#fff5e6" intensity={1.62}>
        <primitive object={sunTarget} attach="target" />
      </directionalLight>
      <directionalLight ref={fillRef} color="#d4e8ff" intensity={0.32} />
    </>
  )
}
