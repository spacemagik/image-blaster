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
  /** Visual gizmo for the collider. Renders a TransformControls in
   *  translate mode that drives `colliderOffsetX/Y/Z`. Off by default
   *  so it doesn't clutter the scene; toggled from the "Collider
   *  position offset" GUI folder. Translate-only because rotation +
   *  scale would rebuild the trimesh BVH every drag tick. Scale is
   *  exposed via the dedicated slider where remounts happen once on
   *  mouse-up rather than per-frame. */
  colliderGizmoEnabled: boolean
  /** User-facing collider uniform scale, multiplied INTO the world's
   *  authored `metricScaleFactor` at render time. Default 1.0 = no
   *  change (use the world's authored scale as-is); >1 scales the
   *  physics collider larger to match a splat the user scaled up
   *  via `splatUniformScale`; <1 shrinks it. Per-world so each
   *  world remembers its own splat/collider match. Note: changing
   *  this rebuilds the trimesh BVH (a few seconds for dense
   *  colliders) because Rapier can't resize an existing trimesh —
   *  the RigidBody remounts with the new scale baked in. Keep this
   *  in mind if you're sliding the slider live; settle on a value
   *  before walking around. */
  colliderUniformScale: number

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

  // ── Per-world overrides ───────────────────────────────────────────────
  // Some settings (splat alignment, sparkle preset, etc.) need to be
  // remembered PER WORLD rather than globally — each world has its
  // own SPZ + collider geometry and authored frame, so a splat offset
  // that aligns world A wrecks alignment for world B. Without this,
  // editing the splat in hell-cave silently corrupts fantasy2 the
  // next time the user teleports back.
  //
  // Mechanism (see `PER_WORLD_KEYS` and `applyWorldOverrides` below):
  //   - On slug change, App.tsx calls `applyWorldOverrides(slug)`
  //     which copies `worldOverrides[slug]` into the global slider
  //     fields. Missing keys fall back to DEFAULT_WIZARD_TUNING (so
  //     a brand-new world starts at the as-authored alignment).
  //   - When the user changes a per-world slider, `setTuning` also
  //     writes that key into `worldOverrides[currentWorldSlug]` so
  //     the change persists across world swaps.
  //
  // Stored as `Partial<WizardTuning>` per slug rather than the full
  // shape so adding new per-world keys later doesn't require a
  // schema bump (any keys not present fall back to the global default).
  worldOverrides: Record<string, Partial<WizardTuning>>
  /** Per-world snapshots for the SUBSET of `useDebugStore` fields
   *  that the WizardGui's Post-processing folder writes to (bloom,
   *  vignette, tone mapping, DoF, colour grade, chromatic, motion
   *  blur, brightness/contrast). The PP knobs live in `useDebugStore`
   *  because PostProcessing.tsx reads them via 20+ subscribers and
   *  moving the field set into wizardTuning would require rewriting
   *  the entire composer pipeline. Instead, we mirror writes: every
   *  PP-slider edit goes to BOTH stores, and on world swap we replay
   *  the per-world snapshot back into `useDebugStore` via the
   *  `applyDebugOverrides` helper (see store/debug.ts).
   *
   *  Stored as a flat key→value map per slug, keys typed against the
   *  exported `PerWorldDebugKey` union from debug.ts. Adding a new
   *  per-world PP knob = add the key to `PER_WORLD_DEBUG_KEYS` and
   *  `PER_WORLD_DEBUG_SETTERS` in debug.ts; no schema bump here
   *  (this map is `Partial<...>` so missing keys fall back to
   *  shipped defaults in `applyDebugOverrides`). */
  worldDebugOverrides: Record<string, Partial<Record<string, unknown>>>
  /** Current active world slug. Synced from the wouter route in
   *  App.tsx via a setter. Used by `setTuning` to know which slot
   *  in `worldOverrides` to write per-world keys into. */
  currentWorldSlug: string

  // ── Teleport trigger ──────────────────────────────────────────────────
  // An invisible AABB volume that, when the wizard's feet enter it,
  // calls wouter `setLocation('/<teleportTargetSlug>')` to swap worlds.
  // The mechanism is route-based (each world is its own `/:slug`
  // route in App.tsx) which means the old world's splat + creatures
  // + audio fully unmount on transition — no double-loaded VRAM, no
  // mixed-state weirdness. Used as the "walk into the cosmic swirl
  // to enter the hell-cave" portal.
  /** Master toggle. When false the trigger never fires + the debug
   *  visualizer is hidden. Lets the user turn off teleportation
   *  while editing placement without ripping out the box. */
  teleportEnabled: boolean
  /** URL slug to navigate to when triggered. E.g. 'hell-cave' →
   *  setLocation('/hell-cave'). String-typed so the user can add new
   *  worlds without a code change here; the wouter route handler
   *  resolves the slug → WorldEntry via the existing worldLoader
   *  pipeline. */
  teleportTargetSlug: string
  /** AABB centre in world space. Defaults near the cosmic swirl's
   *  default spawn; the "Snap to Cosmic Swirl" GUI button copies
   *  portalPos* into these. The user is expected to drag this with
   *  the gizmo to fine-tune placement. */
  teleportPosX: number
  teleportPosY: number
  teleportPosZ: number
  /** AABB half-extent (so total edge length = 2 × this). Half-extent
   *  rather than full so the in-frame "inside the box?" test is just
   *  `abs(playerPos.x - centerX) < halfX` for each axis — one fewer
   *  divide per axis per frame. Defaults to 1.5m → 3m cube which is
   *  big enough that the user can't accidentally walk past it. */
  teleportHalfSize: number
  /** Mounts a TransformControls handle on the trigger so it can be
   *  dragged in the canvas. Off by default — same pattern as the
   *  creature gizmos. */
  teleportGizmoEnabled: boolean
  /** Which gizmo handle to show. 'scale' lets the user resize the
   *  AABB; 'translate' moves it. Rotate isn't supported because the
   *  trigger is an axis-aligned box (rotating it has no effect on
   *  the AABB test). */
  teleportGizmoMode: 'translate' | 'scale'
  /** Show a translucent wireframe cube where the trigger lives so the
   *  user can see + position it. Defaults true — the whole point of
   *  the GUI is to edit placement, and an "invisible" trigger you
   *  can't see is harder to align with the swirl. Once the user is
   *  happy with placement they flip this off so play-mode is clean. */
  teleportShowDebug: boolean
}

