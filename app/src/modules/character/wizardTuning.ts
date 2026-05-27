/**
 * Tuning store for the wizard controller — mirrors the `tuning` object in
 * `Desktop/Astronaut/src/main.ts` so the floating lil-gui panel exposes the
 * exact same field set (folders, labels, ranges) as the astronaut demo.
 *
 * Property names intentionally match the demo (e.g. `dogHeight`,
 * `sprintMoveMultiplier`) so saved-settings JSON stays compatible with the
 * tpc-splat/astronaut serialization format.
 *
 * Color fields are stored as `[r, g, b]` 0–1 tuples (lil-gui's `addColor`
 * accepts that shape natively) so the store stays JSON-serializable for
 * persistence — Three.js Color instances aren't.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SPARKLE_PRESETS, type SparklePreset } from '../splat/sparkle'

export type ColorRGB = [number, number, number]

export type ShadowMapType =
  | 'BasicShadowMap'
  | 'PCFShadowMap'
  | 'PCFSoftShadowMap'
  | 'VSMShadowMap'

export interface WizardTuning {
  // Movement
  moveSpeed: number
  sprintMoveMultiplier: number
  sprintWalkAnimMultiplier: number
  jumpSpeed: number
  gravityY: number
  enableWalkStairs: boolean
  enableStickToFloor: boolean
  /**
   * Rapier KCC `enableSnapToGround` distance in metres. If the floor under the
   * character drops by *less than* this every frame the controller treats the
   * character as still grounded (no airborne animation, no momentum loss).
   *
   * Bump this up if the collider GLB has sparse/large triangles or small dips
   * that flip the character into "fly mode" while walking.
   */
  stickToFloorDistance: number
  /**
   * Max angle (degrees) the KCC will autostep over. Larger values let the
   * character climb taller geometry without going airborne; smaller values
   * keep them planted on flat ground.
   */
  maxSlopeClimbDeg: number
  controlMovementDuringJump: boolean
  enableCharacterInertia: boolean

  // Character mesh
  dogHeight: number
  dogYawDeg: number
  dogOffsetX: number
  dogOffsetY: number
  dogOffsetZ: number
  dogTurnSpeed: number
  dogWalkSpeedThreshold: number
  dogAnimGroundReleaseHold: number
  dogAnimWalkSpeedSmoothing: number
  dogAnimCrossfade: number
  dogWalkAnimTimeScale: number

  // Physics debug
  showPhysicsDebug: boolean
  debugBodies: boolean

  // Splat / Spark
  splatUniformScale: number
  /**
   * Per-splat 180° X-axis flip override. XOR'd with the world manifest's
   * `flip_y` so you can flip JUST the splat without also flipping the collider
   * (which the manifest's `flip_y` would do — same rotation prop goes to both).
   * Useful when a splat and collider were authored in different Y conventions.
   */
  splatFlipYOverride: boolean
  sparkFocalDistance: number
  sparkApertureAngleDeg: number

  // Splat LOD performance (Spark 2.0)
  // Spark embeds an LOD tree in each SPZ; these knobs let us trade quality for FPS
  // without re-encoding the file. Most useful when a single SPZ is very large
  // (e.g., 200MB+ from World Labs) — the renderer can pick a subset of splats.
  splatLodEnabled: boolean
  splatLodSplatScale: number   // 0.1..2.0 (×1.0 = Spark's platform default ~2.5M desktop)
  splatLodRenderScale: number  // 1.0..5.0 px (higher = fewer tiny splats kept)
  splatMaxStdDev: number       // sqrt(4)..sqrt(9) — Gaussian extent, lower = faster
  // Spark 2.1 additions for big SPZs.
  // splatLodSplatCount overrides Spark's platform default budget directly: it caps
  // active splats at this absolute number, which is more predictable than the relative
  // `lodSplatScale`. Set to 0 to fall back to Spark's per-platform default.
  splatLodSplatCount: number   // 0 = auto; otherwise an absolute cap (e.g. 1_500_000)
  splatMinPixelRadius: number  // splats projected smaller than this are discarded (px)
  // Fixed foveation cones — full-res inside `coneFov0`, smoothly degrade out to `coneFov`,
  // then to behind the viewer. Aggressive foveation is the single biggest win on giant
  // SPZs because off-screen and peripheral splats are still loaded otherwise.
  splatConeFov0Deg: number     // 0..180 (default 90)
  splatConeFovDeg: number      // 0..180 (default 120, must be >= splatConeFov0Deg)
  splatConeFoveate: number     // 0..1   (default 0.4, lower = fewer peripheral splats)
  splatBehindFoveate: number   // 0..1   (default 0.2, lower = fewer behind-camera splats)
  splatLodInflate: boolean     // softer kernels; can hide LoD popping at low budgets

  // Lighting
  ambientIntensity: number
  sunIntensity: number
  sunPosX: number
  sunPosY: number
  sunPosZ: number
  sunShadowFollowCharacter: boolean
  sunColor: ColorRGB
  fillIntensity: number
  fillPosX: number
  fillPosY: number
  fillPosZ: number
  fillColor: ColorRGB

  // Shadows
  shadowMapSize: number
  shadowBias: number
  shadowNormalBias: number
  shadowRadius: number
  shadowCameraNear: number
  shadowCameraFar: number
  shadowCameraHalfExtent: number
  shadowMapType: ShadowMapType
  shadowIntensity: number
  shadowBlurSamples: number
  colliderGlbShadowOpacity: number
  colliderGlbShadowColor: ColorRGB

  // Post-processing
  ppEnabled: boolean
  ppBloomIntensity: number
  ppBloomThreshold: number
  ppBloomSmoothing: number
  ppBrightness: number
  ppContrast: number
  ppVignetteDarkness: number
  ppVignetteOffset: number

  // Spawn (image-blaster addition — astronaut hardcoded `spawnFeetY = 4`).
  // Exposed because image-blaster worlds vary in scale + floor height; users need to
  // tune this per world or the character can spawn above the ceiling or below the floor.
  spawnFeetY: number

  // Collider GLB position offset (image-blaster addition).
  // Lets the user nudge a misaligned collider mesh into place at runtime instead of
  // re-exporting from Blender. Applied on top of the world manifest's
  // `ground_plane_offset` (so Y here is additive). Translation only — no rebuild of the
  // trimesh BVH (we call `setTranslation` on the RigidBody directly).
  colliderOffsetX: number
  colliderOffsetY: number
  colliderOffsetZ: number

  // Splat (SPZ) position + rotation offset (image-blaster addition).
  // Mirrors the collider offset but applies to the visible Gaussian splat. Useful when
  // the SPZ was exported in a slightly different reference frame than the collider GLB
  // (e.g. user repositioned the splat in Blender / World Labs but not the matching
  // mesh, or vice-versa). Rotation values stored as degrees so the GUI sliders make
  // intuitive sense; converted to radians at apply time.
  splatOffsetX: number
  splatOffsetY: number
  splatOffsetZ: number
  splatRotationDegX: number
  splatRotationDegY: number
  splatRotationDegZ: number
  // In-canvas 3D gizmo for dragging the splat directly. Off by default because
  // TransformControls intercepts clicks on the canvas; users normally don't want
  // that handle hovering over their world.
  splatGizmoEnabled: boolean
  splatGizmoMode: 'translate' | 'rotate' | 'scale'

  // Scene-object placements (astronaut demo had Flag 2 + Rocket)
  flag2X: number
  flag2Y: number
  flag2Z: number
  flag2RotY: number
  flag2Scale: number
  rocketX: number
  rocketY: number
  rocketZ: number
  rocketRotY: number
  rocketScale: number

  // Sparkles — Spark 2.1 particle effect (sparkle.ts wrapping generators.snowBox).
  // One single configurable effect; preset picker re-seeds the per-field knobs
  // below from `SPARKLE_PRESETS` via `applySparklePreset`.
  sparkleEnabled: boolean
  sparklePreset: SparklePreset
  // Position of the effect bounding box (Vector3-on-disk as flat XYZ).
  sparklePosX: number
  sparklePosY: number
  sparklePosZ: number
  /** Horizontal half-extent (X & Z) of the spawn box. Particles emit
   *  within `(2*radius) × (2*height) × (2*radius)` around the position. */
  sparkleRadius: number
  /** Vertical half-extent (Y). Keep small (≤ 1) for plane-like spawn
   *  curtains (rain, fairy dust ceiling, etc.). */
  sparkleHeight: number
  // Per-particle look.
  sparkleDensity: number      // particles per box-volume unit (input to count)
  /** Hard cap on total particles, regardless of `density × volume`. Without
   *  this, growing radius even slightly explodes the splat count (1M+) and
   *  freezes Spark. 8000 is a safe ceiling for forest-mist effects. */
  sparkleMaxSplats: number
  sparkleOpacity: number      // 0..1 multiplier
  sparkleMinScale: number     // smallest particle size
  sparkleMaxScale: number     // largest particle size
  sparkleColor1: ColorRGB     // gradient endpoint 1
  sparkleColor2: ColorRGB     // gradient endpoint 2
  // Motion.
  sparkleFallVelocity: number // speed along `fallDirection`
  sparkleWanderScale: number  // turbulence amplitude
  sparkleWanderVariance: number
  sparkleFallDirX: number     // direction vector; +Y rises, -Y falls
  sparkleFallDirY: number
  sparkleFallDirZ: number
  /** In-canvas TransformControls gizmo for dragging / scaling the sparkle box. */
  sparkleGizmoEnabled: boolean
  sparkleGizmoMode: 'translate' | 'rotate' | 'scale'
  /** Show a wireframe outline of the spawn box so the user can find the effect. */
  sparkleShowBox: boolean
  /** When true, the spawn slab follows the character's feet every frame so
   *  particles are always around the player (illusion of world-wide atmosphere
   *  without paying for world-wide splats). `sparklePos{X,Y,Z}` then act as a
   *  per-axis offset relative to the character. When false, those fields are
   *  absolute world coordinates and the slab stays put. */
  sparkleFollowCharacter: boolean
  /** Exponential follow time-constant in seconds. 0 = the slab snaps to the
   *  player's feet every frame (the previous behaviour), which makes walking
   *  look like an obvious teleport because all 8K particles translate together
   *  and dwarf their own wander motion. Values > 0 make the slab lerp toward
   *  the target with `α = 1 − exp(−dt / τ)`, so the spawn area trails behind
   *  the player and the natural per-particle wander stays the dominant motion.
   *  Default 0.6 s = noticeable damping at sprint speed but no visible lag when
   *  idle. Larger values look more like world-space fog; smaller values keep
   *  the slab tightly centred on the player. */
  sparkleFollowSmoothing: number
}

