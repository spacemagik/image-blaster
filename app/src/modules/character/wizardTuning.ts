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
import {
  CREATURE_CONFIGS,
  defaultCreatureTransforms,
  type CreatureTransform,
} from '../creatures/creatureConfigs'

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

  /** Multiplier applied to every world-splat RGB pixel in a Spark
   *  `worldModifier` (see `splatGain.ts`). Default 1.5 pushes
   *  brightly-lit splat pixels above the 0.7 bloom threshold so the
   *  composer's bloom pass can glow on them — dark splats stay below
   *  threshold because the multiplier scales them proportionally.
   *  Value of 1.0 = no boost (modifier becomes a pure pass-through).
   *  Range exposed in the GUI is 1..3; the slider hits HDR territory
   *  above ~1.2. */
  splatBrightness: number

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

  // ── Portal twist (Spark 2.1 worldModifier experiment) ──────────────────
  // A spherical region of the world splat is rotated around an axis,
  // smoothly falling off to zero by `portalRadius` so the boundary doesn't
  // pop. `portalStrength` is radians of twist at the centre; `portalSpinRate`
  // (rad/sec) adds continuous animation on top so the portal "swirls".
  // Implemented as a Spark `SplatMesh.worldModifier` running per-splat in
  // GLSL — see `splat/portalTwist.ts` for the dyno that consumes these.
  portalEnabled: boolean
  /** World-space centre of the twist sphere (NOT character-relative). */
  portalPosX: number
  portalPosY: number
  portalPosZ: number
  /** Falloff radius in metres. Twist is ~1× at the centre, ~37% at this
   *  distance, ~2% at 2× this distance. */
  portalRadius: number
  /** Rotation axis (will be normalised in the shader). +Y = swirl around
   *  vertical, +Z = horizontal vortex. */
  portalAxisX: number
  portalAxisY: number
  portalAxisZ: number
  /** Static twist amount at the portal centre (radians). π ≈ half-rotation. */
  portalStrength: number
  /** Continuous spin layered on top (radians/sec). 0 = static swirl. */
  portalSpinRate: number
  /** Spiral-arm density. Radians of EXTRA twist per (radial / radius) =
   *  the angle splats at the rim get rotated by ON TOP of `portalStrength`.
   *  `2π` ≈ one full spiral arm; `4π` ≈ two arms; 0 disables arms entirely
   *  and you get the bulk-twist look. Combined with `portalSpinRate`, the
   *  arms rotate around the axis over time → portal swirl. */
  portalWindings: number
  /** 0..1 axial-extent multiplier on the swirl falloff. Decouples the
   *  influence region's thickness (along `portalAxis`) from its
   *  diameter (perpendicular to axis):
   *    - 1.0 → sphere (axial extent = radial extent). The original
   *      Gaussian falloff. Good for warping 3D regions of a volumetric
   *      splat scene.
   *    - 0.2 → flat disk perpendicular to the axis. Splats more than
   *      ~0.2 × radius along the axis are excluded from the swirl,
   *      which keeps a 2D-spiral SPZ from ballooning into a 3D ball
   *      when its splats get rotated.
   *  Clamped to 1e-4 inside the shader so 0 doesn't divide-by-zero. */
  portalAxialExtent: number
  /** 0..1 multiplier on the GEOMETRIC twist only. The tint band
   *  animation is unaffected.
   *    - 1.0 → splats rotate (current behaviour; outer splats rotate
   *      more than inner ones, so a stationary spiral SPZ visibly
   *      shears as windings increase).
   *    - 0.0 → splats stay in their authored positions, but the tint
   *      pass still animates (`tintColor` bands sweep around the
   *      axis at `spinRate`). Use this for splats that already encode
   *      their own spiral pattern — you get the *appearance* of
   *      rotation without distorting the SPZ.
   *  Intermediate values give a partial geometric twist plus full
   *  tint animation, which can be a nice middle ground. */
  portalGeometryAmount: number
  /** Euler rotation of the portal SPZ (degrees, applied to the proxy group
   *  that wraps the portal SplatMesh). Drives the same proxy the TransformControls
   *  writes into, so rotating with the gizmo flows back through here. */
  portalRotationDegX: number
  portalRotationDegY: number
  portalRotationDegZ: number
  /** Uniform scale of the portal SPZ. Single value because non-uniform
   *  splat scaling distorts the Gaussian kernels in ways that look wrong;
   *  uniform scale is well-defined. */
  portalScale: number
  /** In-canvas TransformControls gizmo for posing the portal. The same
   *  gizmo handles all three modes — flip `portalGizmoMode` to switch. */
  portalGizmoEnabled: boolean
  /** Which transform handle the gizmo exposes: translate / rotate / scale.
   *  Mirrors the world splat's `splatGizmoMode` pattern. */
  portalGizmoMode: 'translate' | 'rotate' | 'scale'
  /** Which object the gizmo currently controls:
   *  - 'splat'  → portalPos/Rot/Scale (visible SPZ)
   *  - 'region' → portalRegionPos*    (swirl influence sphere centre)
   *  Swapping target only changes which proxy the TransformControls is
   *  attached to — both proxies stay mounted, so the sphere stays visible
   *  while you drag the splat (and vice versa). The reason this is a
   *  separate field from `portalGizmoMode` is so users can keep their
   *  preferred handle (e.g. translate) when switching what they're
   *  moving. */
  portalGizmoTarget: 'splat' | 'region'
  /** World-space centre of the swirl influence sphere. Decoupled from
   *  `portalPos*` (which is the SPZ's proxy origin) because the cosmic
   *  SPZ's visible geometry is offset from its object-space origin by
   *  several metres — placing the region at the proxy gives a sphere
   *  that misses every splat. Independent X/Y/Z so the user can drag
   *  the sphere onto the actual visible vortex without disturbing the
   *  splat's pose. Reads into the `portalCenter` dyno uniform each
   *  frame, so the falloff sphere recentres live when these change. */
  portalRegionPosX: number
  portalRegionPosY: number
  portalRegionPosZ: number
  /** Show a translucent sphere helper at the portal so it's easy to find
   *  when the twist effect itself is subtle (low strength, off-camera). */
  portalShowSphere: boolean

  // ── Splat colour modulation (turns the twisted splats into a glowing
  // cyan vortex — the "magical portal" look). Independent of the disk
  // overlay below; this is applied IN the worldModifier so the splats
  // themselves take on the colour. ───────────────────────────────────────
  /** Master toggle for the recolour pass inside the portal region. */
  portalTintEnabled: boolean
  /** Tint colour that splats blend toward as they approach the centre. */
  portalTintColor: ColorRGB
  /** 0..5+ extra brightness multiplier at the spiral-arm crests. Push
   *  above 1 to drive the bloom post-processing. */
  portalTintEmission: number
  /** Number of distinct angular arm streams visible (1–12). */
  portalTintArms: number
  /** Log-spiral tightness for the colour arms (1–30 — higher wraps
   *  the bands more tightly into the centre). */
  portalTintWindings: number
  /** 1–5 — arm crest sharpness. Higher = each arm reads as a discrete
   *  stream instead of a smooth gradient. */
  portalTintContrast: number
  /** 0..1 — how dark the absolute centre of the portal gets (the
   *  "tunnel mouth" look from most portal art). */
  portalTintCoreDarkness: number

  // ── Procedural spiral overlay ─────────────────────────────────────────
  // A rigid-rotation particle layer parented to the cosmic SPZ proxy.
  // Unlike the dyno-driven swirl above, this never touches splat data —
  // it's a separate THREE.Points group that spins as a single rigid
  // body, so it cannot shear / NaN / wedge the GPU. The visible spiral
  // sells the "this portal is spinning" idea while the underlying SPZ
  // stays crisp and untouched. Lives in the SPZ's LOCAL XY plane so
  // moving / rotating / scaling the SPZ via the gizmo drags the spiral
  // with it (it inherits the SPZ's TRS).
  /** Master enable for the procedural spiral overlay. */
  portalSpiralEnabled: boolean
  /** Number of spiral arms (1–8). Higher = denser visual energy. */
  portalSpiralArmCount: number
  /** Points per arm (10–400). Higher = smoother arm, more GPU draw. */
  portalSpiralDensity: number
  /** Spiral tightness — full revolutions from centre to rim. 0.5 =
   *  shallow curl, 3+ = tightly coiled. */
  portalSpiralTurns: number
  /** Radius of the spiral in SPZ-local units. The spiral lies in the
   *  XY plane between (0,0) and ±radius on each axis. */
  portalSpiralRadius: number
  /** Rotation rate in rad/s. Positive = CCW from camera looking down
   *  local +Z. Negative reverses. */
  portalSpiralSpinRate: number
  /** Bright core colour (the "hot" centre of each arm). */
  portalSpiralCoreColor: ColorRGB
  /** Cool tail colour blended to as points move outward. */
  portalSpiralTailColor: ColorRGB
  /** World-space point size before perspective scaling. Higher = chunkier
   *  blobs; lower = fine sparkle dust. */
  portalSpiralPointSize: number
  /** 0..5+ additive emission multiplier. >1 drives bloom for a hot
   *  plasma look. */
  portalSpiralGlow: number
  /** 0..1 size taper from core (0 = uniform, 1 = points shrink to 0 at
   *  the rim). Combine with tail colour for natural fade-out. */
  portalSpiralTaper: number
  /** Z-offset in SPZ-local space (metres). Positive nudges the spiral
   *  toward the camera-facing side of the SPZ; negative pushes it into
   *  the splat depth. Useful when the cosmic SPZ has some axial
   *  thickness and the spiral needs to sit at a specific layer. */
  portalSpiralOffsetZ: number

  // ── Rigid SPZ spin ─────────────────────────────────────────────────────
  // The CHEAPEST and SMOOTHEST way to make the cosmic SPZ "spin": just
  // rotate a wrapper <group> around the SPZ each frame, instead of
  // computing per-splat rotations in a shader. One mat4 multiply per
  // frame regardless of splat count, splats stay in their authored
  // positions (zero shearing / shimmer), can't NaN, can't wedge.
  //
  // Compare:
  //   - portalGeometryAmount (dyno)  → per-splat shader work, can shear
  //     with windings, can NaN if a uniform goes bad
  //   - portalRigidSpinRate (this)   → group.rotateOnAxis once per frame,
  //     buttery smooth, but rotates the SPZ as a single rigid body
  //
  // Set the dyno path to 0 (geometryAmount) when using rigid spin to
  // avoid the two rotation systems compounding awkwardly.
  /** Rotation rate of the rigid spin wrapper, in rad/s. The axis is
   *  `portalAxis` (the same vector that already drives the falloff
   *  region) but applied in the SPZ's LOCAL frame, so tilting the SPZ
   *  via the gizmo rotates the spin axis with it. 0 = no rigid spin. */
  portalRigidSpinRate: number

  /** Per-creature TRS + visibility + gizmo state, keyed by the slugs in
   *  `CREATURE_CONFIGS`. Stored as a record (rather than flat fields)
   *  so adding a new creature is config-only and doesn't require a
   *  schema bump — the migration seeds missing slugs from
   *  `defaultCreatureTransforms()` on hydrate. */
  creatures: Record<string, CreatureTransform>
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