/**
 * Settings that are remembered PER WORLD (keyed by URL slug) rather
 * than globally. Anything related to a specific world's geometry +
 * authored alignment + ambience belongs here:
 *
 *   • splat offset/rotation/scale — every SPZ has its own authored
 *     frame; an offset that aligns world A breaks world B.
 *   • collider offset — same story for the collider GLB.
 *   • sparkle preset + derived sparkle fields — ambience should
 *     match the world's vibe ("ember" for a hell cave, "magic"
 *     for the forest, etc.).
 *
 * Keep this list narrow. Movement speed, camera tuning, post-processing,
 * etc. are GLOBAL: the user expects consistent feel across worlds, and
 * making them per-world would force the user to re-tune them N times.
 *
 * Adding a new key here:
 *   1. Add the key string to the array below (the `as const` ensures
 *      it stays typed against `keyof WizardTuning`).
 *   2. No migration is needed — `worldOverrides[slug]` is
 *      `Partial<WizardTuning>`, so missing keys just fall back to
 *      the global default during `applyWorldOverrides`.
 */
export const PER_WORLD_KEYS = [
  // Splat alignment (relative to the world's collider GLB)
  'splatOffsetX',
  'splatOffsetY',
  'splatOffsetZ',
  'splatRotationDegX',
  'splatRotationDegY',
  'splatRotationDegZ',
  'splatUniformScale',
  // Collider offset (rare-but-needed nudge when the GLB origin was
  // exported in the wrong place)
  'colliderOffsetX',
  'colliderOffsetY',
  'colliderOffsetZ',
  // Collider uniform scale — multiplied into the world's authored
  // metricScaleFactor. Default 1 = no change; bump up to match a
  // SPZ that was scaled bigger in the splat tools.
  'colliderUniformScale',
  // Wizard spawn Y. Each world has a different floor height (e.g.
  // hell-cave's cave floor sits at y ≈ -1.41, while fantasy2's
  // grass plane is around y = 4). Per-world so the wizard lands on
  // the floor on first teleport into each scene rather than
  // free-falling for several seconds or spawning inside the mesh.
  'spawnFeetY',
  // Lighting — the single biggest reason worlds need to look
  // different from each other. Red sun for hell-cave, blue sun for
  // fantasy2; each world also typically has its own ambient
  // intensity, fill colour, and shadow-follow offsets so the
  // wizard always looks lit even when the world's environment map
  // is dark. Every lighting knob is per-world so flipping between
  // scenes feels like two genuinely separate places.
  'ambientIntensity',
  'sunIntensity',
  'sunPosX',
  'sunPosY',
  'sunPosZ',
  'sunShadowFollowCharacter',
  'sunColor',
  'fillIntensity',
  'fillPosX',
  'fillPosY',
  'fillPosZ',
  'fillColor',
  // Shadows — paired with lighting because shadow tuning is
  // tightly coupled to the sun position / colour above. Different
  // worlds typically want different shadow maps (e.g. hell-cave's
  // dim red light needs higher shadow intensity than fantasy2's
  // bright sun).
  'shadowMapSize',
  'shadowBias',
  'shadowNormalBias',
  'shadowRadius',
  'shadowCameraNear',
  'shadowCameraFar',
  'shadowCameraHalfExtent',
  'shadowMapType',
  'shadowIntensity',
  'shadowBlurSamples',
  'colliderGlbShadowOpacity',
  'colliderGlbShadowColor',
  // Post-processing — each world's vibe usually wants different
  // bloom / contrast / vignette. Saved per-world so a moody
  // hell-cave doesn't force the same bloom onto a bright fantasy
  // forest.
  'ppEnabled',
  'ppBloomIntensity',
  'ppBloomThreshold',
  'ppBloomSmoothing',
  'ppBrightness',
  'ppContrast',
  'ppVignetteDarkness',
  'ppVignetteOffset',
  // Splat brightness boost is part of the "look" too — driven into
  // the splat shader for HDR bloom (see splatGain.ts). Per-world
  // so the cave can be subdued while the forest can pop.
  'splatBrightness',
  // Sparkle ambience — the user explicitly asked for "ember" in
  // hell-cave and "magic" in fantasy2, so the entire sparkle config
  // travels with the world. Including the preset name AND the
  // derived per-field settings so a preset change in one world
  // doesn't bleed into another.
  // EVERY sparkle field that SparkleScene reads — this used to be a
  // shorter list, but missing fields (sparklePosX/Y/Z, sparkleHeight,
  // sparkleFollowCharacter, etc.) leaked between worlds because they
  // weren't reset on world change. If you add a new sparkle knob,
  // add it here too or it will silently bleed.
  'sparkleEnabled',
  'sparklePreset',
  'sparklePosX',
  'sparklePosY',
  'sparklePosZ',
  'sparkleRadius',
  'sparkleHeight',
  'sparkleDensity',
  'sparkleMaxSplats',
  'sparkleMinScale',
  'sparkleMaxScale',
  'sparkleOpacity',
  'sparkleColor1',
  'sparkleColor2',
  'sparkleFallDirX',
  'sparkleFallDirY',
  'sparkleFallDirZ',
  'sparkleWanderVariance',
  'sparkleFollowCharacter',
  'sparkleFollowSmoothing',
  'sparkleFallVelocity',
  'sparkleWanderScale',
] as const satisfies readonly (keyof WizardTuning)[]

export type PerWorldKey = (typeof PER_WORLD_KEYS)[number]

/** Pick only the per-world fields from a full WizardTuning object.
 *  Used by `saveCurrentSettingsForWorld` to snapshot global state. */