export type SplatPerfPreset = 'performance' | 'balanced' | 'quality'

/**
 * Splat-rendering preset table — one click sets every Spark 2.1 LoD knob at once.
 * Tuned for ~20M-splat scenes on a laptop integrated GPU; bigger desktop GPUs can
 * crank `quality` higher freely.
 */
export const SPLAT_PERF_PRESETS: Record<SplatPerfPreset, Partial<WizardTuning>> = {
  // Lock in 60fps even with 20M-splat scenes. Aggressive foveation + tight budget.
  performance: {
    splatLodEnabled: true,
    splatLodSplatScale: 1,
    splatLodSplatCount: 750_000,
    splatLodRenderScale: 3,
    splatMinPixelRadius: 1.25,
    splatMaxStdDev: Math.sqrt(5),
    splatConeFov0Deg: 45,
    splatConeFovDeg: 90,
    splatConeFoveate: 0.25,
    splatBehindFoveate: 0.05,
    splatLodInflate: true,
  },
  // A reasonable default for an integrated GPU on a 20M-splat scene.
  balanced: {
    splatLodEnabled: true,
    splatLodSplatScale: 1,
    splatLodSplatCount: 1_500_000,
    splatLodRenderScale: 2,
    splatMinPixelRadius: 0.75,
    splatMaxStdDev: Math.sqrt(6),
    splatConeFov0Deg: 60,
    splatConeFovDeg: 110,
    splatConeFoveate: 0.35,
    splatBehindFoveate: 0.08,
    splatLodInflate: false,
  },
  // Push detail; expect <60fps on heavy splats / weaker GPUs.
  quality: {
    splatLodEnabled: true,
    splatLodSplatScale: 1,
    splatLodSplatCount: 3_000_000,
    splatLodRenderScale: 1.5,
    splatMinPixelRadius: 0.5,
    splatMaxStdDev: Math.sqrt(7),
    splatConeFov0Deg: 90,
    splatConeFovDeg: 130,
    splatConeFoveate: 0.5,
    splatBehindFoveate: 0.15,
    splatLodInflate: false,
  },
}

