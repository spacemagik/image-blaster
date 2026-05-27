/**
 * Sparkle — drop-in magic particle engine for Spark 2.1.
 *
 * Ported from `Desktop/Sparkle/sparkle.js` (user-authored library) to TypeScript
 * so it lives inside the app's type-checked source tree. Pure logic, no React.
 *
 * Wraps `generators.snowBox` from `@sparkjsdev/spark` with a small `Sparkle`
 * class that manages multiple named effects (preset + position + box overrides)
 * inside an existing `THREE.Scene` / `SparkRenderer`.
 */
import * as THREE from 'three'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { SparkRenderer, generators } from '@sparkjsdev/spark'

export type SparklePreset =
  | 'magic'
  | 'fire'
  | 'snow'
  | 'fairy'
  | 'stardust'
  | 'rain'
  | 'smoke'
  | 'ember'

export interface SparkleEffectConfig {
  fallDirection?: THREE.Vector3
  fallVelocity?: number
  wanderScale?: number
  wanderVariance?: number
  color1?: THREE.Color
  color2?: THREE.Color
  anisoScale?: THREE.Vector3
  minScale?: number
  maxScale?: number
  density?: number
  opacity?: number
}

/**
 * Each preset maps to a `generators.snowBox` configuration. Any field can be
 * overridden by passing it in `addEffect(preset, overrides)`.
 */
export const SPARKLE_PRESETS: Record<SparklePreset, SparkleEffectConfig> = {
  magic: {
    fallDirection: new THREE.Vector3(0, 1, 0),
    // Bumped from 0.015 — the original was so slow (1.5 cm/sec) the upward
    // drift looked motionless from gameplay distance. 0.04 reads clearly as
    // "rising motes" without feeling like fast-forward.
    fallVelocity: 0.04,
    wanderScale: 0.025,
    wanderVariance: 4,
    color1: new THREE.Color(0.85, 0.25, 1.0),
    color2: new THREE.Color(1.0, 0.85, 0.1),
    minScale: 0.002,
    maxScale: 0.009,
    density: 180,
    opacity: 0.92,
  },
  fire: {
    fallDirection: new THREE.Vector3(0, 1, 0),
    fallVelocity: 0.04,
    wanderScale: 0.03,
    wanderVariance: 5,
    color1: new THREE.Color(1.0, 0.08, 0.0),
    color2: new THREE.Color(1.0, 0.65, 0.0),
    anisoScale: new THREE.Vector3(0.5, 2.0, 0.5),
    minScale: 0.002,
    maxScale: 0.011,
    density: 280,
    opacity: 0.88,
  },
  snow: {
    fallDirection: new THREE.Vector3(0, -1, 0),
    fallVelocity: 0.012,
    wanderScale: 0.008,
    wanderVariance: 2,
    color1: new THREE.Color(1.0, 1.0, 1.0),
    color2: new THREE.Color(0.75, 0.88, 1.0),
    minScale: 0.003,
    maxScale: 0.009,
    density: 120,
    opacity: 0.9,
  },
  fairy: {
    fallDirection: new THREE.Vector3(0, 0.4, 0),
    fallVelocity: 0.008,
    wanderScale: 0.035,
    wanderVariance: 6,
    color1: new THREE.Color(0.2, 1.0, 0.65),
    color2: new THREE.Color(0.0, 0.7, 1.0),
    minScale: 0.001,
    maxScale: 0.005,
    density: 80,
    opacity: 0.85,
  },
  stardust: {
    fallDirection: new THREE.Vector3(0, -0.2, 0),
    fallVelocity: 0.004,
    wanderScale: 0.012,
    wanderVariance: 3,
    color1: new THREE.Color(1.0, 1.0, 0.6),
    color2: new THREE.Color(1.0, 0.88, 1.0),
    minScale: 0.001,
    maxScale: 0.004,
    density: 350,
    opacity: 0.65,
  },
  rain: {
    fallDirection: new THREE.Vector3(0, -1, 0),
    fallVelocity: 0.08,
    wanderScale: 0.004,
    wanderVariance: 1,
    color1: new THREE.Color(0.5, 0.75, 1.0),
    color2: new THREE.Color(0.7, 0.88, 1.0),
    anisoScale: new THREE.Vector3(0.3, 4.0, 0.3),
    minScale: 0.002,
    maxScale: 0.006,
    density: 200,
    opacity: 0.7,
  },
  smoke: {
    fallDirection: new THREE.Vector3(0, 1, 0),
    fallVelocity: 0.007,
    wanderScale: 0.045,
    wanderVariance: 2,
    color1: new THREE.Color(0.35, 0.35, 0.38),
    color2: new THREE.Color(0.62, 0.62, 0.65),
    minScale: 0.009,
    maxScale: 0.022,
    density: 60,
    opacity: 0.38,
  },
  ember: {
    fallDirection: new THREE.Vector3(0.1, 1, 0.15),
    fallVelocity: 0.022,
    wanderScale: 0.035,
    wanderVariance: 7,
    color1: new THREE.Color(1.0, 0.35, 0.0),
    color2: new THREE.Color(1.0, 1.0, 0.35),
    minScale: 0.001,
    maxScale: 0.004,
    density: 100,
    opacity: 1.0,
  },
}