/** Named appearance presets for the cosmic-swirl effect. `hypnosis` is the
 *  current default (slow, mesmerising, soft tint); `dramatic` restores the
 *  faster, more contrasty look that was the default before v42. Each preset
 *  re-seeds the full set of swirl + tint fields so flipping back is a
 *  one-click round-trip without any leftover values from the other mode. */
export type PortalLookPreset = 'hypnosis' | 'dramatic'

export const PORTAL_LOOK_PRESETS: Record<PortalLookPreset, Partial<WizardTuning>> = {
  // Slow, continuous, soft — designed to "trance" rather than flash.
  // Mirrors DEFAULT_WIZARD_TUNING; the preset exists so a user who
  // tried `dramatic` can get back to the baseline without retyping
  // each field.
  //
  // Uses a thin-disk axial extent (0.2) so the swirl stays in the
  // SPZ's spiral plane instead of ballooning into 3D. Pure +Y axis
  // (no tilt) for the same reason — tilted axis + thick falloff was
  // what made the SPZ look like a fuzzy globe.
  hypnosis: {
    portalRadius: 6,
    // +Z axis → vertical disc falloff (XY plane). Matches a cosmic
    // SPZ mounted face-on against a wall. Y-axis would give a flying-
    // saucer slice that misses most of the spiral.
    portalAxisX: 0,
    portalAxisY: 0,
    portalAxisZ: 1,
    portalStrength: 0,
    portalSpinRate: 0.5,
    portalWindings: Math.PI,
    portalAxialExtent: 0.2,
    // Tint-only animation by default — splats stay in their authored
    // spiral pattern (crisp arms, no shearing) while the cyan band
    // pattern sweeps around the axis at spinRate. This is what the
    // user wants for the cosmic SPZ: "visible swirling but the splats
    // don't break". They can dial geometryAmount up if they decide
    // they DO want the splats to physically rotate.
    portalGeometryAmount: 0,
    portalTintEmission: 0.6,
    portalTintContrast: 1.2,
    portalTintCoreDarkness: 0.35,
  },
  // The pre-hypnosis look: tighter radius, faster spin, sharper /
  // brighter arm bands. Reads as "actively glowing portal" rather
  // than "trance". Uses spherical falloff (axialExtent = 1) since
  // the dramatic look was originally tuned for that, and rotates
  // visibly with a flat disk anyway.
  dramatic: {
    portalRadius: 5,
    portalAxisX: 0,
    portalAxisY: 1,
    portalAxisZ: 0,
    portalStrength: Math.PI * 0.5,
    portalSpinRate: 1,
    portalWindings: Math.PI * 0.5,
    portalAxialExtent: 1,
    // Full geometric twist — this is the "rotate the actual splats"
    // look. Pair with the higher emission/contrast for an active
    // portal feel where the geometry is clearly churning.
    portalGeometryAmount: 1,
    portalTintEmission: 1.5,
    portalTintContrast: 2,
    portalTintCoreDarkness: 0.55,
  },
}

