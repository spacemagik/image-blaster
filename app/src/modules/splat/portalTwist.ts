/**
 * Portal twist — a Spark 2.1 `worldModifier` that warps the world splats
 * inside a sphere, making reality itself swirl around an axis to fake a
 * dimensional portal.
 *
 * Approach:
 *   Spark exposes `SplatMesh.worldModifier`, a `GsplatModifier` (a dyno
 *   block from `gsplat → gsplat`) that runs after the object-to-world
 *   transform on every splat. We attach one whose body, in raw GLSL:
 *
 *     1. Reads each splat's world-space `center` and quaternion.
 *     2. Computes the splat's position relative to the portal center,
 *        a smooth falloff that's 1 at the center and ~0 at the radius,
 *        and a per-splat twist angle = falloff × (strength + time × spinRate).
 *     3. Builds an axis-angle quaternion `q` for that twist.
 *     4. Rotates the splat's offset by `q` (Rodrigues form via quaternion).
 *     5. Composes `q` with the splat's own rotation so the Gaussian
 *        ellipsoid stays oriented correctly relative to its rotated center
 *        (otherwise twisted splats would smear instead of swirl).
 *     6. Returns the new gsplat via `combineGsplat`.
 *
 *   All uniforms (center / axis / radius / strength / spinRate / time /
 *   enabled) are mutable `Dyno*` instances — writing `.value = …` updates
 *   the GPU uniform on the next frame, no shader recompile. The only thing
 *   that does cause a recompile is attaching/detaching the modifier itself,
 *   which we only do once per mesh.
 *
 *   `enabled = false` zeroes the twist angle but the modifier stays in the
 *   pipeline — that means the shader path is identical whether the portal
 *   is "on" or "off", so toggling at runtime is free of recompile hitches.
 *
 * World-space contract:
 *   Because we use `worldModifier` (not `objectModifier`), `gsplat.center`
 *   is already in world space when the shader runs. The `portalCenter`
 *   uniform must therefore be a WORLD-space position — the same coordinate
 *   you'd type into the GUI / read from a TransformControls gizmo.
 */
import * as THREE from 'three'
import {
  dyno as d,
  type SplatMesh,
  type GsplatModifier,
} from '@sparkjsdev/spark'

export interface PortalTwistInitial {
  center?: THREE.Vector3
  axis?: THREE.Vector3
  radius?: number
  /** Radians of twist at the center; smoothly falls off to ~0 by `radius`. */
  strength?: number
  /** Radians/sec extra spin layered on top of `strength`. 0 = static swirl. */
  spinRate?: number
  /**
   * Extra twist angle per unit of perpendicular-to-axis distance, scaled
   * so that `windings = 2π` puts one full spiral revolution between the
   * axis and the radius (i.e. 1 visible spiral arm). 4π = 2 arms, etc.
   * The whole spiral rotates together when `spinRate ≠ 0`, so a non-zero
   * `windings` is what turns the swirl into something that reads as a
   * dimensional portal rather than a uniformly twisted region.
   */
  windings?: number
  enabled?: boolean
  // ── Splat colour modulation: makes the twisted splats *look* like a
  // glowing portal (cyan vortex, arm bands, dark core) instead of just
  // a bent piece of forest. All gated behind `tintEnabled`. ────────────
  /** Master toggle for the colour modulation. When off, position-only
   *  twist is applied and splats keep their original RGBA. */
  tintEnabled?: boolean
  /** Tint colour that splats inside the portal region get blended toward,
   *  weighted by the spherical falloff (full tint at centre, fading at
   *  the rim). */
  tintColor?: THREE.Color
  /** 0..5+ — additional brightness multiplier applied at the arm crests.
   *  Push above 1 to drive bloom; 0 = bands are visible only as darker
   *  troughs against the tinted region. */
  tintEmission?: number
  /** 1..12 — number of distinct angular arm streams visible in the disk
   *  cross-section. 3 matches most fantasy-portal references. */
  tintArms?: number
  /** Log-spiral tightness for the colour bands (how many times they
   *  wrap before reaching the core). Independent of the geometry
   *  `windings` so you can have, say, a subtle position twist with a
   *  busy visible arm pattern. */
  tintWindings?: number
  /** 1..5 — sharpens the arm crests so each stream reads as distinct
   *  instead of a smooth angular gradient. */
  tintContrast?: number
  /** 0..1 — how dark the absolute centre of the portal gets, mimicking
   *  the "tunnel mouth" deep-blue spot seen in most portal art. */
  tintCoreDarkness?: number
}