export interface AddEffectOptions extends SparkleEffectConfig {
  position?: THREE.Vector3
  /**
   * Horizontal half-extent (X & Z). Together with `height` describes a
   * box of size `(2*radius) × (2*height) × (2*radius)`. Use a wide
   * `radius` + small `height` for plane-like "rain curtain" effects.
   * Defaults to 2.
   */
  radius?: number
  /**
   * Vertical half-extent (Y). Defaults to 2. Set to a small value
   * (e.g. 0.5) to spawn particles from a thin sheet rather than a cube.
   */
  height?: number
  /**
   * Hard cap on total particle count, regardless of `density × volume`.
   * snowBox spawns `density * boxVolume` particles by default, so a wide
   * plane-shaped slab at high density can casually hit 1M+ splats and
   * freeze the page. Defaults to 8000 — plenty for a forest mist; bump
   * higher only if you actually want a denser look.
   */
  maxSplats?: number
}

/**
 * The raw return value of Spark's `snowBox` — the snow Object3D plus the
 * mutable dynos that drive its per-frame shader. We pull `fallDirection` and
 * `fallVelocity` out specifically because `setEffectiveDrift` overwrites them
 * each frame to cancel the spawn-box translation in world space (see method
 * doc-block). The rest are kept untyped so the wrapper doesn't have to track
 * Spark's dyno surface (`min`, `max`, `color1`, etc. would just be opaque
 * pass-through).
 */
interface SparkleControls {
  snow: THREE.Object3D & { opacity?: number; position: THREE.Vector3 }
  /** Mutable per-frame drift direction (unit-ish vec3); `.value.copy(v)` to write. */
  fallDirection: { value: THREE.Vector3 }
  /** Mutable per-frame drift speed (scalar). `.value = n` to write. */
  fallVelocity: { value: number }
}

interface SparkleEffectRecord {
  controls: SparkleControls
  preset: SparklePreset | string
  position: THREE.Vector3
  /** Box's `max - min` in local-space units (`(2r, 2h, 2r)`). Cached at
   *  `addEffect` time so `setEffectiveDrift` doesn't have to re-derive it
   *  from the (private) box dynos every frame. */
  boxSize: THREE.Vector3
}

export interface SparkleOptions {
  scene: THREE.Scene
  /**
   * Optional: an existing SparkRenderer to render the particle SplatGenerators.
   * If omitted, Sparkle relies on any SparkRenderer **already in the scene** —
   * Spark's per-frame `scene.traverse` picks up the snow SplatGenerator we add
   * and renders it via that existing renderer. This is the preferred mode when
   * the host app already has a SparkRenderer for its world splat: a second
   * SparkRenderer on the same WebGLRenderer/scene means both renderers traverse
   * the same generators every frame, double-driving Spark's WASM splat sorter
   * and corrupting its LoD/paging state — which manifests as random
   * "Error: unreachable" WASM traps that wipe the entire SPZ from view.
   *
   * Only pass `renderer` (or `sparkRenderer`) explicitly in standalone demos
   * where nothing else has spawned a SparkRenderer yet.
   */
  renderer?: THREE.WebGLRenderer
  sparkRenderer?: SparkRenderer
}

export class Sparkle {
  readonly scene: THREE.Scene
  readonly spark?: SparkRenderer
  private readonly ownsSpark: boolean
  private readonly effects = new Map<number, SparkleEffectRecord>()
  private nextId = 1

  constructor({ scene, renderer, sparkRenderer }: SparkleOptions) {
    if (!scene) throw new Error('Sparkle: `scene` is required.')
    this.scene = scene
    if (sparkRenderer) {
      this.spark = sparkRenderer
      this.ownsSpark = false
    } else if (renderer) {
      this.spark = new SparkRenderer({ renderer })
      scene.add(this.spark)
      this.ownsSpark = true
    } else {
      // Piggy-back on whatever SparkRenderer is already in the scene (see the
      // SparkleOptions doc-block above for why this is the default).
      this.ownsSpark = false
    }
  }

  /**
   * Spawn a particle effect from a named preset, optionally overriding any
   * preset field (color, density, fall velocity, etc.) plus a placement box.
   *
   * Returns a numeric id you keep around to update / remove the effect.
   */
  addEffect(preset: SparklePreset | string, options: AddEffectOptions = {}): number {
    const presetConfig =
      (SPARKLE_PRESETS as Record<string, SparkleEffectConfig>)[preset] ?? SPARKLE_PRESETS.magic
    const {
      position = new THREE.Vector3(),
      radius = 2,
      height = 2,
      maxSplats = 8000,
      ...overrides
    } = options

    const r = Math.max(0.0001, radius)
    const h = Math.max(0.0001, height)
    const box = new THREE.Box3(
      new THREE.Vector3(-r, -h, -r),
      new THREE.Vector3(r, h, r),
    )

    // snowBox computes `density × volume` for the splat count internally.
    // We pre-compute the same value, clamp it to `maxSplats`, and pass the
    // result as `numSplats` to short-circuit the default calculation. This
    // is the only knob that keeps the cost predictable when the user grows
    // the radius — without it, a 50m-wide slab at density 180 spawns 1M+
    // splats and freezes Spark for tens of seconds.
    const density = overrides.density ?? presetConfig.density ?? 100
    const volume = (r * 2) * (h * 2) * (r * 2)
    const numSplats = Math.min(maxSplats, Math.ceil(density * volume))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controls = (generators as any).snowBox({ ...presetConfig, ...overrides, box, numSplats }) as SparkleControls
    controls.snow.position.copy(position)
    this.scene.add(controls.snow)

    const id = this.nextId++
    this.effects.set(id, {
      controls,
      preset,
      position: position.clone(),
      // Cache box dimensions for setEffectiveDrift; matches the Box3 above.
      boxSize: new THREE.Vector3(r * 2, h * 2, r * 2),
    })
    return id
  }