function extractPerWorldKeys(s: WizardTuning): Partial<WizardTuning> {
  const out: Partial<WizardTuning> = {}
  for (const k of PER_WORLD_KEYS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(out as any)[k] = (s as any)[k]
  }
  return out
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
  // ── Per-world overrides actions ─────────────────────────────────────
  /** Tell the store which world is currently active. App.tsx calls
   *  this from a `useEffect` driven by the wouter route. Updates
   *  `currentWorldSlug` AND immediately calls `applyWorldOverrides`
   *  for the new slug. */
  setCurrentWorldSlug: (slug: string) => void
  /** Copy any saved per-world settings for `slug` into the global
   *  slider fields. Missing keys fall back to defaults so a brand-
   *  new world starts at as-authored alignment. Idempotent — safe
   *  to call when the slug hasn't actually changed. */
  applyWorldOverrides: (slug: string) => void
  /** Snapshot the CURRENT global per-world keys (splat alignment,
   *  collider offset, sparkle settings) into
   *  `worldOverrides[slug]`. The "Save settings for this world"
   *  GUI button calls this. */
  saveCurrentSettingsForWorld: (slug: string) => void
  /** Mirror a single PP-knob value into the current world's
   *  `worldDebugOverrides` snapshot. Called from the WizardGui's
   *  Post-processing folder alongside the existing useDebugStore
   *  setter so the value survives a world swap. `value` is `unknown`
   *  because the PP fields are heterogeneous (number, boolean,
   *  string-enum); `applyDebugOverrides` in debug.ts knows the
   *  shapes by key. */
  recordDebugOverride: (key: string, value: unknown) => void
  /** Write a whole snapshot at once for a specific slug. App.tsx
   *  uses this on first mount to seed the active world's PP
   *  overrides with the user's currently-live useDebugStore values,
   *  so they don't lose their existing PP tuning when the world
   *  swap system comes online. */
  seedDebugOverridesForWorld: (slug: string, snapshot: Record<string, unknown>) => void
  /** Forget the saved overrides for `slug`. Next time it's active,
   *  per-world keys fall back to defaults. */
  clearWorldOverrides: (slug: string) => void
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

  // 1.0 = no scaling vs the world manifest's authored
  // `metricScaleFactor`. The previous default of 1.22 was set when
  // this field was dead code (never applied to the splat); now that
  // SplatRenderer.tsx wires the value into the inner group's scale
  // prop, the default needs to be a true identity so worlds keep
  // rendering at their authored size unless the user explicitly
  // scales them. Per-world (in PER_WORLD_KEYS), so each scene
  // remembers its own value once the user dials it in.
  splatUniformScale: 1,
  // Per-splat extra 180° X flip — leave false by default; flip via GUI only when
  // a specific world's splat is upside-down relative to its collider.
  splatFlipYOverride: false,
  sparkFocalDistance: 0,
  sparkApertureAngleDeg: 0,

  splatLodEnabled: true,
  splatLodSplatScale: 1,
  // Real-time profile tuned for the full-detail `.rad` worlds. Because
  // `.rad` streams LOD by distance, Spark always keeps the BEST splats
  // near the camera — so we can render ~half as many as the "quality"
  // tier and tighten foveation hard without the scene looking soft
  // where you're actually looking. This is the single biggest FPS lever
  // on 20M+ splat scenes (see SPLAT_PERF_PRESETS.balanced).
  //   - Budget 1.5M (was 3M): halves per-frame sort + draw cost.
  //   - renderScale 2 + minPixelRadius 1.0: drop sub-pixel splats that
  //     cost fill-rate but add no visible detail.
  //   - Foveation cones: full detail in a 50° front cone, aggressively
  //     thinned in the periphery and behind the camera (off-screen
  //     splats are the cheapest to drop).
  //   - lodInflate: soften kernels so the lower budget doesn't show
  //     LOD "popping" as you move.
  splatLodRenderScale: 2,
  splatMaxStdDev: Math.sqrt(6),
  splatLodSplatCount: 1_500_000,
  splatMinPixelRadius: 1.0,
  splatConeFov0Deg: 50,
  splatConeFovDeg: 100,
  splatConeFoveate: 0.3,
  splatBehindFoveate: 0.05,
  splatLodInflate: true,

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
  // Off by default — the gizmo is a debug aid, not a permanent
  // visual feature. The user flips it on from the GUI when they
  // want to drag the collider, then off again to stop the in-canvas
  // controls from intercepting clicks meant for the wizard.
  colliderGizmoEnabled: false,
  // Default 1.0 = use the world's authored metricScaleFactor as-is.
  // Per-world so each world's saved value scales its own collider
  // when the user teleports in.
  colliderUniformScale: 1,

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

  // Per-world overrides defaults. fantasy2 starts with NO overrides
  // so it uses the as-authored alignment + global sparkle preset.
  // hell-cave starts pre-seeded with the "ember" sparkle preset
  // (matching the cave/lava vibe of the source SPZ) — the user
  // explicitly asked for this on May 31 '26 21:11. Splat/collider
  // alignment for hell-cave is intentionally left empty so the user
  // can adjust it once and click "Save settings for this world".
  worldOverrides: {
    'hell-cave': {
      // NOTE on alignment: we INTENTIONALLY do not pre-seed splat
      // offsets, collider scale, or spawnFeetY here. The previous
      // calibration was tuned against a splatUniformScale value
      // that v62 forced back to 1.0 (because the slider was dead
      // code before). With the old offsets and the new scale, the
      // splat ended up far underground and invisible. The user
      // should re-tune alignment per world via the GUI sliders /
      // gizmo and click "Save snapshot for this world" when happy.
      //
      // Hell-cave lighting — calibrated to the cave/lava palette
      // the user tuned on 2026-05-31. Red sun (#e6000b) burns
      // through the cave atmosphere; ambient pushed up so the
      // wizard isn't lost in the gloom. Fill colour is pure black
      // because the red sun already does all the colour work and a
      // tinted fill would muddy it.
      sunColor: [0xe6 / 255, 0x00 / 255, 0x0b / 255],
      sunIntensity: 1.62,
      sunPosX: -23.5,
      sunPosY: 43.5,
      sunPosZ: -3.5,
      sunShadowFollowCharacter: true,
      ambientIntensity: 0.83,
      fillIntensity: 0.32,
      fillColor: [0, 0, 0],
      fillPosX: -26,
      fillPosY: 22,
      fillPosZ: -24,
      sparkleEnabled: true,
      sparklePreset: 'ember',
      // Sparkle field copies follow the same calibration the
      // sparklePresetToTuning helper would produce — pre-baking them
      // here means the first teleport into hell-cave looks correct
      // even before the SparkleScene calls `applySparklePreset`.
      // These match the 10× viewer-distance scaling used elsewhere
      // (see SPARKLE_PRESET_SCALE_MULTIPLIER in this file).
      sparkleDensity: 220,
      sparkleMinScale: 0.04,
      sparkleMaxScale: 0.12,
      sparkleOpacity: 0.95,
      sparkleColor1: [1.0, 0.55, 0.1],
      sparkleColor2: [1.0, 0.18, 0.0],
      sparkleFallVelocity: -0.6,
      sparkleWanderScale: 0.25,
    },
  },
  currentWorldSlug: 'fantasy2',
  // Per-world post-processing snapshots. Seeded empty — App.tsx
  // captures the user's current useDebugStore PP values into
  // worldDebugOverrides[currentSlug] on first mount via
  // seedDebugOverridesForWorld, so the per-world system inherits
  // whatever the user already had. Hell-cave (and any future
  // worlds) get an empty snapshot → fall back to shipped defaults
  // in applyDebugOverrides on first visit.
  worldDebugOverrides: {},

  // Teleport trigger defaults. Position is near the default cosmic
  // swirl spawn (origin-ish + slightly forward of where the character
  // spawns at +Y feet). Y is at the wizard's chest height so the AABB
  // catches the feet+body capsule reliably. The user typically wants
  // to walk INTO the swirl to teleport, so the trigger should overlap
  // the swirl visual; the "Snap to Cosmic Swirl" button copies the
  // current portalPos values into these defaults at runtime.
  teleportEnabled: true,
  teleportTargetSlug: 'hell-cave',
  // Place the trigger AT the cosmic swirl (portalPos default above).
  // Putting it at the spawn point (0,1,0) caused immediate teleport
  // the instant the wizard finished falling, because the spawn AABB
  // and the trigger AABB overlapped. Anchoring to the swirl makes
  // the gateway thematic — walk into the swirl, you go to hell —
  // and forces the user to actually traverse some of fantasy2 first.
  // The user can still drag the gizmo to relocate it.
  teleportPosX: -26.650,
  teleportPosY: 1,
  teleportPosZ: -83.276,
  teleportHalfSize: 1.5,
  teleportGizmoEnabled: false,
  teleportGizmoMode: 'translate',
  // Default OFF so players don't see the cyan AABB box + RGB drag gizmo
  // sitting in the world. Flip on from the debug GUI when relocating
  // the trigger.
  teleportShowDebug: false,
}

