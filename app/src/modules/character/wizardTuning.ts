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
  resetToken: number
  bumpResetToken: () => void
}

export const DEFAULT_WIZARD_TUNING: WizardTuning = {
  moveSpeed: 9.5,
  sprintMoveMultiplier: 1.85,
  sprintWalkAnimMultiplier: 1.4,
  jumpSpeed: 12,
  gravityY: -25,
  enableWalkStairs: true,
  enableStickToFloor: true,
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
  dogAnimGroundReleaseHold: 0.11,
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
}

export const useWizardTuning = create<WizardTuningStore>()(
  persist(
    (set) => ({
      ...DEFAULT_WIZARD_TUNING,
      resetToken: 0,
      setTuning: (partial) => set(partial),
      resetTuning: () => set({ ...DEFAULT_WIZARD_TUNING }),
      applySplatPerfPreset: (preset) => set(SPLAT_PERF_PRESETS[preset]),
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
      version: 19,
      partialize: (s) => {
        const {
          resetToken: _resetToken,
          setTuning: _set,
          resetTuning: _reset,
          applySplatPerfPreset: _preset,
          bumpResetToken: _bump,
          ...rest
        } = s
        return rest
      },
    },
  ),
)