export interface WizardTuningStore extends WizardTuning {
  setTuning: (partial: Partial<WizardTuning>) => void
  resetTuning: () => void
  applySplatPerfPreset: (preset: SplatPerfPreset) => void
  /** Re-seed every per-field sparkle knob (colours, motion, density…) from a preset. */
  applySparklePreset: (preset: SparklePreset) => void
  /** Re-seed the full set of cosmic-swirl + tint fields from a named preset. */
  applyPortalLookPreset: (preset: PortalLookPreset) => void
  /** Patch a single creature's transform. Merges into the existing record
   *  (other creatures untouched) — exposed as a dedicated action so we
   *  don't accidentally clobber the whole `creatures` record on a
   *  partial update via `setTuning`. */
  setCreatureTransform: (slug: string, partial: Partial<CreatureTransform>) => void
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

  // Gain multiplier applied to every world-splat RGB pixel via
  // the `worldModifier` in `splatGain.ts`.
  //
  // v52 shipped 1.5 (overcooked); v53 dropped it to 1.2 (still
  // pushed too many pixels into ACES Filmic's highlight-desaturation
  // curve, leaving the scene grey); v54 lands on 1.05 — barely a
  // push at all. With this gain a midtone (~0.5) only reaches ~0.53
  // so it's nowhere near the 0.85 bloom threshold AND well clear of
  // ACES's saturation rolloff. Only genuine specular hits (already
  // ~0.85+ in LDR) get bumped over the threshold to bloom subtly,
  // preserving the actual colours of everything else.
  splatBrightness: 1.05,

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
  // Cosmic swirl — defaults baked from the hand-tuned "cosmic" pose the
  // user landed on after iterating on placement and scale in-canvas.
  // Position drops the SPZ at the back-left of the fantasy2 world (around
  // (-27, 4, -83)) where it sits naturally against the existing scenery
  // rather than overlapping the wizard's spawn. Scale ~8.46 sizes the
  // portal so it reads as a landmark vortex rather than a desktop trinket.
  // Slight X tilt (~9°) gives the swirl axis a subtle lean so the spiral
  // arms aren't perfectly horizontal — looks more "energetic". The swirl
  // effect itself stays disabled by default so first-load is calm; user
  // flips `Enable swirl` to start the animation.
  portalEnabled: false,
  portalPosX: -26.650,
  portalPosY: 3.67319,
  portalPosZ: -83.276,
  // ── "Hypnosis swirl" preset baked as the default. Tuned to read as
  // a slow, mesmerising flow rather than a sharp twist:
  //   - Radius 6m covers the visible spiral (radius 11 rotated outer
  //     splats into geometry occlusion = "splats vanished" bug)
  //   - Axis (0.1, 1, 0) — mostly Y (SPZ symmetry axis) with a slight
  //     X lean so the swirl wobbles with the SPZ's 9° tilt
  //   - Twist 0 — no static offset, pure time-driven motion
  //   - Spin 0.5 rad/s — one revolution every ~12 s, "lazily
  //     mesmerising" rather than fast
  //   - Windings π — visible spiral arms without tearing the SPZ
  // Users can swap to the previous "Dramatic" look via the GUI preset
  // button (PORTAL_LOOK_PRESETS.dramatic) if they want a faster, more
  // contrasty swirl.
  portalRadius: 6,
  // +Z axis = world depth (into / out of the camera). For a wall-
  // mounted SPZ that faces roughly along ±Z, this puts the disk
  // falloff in the world XY plane — a VERTICAL disc, matching the
  // cosmic spiral's authored orientation. Users can adjust the X/Y/Z
  // axis sliders if their SPZ is mounted differently. Previously
  // defaulted to +Y (horizontal disc), which was incompatible with
  // a vertically-facing spiral and made the swirl region look like
  // a flying-saucer slice instead of wrapping the spiral pattern.
  portalAxisX: 0,
  portalAxisY: 0,
  portalAxisZ: 1,
  portalStrength: 0,
  portalSpinRate: 0.5,
  portalWindings: Math.PI,
  // 0.2 = thin disk perpendicular to the rotation axis. This is what
  // keeps the cosmic SPZ's 2D spiral pattern flat under the swirl —
  // without it, the spherical falloff drags axial splats during
  // rotation and the disk fluffs into a 3D ball.
  portalAxialExtent: 0.2,
  // 0 = "swirl-by-tint": the SPZ's splat positions are LEFT ALONE so
  // its authored spiral pattern stays crisp, and the rotation
  // illusion comes from the tint pass sweeping the cyan arm bands
  // around the axis at `portalSpinRate`. Dial up toward 1 to also
  // rotate the splat positions (looks more 'churning' but starts to
  // shear the SPZ visibly past ~0.3 with non-zero windings).
  portalGeometryAmount: 0,
  portalRotationDegX: 9.02233,
  portalRotationDegY: 0,
  portalRotationDegZ: 0,
  portalScale: 8.45987,
  portalGizmoEnabled: false,
  portalGizmoMode: 'translate',
  portalGizmoTarget: 'splat',
  // Region centre seeded to the hand-tuned visible-vortex centroid of the
  // cosmic SPZ at the default splat pose (scale 8.46, X-tilt 9°). With the
  // proxy at (-26.65, 3.67, -83.28) and the SPZ's internal centroid roughly
  // (0, ~0.4, 0) in object space, the visible swirl ends up a couple of
  // metres above + slightly forward of the proxy origin. Defaults below put
  // the region sphere on top of that visible mass so `Enable swirl` does
  // something on the very first toggle — without this, the user would see
  // the same "region empty, swirl invisible" bug as the v38 release.
  portalRegionPosX: -26.650,
  portalRegionPosY: 6.5,
  portalRegionPosZ: -83.276,
  // v55: was `true`. This is the translucent purple bubble helper
  // rendered around the cosmic swirl to visualise its region of
  // effect — a debug aid from the dyno-portal experiment that's
  // no longer reachable from the GUI (removed in the cosmic-swirl
  // simplification). v51 migration disabled it for users coming
  // from older versions, but fresh installs were still hitting
  // the default `true`. Default-off now so the helper has no way
  // to appear unless someone reaches into the store directly.
  portalShowSphere: false,