export interface WizardTuningStore extends WizardTuning {
  setTuning: (partial: Partial<WizardTuning>) => void
  resetTuning: () => void
  applySplatPerfPreset: (preset: SplatPerfPreset) => void
  /** Re-seed every per-field sparkle knob (colours, motion, density…) from a preset. */
  applySparklePreset: (preset: SparklePreset) => void
  resetToken: number
  bumpResetToken: () => void
}

/**
 * Multiplier applied to a preset's `minScale` / `maxScale` when we copy it into
 * the tuning store. The raw `SPARKLE_PRESETS` values (e.g. fairy's 0.001/0.005)
 * are calibrated for the near-camera Sparkle demo viewer; at our third-person
 * gameplay distance (camera ~3–5 m off the character) they project sub-pixel
 * and disappear entirely. 10× matches what `DEFAULT_WIZARD_TUNING` does for the
 * `magic` preset on first load (0.002→0.02, 0.009→0.09), so switching presets
 * via the GUI no longer makes the particles silently invisible.
 */
const SPARKLE_PRESET_GAMEPLAY_SCALE = 10

/** Convert a Sparkle preset into the flat field set we persist in the store. */
function sparklePresetToTuning(preset: SparklePreset): Partial<WizardTuning> {
  const p = SPARKLE_PRESETS[preset]
  const c1 = p.color1!
  const c2 = p.color2!
  const dir = p.fallDirection!
  return {
    sparklePreset: preset,
    sparkleDensity: p.density!,
    sparkleOpacity: p.opacity!,
    sparkleMinScale: p.minScale! * SPARKLE_PRESET_GAMEPLAY_SCALE,
    sparkleMaxScale: p.maxScale! * SPARKLE_PRESET_GAMEPLAY_SCALE,
    sparkleColor1: [c1.r, c1.g, c1.b],
    sparkleColor2: [c2.r, c2.g, c2.b],
    sparkleFallVelocity: p.fallVelocity!,
    sparkleWanderScale: p.wanderScale!,
    sparkleWanderVariance: p.wanderVariance!,
    sparkleFallDirX: dir.x,
    sparkleFallDirY: dir.y,
    sparkleFallDirZ: dir.z,
  }
}