/** Merge `partial` into `state` and ALSO mirror any per-world keys
 *  into `state.worldOverrides[state.currentWorldSlug]` so the change
 *  survives a teleport. Pulled out of `setTuning` so the same auto-
 *  save logic can be reused by `applySparklePreset` (and any other
 *  future "preset" actions that write per-world fields). Without
 *  this helper, presets called via `set(...)` directly would write
 *  to global state but leave `worldOverrides` stale — picking a
 *  sparkle preset in fantasy2 would write the values globally but
 *  the choice would silently revert the next time the user
 *  teleported back into fantasy2, because `setCurrentWorldSlug`
 *  re-applies the (unchanged) saved overrides on slug change.
 *
 *  If `partial` contains NO per-world keys, this returns `partial`
 *  unchanged — so subscribers of `worldOverrides` don't re-render
 *  on global-only updates (moveSpeed, etc.). */
function mergeWithPerWorldSave(
  partial: Partial<WizardTuning>,
  state: WizardTuningStore,
): Partial<WizardTuningStore> {
  const perWorld: Partial<WizardTuning> = {}
  let hasPerWorld = false
  for (const k of PER_WORLD_KEYS) {
    if (k in partial) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(perWorld as any)[k] = (partial as any)[k]
      hasPerWorld = true
    }
  }
  if (!hasPerWorld) return partial
  const slug = state.currentWorldSlug
  return {
    ...partial,
    worldOverrides: {
      ...state.worldOverrides,
      [slug]: {
        ...state.worldOverrides[slug],
        ...perWorld,
      },
    },
  }
}

