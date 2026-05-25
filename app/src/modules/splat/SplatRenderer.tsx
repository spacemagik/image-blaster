import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { extend, useThree, useFrame } from '@react-three/fiber'
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useDebugStore } from '../../store/debug'
import { useWizardTuning } from '../character/wizardTuning'
import { ViewerQuality } from '../../types/world'

// Patch Spark's default vertex shader to swap the linear thin-lens CoC formula
// for a configurable curve: zero blur within `sharpRange` of the focal plane,
// then exponential growth at `falloffRate` per world unit beyond it. The
// existing `apertureAngle` uniform stays as the overall blur strength.
const ORIGINAL_FOCUS_BLUR =
  'float focusBlur = abs((-viewCenter.z - focalDistance) / viewCenter.z);'
const CUSTOM_FOCUS_BLUR = `float dist = -viewCenter.z;
            float diff = abs(dist - focalDistance);
            float beyond = max(0.0, diff - sharpRange);
            float focusBlur = exp(beyond * falloffRate) - 1.0;`
const APERTURE_DECL = 'uniform float apertureAngle;'
const APERTURE_DECL_PLUS = `uniform float apertureAngle;
uniform float sharpRange;
uniform float falloffRate;`
const DEFAULT_SHARP_RANGE = 2
const DEFAULT_FALLOFF_RATE = 0.3

const SparkRendererEl = extend(SparkRenderer)
const SplatMeshEl = extend(SplatMesh)
const ignoreRaycast: THREE.Object3D['raycast'] = () => {}

interface Props {
  url: string
  visible?: boolean
  groundPlaneOffset?: number
  flipY?: boolean
  metricScaleFactor?: number
}