export interface PortalTwistControls {
  /** Mutable world-space portal center. Update via `controls.center.value.copy(v)`. */
  readonly center: { value: THREE.Vector3 }
  /** Mutable unit axis of rotation. Update via `controls.axis.value.copy(v)`. */
  readonly axis: { value: THREE.Vector3 }
  /** Mutable sphere radius (m) — twist falls off to ~0 at this distance. */
  readonly radius: { value: number }
  readonly strength: { value: number }
  readonly spinRate: { value: number }
  readonly windings: { value: number }
  readonly enabled: { value: boolean }
  readonly tintEnabled: { value: boolean }
  readonly tintColor: { value: THREE.Color }
  readonly tintEmission: { value: number }
  readonly tintArms: { value: number }
  readonly tintWindings: { value: number }
  readonly tintContrast: { value: number }
  readonly tintCoreDarkness: { value: number }
  /** Underlying Spark modifier; attach with `attach(mesh)`. */
  readonly modifier: GsplatModifier
  /** Attach the modifier to a SplatMesh. Idempotent per mesh. */
  attach(mesh: SplatMesh): void
  /** Detach from a SplatMesh. Safe to call even if never attached. */
  detach(mesh: SplatMesh): void
  /** Advance the internal `time` uniform (seconds). Call once per frame. */
  advance(deltaTime: number): void
}

/**
 * Build a portal-twist modifier with live-mutable uniforms. The returned
 * `controls` object holds direct references to the dyno uniform objects —
 * change `controls.strength.value` etc. and the change takes effect next
 * frame without any recompile.
 */