export const useWizardTuning = create<WizardTuningStore>()(
  persist(
    (set) => ({
      ...DEFAULT_WIZARD_TUNING,
      resetToken: 0,
      setTuning: (partial) => set((state) => mergeWithPerWorldSave(partial, state)),
      resetTuning: () => set({ ...DEFAULT_WIZARD_TUNING }),
      // Preset actions go through `mergeWithPerWorldSave` for the same
      // reason `setTuning` does — the sparkle preset, in particular,
      // writes only per-world keys (every sparkle field is in
      // PER_WORLD_KEYS), so it MUST mirror into `worldOverrides` or
      // the choice will be lost on the next world swap. Splat-perf
      // and portal-look presets write only GLOBAL keys, so the
      // helper short-circuits and returns the patch unchanged — but
      // routing them through the same wrapper keeps the invariant
      // local: "every write to wizardTuning is per-world-safe".
      applySplatPerfPreset: (preset) =>
        set((state) => mergeWithPerWorldSave(SPLAT_PERF_PRESETS[preset], state)),
      applySparklePreset: (preset) =>
        set((state) => mergeWithPerWorldSave(sparklePresetToTuning(preset), state)),
      applyPortalLookPreset: (preset) =>
        set((state) => mergeWithPerWorldSave(PORTAL_LOOK_PRESETS[preset], state)),
      // Per-world overrides actions. These don't write to localStorage
      // directly — the `worldOverrides` field is included in the
      // `partialize` list below so it persists with the rest of the
      // store.
      setCurrentWorldSlug: (slug) => set((state) => {
        if (state.currentWorldSlug === slug) return {}
        // Apply the new slug's saved overrides at the same time we
        // record the slug — atomicity guarantee, no flash of stale
        // values between the slug update and the override apply.
        const overrides = state.worldOverrides[slug] ?? {}
        const updates: Partial<WizardTuning> = { currentWorldSlug: slug }
        for (const k of PER_WORLD_KEYS) {
          if (k in overrides) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(updates as any)[k] = (overrides as any)[k]
          } else {
            // Fall back to defaults so a world without saved overrides
            // gets the as-authored alignment. Skipping this branch
            // would leave the PREVIOUS world's overrides bleeding into
            // the new one (e.g. teleporting from hell-cave back to
            // fantasy2 would keep hell-cave's splat scale).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(updates as any)[k] = (DEFAULT_WIZARD_TUNING as any)[k]
          }
        }
        return updates
      }),
      applyWorldOverrides: (slug) => set((state) => {
        const overrides = state.worldOverrides[slug] ?? {}
        const updates: Partial<WizardTuning> = {}
        for (const k of PER_WORLD_KEYS) {
          if (k in overrides) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(updates as any)[k] = (overrides as any)[k]
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(updates as any)[k] = (DEFAULT_WIZARD_TUNING as any)[k]
          }
        }
        return updates
      }),
      saveCurrentSettingsForWorld: (slug) => set((state) => ({
        worldOverrides: {
          ...state.worldOverrides,
          [slug]: extractPerWorldKeys(state),
        },
      })),
      recordDebugOverride: (key, value) => set((state) => {
        const slug = state.currentWorldSlug
        // Shallow spread keeps reference identity for OTHER slugs'
        // overrides — subscribers of worldDebugOverrides only
        // re-render if THEIR slug changed.
        return {
          worldDebugOverrides: {
            ...state.worldDebugOverrides,
            [slug]: {
              ...state.worldDebugOverrides[slug],
              [key]: value,
            },
          },
        }
      }),
      seedDebugOverridesForWorld: (slug, snapshot) => set((state) => {
        // If this slug ALREADY has a snapshot, do nothing — the
        // user has been tuning PP in this world and their values
        // beat any seed-time snapshot. The "seed" is meant to
        // capture the user's pre-per-world PP tuning ONCE, on
        // first run after the upgrade.
        if (state.worldDebugOverrides[slug] && Object.keys(state.worldDebugOverrides[slug]).length > 0) {
          return {}
        }
        return {
          worldDebugOverrides: {
            ...state.worldDebugOverrides,
            [slug]: snapshot,
          },
        }
      }),
      clearWorldOverrides: (slug) => set((state) => {
        if (!(slug in state.worldOverrides)) return {}
        // Object-rest to omit the key — cleaner than `delete`
        // (which mutates) and preserves the reference identity of
        // the OTHER worlds' override objects.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [slug]: _removed, ...rest } = state.worldOverrides
        return { worldOverrides: rest }
      }),
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
      version: 71,
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
        // v57: kill the procedural glitter-spiral particle overlay.
        // PortalSpiralOverlay was added during the "make the SPZ
        // look like it's swirling" experiment, then superseded by
        // the simpler rigid-spin of the SPZ itself once the user
        // said the particle spiral "shows through the other splats"
        // and didn't like it. The component still renders when its
        // toggle is true though, and the user's persisted state
        // (May 31 '26 19:25 screenshot — vertical line of colored
        // dots) shows it was left enabled from that experiment.
        // Force the toggle off so the spiral disappears on next
        // load; the GUI checkbox still exists so it can be re-
        // enabled if anyone wants the effect back.
        if (fromVersion < 57) {
          migrated.portalSpiralEnabled = false
        }
        // v58: seed teleport-trigger fields. The 8 new keys describe
        // an AABB volume + target slug for the "walk into the cosmic
        // swirl to enter the hell-cave" portal. Persisted states
        // from v57 and earlier won't have them at all, so the
        // TeleportTrigger component would crash on `undefined` reads;
        // fall back to defaults so first-load placement matches a
        // clean install. We always copy defaults rather than checking
        // each field individually because all 8 are tightly coupled
        // (changing one without the others would produce a half-
        // configured trigger that's harder to reason about than just
        // re-seeding from scratch).
        if (fromVersion < 58) {
          migrated.teleportEnabled = DEFAULT_WIZARD_TUNING.teleportEnabled
          migrated.teleportTargetSlug = DEFAULT_WIZARD_TUNING.teleportTargetSlug
          migrated.teleportPosX = DEFAULT_WIZARD_TUNING.teleportPosX
          migrated.teleportPosY = DEFAULT_WIZARD_TUNING.teleportPosY
          migrated.teleportPosZ = DEFAULT_WIZARD_TUNING.teleportPosZ
          migrated.teleportHalfSize = DEFAULT_WIZARD_TUNING.teleportHalfSize
          migrated.teleportGizmoEnabled = DEFAULT_WIZARD_TUNING.teleportGizmoEnabled
          migrated.teleportGizmoMode = DEFAULT_WIZARD_TUNING.teleportGizmoMode
          migrated.teleportShowDebug = DEFAULT_WIZARD_TUNING.teleportShowDebug
        }
        // v59: per-world overrides. Splat alignment / collider offset /
        // sparkle settings used to be GLOBAL — editing them in
        // hell-cave silently desynced fantasy2's alignment (user
        // reported "I moved and sized the spz but it didnt affect
        // the collider" on May 31 '26 21:11). Add the
        // `worldOverrides` + `currentWorldSlug` plumbing; pre-seed
        // hell-cave with the ember sparkle preset since the user
        // also asked for that to switch automatically on teleport.
        //
        // CRITICALLY: we do NOT snapshot the user's current global
        // values into any specific world here. That would lock in
        // whatever broken state they're sitting in. Instead the
        // current globals stay as-is (untouched until the user
        // teleports or clicks "Save settings for this world"); on
        // the first teleport, App.tsx calls applyWorldOverrides for
        // the new slug, which loads either the saved overrides
        // (hell-cave gets ember) or DEFAULT_WIZARD_TUNING values
        // (fantasy2 gets clean alignment). So a single teleport
        // round-trip is enough to fix both worlds.
        if (fromVersion < 59) {
          // Only set worldOverrides if the field is missing — if the
          // user already saved overrides via a future build, we
          // wouldn't want to wipe them. (Belt-and-suspenders; v59
          // is the version that INTRODUCES the field so this branch
          // can't realistically hit.)
          if (!migrated.worldOverrides || typeof migrated.worldOverrides !== 'object') {
            migrated.worldOverrides = DEFAULT_WIZARD_TUNING.worldOverrides
          }
          if (typeof migrated.currentWorldSlug !== 'string') {
            migrated.currentWorldSlug = DEFAULT_WIZARD_TUNING.currentWorldSlug
          }
        }
        if (fromVersion < 60) {
          // colliderUniformScale was added alongside the per-world
          // overrides because the user needed to scale the hell-cave
          // collider to match a manually-scaled SPZ. Seed it to 1.0
          // (no change vs the world's authored metricScaleFactor) for
          // any persisted state that predates the field. This is a
          // separate version bump from v59 because v59 was already
          // shipped without it — users on v59 still need this branch.
          if (typeof migrated.colliderUniformScale !== 'number') {
            migrated.colliderUniformScale = DEFAULT_WIZARD_TUNING.colliderUniformScale
          }
          // colliderGizmoEnabled is new in v60 too. Force OFF on
          // first hydration so the user isn't surprised by a gizmo
          // appearing in the scene after the migration runs — they
          // can enable it from the GUI when they actually want it.
          if (typeof migrated.colliderGizmoEnabled !== 'boolean') {
            migrated.colliderGizmoEnabled = DEFAULT_WIZARD_TUNING.colliderGizmoEnabled
          }
        }
        if (fromVersion < 61) {
          // Bake the user's hard-won hell-cave calibration into the
          // persisted overrides. The user spent time dragging the
          // splat into the manually-scaled collider on 2026-05-31
          // and asked us to "save everything in this position".
          // Merge order: CALIBRATED defaults first, then existing
          // user overrides. If the user has already saved a value
          // for a key (e.g. they nudged the splat after this build
          // shipped), their value wins. Missing keys (most notably
          // spawnFeetY, which we added to PER_WORLD_KEYS in v61)
          // fall back to the calibrated value so the wizard doesn't
          // spawn 5 m above the cave floor on first teleport in.
          // `migrated` is typed as Record<string, unknown> here, so we
          // narrow to the shape the rest of the migration relies on.
          // Cast over a guard rather than restructuring the whole
          // migrate() to use Partial<WizardTuning> — that refactor is
          // touchy and out of scope for a single per-world override.
          const overrides = migrated.worldOverrides as
            | Record<string, Partial<WizardTuning>>
            | undefined
          if (overrides && typeof overrides === 'object') {
            const existing = overrides['hell-cave'] ?? {}
            const calibrated = DEFAULT_WIZARD_TUNING.worldOverrides['hell-cave'] ?? {}
            migrated.worldOverrides = {
              ...overrides,
              'hell-cave': { ...calibrated, ...existing },
            }
            // Special-case: if the user IS currently in hell-cave on
            // hydration, their global spawnFeetY needs to match the
            // override too — otherwise the WizardController spawns
            // at the OLD value before the next route change fires
            // applyWorldOverrides. Cheaper to fix it once here than
            // ship a "respawn after migration" effect somewhere.
            if (migrated.currentWorldSlug === 'hell-cave' && typeof existing.spawnFeetY !== 'number') {
              migrated.spawnFeetY = calibrated.spawnFeetY ?? migrated.spawnFeetY
            }
          }
        }
        if (fromVersion < 62) {
          // splatUniformScale was previously dead code (the GUI slider
          // existed and was persisted, but SplatRenderer.tsx never
          // applied it to the rendered splat). v62 wires it into the
          // inner group's scale prop. Any value left over in
          // persisted state was meaningless — applying it now would
          // suddenly scale every world that has a stored value
          // (notably fantasy2, where the old global default of 1.22
          // would render the splat 22% bigger overnight). Force the
          // global field to 1.0 and wipe per-world overrides for the
          // same key so every scene starts at "as-authored size" and
          // the user re-dials whatever they actually want via the
          // newly-functional slider.
          migrated.splatUniformScale = 1
          const overridesV62 = migrated.worldOverrides as
            | Record<string, Partial<WizardTuning>>
            | undefined
          if (overridesV62 && typeof overridesV62 === 'object') {
            const cleaned: Record<string, Partial<WizardTuning>> = {}
            for (const slug of Object.keys(overridesV62)) {
              // Destructure to drop splatUniformScale without mutating
              // the source object. ESLint complains about the unused
              // binding so we mark it intentionally-unused.
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { splatUniformScale: _drop, ...rest } = overridesV62[slug]
              cleaned[slug] = rest
            }
            migrated.worldOverrides = cleaned
          }
        }
        if (fromVersion < 63) {
          // Lighting / shadows / post-processing / splatBrightness
          // are now per-world (PER_WORLD_KEYS). Before this version
          // these knobs were GLOBAL — so when the user changed the
          // sun to red while standing in hell-cave, that red colour
          // bled into fantasy2 too. Now each world owns its own
          // copy. To preserve the user's current tuning we
          // SNAPSHOT the current globals into the current world's
          // overrides, then RESET the globals to defaults. The next
          // time the user teleports between worlds, applyWorldOverrides
          // will pull each world's settings independently.
          //
          // Migration order matters: snapshot first, THEN reset, so
          // the snapshot captures the user's tuned values (not the
          // defaults we're about to write).
          //
          // List of keys hard-coded here rather than re-using
          // PER_WORLD_KEYS because we want to be explicit about
          // which categories migrate — splat/collider alignment +
          // sparkle were always per-world even before v63 and
          // shouldn't be touched here.
          const v63LookKeys = [
            'ambientIntensity', 'sunIntensity', 'sunPosX', 'sunPosY', 'sunPosZ',
            'sunShadowFollowCharacter', 'sunColor', 'fillIntensity',
            'fillPosX', 'fillPosY', 'fillPosZ', 'fillColor',
            'shadowMapSize', 'shadowBias', 'shadowNormalBias', 'shadowRadius',
            'shadowCameraNear', 'shadowCameraFar', 'shadowCameraHalfExtent',
            'shadowMapType', 'shadowIntensity', 'shadowBlurSamples',
            'colliderGlbShadowOpacity', 'colliderGlbShadowColor',
            'ppEnabled', 'ppBloomIntensity', 'ppBloomThreshold', 'ppBloomSmoothing',
            'ppBrightness', 'ppContrast', 'ppVignetteDarkness', 'ppVignetteOffset',
            'splatBrightness',
          ] as const

          const currentSlug =
            typeof migrated.currentWorldSlug === 'string' && migrated.currentWorldSlug
              ? migrated.currentWorldSlug
              : 'fantasy2' // best-effort default for stores that never set a slug

          // Snapshot: build the per-slug override from whatever
          // values the user currently has set globally. Skip any
          // key that's missing/undefined to avoid storing junk.
          const snapshot: Record<string, unknown> = {}
          for (const k of v63LookKeys) {
            if (migrated[k] !== undefined) snapshot[k] = migrated[k]
          }

          const overridesV63 = (migrated.worldOverrides as
            | Record<string, Partial<WizardTuning>>
            | undefined) ?? {}
          // Merge: snapshot first (lower precedence), then any
          // existing override (higher precedence). The current world
          // gets the snapshot baked in, but if the user already had
          // a partial override for the same key it wins.
          migrated.worldOverrides = {
            ...overridesV63,
            [currentSlug]: {
              ...snapshot,
              ...(overridesV63[currentSlug] ?? {}),
            },
          }

          // Now reset the globals to as-shipped defaults. When the
          // user next teleports / refreshes, applyWorldOverrides
          // re-applies the right world's values.
          for (const k of v63LookKeys) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            migrated[k] = (DEFAULT_WIZARD_TUNING as any)[k]
          }
          // ALSO immediately apply the current world's overrides on
          // top of the freshly-reset globals so the page doesn't
          // flash defaults for one frame on hydration.
          const finalOverrides = (migrated.worldOverrides as
            Record<string, Partial<WizardTuning>>)[currentSlug] ?? {}
          for (const k of v63LookKeys) {
            if (k in finalOverrides) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              migrated[k] = (finalOverrides as any)[k]
            }
          }
        }
        if (fromVersion < 64) {
          // The user reported fantasy2 alignment was "not aligned
          // properly anymore" and asked to restore the values from
          // their last git commit (b1a59d4), where fantasy2's
          // alignment was just the defaults: every splat/collider
          // offset = 0, every scale = 1 (or the global default at the
          // time), spawnFeetY = 4. Stale user-set overrides from the
          // pre-per-world era had crept into worldOverrides['fantasy2']
          // via the auto-save in setTuning.
          //
          // Surgically strip ONLY alignment keys from fantasy2's
          // overrides — we leave sparkle / lighting / post-processing
          // alone because the user didn't ask to revert those (and
          // doing so would wipe any deliberate fantasy-look tuning
          // they did intentionally). If they want a full fantasy2
          // reset later, the "Reset this world to defaults" button
          // already does that.
          const alignmentKeys = [
            'splatOffsetX', 'splatOffsetY', 'splatOffsetZ',
            'splatRotationDegX', 'splatRotationDegY', 'splatRotationDegZ',
            'splatUniformScale',
            'colliderOffsetX', 'colliderOffsetY', 'colliderOffsetZ',
            'colliderUniformScale',
            'spawnFeetY',
          ] as const
          const overridesV64 = migrated.worldOverrides as
            | Record<string, Partial<WizardTuning>>
            | undefined
          if (overridesV64 && overridesV64['fantasy2']) {
            const fantasy = { ...overridesV64['fantasy2'] }
            for (const k of alignmentKeys) {
              delete (fantasy as Record<string, unknown>)[k]
            }
            migrated.worldOverrides = {
              ...overridesV64,
              fantasy2: fantasy,
            }
          }
          // If the user is currently IN fantasy2 on hydration, the
          // global alignment fields could still hold stale tweaks
          // from before. Reset those to defaults so the splat snaps
          // to the as-authored alignment without waiting for a
          // teleport.
          if (migrated.currentWorldSlug === 'fantasy2') {
            for (const k of alignmentKeys) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              migrated[k] = (DEFAULT_WIZARD_TUNING as any)[k]
            }
          }
        }
        if (fromVersion < 66) {
          // The user reported ember particles bleeding into fantasy2
          // (they should be hell-cave-only). Root cause: several
          // sparkle fields (`sparklePosX/Y/Z`, `sparkleHeight`,
          // `sparkleFollowCharacter`, etc.) are read by SparkleScene
          // but were never added to PER_WORLD_KEYS. When the user
          // applies the ember preset in hell-cave, those globals get
          // written and persist; teleporting to fantasy2 doesn't
          // clear them because applyWorldOverrides only touches
          // keys listed in PER_WORLD_KEYS.
          //
          // Cumulative migrations over the last hour have made the
          // user's persisted state hard to reason about. The fastest
          // path to a known-good baseline is a NUCLEAR RESET of
          // worldOverrides: wipe the user's accumulated per-world
          // overrides and reseed from the code-level defaults
          // (DEFAULT_WIZARD_TUNING.worldOverrides). The pre-seeded
          // hell-cave look survives (red sun + ember sparkle),
          // fantasy2 gets no overrides (= as-shipped defaults), and
          // every per-world GLOBAL field is reset to the default
          // value too so whichever world is active on hydration
          // matches its overrides cleanly.
          migrated.worldOverrides = {
            ...DEFAULT_WIZARD_TUNING.worldOverrides,
          }
          for (const k of PER_WORLD_KEYS) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            migrated[k] = (DEFAULT_WIZARD_TUNING as any)[k]
          }
          // If the user is currently in a world that has pre-seeded
          // overrides (hell-cave), apply them to globals so the page
          // doesn't flash defaults for a frame before App's effect
          // fires setCurrentWorldSlug.
          const currentSlugV66 =
            typeof migrated.currentWorldSlug === 'string' && migrated.currentWorldSlug
              ? migrated.currentWorldSlug
              : ''
          if (currentSlugV66) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const seeded = (DEFAULT_WIZARD_TUNING.worldOverrides as any)[currentSlugV66]
            if (seeded) {
              for (const k of PER_WORLD_KEYS) {
                if (k in seeded) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  migrated[k] = seeded[k]
                }
              }
            }
          }
          if (typeof console !== 'undefined') {
            console.info(
              '[wizardTuning v66] Nuclear reset: wiped user worldOverrides, ' +
              'reseeded from DEFAULT_WIZARD_TUNING. Hell-cave keeps its ' +
              'pre-seeded red sun + ember sparkle; fantasy2 is at vanilla ' +
              'defaults; alignment is 0,0,0 in both worlds.'
            )
          }
        }
        if (fromVersion < 67) {
          // The user reported the teleport square was auto-firing at the
          // fantasy2 spawn point. Root cause: the v58 default placed it
          // at (0,1,0) with halfSize 1.5, which is exactly where the
          // wizard's feet land after falling from spawnFeetY=4 — the
          // capsule passes straight through the AABB on the way down
          // and edge-triggers the teleport before the player has any
          // chance to look around.
          //
          // Move it to the cosmic swirl (the thematic gateway). Only
          // override if it still matches the OLD default; preserve any
          // intentional user placement (gizmo drag, world-snapshot, etc.).
          const isOldDefault =
            migrated.teleportPosX === 0 &&
            migrated.teleportPosY === 1 &&
            migrated.teleportPosZ === 0
          if (isOldDefault) {
            migrated.teleportPosX = DEFAULT_WIZARD_TUNING.teleportPosX
            migrated.teleportPosY = DEFAULT_WIZARD_TUNING.teleportPosY
            migrated.teleportPosZ = DEFAULT_WIZARD_TUNING.teleportPosZ
            if (typeof console !== 'undefined') {
              console.info(
                '[wizardTuning v67] Moved teleport square from spawn (0,1,0) ' +
                'to the cosmic swirl ' +
                `(${DEFAULT_WIZARD_TUNING.teleportPosX}, ` +
                `${DEFAULT_WIZARD_TUNING.teleportPosY}, ` +
                `${DEFAULT_WIZARD_TUNING.teleportPosZ}).`
              )
            }
          }
        }
        if (fromVersion < 68) {
          // Introduce the per-world post-processing snapshot map.
          // The actual seeding (capturing the user's current
          // useDebugStore PP values into the active world's
          // snapshot) happens in App.tsx on first mount — the
          // migration runs before useDebugStore is guaranteed to
          // be hydrated, so we can't read from it safely here.
          // Just make sure the field exists with an empty default
          // so the seedDebugOverridesForWorld action has something
          // to spread into.
          if (!migrated.worldDebugOverrides || typeof migrated.worldDebugOverrides !== 'object') {
            migrated.worldDebugOverrides = {}
          }
        }
        if (fromVersion < 69) {
          // The v67 fix moved the teleport square off spawn, but only
          // for stores older than v67. Users who were already past v67
          // kept a stuck (0,1,0) value (e.g. from an earlier reset),
          // which makes the wizard teleport to hell-cave the instant it
          // spawns in fantasy2 — the player never gets to start in the
          // fantasy world. Re-run the same (0,1,0)→cosmic-swirl fix at
          // this version so those stores get corrected too. Any
          // intentional placement (non-(0,1,0)) is preserved.
          const stuckAtSpawn =
            migrated.teleportPosX === 0 &&
            migrated.teleportPosY === 1 &&
            migrated.teleportPosZ === 0
          if (stuckAtSpawn) {
            migrated.teleportPosX = DEFAULT_WIZARD_TUNING.teleportPosX
            migrated.teleportPosY = DEFAULT_WIZARD_TUNING.teleportPosY
            migrated.teleportPosZ = DEFAULT_WIZARD_TUNING.teleportPosZ
            migrated.teleportHalfSize = DEFAULT_WIZARD_TUNING.teleportHalfSize
            if (typeof console !== 'undefined') {
              console.info(
                '[wizardTuning v69] Teleport square was stuck at spawn (0,1,0); ' +
                'reset to the cosmic swirl ' +
                `(${DEFAULT_WIZARD_TUNING.teleportPosX}, ` +
                `${DEFAULT_WIZARD_TUNING.teleportPosY}, ` +
                `${DEFAULT_WIZARD_TUNING.teleportPosZ}).`
              )
            }
          }
        }
        if (fromVersion < 70) {
          // Two visual-quality fixes after the 21M→3M decimation:
          //   1. The runtime LOD budget was capped at 1.5M splats, so
          //      only half of each decimated world actually rendered —
          //      the scene looked soft/blurry. Raise it to 3M (render
          //      everything we shipped) and drop renderScale to 1.5 so
          //      small/distant splats survive. These are GLOBAL knobs.
          //   2. The teleport debug box + drag gizmo were visible in
          //      play (cyan AABB + RGB arrows floating next to the
          //      wizard). Force both off.
          migrated.splatLodSplatCount = DEFAULT_WIZARD_TUNING.splatLodSplatCount
          migrated.splatLodRenderScale = DEFAULT_WIZARD_TUNING.splatLodRenderScale
          migrated.teleportShowDebug = false
          migrated.teleportGizmoEnabled = false
          if (typeof console !== 'undefined') {
            console.info(
              '[wizardTuning v70] Raised LOD budget to 3M (renderScale 1.5) ' +
              'for sharper worlds, and hid the teleport debug box + gizmo.'
            )
          }
        }
        if (fromVersion < 71) {
          // Performance pass for the full-detail `.rad` worlds. v70 had
          // pushed the LOD to a heavy "quality" profile (3M budget, wide
          // full-detail cone) which renders beautifully but lags. Switch
          // to the real-time profile: ~half the splat budget + tighter
          // foveation. With `.rad` streaming LOD by distance this keeps
          // near-camera detail crisp while roughly doubling FPS. All
          // GLOBAL knobs, so it applies to every world at once.
          migrated.splatLodSplatCount = DEFAULT_WIZARD_TUNING.splatLodSplatCount
          migrated.splatLodRenderScale = DEFAULT_WIZARD_TUNING.splatLodRenderScale
          migrated.splatMinPixelRadius = DEFAULT_WIZARD_TUNING.splatMinPixelRadius
          migrated.splatConeFov0Deg = DEFAULT_WIZARD_TUNING.splatConeFov0Deg
          migrated.splatConeFovDeg = DEFAULT_WIZARD_TUNING.splatConeFovDeg
          migrated.splatConeFoveate = DEFAULT_WIZARD_TUNING.splatConeFoveate
          migrated.splatBehindFoveate = DEFAULT_WIZARD_TUNING.splatBehindFoveate
          migrated.splatLodInflate = DEFAULT_WIZARD_TUNING.splatLodInflate
          if (typeof console !== 'undefined') {
            console.info(
              '[wizardTuning v71] Switched to the real-time LOD/foveation ' +
              'profile (1.5M budget, 50° detail cone) for smoother FPS on ' +
              'the .rad worlds. Use the Splat-perf GUI presets to fine-tune.'
            )
          }
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
            // v56: same one-shot re-enable as v50, prompted by the user
            // explicitly asking "please add the characters back" on
            // May 31 '26 18:49 — none were visible because the 30 m
            // distance cull was hiding them whenever the camera moved
            // off the spawn cluster. The cull was widened to 200 m in
            // CreaturesScene.tsx, but if any creature's `enabled` was
            // also flipped off in the GUI it would still vanish; this
            // sweep flips all of them back on once so the user starts
            // from a known-visible state. As with v50, this is a
            // one-shot — future GUI hides won't be clobbered.
            ...(fromVersion < 56 ? { enabled: true } : {}),
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
          setCurrentWorldSlug: _setSlug,
          applyWorldOverrides: _applyOv,
          saveCurrentSettingsForWorld: _saveOv,
          clearWorldOverrides: _clearOv,
          bumpResetToken: _bump,
          ...rest
        } = s
        return rest
      },
    },
  ),
)
