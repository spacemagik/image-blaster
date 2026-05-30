/**
 * PortalSpiralOverlay — a procedural rotating-spiral particle effect
 * that lives in the SPZ's local frame.
 *
 * Why this exists:
 *   The dyno-driven swirl in `portalTwist.ts` warps splat positions
 *   directly. That gives "true" rotation but visibly shears the
 *   cosmic SPZ's authored spiral pattern (outer splats rotate more
 *   than inner ones), and any NaN in a uniform can wedge the GPU.
 *
 *   This component takes the opposite trade-off: the SPZ stays
 *   completely untouched (so it always looks crisp like the
 *   authored asset), and we sell the "spinning portal" idea by
 *   rendering a separate particle layer in spiral arms that we
 *   rotate as a single rigid body. Rigid-body rotation can't shear,
 *   can't NaN, and is one matrix multiply per frame regardless of
 *   particle count.
 *
 * Architecture:
 *   <group ref={spinRef}>          ← rotated each frame
 *     <points geometry material /> ← static spiral arm positions
 *   </group>
 *
 *   The component is intended to be mounted as a CHILD of the
 *   cosmic SPZ's proxy <group> in PortalScene, so it inherits the
 *   SPZ's TRS (position / rotation / scale via the gizmo) and stays
 *   visually pinned to the splat. The spiral lies in the parent's
 *   local XY plane and spins around local +Z. To put the spiral on
 *   a different plane the user rotates the parent SPZ.
 *
 * Performance:
 *   `armCount × density` points. With the default 3 × 120 = 360
 *   points this is fully negligible (< 0.1 ms/frame on integrated
 *   GPU). The user can crank density to ~400 per arm before it
 *   starts to compete with the splat passes for fill-rate, mostly
 *   driven by additive-blended overdraw.
 *
 *   The buffer is rebuilt only when SHAPE parameters change
 *   (armCount, density, turns, radius, taper). Per-frame work is
 *   limited to `group.rotation.z += dt * spinRate` plus a single
 *   uniform write for `uGlow` if the user is dragging that slider.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useWizardTuning } from '../character/wizardTuning'

/** Custom shader so we get crisp circular sprites with additive
 *  blending and per-point size driven by a buffer attribute, without
 *  pulling in a texture. The fragment shader draws the disk
 *  procedurally with `smoothstep` for soft edges. */
const SPIRAL_VERTEX_SHADER = /* glsl */ `
  attribute float size;
  varying vec3 vColor;
  varying float vRadial;
  void main() {
    vColor = color;
    // Encode radial distance (0..1) as a second varying so the
    // fragment can fade alpha along the arm without touching colour.
    // We stash it in the unused .w of position via a uniform-free
    // trick: just compute from XY in eye-space-equivalent local
    // coords. (Cleaner alternative: a dedicated attribute, but this
    // saves a buffer.)
    vRadial = length(position.xy);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Perspective-correct point size: bigger when close, smaller far.
    // 300 is the canonical factor that matches three.js's default
    // PointsMaterial perspective behaviour at FOV ≈ 50°.
    gl_PointSize = size * (300.0 / max(0.001, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`

const SPIRAL_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vRadial;
  uniform float uGlow;
  uniform float uOuterRadius;
  void main() {
    // gl_PointCoord ranges 0..1 across the sprite quad; centre it.
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    // Hard discard outside the circle to avoid square sprite edges.
    if (d > 0.5) discard;
    // Soft radial falloff inside the disk → glowing dot.
    float alpha = smoothstep(0.5, 0.0, d);
    // Distance-along-arm falloff (so the arm fades out at the tip
    // rather than terminating in a hard cluster of dots). Normalised
    // by uOuterRadius so the falloff tracks the user's radius slider.
    float armAlpha = 1.0 - smoothstep(0.7, 1.0, vRadial / max(0.001, uOuterRadius));
    gl_FragColor = vec4(vColor * uGlow, alpha * armAlpha);
  }