  // Splat tint — defaults give the same cyan-vortex look but applied
  // directly to the swirled splats themselves. On by default so that
  // when the user enables `portalEnabled`, the splats inside the sphere
  // immediately read as a glowing portal instead of just bent forest.
  // Tuned for the hypnosis preset: softer arm crests (contrast 1.2,
  // emission 0.6) blend into a continuous flow instead of strobing
  // bright bands; gentler core darkness (0.35) keeps it reading as
  // "swirl" rather than "tunnel". Bumped contrast + emission + core
  // available via the "Dramatic" GUI preset for the previous look.
  portalTintEnabled: true,
  portalTintColor: [0.35, 0.85, 1.0],
  portalTintEmission: 0.6,
  portalTintArms: 3,
  portalTintWindings: 8,
  portalTintContrast: 1.2,
  portalTintCoreDarkness: 0.35,

  // Spiral overlay defaults — OFF by default. The additive overlay
  // bleeds through world splats (Gaussian Splats don't write depth in
  // the way standard meshes do, so transparent overlays in front of
  // them can't be reliably occluded). The rigid-spin path below
  // gives the "this portal is spinning" feel without that issue, so
  // we leave the overlay opt-in for users who specifically want it.
  portalSpiralEnabled: false,
  portalSpiralArmCount: 3,
  portalSpiralDensity: 120,
  portalSpiralTurns: 1.5,
  portalSpiralRadius: 6,
  // 0.8 rad/s ≈ one full revolution every ~8s. Reads as "alive" without
  // being motion-sickness territory. Negative for opposite direction.
  portalSpiralSpinRate: 0.8,
  // Hot cyan core → cooler magenta tail. Matches the cosmic SPZ palette
  // so the overlay reads as the SPZ's own energy.
  portalSpiralCoreColor: [0.7, 0.95, 1.0],
  portalSpiralTailColor: [0.55, 0.3, 0.95],
  portalSpiralPointSize: 0.18,
  // 1.4 = slight HDR push so additive blending produces a glow halo
  // around each point. >2 starts driving the bloom pass.
  portalSpiralGlow: 1.4,
  // 0.55 = points are ~half-size at the tail. Combined with the tail
  // colour shift, this gives a soft "evaporating" arm-end feel.
  portalSpiralTaper: 0.55,
  // 0 = spiral sits exactly in the SPZ's local XY plane. Bump a few
  // cm if the cosmic SPZ has thickness that swallows the spiral.
  portalSpiralOffsetZ: 0,

  // 0 = SPZ stays perfectly still in place. The "spinning portal"
  // illusion comes entirely from the dyno tint pass (cyan bands
  // sweeping around the axis without touching splat positions).
  // Users who want physical rotation can crank this from the GUI;
  // ±6.28 rad/s ≈ ±1 revolution/sec.
  portalRigidSpinRate: 0,

  sparkleFollowCharacter: true,
  // Defaults to 0 (snap-follow): the spawn box tracks the player tightly,
  // and SparkleScene's per-frame counter-drift cancels that translation in
  // particle space so individual particles stay in WORLD space anyway. So
  // tight follow no longer looks synthetic. The slider stays exposed in the
  // GUI for users who want a deliberate trailing "fog" feel (set τ > 0 to
  // make the slab itself lag behind the player; particles still stay in
  // world space, but the *region* of visible particles drifts too).
  sparkleFollowSmoothing: 0,