export const DEFAULT_WIZARD_TUNING: WizardTuning = {
  moveSpeed: 9.5,
  sprintMoveMultiplier: 1.85,
  sprintWalkAnimMultiplier: 1.4,
  jumpSpeed: 12,
  gravityY: -25,
  enableWalkStairs: true,
  enableStickToFloor: true,
  // 0.5 was too tight, 1.5 still gapped on fantasy8/10.glb's big triangles
  // (some edges dip 2+ m). 5 m bridges almost any sparse mesh AND gives
  // sprint-speed traversal (17.5 m/s = 0.29 m/frame at 60 fps) enough
  // headroom that hopping a ledge edge doesn't break the snap chain.
  stickToFloorDistance: 5,
  // Rapier's KCC default is ~45°. Sparse triangulated GLBs sometimes have
  // near-vertical micro-facets along the floor; bumping this lets the
  // controller treat them as walkable instead of slide surfaces.
  maxSlopeClimbDeg: 70,
  controlMovementDuringJump: true,
  enableCharacterInertia: true,

  dogHeight: 7.9,
  // The astronaut demo defaults this to 180 because its dog model's walk cycle points
  // legs in -mesh-Z. silo.glb (and previously wizard.glb) walks toward +mesh-Z, so 0 is
  // the correct default. If you swap in a different .glb that faces the opposite way,
  // slide the Mesh yaw (°) GUI control by ±180.
  dogYawDeg: 0,
  dogOffsetX: 0,
  dogOffsetY: -3.69,
  dogOffsetZ: 0,
  dogTurnSpeed: 6,
  dogWalkSpeedThreshold: 0.08,
  // 0.11 s was tuned for flat ground; on sparse colliders the character pops
  // off the ground for a frame or two on every triangle edge and the walk
  // animation snapped to fall/jump — looked like accidental "fly mode".
  // 0.75 s holds the grounded animation through sustained sprint-over-edge
  // sequences (0.45 s was enough for walk but sprint clears ledges faster).
  dogAnimGroundReleaseHold: 0.75,
  dogAnimWalkSpeedSmoothing: 40,
  dogAnimCrossfade: 0.28,
  dogWalkAnimTimeScale: 0.85,

  showPhysicsDebug: false,
  debugBodies: true,

  splatUniformScale: 1.22,
  // Per-splat extra 180° X flip — leave false by default; flip via GUI only when
  // a specific world's splat is upside-down relative to its collider.
  splatFlipYOverride: false,
  sparkFocalDistance: 0,
  sparkApertureAngleDeg: 0,

  splatLodEnabled: true,
  splatLodSplatScale: 1,
  splatLodRenderScale: 2,
  splatMaxStdDev: Math.sqrt(6),
  splatLodSplatCount: 1_500_000,
  splatMinPixelRadius: 0.75,
  splatConeFov0Deg: 60,
  splatConeFovDeg: 110,
  splatConeFoveate: 0.35,
  splatBehindFoveate: 0.08,
  splatLodInflate: false,

  ambientIntensity: 0.83,
  sunIntensity: 1.62,
  sunPosX: -23.5,
  sunPosY: 43.5,
  sunPosZ: -3.5,
  sunShadowFollowCharacter: true,
  sunColor: [0x94 / 255, 0xb4 / 255, 0xff / 255],
  fillIntensity: 0.32,
  fillPosX: -26,
  fillPosY: 22,
  fillPosZ: -24,
  fillColor: [0xa7 / 255, 0xcd / 255, 0xff / 255],

  shadowMapSize: 4096,
  shadowBias: 0,
  shadowNormalBias: 0,
  shadowRadius: 1,
  shadowCameraNear: 0.5,
  shadowCameraFar: 200,
  shadowCameraHalfExtent: 30,
  shadowMapType: 'PCFSoftShadowMap',
  shadowIntensity: 1,
  shadowBlurSamples: 8,
  colliderGlbShadowOpacity: 0.23,
  colliderGlbShadowColor: [0, 0, 0],

  ppEnabled: true,
  ppBloomIntensity: 0.3,
  ppBloomThreshold: 0.29,
  ppBloomSmoothing: 0.5,
  ppBrightness: -0.1,
  ppContrast: 0.1,
  ppVignetteDarkness: 0.57,
  ppVignetteOffset: 0.5,

  spawnFeetY: 4,

  // Reset for fantasy8 — the fantasy5-tuned offsets don't apply to the new origin.
  // Use the in-canvas gizmo + GUI sliders to dial these in for whatever world is loaded.
  colliderOffsetX: 0,
  colliderOffsetY: 0,
  colliderOffsetZ: 0,

  splatOffsetX: 0,
  splatOffsetY: 0,
  splatOffsetZ: 0,
  splatRotationDegX: 0,
  splatRotationDegY: 0,
  splatRotationDegZ: 0,
  splatGizmoEnabled: false,
  splatGizmoMode: 'translate',

  flag2X: -9.4,
  flag2Y: 2.6,
  flag2Z: 3.3,
  flag2RotY: 93,
  flag2Scale: 3.21,
  rocketX: 8.4,
  rocketY: 9,
  rocketZ: -4.3,
  rocketRotY: -67,
  rocketScale: 9.57,

  // Sparkles — default off so they don't surprise users on a fresh world.
  // The preset+per-field values mirror SPARKLE_PRESETS.magic so toggling
  // enable shows the canonical magic look immediately; preset picker re-seeds
  // every per-field value below via `applySparklePreset`.
  sparkleEnabled: false,
  sparklePreset: 'magic',
  // Character-following defaults: a 20m-radius / 2m-thick slab that rides
  // the player's feet (sparkleFollowCharacter=true below). Position fields
  // are interpreted as offsets from `wizardFeetPos`, so (0, 1, 0) keeps the
  // slab bottom ~at foot level no matter where the player walks.
  //
  // 20m radius is roughly camera-visible range, so every splat the cap
  // allows is on-screen — no waste like the previous 200m world-spanning
  // version. At density 180 the naive count is ~57K (180 × 40 × 2 × 40),
  // capped to 8K → ~0.13 splats/m³, plenty visible at typical 3-rd-person
  // camera distance.
  sparklePosX: 0,
  sparklePosY: 1,
  sparklePosZ: 0,
  sparkleRadius: 20,
  sparkleHeight: 1,
  sparkleDensity: 180,
  sparkleMaxSplats: 8000,
  sparkleOpacity: 0.92,
  // Bumped 10× from the magic preset's 0.002/0.009. The original values
  // come from a near-camera viewer (sparkle.js demo) where you're looking
  // at the box from <1m away; at gameplay third-person distance they're
  // sub-pixel and invisible. 0.02–0.06 = 2cm–6cm splats — clearly visible
  // from 3–5m without looking like floating beach balls.
  sparkleMinScale: 0.02,
  sparkleMaxScale: 0.06,
  sparkleColor1: [0.85, 0.25, 1.0],
  sparkleColor2: [1.0, 0.85, 0.1],
  sparkleFallVelocity: 0.04,
  sparkleWanderScale: 0.025,
  sparkleWanderVariance: 4,
  sparkleFallDirX: 0,
  sparkleFallDirY: 1,
  sparkleFallDirZ: 0,
  sparkleGizmoEnabled: false,
  sparkleGizmoMode: 'translate',
  sparkleShowBox: false,
  sparkleFollowCharacter: true,
  // Defaults to 0 (snap-follow): the spawn box tracks the player tightly,
  // and SparkleScene's per-frame counter-drift cancels that translation in
  // particle space so individual particles stay in WORLD space anyway. So
  // tight follow no longer looks synthetic. The slider stays exposed in the
  // GUI for users who want a deliberate trailing "fog" feel (set τ > 0 to
  // make the slab itself lag behind the player; particles still stay in
  // world space, but the *region* of visible particles drifts too).
  sparkleFollowSmoothing: 0,
}