`

type ColorRGB = readonly [number, number, number]

/** Build the spiral's static geometry (positions / colors / sizes)
 *  from the shape parameters. Pure function so the useMemo
 *  dependency array is the single source of truth for when we
 *  rebuild. */
function buildSpiralGeometry(args: {
  armCount: number
  density: number
  turns: number
  radius: number
  coreColor: ColorRGB
  tailColor: ColorRGB
  pointSize: number
  taper: number
}): THREE.BufferGeometry {
  const { armCount, density, turns, radius, coreColor, tailColor, pointSize, taper } = args
  // Defensive clamps — these come straight from sliders, and a 0 / NaN
  // here would explode the buffer allocation. We don't expect bad
  // values (the GUI slider mins are all > 0), but a stale persisted
  // state from a future-version migration could in theory carry one,
  // and an OOM from `new Float32Array(NaN * 3)` is harder to debug
  // than a forced-min default.
  const safeArms = Math.max(1, Math.min(8, Math.floor(armCount)))
  const safeDensity = Math.max(2, Math.min(800, Math.floor(density)))
  const total = safeArms * safeDensity
  const positions = new Float32Array(total * 3)
  const colors = new Float32Array(total * 3)
  const sizes = new Float32Array(total)
  const cCore = new THREE.Color(coreColor[0], coreColor[1], coreColor[2])
  const cTail = new THREE.Color(tailColor[0], tailColor[1], tailColor[2])
  const scratch = new THREE.Color()
  for (let arm = 0; arm < safeArms; arm++) {
    const armOffset = (arm / safeArms) * Math.PI * 2
    for (let i = 0; i < safeDensity; i++) {
      // Parameter t walks from 0 at the centre to 1 at the rim.
      // We bias slightly off zero so points don't all pile onto the
      // axis (which would produce a bright stationary blob and
      // hide the rotation visually).
      const t = (i + 1) / safeDensity
      const r = t * radius
      // Logarithmic-ish spiral: theta = armOffset + turns × 2π × t.
      // Linear in `t` keeps the arm-spacing visually even; a true
      // log spiral would crowd the centre.
      const theta = armOffset + turns * Math.PI * 2 * t
      const idx = arm * safeDensity + i
      positions[idx * 3 + 0] = Math.cos(theta) * r
      positions[idx * 3 + 1] = Math.sin(theta) * r
      positions[idx * 3 + 2] = 0
      // Lerp core → tail along the arm. `clone()` would allocate
      // each iteration; reuse the scratch Color instead.
      scratch.copy(cCore).lerp(cTail, t)
      colors[idx * 3 + 0] = scratch.r
      colors[idx * 3 + 1] = scratch.g
      colors[idx * 3 + 2] = scratch.b
      // Taper shrinks size linearly from full at centre to
      // (1 − taper) at rim. Clamped to a tiny minimum so the
      // points never vanish entirely (they should be visible at
      // every t for the arm to read as continuous).
      sizes[idx] = Math.max(0.02, pointSize * (1 - t * taper))
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  return geo
}

export function PortalSpiralOverlay() {
  const enabled = useWizardTuning((s) => s.portalSpiralEnabled)
  const armCount = useWizardTuning((s) => s.portalSpiralArmCount)
  const density = useWizardTuning((s) => s.portalSpiralDensity)
  const turns = useWizardTuning((s) => s.portalSpiralTurns)
  const radius = useWizardTuning((s) => s.portalSpiralRadius)
  const coreColor = useWizardTuning((s) => s.portalSpiralCoreColor)
  const tailColor = useWizardTuning((s) => s.portalSpiralTailColor)
  const pointSize = useWizardTuning((s) => s.portalSpiralPointSize)
  const glow = useWizardTuning((s) => s.portalSpiralGlow)
  const taper = useWizardTuning((s) => s.portalSpiralTaper)
  const offsetZ = useWizardTuning((s) => s.portalSpiralOffsetZ)

  // spinRef holds the THREE.Group whose rotation we increment each
  // frame. Using a ref (not state) so spin updates don't trigger
  // React re-renders — `useFrame` mutates the matrix directly.
  const spinRef = useRef<THREE.Group | null>(null)

  // Build the geometry once per shape change. Dependencies are kept
  // narrow so colour-only / size-only tweaks don't rebuild the entire
  // buffer (we only need to rebuild when point COUNT or RADIUS
  // changes; colour/size could in principle be done via uniforms.
  // For simplicity and clarity we rebuild on any shape change — at
  // 360 default points this is sub-millisecond.
  const geometry = useMemo(
    () => buildSpiralGeometry({ armCount, density, turns, radius, coreColor, tailColor, pointSize, taper }),
    [armCount, density, turns, radius, coreColor, tailColor, pointSize, taper],
  )

  // Material is built once and mutated via uniforms. The two
  // animatable inputs (glow, outerRadius) are reads from the store
  // each frame.
  const material = useMemo(
    () => new THREE.ShaderMaterial({
      uniforms: {
        uGlow: { value: glow },
        uOuterRadius: { value: radius },
      },
      vertexShader: SPIRAL_VERTEX_SHADER,
      fragmentShader: SPIRAL_FRAGMENT_SHADER,
      vertexColors: true,
      transparent: true,
      // Additive blending makes overlapping points brighten — gives
      // the spiral arms a natural glow halo around dense clusters.
      // Pair with depthWrite=false so the points don't occlude
      // each other and produce a flat painted disc instead of an
      // additive plasma look.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    // Material recreated only if reference identity changes — but
    // we mutate uniforms below for live changes, so this list is
    // intentionally empty.
    [],
  )

  // Keep the live uniforms in sync without forcing a re-render.
  useEffect(() => {
    material.uniforms.uGlow.value = glow
  }, [material, glow])
  useEffect(() => {
    material.uniforms.uOuterRadius.value = radius
  }, [material, radius])

  // Geometry is owned by useMemo; we need to dispose the prior
  // buffer when shape changes (otherwise the GPU buffers leak).
  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])
  // Material lives for the component's lifetime; dispose on unmount.
  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  useFrame((_, dt) => {
    if (!enabled) return
    const g = spinRef.current
    if (!g) return
    // NaN-safety: a single NaN angle on `rotation.z` propagates into
    // the group's matrix and corrupts every child position to NaN.
    // For a Points buffer that's just invisible; for a SplatMesh
    // sibling (which this isn't, but the principle holds), it wedges
    // the GPU. Explicit Number.isFinite gates because `??` doesn't
    // catch NaN, only null/undefined.
    if (!Number.isFinite(dt)) return
    const rawRate = useWizardTuning.getState().portalSpiralSpinRate
    if (typeof rawRate !== 'number' || !Number.isFinite(rawRate)) return
    // Clamp dt so a backgrounded tab resuming doesn't trigger a big
    // angular jump on the first frame back.
    const dtClamped = Math.min(0.1, Math.max(0, dt))
    const angle = dtClamped * rawRate
    if (!Number.isFinite(angle)) return
    g.rotation.z += angle
  })

  if (!enabled) return null
  return (
    <group position={[0, 0, offsetZ]}>
      <group ref={spinRef}>
        <points
          // Cast through `any` because R3F's typing for <points> wants
          // a complete BufferGeometry attribute set; we provide
          // position/color/size via setAttribute above and that's
          // sufficient at runtime.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          geometry={geometry as any}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          material={material as any}
          raycast={() => {}}
        />
      </group>
    </group>
  )
}