  creatures: defaultCreatureTransforms(),
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
      applyPortalLookPreset: (preset) => set(PORTAL_LOOK_PRESETS[preset]),
      setCreatureTransform: (slug, partial) =>
        set((s) => {
          // Always seed from the registry's default first so a slug
          // that the user has never touched still hydrates with a
          // valid transform. Without this, patching a single field
          // (e.g. `posX` from the gizmo) on a missing slug would
          // produce `{ posX: 1.2 }` with nine `undefined`s — every
          // downstream selector would then read NaN for the missing
          // axes and the proxy group's matrix would corrupt.
          const fallback = DEFAULT_WIZARD_TUNING.creatures[slug]
          const existing = s.creatures[slug] ?? fallback
          if (!existing) return s
          return {
            creatures: {
              ...s.creatures,
              [slug]: { ...existing, ...partial },
            },
          }
        }),
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
      // v49: introduces the `creatures` record (Verdant Guardian /
      // Verdant Sentinel / Vinebound Sentinel GLBs). Stored as a
      // `Record<slug, CreatureTransform>` so adding a new creature is
      // config-only — the migration backfills any missing slugs from
      // `defaultCreatureTransforms()` on hydrate, no schema bump
      // required for future additions.
      // v50: one-shot force-enable for all creatures, because users who
      // hit the (now-removed) "Hide all creatures" panic button during
      // the perf-debugging phase ended up with `enabled: false`
      // persisted across reloads — and there was no way to recover
      // without manually toggling each subfolder. We now make the GLBs
      // cheap to render at load time (texture downscale + PBR strip in
      // CreaturesScene.optimizeCreatureGltf), so the "panic hide" is
      // no longer needed; this migration restores visibility one time
      // so you don't have to re-enable each creature by hand.
      //
      // v51: pin every dyno/tint/spiral knob to a no-op value and seed
      // `portalRigidSpinRate = 0.5` so the simplified Cosmic-swirl GUI
      // ("Enable rotation" toggle, see WizardGui.tsx) has a single
      // motion path it can drive. The dyno modifier in portalTwist.ts
      // still attaches in PortalScene when `portalEnabled` is true, but
      // every uniform it reads (twist strength, geometry amount,
      // windings, tint colour mix) is now zero/off, so the shader is a
      // pure pass-through. Cheaper than reworking the attach pipeline
      // and lets us bring back the old controls later without another
      // schema bump. `portalEnabled` itself is force-OFF so the dyno
      // doesn't even attach by default — the rigid spin path is
      // entirely independent of it.
      //
      // v52: introduce `splatBrightness` (default 1.5) so the world
      // splat's bright pixels get pushed into HDR (>1.0 linear) and the
      // bloom pass can pick them up. Without this the SPZ's colours
      // max out at 1.0 LDR — right at the bloom threshold — so
      // bloom looked broken once the cosmic-SPZ tint pass was
      // disabled in v51. See `splatGain.ts` for the modifier impl.
      version: 55,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      migrate: (persistedState: any, fromVersion: number) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState
        // Always force the v21 anti-fly-mode tuning regardless of what
        // upgrade path the user came from — we want the new defaults to win
        // even if they had stale per-field values from v20 already.
        const migrated: Record<string, unknown> = {
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
      // v30: introduces the portal-twist experiment. Older persisted
      // states lack every `portal*` field; pull them in from defaults so
      // PortalScene doesn't see `undefined` and skip uniform writes. The
      // portal is `portalEnabled: false` by default, so existing users
      // see exactly the same scene on upgrade — they have to opt in via
      // the GUI to make the splats swirl.
      ...(fromVersion < 30 && {
        portalEnabled: DEFAULT_WIZARD_TUNING.portalEnabled,
        portalPosX: DEFAULT_WIZARD_TUNING.portalPosX,
        portalPosY: DEFAULT_WIZARD_TUNING.portalPosY,
        portalPosZ: DEFAULT_WIZARD_TUNING.portalPosZ,
        portalRadius: DEFAULT_WIZARD_TUNING.portalRadius,
        portalAxisX: DEFAULT_WIZARD_TUNING.portalAxisX,
        portalAxisY: DEFAULT_WIZARD_TUNING.portalAxisY,
        portalAxisZ: DEFAULT_WIZARD_TUNING.portalAxisZ,
        portalStrength: DEFAULT_WIZARD_TUNING.portalStrength,
        portalSpinRate: DEFAULT_WIZARD_TUNING.portalSpinRate,
        portalGizmoEnabled: DEFAULT_WIZARD_TUNING.portalGizmoEnabled,
        portalShowSphere: DEFAULT_WIZARD_TUNING.portalShowSphere,
      }),
      // v31: introduces `portalWindings` so the twist reads as a rotating
      // spiral (visible arms) instead of a uniformly tumbled blob. Older
      // states would land on undefined → 0 (no arms), so seed the default
      // so anyone re-enabling the portal sees the spiral immediately.
      ...(fromVersion < 31 && {
        portalWindings: DEFAULT_WIZARD_TUNING.portalWindings,
      }),
      // v32: previously seeded a procedural glowing-disk overlay portal
      // visual (`portalDisk*` fields). Removed in v34 — the disk was made
      // redundant by the in-splat tint pass added in v33 (the splats
      // themselves now read as the glowing portal). No-op here so the
      // version number stays monotonic.
      // v33: splat-tint pass — the twist modifier now also recolours the
      // splats inside the sphere so they read as a glowing cyan vortex
      // (matching the user's reference) instead of just bent forest.
      // Without these defaults the dyno uniforms would receive undefined
      // and Spark would either skip the pass or sample garbage colours.
      // tintEnabled defaults to true so the moment a user toggles
      // `portalEnabled` they see the magical-portal look immediately.
      ...(fromVersion < 33 && {
        portalTintEnabled: DEFAULT_WIZARD_TUNING.portalTintEnabled,
        portalTintColor: DEFAULT_WIZARD_TUNING.portalTintColor,
        portalTintEmission: DEFAULT_WIZARD_TUNING.portalTintEmission,
        portalTintArms: DEFAULT_WIZARD_TUNING.portalTintArms,
        portalTintWindings: DEFAULT_WIZARD_TUNING.portalTintWindings,
        portalTintContrast: DEFAULT_WIZARD_TUNING.portalTintContrast,
        portalTintCoreDarkness: DEFAULT_WIZARD_TUNING.portalTintCoreDarkness,
      }),
      // v34: drop the now-removed `portalDisk*` keys. Users on v32/v33
      // have them in localStorage; if we leave the keys hanging around
      // they bloat the persisted JSON forever and confuse future
      // diff-based debugging. Deletion below uses `Reflect.deleteProperty`
      // because TypeScript's `delete` operator doesn't play nicely with
      // a typed spread.
        }
        // v35 cleanup: the procedural glowing-disk visual was removed in
        // favour of the in-splat tint pass (v33) — the splats themselves
        // are now the portal visual, so the overlay disk became redundant.
        // Older persisted states still have the `portalDisk*` keys floating
        // around; strip them so the JSON stays clean and nothing else can
        // accidentally read a stale toggle. Done as an explicit delete pass
        // rather than a spread-omit because the latter requires knowing the
        // full type up front.
        // (Bumped to v35 because v34 was briefly published with the cleanup
        // gated on `fromVersion < 34` — anyone who hydrated against that
        // pre-cleanup version 34 still has the keys lingering, hence the
        // re-run at v35.)
        if (fromVersion < 35) {
          for (const k of [
            'portalShowDisk',
            'portalDiskColor',
            'portalDiskScale',
            'portalDiskOpacity',
            'portalDiskArms',
            'portalDiskWindings',
            'portalDiskSpeed',
            'portalDiskCoreDarkness',
            'portalDiskContrast',
            'portalDiskFaceCamera',
          ]) Reflect.deleteProperty(migrated, k)
        }
        // v36: portal SPZ now spawns AT the character's spawn position
        // (Y = spawnFeetY) instead of an arbitrary 2 m. Older states have
        // `portalPosY: 2` baked in from the v30 seed; overwrite them with
        // the new default so the portal lands at the wizard's feet on
        // next load. We reset all three axes (XZ were already 0, so this
        // is effectively a Y-only change) to keep the migration intent
        // obvious and self-documenting.
        if (fromVersion < 36) {
          migrated.portalPosX = DEFAULT_WIZARD_TUNING.portalPosX
          migrated.portalPosY = DEFAULT_WIZARD_TUNING.portalPosY
          migrated.portalPosZ = DEFAULT_WIZARD_TUNING.portalPosZ
        }
        // v37: portal gizmo upgraded from translate-only to the full
        // translate/rotate/scale picker (matches the world splat). Seed
        // the new rotation/scale/mode fields so older states don't end
        // up with `undefined` flowing into proxy.rotation / proxy.scale
        // (which would silently render the portal at scale 0).
        if (fromVersion < 37) {
          migrated.portalRotationDegX = DEFAULT_WIZARD_TUNING.portalRotationDegX
          migrated.portalRotationDegY = DEFAULT_WIZARD_TUNING.portalRotationDegY
          migrated.portalRotationDegZ = DEFAULT_WIZARD_TUNING.portalRotationDegZ
          migrated.portalScale = DEFAULT_WIZARD_TUNING.portalScale
          migrated.portalGizmoMode = DEFAULT_WIZARD_TUNING.portalGizmoMode
        }
        // v38: bake the user's hand-tuned "cosmic" placement into the
        // defaults (position ≈ (-27, 4, -83), uniform scale ≈ 8.46, slight
        // X-axis tilt). Force-overwrite the matching portal* keys here so
        // any persisted state from v36/v37 (which still has the
        // wizard-spawn defaults of (0, 4, 0) + scale 1) snaps to the new
        // canonical cosmic pose on next load. The fields we re-seed are
        // exactly the ones the new DEFAULT_WIZARD_TUNING moved — radius,
        // strength, spin, axis, and windings already matched the previous
        // defaults so they don't need a reset.
        if (fromVersion < 38) {
          migrated.portalPosX = DEFAULT_WIZARD_TUNING.portalPosX
          migrated.portalPosY = DEFAULT_WIZARD_TUNING.portalPosY
          migrated.portalPosZ = DEFAULT_WIZARD_TUNING.portalPosZ
          migrated.portalRotationDegX = DEFAULT_WIZARD_TUNING.portalRotationDegX
          migrated.portalRotationDegY = DEFAULT_WIZARD_TUNING.portalRotationDegY
          migrated.portalRotationDegZ = DEFAULT_WIZARD_TUNING.portalRotationDegZ
          migrated.portalScale = DEFAULT_WIZARD_TUNING.portalScale
        }
        // v39: split the swirl-region centre from the SPZ proxy position.
        // Previously, the translucent region sphere was a child of the
        // SPZ's proxy group, so it sat at the proxy origin — but the
        // cosmic SPZ's visible mass is offset from its object-space
        // origin, which meant the sphere (and therefore the falloff
        // volume the worldModifier reads from `portalCenter`) covered
        // empty world space and the splats never entered it → "Enable
        // swirl does nothing". The new `portalRegionPos*` fields hold
        // an independent world-space centre for the region; defaulting
        // to the hand-tuned visible-vortex spot on top of the SPZ means
        // first-load swirl actually works. `portalGizmoTarget = 'splat'`
        // preserves the v38 gizmo-on-splat behaviour for users coming
        // from the previous version.
        if (fromVersion < 39) {
          migrated.portalRegionPosX = DEFAULT_WIZARD_TUNING.portalRegionPosX
          migrated.portalRegionPosY = DEFAULT_WIZARD_TUNING.portalRegionPosY
          migrated.portalRegionPosZ = DEFAULT_WIZARD_TUNING.portalRegionPosZ
          migrated.portalGizmoTarget = DEFAULT_WIZARD_TUNING.portalGizmoTarget
        }
        // v40: re-aim the swirl and stop tearing the splats apart.
        //
        // First attempt: tried to flip the swirl axis to world +X
        // based on "swirl when facing the character" intent. This was
        // wrong for the cosmic SPZ — rotating around its non-symmetry
        // axis tipped the spiral disk edge-on to the camera and made
        // it appear to vanish. v41 below corrects the axis back to Y
        // (the SPZ's actual symmetry axis), but keeps the v40 strength
        // and windings dial-down because those were genuine wins
        // (original π + 4π values shredded the splats regardless of
        // axis). We still run the v40 block on older states so they
        // pick up the gentler strength immediately, but v41 overwrites
        // the axis fields that v40 got wrong.
        if (fromVersion < 40) {
          migrated.portalStrength = DEFAULT_WIZARD_TUNING.portalStrength
        }
        // v41: restore the swirl axis to the SPZ's symmetry axis (+Y)
        // and adopt a small `windings` term so the otherwise-invisible
        // rigid rotation around that axis becomes visible as a per-
        // radius differential twist. v40 had set windings to 0 + axis
        // to X, which is "valid" but for the cosmic SPZ specifically
        // it (a) made the SPZ disappear by flipping it edge-on, and
        // (b) would have been invisible anyway if the axis was Y. The
        // v41 combination — Y-axis rotation + small per-radius warp —
        // gives a smooth, readable swirl on the actual asset.
        if (fromVersion < 41) {
          migrated.portalAxisX = DEFAULT_WIZARD_TUNING.portalAxisX
          migrated.portalAxisY = DEFAULT_WIZARD_TUNING.portalAxisY
          migrated.portalAxisZ = DEFAULT_WIZARD_TUNING.portalAxisZ
          migrated.portalWindings = DEFAULT_WIZARD_TUNING.portalWindings
        }
        // v42: apply the "Hypnosis swirl" preset as the new defaults.
        // Slower spin, larger radius, softer tint — designed to read as
        // a continuous mesmerising flow rather than a sharp twist. Users
        // who liked the old look can one-click revert via the GUI's
        // "Dramatic" preset button (see WizardGui's Cosmic swirl folder).
        // Force-apply via Object.assign so users on intermediate states
        // (v40/v41) snap straight to the hypnosis defaults regardless of
        // whatever values their slider tinkering landed on.
        if (fromVersion < 42) {
          Object.assign(migrated, PORTAL_LOOK_PRESETS.hypnosis)
        }
        // v43: introduces `portalAxialExtent` (disk-shape falloff).
        // Without this field the worldModifier reads `undefined` and
        // the falloff exponent ends up NaN, which silently zeros every
        // splat's alpha → cosmic SPZ appears to vanish. Re-apply the
        // hypnosis preset so existing persisted states pick up both
        // the new field AND the corrected axis (the v42 hypnosis had
        // a 0.1 X-axis tilt that warped the SPZ into 3D; v43 zeros
        // the tilt and adds the disk falloff so the spiral stays flat).
        if (fromVersion < 43) {
          Object.assign(migrated, PORTAL_LOOK_PRESETS.hypnosis)
        }
        // v44: flip default rotation axis from +Y → +Z so the falloff
        // disc lies in the world XY plane (vertical). The +Y default
        // produced a horizontal disc that didn't match a wall-mounted
        // cosmic SPZ's authored vertical spiral. Re-applying the full
        // hypnosis preset also picks up the corresponding axis change
        // in the preset definition so existing states snap to the new
        // canonical orientation.
        if (fromVersion < 44) {
          Object.assign(migrated, PORTAL_LOOK_PRESETS.hypnosis)
        }
        // v45: introduces `portalGeometryAmount` (0..1 multiplier on
        // the geometric twist, independent from the tint animation).
        // We re-apply the hypnosis preset so existing users get the
        // new "tint-only" default (geometryAmount = 0). Users who
        // had switched to the dramatic preset will lose their custom
        // geometryAmount, but they can re-apply it with one click in
        // the GUI — versus the alternative of leaving the field
        // undefined and feeding NaN into the shader on first frame.
        if (fromVersion < 45) {
          Object.assign(migrated, PORTAL_LOOK_PRESETS.hypnosis)
        }
        // v46: introduces the procedural spiral overlay (a rigid-body
        // particle layer that fakes the swirl without touching splat
        // positions). Seed every field from defaults so the new
        // overlay shows up immediately for existing users; they had
        // no spiral fields persisted, so undefined → defaults would
        // resolve at runtime anyway, but pumping them here means the
        // GUI sliders all read non-empty on first paint.
        if (fromVersion < 46) {
          migrated.portalSpiralEnabled = DEFAULT_WIZARD_TUNING.portalSpiralEnabled
          migrated.portalSpiralArmCount = DEFAULT_WIZARD_TUNING.portalSpiralArmCount
          migrated.portalSpiralDensity = DEFAULT_WIZARD_TUNING.portalSpiralDensity
          migrated.portalSpiralTurns = DEFAULT_WIZARD_TUNING.portalSpiralTurns
          migrated.portalSpiralRadius = DEFAULT_WIZARD_TUNING.portalSpiralRadius
          migrated.portalSpiralSpinRate = DEFAULT_WIZARD_TUNING.portalSpiralSpinRate
          migrated.portalSpiralCoreColor = [...DEFAULT_WIZARD_TUNING.portalSpiralCoreColor]
          migrated.portalSpiralTailColor = [...DEFAULT_WIZARD_TUNING.portalSpiralTailColor]
          migrated.portalSpiralPointSize = DEFAULT_WIZARD_TUNING.portalSpiralPointSize
          migrated.portalSpiralGlow = DEFAULT_WIZARD_TUNING.portalSpiralGlow
          migrated.portalSpiralTaper = DEFAULT_WIZARD_TUNING.portalSpiralTaper
          migrated.portalSpiralOffsetZ = DEFAULT_WIZARD_TUNING.portalSpiralOffsetZ
          // Also flip the dyno geometric twist off — the spiral
          // overlay replaces it, and running both creates conflicting
          // motion that's hard to reason about. The user can still
          // toggle the dyno path back on from the GUI.
          migrated.portalGeometryAmount = 0
        }
        // v47: pivot to rigid-body spin as the primary motion path.
        //   - Spiral overlay → OFF (the additive blend bleeding through
        //     world splats was visually wrong, and users didn't like
        //     the look anyway).
        //   - Rigid spin rate → 0.5 rad/s default (~12 s per revolution),
        //     animated by rotating a wrapper <group> around the SPZ
        //     once per frame. Smoothest possible because it's just a
        //     matrix multiply per frame — no per-splat shader work,
        //     no shearing, no NaN risk.
        //   - Dyno geometric twist → kept at 0 so the two paths don't
        //     compound (user can re-enable from the GUI if they
        //     specifically want the windings-shear look).
        if (fromVersion < 47) {
          migrated.portalSpiralEnabled = false
          migrated.portalRigidSpinRate = 0.5
          migrated.portalGeometryAmount = 0
        }
        // v48: the SPZ should stay STILL in place. User reported that
        // rigid-body rotation tipped the spiral SPZ edge-on at
        // various angles, which made it look like a thin streak
        // rather than a portal. The fix: drop ALL physical motion of
        // the SPZ and use only the dyno tint pass for visible
        // animation. Tint bands (cyan, by default) sweep around the
        // axis at `portalSpinRate` rad/s — splats stay perfectly
        // pinned to their authored positions, only their COLOUR
        // animates. Reads as "spinning portal" without any geometry
        // actually moving.
        //
        // We crank the tint emission and contrast so the band
        // animation reads clearly on the cosmic SPZ (which already
        // has its own arm pattern that can camouflage subtle tint).
        if (fromVersion < 48) {
          migrated.portalRigidSpinRate = 0
          migrated.portalGeometryAmount = 0
          // The dyno must be on for the tint pass to run.
          migrated.portalEnabled = true
          // Tint pass on, with parameters tuned to be obviously
          // visible. 1.0 rad/s ≈ one cyan-band revolution every
          // 6.3 s, which reads as clear motion without inducing
          // motion sickness.
          migrated.portalTintEnabled = true
          migrated.portalSpinRate = 1.0
          migrated.portalTintEmission = 1.5
          migrated.portalTintContrast = 2.0
        }
        // v51: collapse the cosmic-swirl effect surface to ONE knob
        // (rigid group-spin) and force every other motion/colour path
        // off so they can't fight with each other. The simplified GUI
        // exposes a single "Enable rotation" toggle that drives
        // `portalRigidSpinRate` (0 ↔ 0.5 rad/s) — everything else
        // below is held permanently at neutral so the dyno, tint, and
        // spiral overlay are invisible regardless of where the user
        // dropped them in earlier sessions. We use a one-shot
        // `fromVersion < 51` block (not "always") because users may
        // hand-edit the underlying fields again in the future.
        if (fromVersion < 51) {
          // Rigid spin: seed at the speed that was reported as
          // "PERFECT" before the creatures regressed perf. The GUI
          // toggle reads `> 0` to determine on/off, so any non-zero
          // value works here — but 0.5 rad/s (~12.6 s per revolution)
          // is the gentle, hypnotic rate the user committed at v47.
          migrated.portalRigidSpinRate = 0.5
          // Dyno: detach by default. With portalEnabled=false, the
          // attach effect in PortalScene short-circuits and the
          // worldModifier never gets pushed onto the SplatMesh — no
          // wasted shader work, no risk of stale uniforms making the
          // SPZ look weird.
          migrated.portalEnabled = false
          // Belt-and-braces: zero every dyno/tint/spiral uniform so
          // that even if a future code path re-attaches the modifier,
          // its shader body short-circuits to a pass-through. Each
          // one is documented in detail at its store-field
          // definition above.
          migrated.portalStrength = 0
          migrated.portalSpinRate = 0
          migrated.portalGeometryAmount = 0
          migrated.portalWindings = 0
          migrated.portalTintEnabled = false
          migrated.portalSpiralEnabled = false
          // Hide the placement helpers that referenced removed GUI
          // folders so they don't appear floating in the scene with
          // no way to turn off.
          migrated.portalShowSphere = false
          migrated.portalGizmoEnabled = false
          // Force gizmo target to 'splat' — 'region' was the other
          // option but it's no longer reachable from the GUI.
          migrated.portalGizmoTarget = 'splat'
        }
        // v52: seed `splatBrightness` for older states. Missing field
        // → SplatRenderer reads `undefined` → splatGain modifier
        // creates with NaN initial → shader short-circuits to gain=1.0
        // (the NaN guard inside the kernel) so it'd still be visually
        // safe, but the slider would read NaN and the user couldn't
        // increase it without first typing a number. Force the default
        // so the GUI surface is immediately usable.
        if (fromVersion < 52) {
          migrated.splatBrightness = 1.5
        }
        // v53: walk back the v52 default. 1.5 was tuned to make bloom
        // easy to spot, but combined with the v17 bloom defaults (1.2 /
        // 0.7) it blew out specular highlights and pushed midtones into
        // the bloom band. v53 = 1.2 keeps the HDR push for genuine
        // highlights (which now pair with the v18 threshold = 0.85)
        // while leaving midtones below the bloom threshold. Force-write
        // so users who tweaked the slider higher get the calmer baseline.
        if (fromVersion < 53) {
          migrated.splatBrightness = 1.2
        }
        // v54: 1.2 was still feeding too many pixels into ACES Filmic's
        // highlight-desaturation curve — the scene came out grey and
        // muted ("bloom mutes the colors" screenshot, May 31 '26 14:11).
        // Drop to 1.05: barely any HDR push, only true specular hits
        // (already 0.85+ in LDR) tip over the bloom threshold, and ACES
        // leaves midtones alone so colours stay saturated. Paired with
        // the v19 bloomIntensity drop to 0.3 for a "subtle glow without
        // dulling colors" look.
        if (fromVersion < 54) {
          migrated.splatBrightness = 1.05
        }
        // v55: kill the residual translucent purple bubble around the
        // cosmic swirl. v51 set this false for users coming from <51
        // but the bubble was still appearing on this user's machine
        // (May 31 '26 16:32 screenshot) — likely because their state
        // never went through the v51 hop, or some path re-wrote true
        // back in. Force false unconditionally now so the helper can
        // never show until someone wires GUI controls for it again.
        if (fromVersion < 55) {
          migrated.portalShowSphere = false
        }
        // v49: introduce the `creatures` record. Older stores have no
        // `creatures` field at all → CreaturesScene reads `undefined`,
        // every per-slug selector falls back to NaN, and the proxy
        // group's matrix corrupts the moment React tries to set
        // `position.x = undefined`. Seed every slug from the registry's
        // default transform so first paint already has valid TRS.
        //
        // Also ALWAYS backfill missing slugs (run on every hydrate, not
        // just fromVersion < 49) so adding a new creature config later
        // doesn't require another schema bump — the next page load
        // just notices the gap and fills it from defaults.
        const persistedCreatures =
          (migrated.creatures && typeof migrated.creatures === 'object')
            ? (migrated.creatures as Record<string, Partial<CreatureTransform>>)
            : {}
        const seededCreatures: Record<string, CreatureTransform> = {}
        for (const config of CREATURE_CONFIGS) {
          const persisted = persistedCreatures[config.slug] ?? {}
          seededCreatures[config.slug] = {
            ...config.defaultTransform,
            ...persisted,
            // v50: one-shot — preserve every other persisted field (pos,
            // rot, scale, gizmo state) but force `enabled: true` so the
            // user's three creatures are visible again after the panic
            // "Hide all" button hid them. Only run on the v49→v50 hop
            // so future user-driven hides aren't clobbered on every
            // reload.
            ...(fromVersion < 50 ? { enabled: true } : {}),
          }
        }
        migrated.creatures = seededCreatures
        return migrated
      },
      partialize: (s) => {
        const {
          resetToken: _resetToken,
          setTuning: _set,
          resetTuning: _reset,
          applySplatPerfPreset: _preset,
          applySparklePreset: _sparkle,
          applyPortalLookPreset: _portal,
          setCreatureTransform: _creature,
          bumpResetToken: _bump,
          ...rest
        } = s
        return rest
      },
    },
  ),
)