export const useWizardTuning = create<WizardTuningStore>()(
  persist(
    (set) => ({
      ...DEFAULT_WIZARD_TUNING,
      resetToken: 0,
      setTuning: (partial) => set(partial),
      resetTuning: () => set({ ...DEFAULT_WIZARD_TUNING }),
      applySplatPerfPreset: (preset) => set(SPLAT_PERF_PRESETS[preset]),
      applySparklePreset: (preset) => set(sparklePresetToTuning(preset)),
      bumpResetToken: () => set((s) => ({ resetToken: s.resetToken + 1 })),
    }),
    {
      name: 'image-blaster-wizard-tuning',
      // Bumped on schema change to drop stale persisted values from earlier prototypes.
      // Note: ADDING a new field with a sane default does NOT require bumping — zustand
      // persist's default shallow merge keeps the new default for missing keys. Only bump
      // when removing or renaming a field, or when defaults change meaningfully.
      // v17: hard-reset to baked-in fantasy2 alignment values (moveSpeed=9.5,
      // collider/splat offsets dialed in by hand). Persisted values from earlier
      // tuning sessions would otherwise mask the new defaults.
      // v18: Spark 2.1 LoD upgrade — new defaults for foveation + splat budget;
      // bump so the upgraded defaults apply on next page load.
      // v19: cleared collider/splat offsets back to 0 for fantasy8 (the fantasy5
      // values stopped being meaningful when the world assets changed).
      // v20: added stickToFloorDistance + maxSlopeClimbDeg knobs to fight
      // unintentional airborne / "fly mode" while walking on sparse colliders
      // like fantasy8.glb. Existing persisted state lacks these fields, so bump
      // the version to force defaults to apply.
      // v21: fantasy10.glb's sparse triangulation still flipped the character
      // into fly mode at the v20 defaults. Bumped snap distance 1.5→3, slope
      // 60→70, anim ground-release-hold 0.11→0.45. Migrate only overwrites
      // these three fields so collider / splat / spawn offsets users have
      // dialed in survive the version bump.
      // v22: added Sparkle particle FX (preset + colour/move/scale knobs).
      // Migrate from <22 pulls in default sparkle fields so SparkleScene
      // doesn't see `undefined` on hydrate. v23 nudges the sparkle position
      // + motion fields to "ground mist rising" defaults (slab bottom at
      // y=0, visible upward velocity) — preserves colours/density/scale
      // tuning so anyone who customised those keeps them. v24 introduces
      // `sparkleMaxSplats` (hard cap) AND re-applies sane radius/height
      // because earlier v23 defaults could blow past 1M splats and freeze
      // Spark for tens of seconds during first paint. v25 bumps default
      // particle scales 10× because the preset values (calibrated for a
      // near-camera viewer) were sub-pixel at gameplay distance. v26
      // sizes the slab to fully cover fantasy2's collider GLB
      // (radius 12→200, cap 8000→50000) so particles surround the
      // player no matter where they walk in the 365×331m world. v27
      // pivots to character-following (slab rides feet, position fields
      // become offsets) and drops radius back to 20m / cap to 8K — every
      // splat now lives near the camera so the world-spanning sparseness
      // is no longer needed. v28 adds `sparkleFollowSmoothing` so the slab
      // exponentially lerps toward the player instead of snapping per frame
      // — snap-follow at walk/sprint speed was dominating the per-particle
      // wander and looked obviously synthetic. Missing on older states reads
      // as 0 (snap) which reproduces the bug, so migration force-applies
      // the new default. v29 replaces the smoothing workaround with a
      // proper fix: SparkleScene now overwrites the snowBox fall direction /
      // velocity dynos each frame to cancel the spawn-box motion in particle
      // space, so particles stay in WORLD space even with snap-follow.
      // Smoothing default reverts to 0 since it's no longer needed as a
      // workaround (still exposed for users who want a deliberate "fog"
      // trailing feel).
      version: 29,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      migrate: (persistedState: any, fromVersion: number) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState
        // Always force the v21 anti-fly-mode tuning regardless of what
        // upgrade path the user came from — we want the new defaults to win
        // even if they had stale per-field values from v20 already.
        return {
          ...persistedState,
          stickToFloorDistance: DEFAULT_WIZARD_TUNING.stickToFloorDistance,
          maxSlopeClimbDeg: DEFAULT_WIZARD_TUNING.maxSlopeClimbDeg,
          dogAnimGroundReleaseHold: DEFAULT_WIZARD_TUNING.dogAnimGroundReleaseHold,
          // Older persisted states (v19 and below) lack these splat-perf
          // fields; pull them in from defaults so SparkRenderer doesn't see
          // `undefined`s and skip its setters.
          ...(fromVersion < 18 && {
            splatLodSplatCount: DEFAULT_WIZARD_TUNING.splatLodSplatCount,
            splatMinPixelRadius: DEFAULT_WIZARD_TUNING.splatMinPixelRadius,
            splatConeFov0Deg: DEFAULT_WIZARD_TUNING.splatConeFov0Deg,
            splatConeFovDeg: DEFAULT_WIZARD_TUNING.splatConeFovDeg,
            splatConeFoveate: DEFAULT_WIZARD_TUNING.splatConeFoveate,
            splatBehindFoveate: DEFAULT_WIZARD_TUNING.splatBehindFoveate,
            splatLodInflate: DEFAULT_WIZARD_TUNING.splatLodInflate,
          }),
          // v22: pull in Sparkle defaults so the new fields exist on hydrate.
          ...(fromVersion < 22 && {
            sparkleEnabled: DEFAULT_WIZARD_TUNING.sparkleEnabled,
            sparklePreset: DEFAULT_WIZARD_TUNING.sparklePreset,
            sparklePosX: DEFAULT_WIZARD_TUNING.sparklePosX,
            sparklePosY: DEFAULT_WIZARD_TUNING.sparklePosY,
            sparklePosZ: DEFAULT_WIZARD_TUNING.sparklePosZ,
            sparkleRadius: DEFAULT_WIZARD_TUNING.sparkleRadius,
            sparkleHeight: DEFAULT_WIZARD_TUNING.sparkleHeight,
            sparkleDensity: DEFAULT_WIZARD_TUNING.sparkleDensity,
            sparkleOpacity: DEFAULT_WIZARD_TUNING.sparkleOpacity,
            sparkleMinScale: DEFAULT_WIZARD_TUNING.sparkleMinScale,
            sparkleMaxScale: DEFAULT_WIZARD_TUNING.sparkleMaxScale,
            sparkleColor1: DEFAULT_WIZARD_TUNING.sparkleColor1,
            sparkleColor2: DEFAULT_WIZARD_TUNING.sparkleColor2,
            sparkleFallVelocity: DEFAULT_WIZARD_TUNING.sparkleFallVelocity,
            sparkleWanderScale: DEFAULT_WIZARD_TUNING.sparkleWanderScale,
            sparkleWanderVariance: DEFAULT_WIZARD_TUNING.sparkleWanderVariance,
            sparkleFallDirX: DEFAULT_WIZARD_TUNING.sparkleFallDirX,
            sparkleFallDirY: DEFAULT_WIZARD_TUNING.sparkleFallDirY,
            sparkleFallDirZ: DEFAULT_WIZARD_TUNING.sparkleFallDirZ,
          }),
          // v23: re-seat the slab on the ground + restore visible upward
          // velocity. We force these even if the user already had sparkle
          // fields (from a v22 install) because the original values were
          // bad enough that nobody would have tuned them on purpose.
          ...(fromVersion < 23 && {
            sparklePosX: DEFAULT_WIZARD_TUNING.sparklePosX,
            sparklePosY: DEFAULT_WIZARD_TUNING.sparklePosY,
            sparklePosZ: DEFAULT_WIZARD_TUNING.sparklePosZ,
            sparkleFallVelocity: DEFAULT_WIZARD_TUNING.sparkleFallVelocity,
            sparkleFallDirX: DEFAULT_WIZARD_TUNING.sparkleFallDirX,
            sparkleFallDirY: DEFAULT_WIZARD_TUNING.sparkleFallDirY,
            sparkleFallDirZ: DEFAULT_WIZARD_TUNING.sparkleFallDirZ,
          }),
          // v24: introduce maxSplats cap AND force radius/height back to
          // safe values (a v23 user could have radius=25, height=1.5,
          // which is 1.35M splats without the cap — refresh-freezing).
          ...(fromVersion < 24 && {
            sparkleMaxSplats: DEFAULT_WIZARD_TUNING.sparkleMaxSplats,
            sparkleRadius: DEFAULT_WIZARD_TUNING.sparkleRadius,
            sparkleHeight: DEFAULT_WIZARD_TUNING.sparkleHeight,
          }),
          // v25: bump particle scales 10× — preset values (0.002..0.009)
          // are sub-pixel at gameplay distance so users see nothing even
          // when sparkles are correctly enabled and positioned.
          ...(fromVersion < 25 && {
            sparkleMinScale: DEFAULT_WIZARD_TUNING.sparkleMinScale,
            sparkleMaxScale: DEFAULT_WIZARD_TUNING.sparkleMaxScale,
          }),
          // v26: size the slab to fantasy2's world collider (XZ half-extent
          // ≈ 182m). A user on v24/v25 had radius=12 which is invisible the
          // moment they walk more than 12m from origin; force-overwrite to
          // 200 + bump the cap to 50K so the wider volume still has enough
          // particles to read as atmosphere. Anyone who hand-tuned radius
          // post-hoc will need to re-tune, but the v24/v25 defaults were
          // unusable for actual gameplay so the overwrite is worth it.
          //
          // NOTE: v27 immediately undoes v26 (radius back to 20, cap back to
          // 8K) because v27 introduces character-following — the wide slab is
          // no longer needed. We still keep the v26 migration block so the
          // intermediate state is consistent for anyone whose store happens
          // to land on v26 mid-hydrate, but in practice the v27 block below
          // overwrites both fields again.
          ...(fromVersion < 26 && {
            sparkleRadius: DEFAULT_WIZARD_TUNING.sparkleRadius,
            sparkleMaxSplats: DEFAULT_WIZARD_TUNING.sparkleMaxSplats,
          }),
          // v27: slab now follows the character. Add the new follow toggle
          // (existed only as `undefined` on older states), and force radius
          // + cap back to the camera-bubble defaults because anyone on v25
          // had radius=12 (invisible) and v26 had radius=200 (too sparse to
          // see). Position offsets are preserved — users who manually moved
          // the slab will keep their tuning, it just becomes an offset from
          // feet instead of an absolute world coordinate.
          ...(fromVersion < 27 && {
            sparkleFollowCharacter: DEFAULT_WIZARD_TUNING.sparkleFollowCharacter,
            sparkleRadius: DEFAULT_WIZARD_TUNING.sparkleRadius,
            sparkleMaxSplats: DEFAULT_WIZARD_TUNING.sparkleMaxSplats,
          }),
          // v28: add `sparkleFollowSmoothing`. Older states would land on
          // `undefined`, which the useFrame loop reads as 0 (snap-follow) —
          // i.e. the exact teleport-while-walking bug v28 fixes. Force the
          // new default in so the fix is live on first load post-upgrade.
          ...(fromVersion < 28 && {
            sparkleFollowSmoothing: DEFAULT_WIZARD_TUNING.sparkleFollowSmoothing,
          }),
          // v29: smoothing is no longer the fix for teleport-while-walking
          // (the fall-dyno counter-drift in SparkleScene is). v28 had set
          // the default to 0.6 s as a workaround; reset to 0 (snap) so the
          // particles read as world-space immediately. Users who deliberately
          // dialled smoothing > 0 will see it reset — they can re-set it via
          // the GUI if they liked the trailing feel.
          ...(fromVersion < 29 && {
            sparkleFollowSmoothing: DEFAULT_WIZARD_TUNING.sparkleFollowSmoothing,
          }),
        }
      },
      partialize: (s) => {
        const {
          resetToken: _resetToken,
          setTuning: _set,
          resetTuning: _reset,
          applySplatPerfPreset: _preset,
          applySparklePreset: _sparkle,
          bumpResetToken: _bump,
          ...rest
        } = s
        return rest
      },
    },
  ),
)