export function makePortalTwist(initial?: PortalTwistInitial): PortalTwistControls {
  const dCenter = d.dynoVec3<THREE.Vector3>(initial?.center?.clone() ?? new THREE.Vector3())
  const dAxis = d.dynoVec3<THREE.Vector3>(
    (initial?.axis ? initial.axis.clone().normalize() : new THREE.Vector3(0, 1, 0)),
  )
  const dRadius = d.dynoFloat(initial?.radius ?? 4)
  const dStrength = d.dynoFloat(initial?.strength ?? Math.PI)
  const dSpinRate = d.dynoFloat(initial?.spinRate ?? 1)
  const dWindings = d.dynoFloat(initial?.windings ?? 0)
  const dTime = d.dynoFloat(0)
  const dEnabled = d.dynoBool(initial?.enabled ?? true)
  const dTintEnabled = d.dynoBool(initial?.tintEnabled ?? true)
  const dTintColor = d.dynoVec3<THREE.Color>(
    initial?.tintColor?.clone() ?? new THREE.Color(0.35, 0.85, 1.0),
  )
  const dTintEmission = d.dynoFloat(initial?.tintEmission ?? 1.5)
  const dTintArms = d.dynoFloat(initial?.tintArms ?? 3)
  const dTintWindings = d.dynoFloat(initial?.tintWindings ?? 8)
  const dTintContrast = d.dynoFloat(initial?.tintContrast ?? 2)
  const dTintCoreDarkness = d.dynoFloat(initial?.tintCoreDarkness ?? 0.55)

  // The big payload: a single statements-based dyno that ingests the split
  // gsplat fields + all uniforms, and emits the rotated center + composed
  // quaternion. Doing the math in raw GLSL (rather than chaining dyno-level
  // helpers like `transformPos` / `transformQuat`) keeps the whole twist
  // calculation in one shader block we can read top-to-bottom and avoids
  // a fan-out of intermediate dynos that the compiler would otherwise have
  // to elide.
  const twistKernel = d.dyno<
    {
      center: 'vec3'
      quaternion: 'vec4'
      rgba: 'vec4'
      portalCenter: 'vec3'
      portalAxis: 'vec3'
      portalRadius: 'float'
      twistStrength: 'float'
      spinRate: 'float'
      windings: 'float'
      time: 'float'
      enabled: 'bool'
      tintEnabled: 'bool'
      tintColor: 'vec3'
      tintEmission: 'float'
      tintArms: 'float'
      tintWindings: 'float'
      tintContrast: 'float'
      tintCoreDarkness: 'float'
    },
    { newCenter: 'vec3'; newQuat: 'vec4'; newRgba: 'vec4' }
  >({
    inTypes: {
      center: 'vec3',
      quaternion: 'vec4',
      rgba: 'vec4',
      portalCenter: 'vec3',
      portalAxis: 'vec3',
      portalRadius: 'float',
      twistStrength: 'float',
      spinRate: 'float',
      windings: 'float',
      time: 'float',
      enabled: 'bool',
      tintEnabled: 'bool',
      tintColor: 'vec3',
      tintEmission: 'float',
      tintArms: 'float',
      tintWindings: 'float',
      tintContrast: 'float',
      tintCoreDarkness: 'float',
    },
    outTypes: { newCenter: 'vec3', newQuat: 'vec4', newRgba: 'vec4' },
    inputs: {
      portalCenter: dCenter,
      portalAxis: dAxis,
      portalRadius: dRadius,
      twistStrength: dStrength,
      spinRate: dSpinRate,
      windings: dWindings,
      time: dTime,
      enabled: dEnabled,
      tintEnabled: dTintEnabled,
      tintColor: dTintColor,
      tintEmission: dTintEmission,
      tintArms: dTintArms,
      tintWindings: dTintWindings,
      tintContrast: dTintContrast,
      tintCoreDarkness: dTintCoreDarkness,
    },
    statements: ({ inputs, outputs }) => [
      // Local position relative to the portal centre (world space).
      `vec3 _local = ${inputs.center} - ${inputs.portalCenter};`,
      // Normalise axis defensively in case the JS side wrote a non-unit vec.
      `vec3 _axis = normalize(${inputs.portalAxis});`,
      // Avoid divide-by-zero from a slider parked at 0 m radius.
      `float _r = max(1e-4, ${inputs.portalRadius});`,
      `float _dist = length(_local);`,
      // Perpendicular-to-axis (radial) distance. This is the "how far from
      // the swirl column" measurement that the windings term scales with —
      // the spherical `_dist` is reserved for the influence-volume falloff.
      `float _axial = dot(_local, _axis);`,
      `float _radial = length(_local - _axis * _axial);`,
      // Gaussian-style falloff: 1 at the centre, ~0.37 at one radius,
      // ~0.018 at 2× radius. Smooth derivative means no visible seam at
      // the edge of the influence sphere — important since the splats
      // we're twisting are part of a continuous world.
      `float _falloff = ${inputs.enabled} ? exp(-(_dist * _dist) / (_r * _r)) : 0.0;`,
      // The angle a splat is rotated by is composed of three parts:
      //   - `twistStrength`     : a base offset (so the whole region looks
      //                           "wound up" even at rest).
      //   - `time * spinRate`   : continuous animation that rotates the
      //                           entire spiral pattern around the axis.
      //   - `windings * (_radial / _r)` : the spiral arms. With this term
      //                           splats at the rim rotate MORE than splats
      //                           on the axis, which is what makes the
      //                           pattern read as a swirl/portal rather
      //                           than a uniformly tumbled blob of world.
      // The entire thing is windowed by `_falloff` so the boundary stays
      // continuous with the un-twisted world outside the radius.
      `float _angle = _falloff * (${inputs.twistStrength} + ${inputs.time} * ${inputs.spinRate} + ${inputs.windings} * (_radial / _r));`,
      `float _ha = 0.5 * _angle;`,
      // Axis-angle → quaternion. `_axis` is unit-length, so this is direct.
      `vec4 _q = vec4(_axis * sin(_ha), cos(_ha));`,
      // Rotate `_local` by `_q` using the Rodrigues quaternion form:
      //   v' = v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
      // Cheaper than building a 3×3 rotation matrix per splat.
      `vec3 _t = 2.0 * cross(_q.xyz, _local);`,
      `vec3 _rotated = _local + _q.w * _t + cross(_q.xyz, _t);`,
      `${outputs.newCenter} = ${inputs.portalCenter} + _rotated;`,
      // Compose: newQuat = _q * existingQuat (Hamilton product). Without
      // this the Gaussian's principal axes would still point in their
      // original directions while their centres orbit — visually you'd see
      // the splats elongate / shear instead of pivoting cleanly.
      `vec4 _a = _q;`,
      `vec4 _b = ${inputs.quaternion};`,
      `${outputs.newQuat} = vec4(`,
      `  _a.w * _b.xyz + _b.w * _a.xyz + cross(_a.xyz, _b.xyz),`,
      `  _a.w * _b.w - dot(_a.xyz, _b.xyz)`,
      `);`,
      // ── Colour modulation ───────────────────────────────────────────
      // Build an orthonormal basis in the plane perpendicular to _axis
      // so we can express each splat as `(angle, radial)` around the
      // axis. The `_refUp` swap avoids a degenerate cross product when
      // the axis happens to be exactly (0,1,0) (or close to it).
      `vec3 _refUp = (abs(_axis.y) < 0.99) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);`,
      `vec3 _u = normalize(cross(_axis, _refUp));`,
      `vec3 _v = cross(_axis, _u);`,
      `float _px = dot(_local, _u);`,
      `float _py = dot(_local, _v);`,
      `float _theta = atan(_py, _px);`,
      // Log-spiral phase for the visible colour arms. The `log()` term
      // is what gives the bands their fantasy-portal "wrap into the
      // centre" shape; a plain linear term would produce flat rings.
      // We clamp `_radial/_r` away from zero so `log()` doesn't blow up
      // exactly on the axis.
      `float _lr = log(max(_radial / _r, 0.05));`,
      `float _bandPhase = ${inputs.tintArms} * _theta + ${inputs.tintWindings} * _lr - ${inputs.time} * ${inputs.spinRate};`,
      `float _bands = 0.5 + 0.5 * sin(_bandPhase);`,
      `_bands = pow(_bands, max(1.0, ${inputs.tintContrast}));`,
      // Tint the original splat colour toward the portal colour by
      // the same Gaussian falloff used for the position twist — so
      // recolour and bend share the exact same boundary.
      `vec4 _origRgba = ${inputs.rgba};`,
      `vec3 _tinted = mix(_origRgba.rgb, ${inputs.tintColor}, _falloff);`,
      // Per-arm brightness: troughs dim to 0.4×, crests punch up to
      // `1 + emission` ×. Push emission >1 to seed the project's bloom
      // pass and get the glowing-edge look from the reference.
      `float _brightMod = mix(0.4, 1.0 + ${inputs.tintEmission}, _bands);`,
      // Darken the absolute centre into a "tunnel mouth". Linear ramp
      // from `(1 - coreDarkness)` at the axis up to 1.0 by r/R = 0.25.
      `float _coreFactor = mix(1.0 - ${inputs.tintCoreDarkness}, 1.0, smoothstep(0.0, 0.25, _radial / _r));`,
      `vec3 _modulated = _tinted * _brightMod * _coreFactor;`,
      // Blend modulated → original by falloff, so splats outside the
      // sphere keep their world colour and the seam is smooth.
      // `tintEnabled` lets the user run pure geometry twist without
      // recolouring (matches the old behaviour) without a recompile.
      `vec3 _finalRgb = ${inputs.tintEnabled} ? mix(_origRgba.rgb, _modulated, _falloff) : _origRgba.rgb;`,
      `${outputs.newRgba} = vec4(_finalRgb, _origRgba.a);`,
    ],
  })

  // Wrap it in a `gsplat → gsplat` block that splits, runs the kernel,
  // and combines. This is the actual `GsplatModifier` Spark expects.
  const modifier = d.dynoBlock(
    { gsplat: d.Gsplat },
    { gsplat: d.Gsplat },
    ({ gsplat }) => {
      if (!gsplat) throw new Error('portal twist: missing gsplat input')
      const split = d.splitGsplat(gsplat).outputs
      const kernel = twistKernel.apply({
        center: split.center,
        quaternion: split.quaternion,
        rgba: split.rgba,
      })
      return {
        gsplat: d.combineGsplat({
          gsplat,
          center: kernel.newCenter,
          quaternion: kernel.newQuat,
          rgba: kernel.newRgba,
        }),
      }
    },
  ) as unknown as GsplatModifier

  const attached = new WeakSet<SplatMesh>()

  return {
    center: dCenter,
    axis: dAxis,
    radius: dRadius,
    strength: dStrength,
    spinRate: dSpinRate,
    windings: dWindings,
    enabled: dEnabled,
    tintEnabled: dTintEnabled,
    tintColor: dTintColor,
    tintEmission: dTintEmission,
    tintArms: dTintArms,
    tintWindings: dTintWindings,
    tintContrast: dTintContrast,
    tintCoreDarkness: dTintCoreDarkness,
    modifier,
    attach(mesh) {
      if (attached.has(mesh)) return
      mesh.worldModifier = modifier
      // Pipeline structure changed (modifier added), so the generator
      // needs a recompile next frame. Just changing uniform values does
      // NOT require this call.
      mesh.updateGenerator()
      attached.add(mesh)
    },
    detach(mesh) {
      if (!attached.has(mesh)) return
      // Only blow away the modifier list if WE installed it — guards
      // against stomping another effect that happens to share the mesh.
      if (mesh.worldModifiers && mesh.worldModifiers.includes(modifier)) {
        mesh.worldModifier = undefined
        mesh.updateGenerator()
      }
      attached.delete(mesh)
    },
    advance(dt) {
      dTime.value += dt
    },
  }
}
