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
  sparkFocalDistance: number
  sparkApertureAngleDeg: number

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

export interface WizardTuningStore extends WizardTuning {
  setTuning: (partial: Partial<WizardTuning>) => void
  resetTuning: () => void
  resetToken: number
  bumpResetToken: () => void
}

export const DEFAULT_WIZARD_TUNING: WizardTuning = {
  moveSpeed: 5,
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
  dogOffsetY: -3.86,
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
  sparkFocalDistance: 0,
  sparkApertureAngleDeg: 0,

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
      bumpResetToken: () => set((s) => ({ resetToken: s.resetToken + 1 })),
    }),
    {
      name: 'image-blaster-wizard-tuning',
      // Bumped on schema change to drop stale persisted values from earlier prototypes.
      version: 13,
      partialize: (s) => {
        const {
          resetToken: _resetToken,
          setTuning: _set,
          resetTuning: _reset,
          bumpResetToken: _bump,
          ...rest
        } = s
        return rest
      },
    },
  ),
)