  /** Remove a specific effect by id. */
  removeEffect(id: number) {
    const effect = this.effects.get(id)
    if (!effect) return
    this.scene.remove(effect.controls.snow)
    this.effects.delete(id)
  }

  /** Move an active effect to a new position. Cheap — no rebuild. */
  setPosition(id: number, position: THREE.Vector3) {
    const effect = this.effects.get(id)
    if (!effect) return
    effect.controls.snow.position.copy(position)
    effect.position.copy(position)
  }

  /** Set global opacity multiplier (0–1) on an effect. Cheap — no rebuild. */
  setOpacity(id: number, opacity: number) {
    const effect = this.effects.get(id)
    if (!effect) return
    effect.controls.snow.opacity = opacity
  }

  /**
   * Overwrite the snowBox's per-frame drift so each particle appears to move
   * with `worldDrift` (m/s, world space) regardless of how the spawn box is
   * translating. The intended caller is a per-frame loop that wants particles
   * to stay stationary in world space while the spawn box rides a moving
   * actor (e.g. the player): pass `worldDrift = naturalWorldDrift -
   * playerVelocity` and Sparkle converts it to the dyno-space drift that
   * cancels the spawn-box motion exactly.
   *
   * Derivation: snowBox renders each particle at
   *   `world = snow.position + min + (max - min) * mod(hash + globalOffset, 1)`
   * and advances `globalOffset += fallDirection * fallVelocity * dt` each
   * frame. Taking d/dt (ignoring the modulo wrap discontinuities):
   *   `d(world)/dt = d(snow.position)/dt + (max - min) * fallDir * fallVel`
   * So setting `fallDir * fallVel = worldDrift / (max - min)` makes the
   * world-space motion of every particle equal `worldDrift` regardless of
   * `snow.position`. We pack the result as direction (unit) × magnitude;
   * snowBox doesn't actually require unit direction, but keeping that
   * invariant means the GUI's fall-direction sliders still read sanely if
   * the user inspects the live dyno value.
   *
   * Allocation-free: reuses a single scratch Vector3 so per-frame use is
   * effectively zero-GC.
   */
  setEffectiveDrift(id: number, worldDrift: THREE.Vector3) {
    const effect = this.effects.get(id)
    if (!effect) return
    const bs = effect.boxSize
    // Guard against pathological zero-extent boxes — addEffect clamps `r`
    // and `h` to 1e-4, but be defensive in case future code sets them lower.
    if (bs.x === 0 || bs.y === 0 || bs.z === 0) return
    Sparkle._dynoScratch.set(worldDrift.x / bs.x, worldDrift.y / bs.y, worldDrift.z / bs.z)
    const mag = Sparkle._dynoScratch.length()
    if (mag > 1e-9) {
      effect.controls.fallDirection.value.copy(Sparkle._dynoScratch).divideScalar(mag)
      effect.controls.fallVelocity.value = mag
    } else {
      // Zero net drift — leave direction at its last value and just kill the
      // speed. Avoids divide-by-zero and avoids snapping the unit vector to
      // (0, 0, 0) which would make subsequent non-zero updates start from a
      // degenerate direction.
      effect.controls.fallVelocity.value = 0
    }
  }
  private static readonly _dynoScratch = new THREE.Vector3()

  /** Remove every active effect. */
  removeAll() {
    for (const id of [...this.effects.keys()]) this.removeEffect(id)
  }

  get effectCount(): number {
    return this.effects.size
  }

  get effectIds(): number[] {
    return [...this.effects.keys()]
  }

  getEffectInfo(id: number): { preset: SparklePreset | string; position: THREE.Vector3 } | null {
    const effect = this.effects.get(id)
    if (!effect) return null
    return { preset: effect.preset, position: effect.position.clone() }
  }

  /**
   * Return the underlying Three.js Object3D for an effect, so callers can
   * attach gizmos (TransformControls), helpers (Box3Helper), or read the
   * world matrix. Returned object is owned by Sparkle — don't dispose it.
   */
  getSnowObject(id: number): THREE.Object3D | null {
    return this.effects.get(id)?.controls.snow ?? null
  }

  dispose() {
    this.removeAll()
    if (this.ownsSpark && this.spark) {
      this.scene.remove(this.spark)
    }
  }
}