export function SplatRenderer({
  url,
  visible = true,
  groundPlaneOffset = 0,
  flipY,
  metricScaleFactor = 1,
}: Props) {
    const renderer = useThree((state) => state.gl)
    const viewerQuality = useDebugStore((s) => s.viewerQuality)
    const splatRef = useRef<SplatMesh>(null)
    const sparkRef = useRef<SparkRenderer>(null)
    const encodeLinear = viewerQuality === ViewerQuality.High
    const initialEncodeLinear = useRef(encodeLinear)

    // Live user-tunable splat offset + rotation (independent of world-manifest transform).
    const splatOffsetX = useWizardTuning((s) => s.splatOffsetX)
    const splatOffsetY = useWizardTuning((s) => s.splatOffsetY)
    const splatOffsetZ = useWizardTuning((s) => s.splatOffsetZ)
    const splatRotDegX = useWizardTuning((s) => s.splatRotationDegX)
    const splatRotDegY = useWizardTuning((s) => s.splatRotationDegY)
    const splatRotDegZ = useWizardTuning((s) => s.splatRotationDegZ)
    const splatGizmoEnabled = useWizardTuning((s) => s.splatGizmoEnabled)
    const splatGizmoMode = useWizardTuning((s) => s.splatGizmoMode)

    // useState (not useRef) because TransformControls' `object` prop needs to trigger
    // a re-render when the group mounts so the gizmo can attach on the same frame.
    const [splatOffsetNode, setSplatOffsetNode] = useState<THREE.Group | null>(null)

    // TransformControls writes directly into the Object3D it controls. After each
    // change we sync that transform back into the persisted store so the matching
    // GUI sliders update and the value survives a refresh.
    const handleGizmoChange = useCallback(() => {
      const g = splatOffsetNode
      if (!g) return
      useWizardTuning.getState().setTuning({
        splatOffsetX: g.position.x,
        splatOffsetY: g.position.y,
        splatOffsetZ: g.position.z,
        splatRotationDegX: THREE.MathUtils.radToDeg(g.rotation.x),
        splatRotationDegY: THREE.MathUtils.radToDeg(g.rotation.y),
        splatRotationDegZ: THREE.MathUtils.radToDeg(g.rotation.z),
      })
    }, [splatOffsetNode])

    // Patch the SparkRenderer's vertex shader once to add our custom CoC curve
    // and inject `sharpRange` / `falloffRate` uniforms.
    useEffect(() => {
      const spark = sparkRef.current
      if (!spark) return
      const mat = spark.material
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = mat.uniforms as any
      if (!u.sharpRange) u.sharpRange = { value: DEFAULT_SHARP_RANGE }
      if (!u.falloffRate) u.falloffRate = { value: DEFAULT_FALLOFF_RATE }
      if (!mat.vertexShader.includes('uniform float sharpRange;')) {
        mat.vertexShader = mat.vertexShader
          .replace(APERTURE_DECL, APERTURE_DECL_PLUS)
          .replace(ORIGINAL_FOCUS_BLUR, CUSTOM_FOCUS_BLUR)
        mat.needsUpdate = true
      }
    }, [])

    useFrame(() => {
      const spark = sparkRef.current
      if (!spark) return
      const s = useDebugStore.getState()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = spark.material.uniforms as any
      if (s.viewerQuality === ViewerQuality.High && s.dofEnabled) {
        spark.focalDistance = s.focalDistance
        spark.apertureAngle = s.apertureAngle
        spark.falloff = s.falloff
        if (u.sharpRange) u.sharpRange.value = Number.isFinite(s.sharpRange) ? s.sharpRange : DEFAULT_SHARP_RANGE
        if (u.falloffRate) u.falloffRate.value = s.falloffRate > 0 ? s.falloffRate : DEFAULT_FALLOFF_RATE
      } else {
        spark.focalDistance = 0
        spark.apertureAngle = 0
        spark.falloff = 1
      }

      // Live splat-performance knobs (Spark 2.0 LOD).
      const t = useWizardTuning.getState()
      spark.enableLod = t.splatLodEnabled
      spark.lodSplatScale = t.splatLodSplatScale
      spark.lodRenderScale = t.splatLodRenderScale
      if (u.maxStdDev) u.maxStdDev.value = t.splatMaxStdDev
      spark.maxStdDev = t.splatMaxStdDev
    })

    useEffect(() => {
      if (splatRef.current) splatRef.current.raycast = ignoreRaycast
      if (sparkRef.current) sparkRef.current.raycast = ignoreRaycast
    }, [])

    useEffect(() => {
      if (sparkRef.current) sparkRef.current.encodeLinear = encodeLinear
    }, [encodeLinear])

    const sparkArgs = useMemo(() => ({ renderer, enableLod: true, encodeLinear: initialEncodeLinear.current }), [renderer])
    const splatArgs = useMemo(
      () => ({
        url,
        // Tell SplatMesh to participate in Spark's LOD tree so the renderer can
        // pick a subset of splats by importance + screen-space size. Must be set
        // at construction; live LOD tuning still happens via SparkRenderer above.
        lod: true as const,
      }),
      [url],
    )

    return (
      <>
        <SparkRendererEl ref={sparkRef} args={[sparkArgs]} visible={visible}>
          <group position={[0, groundPlaneOffset, 0]} rotation={[flipY ? Math.PI : 0, 0, 0]} scale={metricScaleFactor}>
            {/* User-tunable offset / rotation. Outside the world-manifest group so
                the gizmo handles operate in world space, which matches what's intuitive
                when looking at a splat that's misaligned to the collider. */}
            <group
              ref={setSplatOffsetNode}
              position={[splatOffsetX, splatOffsetY, splatOffsetZ]}
              rotation={[
                THREE.MathUtils.degToRad(splatRotDegX),
                THREE.MathUtils.degToRad(splatRotDegY),
                THREE.MathUtils.degToRad(splatRotDegZ),
              ]}
            >
              <SplatMeshEl ref={splatRef} args={[splatArgs]} />
            </group>
          </group>
        </SparkRendererEl>
        {splatGizmoEnabled && splatOffsetNode && (
          <TransformControls
            object={splatOffsetNode}
            mode={splatGizmoMode}
            onObjectChange={handleGizmoChange}
          />
        )}
      </>
    )
}
