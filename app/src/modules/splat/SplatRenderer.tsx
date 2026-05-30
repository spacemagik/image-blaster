import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { extend, useThree, useFrame } from '@react-three/fiber'
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useDebugStore } from '../../store/debug'
import { useWizardTuning } from '../character/wizardTuning'
import { ViewerQuality } from '../../types/world'
import { setActiveSplatMesh } from './splatMeshRegistry'

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
    // `encodeLinear` tells Spark to convert sRGB-encoded SPZ colour
    // data to linear in the fragment shader BEFORE writing to the
    // framebuffer. Three's renderer is configured with
    // `outputColorSpace = SRGBColorSpace`, which means it expects
    // shaders to write linear pixels and the renderer applies the
    // sRGB gamma curve at output time.
    //
    // When `encodeLinear` is false, Spark writes the SPZ's sRGB
    // bytes directly → the framebuffer ends up gamma-encoded → the
    // renderer's output pass applies the gamma curve a SECOND time
    // → roughly `pow(x, 0.45 * 0.45) = pow(x, 0.2)` instead of the
    // intended `pow(x, 0.45)`. Result: midtones get lifted, deep
    // shadows fade to grey, and saturation drops noticeably. Exactly
    // the washed-out, low-contrast look users see on Low quality.
    //
    // It used to be gated on `viewerQuality === High` for what
    // looked like a perf optimisation, but the actual cost is one
    // GPU instruction per pixel of splat coverage — effectively
    // free on any device that can render the SPZ at all. The lag
    // on High comes from shadow map resolution + LOD splat count,
    // NOT from this flag.
    //
    // Hard-coding to `true` means Low and High both render with
    // correct gamma. The Low-quality perf wins still come from
    // smaller shadow maps and aggressive LOD; they just no longer
    // come with a colour-correctness penalty.
    const encodeLinear = true
    void viewerQuality
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

    // Per-frame setter cache — Spark's setters can trigger LoD/sort dirtying. We only
    // write when the value actually changed so panning the camera doesn't keep marking
    // the LoD pager dirty on every frame.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastApplied = useRef<Record<string, any>>({})

    useFrame(() => {
      const spark = sparkRef.current
      if (!spark) return
      const s = useDebugStore.getState()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = spark.material.uniforms as any
      const cache = lastApplied.current
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setIfChanged = (key: string, value: any, apply: (v: any) => void) => {
        if (cache[key] !== value) { cache[key] = value; apply(value) }
      }

      const dofOn = s.viewerQuality === ViewerQuality.High && s.dofEnabled
      const focal = dofOn ? s.focalDistance : 0
      const aperture = dofOn ? s.apertureAngle : 0
      const falloff = dofOn ? s.falloff : 1
      setIfChanged('focalDistance', focal, (v) => { spark.focalDistance = v })
      setIfChanged('apertureAngle', aperture, (v) => { spark.apertureAngle = v })
      setIfChanged('falloff', falloff, (v) => { spark.falloff = v })
      if (u.sharpRange) {
        const v = dofOn && Number.isFinite(s.sharpRange) ? s.sharpRange : DEFAULT_SHARP_RANGE
        setIfChanged('sharpRange', v, (val) => { u.sharpRange.value = val })
      }
      if (u.falloffRate) {
        const v = dofOn && s.falloffRate > 0 ? s.falloffRate : DEFAULT_FALLOFF_RATE
        setIfChanged('falloffRate', v, (val) => { u.falloffRate.value = val })
      }

      // Live splat-performance knobs (Spark 2.1 LOD).
      const t = useWizardTuning.getState()
      setIfChanged('enableLod', t.splatLodEnabled, (v) => { spark.enableLod = v })
      setIfChanged('lodSplatScale', t.splatLodSplatScale, (v) => { spark.lodSplatScale = v })
      setIfChanged('lodRenderScale', t.splatLodRenderScale, (v) => { spark.lodRenderScale = v })
      setIfChanged('lodSplatCount', t.splatLodSplatCount, (v) => {
        // 0 / falsy = use Spark's per-platform default
        spark.lodSplatCount = v > 0 ? v : undefined
      })
      setIfChanged('lodInflate', t.splatLodInflate, (v) => { spark.lodInflate = v })
      setIfChanged('minPixelRadius', t.splatMinPixelRadius, (v) => { spark.minPixelRadius = v })
      // Fixed foveation — the biggest win on huge SPZs because Spark drops detail
      // in the peripheral cone (coneFov0…coneFov) and behind the viewer.
      setIfChanged('coneFov0', t.splatConeFov0Deg, (v) => { spark.coneFov0 = v })
      setIfChanged('coneFov', t.splatConeFovDeg, (v) => { spark.coneFov = v })
      setIfChanged('coneFoveate', t.splatConeFoveate, (v) => { spark.coneFoveate = v })
      setIfChanged('behindFoveate', t.splatBehindFoveate, (v) => { spark.behindFoveate = v })
      setIfChanged('maxStdDev', t.splatMaxStdDev, (v) => {
        spark.maxStdDev = v
        if (u.maxStdDev) u.maxStdDev.value = v
      })
    })

    useEffect(() => {
      if (splatRef.current) splatRef.current.raycast = ignoreRaycast
      if (sparkRef.current) sparkRef.current.raycast = ignoreRaycast
    }, [])

    // Publish the active world SplatMesh into the registry so downstream
    // effects (PortalScene's twist worldModifier, future per-splat warps,
    // etc.) can attach without piercing this component. We wait for the
    // SplatMesh's `initialized` promise so the modifier-attach side never
    // races the async load — `mesh.worldModifier = …` immediately calls
    // `updateGenerator()` which compiles a dyno pipeline against the
    // live splat source.
    //
    // LoD itself is built by Spark inside its loading pipeline (because
    // we pass `lod: true` to the `SplatMesh` constructor). That streams
    // the SPZ into a `GsplatArray`, runs Quick LoD, and produces the
    // LoD `PackedSplats` — all before `mesh.initialized` resolves. By
    // the time we get here, `packedSplats.lodSplats` is already populated
    // and `SparkRenderer`'s pager will use it from the first rendered
    // frame onward. (We used to call `mesh.createLodSplats()` here as a
    // post-init step, which is the *re-create after edits* API; doing it
    // that way forced Spark to re-parse all 21M splats a second time
    // after load, adding many seconds of main-thread stall.)
    useEffect(() => {
      const mesh = splatRef.current
      if (!mesh) return
      let cancelled = false
      const spark = sparkRef.current
      console.log('[Spark] SplatRenderer mounted', {
        url,
        sparkRenderer: !!spark,
        enableLodCtor: spark?.enableLod,
        maxPagedSplats: initialMaxPagedSplats.current,
      })
      const t0 = performance.now()
      mesh.initialized
        .then(() => {
          if (cancelled) return
          const tInit = performance.now()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const packed: any = (mesh as any).packedSplats
          console.log('[Spark] SplatMesh initialized (lod: true)', {
            ms: Math.round(tInit - t0),
            numSplats: packed?.numSplats,
            lodSplatsLen: packed?.lodSplats?.numSplats ?? packed?.lodSplats?.length,
            meshEnableLod: mesh.enableLod,
          })
          setActiveSplatMesh(mesh)
        })
        .catch((err: unknown) => {
          console.warn('SplatRenderer: splat mesh failed to initialize', err)
        })
      return () => {
        cancelled = true
        setActiveSplatMesh(null)
      }
    }, [url])

    useEffect(() => {
      if (sparkRef.current) sparkRef.current.encodeLinear = encodeLinear
    }, [encodeLinear])

    // maxPagedSplats sizes Spark's paged GPU pool. Default desktop = 16M which is huge
    // for our 1-3M working set. Pool size must be a multiple of the 65,536 page size.
    // We grab the current LoD budget once (constructor-only knob) and pad ×3 for paging
    // headroom; floor 4M so small budgets don't starve the pager.
    const initialMaxPagedSplats = useRef<number>(
      Math.max(
        4_194_304,
        Math.ceil((useWizardTuning.getState().splatLodSplatCount || 2_500_000) * 3 / 65_536) * 65_536,
      ),
    )
    const sparkArgs = useMemo(() => ({
      renderer,
      enableLod: true,
      encodeLinear: initialEncodeLinear.current,
      maxPagedSplats: initialMaxPagedSplats.current,
    }), [renderer])
    const splatArgs = useMemo(
      () => ({
        url,
        // Spark 2.1 canonical LoD-on-load: `lod: true` tells the loader to
        // decode the SPZ into a `GsplatArray`, run Quick LoD in a background
        // WebWorker, and finish init with `packedSplats.lodSplats` already
        // populated. The SparkRenderer pager (which has `enableLod: true`
        // above) starts paging from frame 0. This is the streaming-pipelined
        // path and is dramatically faster on huge SPZs than calling
        // `createLodSplats()` post-init (which forces Spark to re-parse the
        // whole mesh a second time after load).
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
