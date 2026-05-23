/**
 * Floating lil-gui panel — a 1:1 port of the GUI built in
 * `Desktop/Astronaut/src/main.ts` (lines 1152–1286). Folder names, slider
 * labels, ranges, control order, and the trailing Reset / Save buttons all
 * match the astronaut/tpc-splat demo. Values bind to `useWizardTuning`, which
 * persists to localStorage automatically (the 💾 button surfaces that contract
 * to the user the same way the demo's `saveSettings` button does).
 *
 * Bindings:
 *   - Movement, Physics, Character model (incl. Position offset) → drive
 *     WizardController via the tuning store each frame.
 *   - Lighting, Shadows, Post-processing, Background splat (Spark), Spark
 *     renderer, Physics debug, Flag 2, Rocket — preserved verbatim from the
 *     astronaut GUI; values land in the store. Most have no astronaut-style
 *     consumer in image-blaster's renderer yet (image-blaster's
 *     PostProcessing + lighting are driven from the existing Leva panel and
 *     world manifest), so those sliders are decorative until wired.
 */
import { useEffect, useRef } from 'react'
import GUI from 'lil-gui'
import {
  DEFAULT_WIZARD_TUNING,
  useWizardTuning,
  type ShadowMapType,
  type WizardTuning,
} from './wizardTuning'

const SHADOW_MAP_TYPES: ShadowMapType[] = [
  'BasicShadowMap',
  'PCFShadowMap',
  'PCFSoftShadowMap',
  'VSMShadowMap',
]

export function WizardGui() {
  const guiRef = useRef<GUI | null>(null)

  useEffect(() => {
    const gui = new GUI({ title: 'Character controller' })
    gui.domElement.style.zIndex = '40'
    gui.domElement.style.top = '64px'
    gui.domElement.style.right = '8px'
    guiRef.current = gui

    // Local mutable snapshot the GUI mutates in place; onChange handlers below push
    // every edit back into the persisted Zustand store.
    const t = { ...useWizardTuning.getState() }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tAny = t as any
    const tracked: Array<{ updateDisplay: () => void }> = []
    const push = <K extends keyof WizardTuning>(key: K) =>
      (value: WizardTuning[K]) => useWizardTuning.getState().setTuning({ [key]: value } as Partial<WizardTuning>)

    // ── Movement ─────────────────────────────────────────────────────────────
    const moveFolder = gui.addFolder('Movement')
    tracked.push(
      moveFolder.add(tAny, 'moveSpeed', 1, 40, 0.5).name('Move speed').onChange(push('moveSpeed')),
      moveFolder.add(tAny, 'sprintMoveMultiplier', 1, 3, 0.05).name('Sprint move × (Shift)').onChange(push('sprintMoveMultiplier')),
      moveFolder.add(tAny, 'sprintWalkAnimMultiplier', 1, 2.5, 0.05).name('Sprint walk anim ×').onChange(push('sprintWalkAnimMultiplier')),
      moveFolder.add(tAny, 'jumpSpeed', 2, 35, 0.5).name('Jump impulse').onChange(push('jumpSpeed')),
      moveFolder.add(tAny, 'controlMovementDuringJump').name('Air control').onChange(push('controlMovementDuringJump')),
      moveFolder.add(tAny, 'enableCharacterInertia').name('Move inertia').onChange(push('enableCharacterInertia')),
    )

    // ── Physics ──────────────────────────────────────────────────────────────
    const physFolder = gui.addFolder('Physics')
    tracked.push(
      physFolder.add(tAny, 'gravityY', -60, -5, 0.5).name('Gravity Y').onChange(push('gravityY')),
      physFolder.add(tAny, 'enableWalkStairs').name('Walk stairs').onChange(push('enableWalkStairs')),
      physFolder.add(tAny, 'enableStickToFloor').name('Stick to floor').onChange(push('enableStickToFloor')),
    )

    // ── Lighting ─────────────────────────────────────────────────────────────
    const lightingFolder = gui.addFolder('Lighting')
    tracked.push(
      lightingFolder.add(tAny, 'ambientIntensity', 0, 2, 0.01).name('Ambient').onChange(push('ambientIntensity')),
      lightingFolder.add(tAny, 'sunIntensity', 0, 3, 0.02).name('Sun intensity').onChange(push('sunIntensity')),
      lightingFolder.addColor(tAny, 'sunColor').name('Sun color').onChange(push('sunColor')),
      lightingFolder.add(tAny, 'sunShadowFollowCharacter').name('Sun + shadow map follow character').onChange(push('sunShadowFollowCharacter')),
      lightingFolder.add(tAny, 'sunPosX', -120, 120, 0.5).name('Sun X (offset if follow)').onChange(push('sunPosX')),
      lightingFolder.add(tAny, 'sunPosY', -20, 120, 0.5).name('Sun Y (offset if follow)').onChange(push('sunPosY')),
      lightingFolder.add(tAny, 'sunPosZ', -120, 120, 0.5).name('Sun Z (offset if follow)').onChange(push('sunPosZ')),
      lightingFolder.add(tAny, 'fillIntensity', 0, 2, 0.02).name('Fill intensity').onChange(push('fillIntensity')),
      lightingFolder.addColor(tAny, 'fillColor').name('Fill color').onChange(push('fillColor')),
      lightingFolder.add(tAny, 'fillPosX', -120, 120, 0.5).name('Fill X').onChange(push('fillPosX')),
      lightingFolder.add(tAny, 'fillPosY', -20, 120, 0.5).name('Fill Y').onChange(push('fillPosY')),
      lightingFolder.add(tAny, 'fillPosZ', -120, 120, 0.5).name('Fill Z').onChange(push('fillPosZ')),
    )

    // ── Shadows ──────────────────────────────────────────────────────────────
    const shadowFolder = gui.addFolder('Shadows')
    tracked.push(
      shadowFolder.add(tAny, 'shadowMapSize', 256, 4096, 128).name('Map size (px)').onChange(push('shadowMapSize')),
      shadowFolder.add(tAny, 'shadowBias', -0.002, 0.002, 0.00005).name('Bias').onChange(push('shadowBias')),
      shadowFolder.add(tAny, 'shadowNormalBias', 0, 0.05, 0.0005).name('Normal bias').onChange(push('shadowNormalBias')),
      shadowFolder.add(tAny, 'shadowRadius', 0, 8, 0.1).name('Radius (soft blur)').onChange(push('shadowRadius')),
      shadowFolder.add(tAny, 'shadowIntensity', 0, 1, 0.01).name('Shadow intensity').onChange(push('shadowIntensity')),
      shadowFolder.add(tAny, 'shadowBlurSamples', 4, 32, 1).name('VSM blur samples').onChange(push('shadowBlurSamples')),
      shadowFolder.add(tAny, 'shadowCameraNear', 0.1, 50, 0.1).name('Cam near').onChange(push('shadowCameraNear')),
      shadowFolder.add(tAny, 'shadowCameraFar', 50, 400, 1).name('Cam far').onChange(push('shadowCameraFar')),
      shadowFolder.add(tAny, 'shadowCameraHalfExtent', 20, 200, 1).name('Cam half-extent').onChange(push('shadowCameraHalfExtent')),
      shadowFolder.add(tAny, 'shadowMapType', SHADOW_MAP_TYPES).name('Map filter').onChange(push('shadowMapType')),
      shadowFolder.addColor(tAny, 'colliderGlbShadowColor').name('Collider GLB shadow tint').onChange(push('colliderGlbShadowColor')),
    )

    // ── Post-processing ──────────────────────────────────────────────────────
    const ppFolder = gui.addFolder('Post-processing')
    tracked.push(
      ppFolder.add(tAny, 'ppEnabled').name('Enabled').onChange(push('ppEnabled')),
      ppFolder.add(tAny, 'ppBloomThreshold', 0, 1, 0.01).name('Bloom threshold').onChange(push('ppBloomThreshold')),
      ppFolder.add(tAny, 'ppBloomSmoothing', 0, 1, 0.01).name('Bloom smoothing').onChange(push('ppBloomSmoothing')),
      ppFolder.add(tAny, 'ppBrightness', -1, 1, 0.02).name('Brightness').onChange(push('ppBrightness')),
      ppFolder.add(tAny, 'ppContrast', -1, 1, 0.02).name('Contrast').onChange(push('ppContrast')),
      ppFolder.add(tAny, 'ppVignetteDarkness', 0, 1, 0.01).name('Vignette darkness').onChange(push('ppVignetteDarkness')),
      ppFolder.add(tAny, 'ppVignetteOffset', 0, 1, 0.01).name('Vignette offset').onChange(push('ppVignetteOffset')),
    )

    // ── Background splat (Spark) ─────────────────────────────────────────────
    const splatFolder = gui.addFolder('Background splat (Spark)')
    tracked.push(
      splatFolder.add(tAny, 'splatUniformScale', 0.05, 8, 0.01).name('Uniform scale').onChange(push('splatUniformScale')),
    )

    // ── Spark renderer ───────────────────────────────────────────────────────
    const sparkRendererFolder = gui.addFolder('Spark renderer')
    tracked.push(
      sparkRendererFolder.add(tAny, 'sparkFocalDistance', 0, 120, 0.05).name('Focal distance (Ln)').onChange(push('sparkFocalDistance')),
      sparkRendererFolder.add(tAny, 'sparkApertureAngleDeg', 0, 45, 0.05).name('Aperture angle (°)').onChange(push('sparkApertureAngleDeg')),
    )

    // ── Character model ──────────────────────────────────────────────────────
    const dogFolder = gui.addFolder('Character model')
    tracked.push(
      // Use onFinishChange for Character size: each commit re-mounts the Rapier capsule
      // (collider `args` aren't reactive in @react-three/rapier), and we want that to fire
      // once on slider release rather than on every micro-drag tick.
      dogFolder.add(tAny, 'dogHeight', 0.1, 10, 0.1).name('Character size').onFinishChange(push('dogHeight')),
      dogFolder.add(tAny, 'dogYawDeg', -180, 180, 1).name('Mesh yaw (°)').onChange(push('dogYawDeg')),
      dogFolder.add(tAny, 'dogTurnSpeed', 0.5, 24, 0.25).name('Turn toward move').onChange(push('dogTurnSpeed')),
      dogFolder.add(tAny, 'dogWalkSpeedThreshold', 0.02, 0.35, 0.01).name('Walk speed threshold').onChange(push('dogWalkSpeedThreshold')),
      dogFolder.add(tAny, 'dogAnimGroundReleaseHold', 0, 0.35, 0.01).name('Air anim delay (s)').onChange(push('dogAnimGroundReleaseHold')),
      dogFolder.add(tAny, 'dogAnimCrossfade', 0.05, 0.8, 0.01).name('Anim crossfade (s)').onChange(push('dogAnimCrossfade')),
    )

    const dogOffsetFolder = dogFolder.addFolder('Position offset (rig space)')
    tracked.push(
      dogOffsetFolder.add(tAny, 'dogOffsetX', -5, 2, 0.01).name('X').onChange(push('dogOffsetX')),
      dogOffsetFolder.add(tAny, 'dogOffsetY', -5, 6, 0.01).name('Y (up)').onChange(push('dogOffsetY')),
      dogOffsetFolder.add(tAny, 'dogOffsetZ', -5, 2, 0.01).name('Z').onChange(push('dogOffsetZ')),
    )

    // ── Spawn (image-blaster addition — variable world scale needs a tunable spawn) ─
    const spawnFolder = gui.addFolder('Spawn')
    tracked.push(
      spawnFolder.add(tAny, 'spawnFeetY', 0, 50, 0.1).name('Feet Y').onChange(push('spawnFeetY')),
    )

    // ── Physics debug (Rapier) ───────────────────────────────────────────────
    const dbgFolder = gui.addFolder('Physics debug (Rapier)')
    tracked.push(
      dbgFolder.add(tAny, 'showPhysicsDebug').name('Enabled').onChange(push('showPhysicsDebug')),
      dbgFolder.add(tAny, 'debugBodies').name('Collider wireframe').onChange(push('debugBodies')),
    )

    // ── Flag 2 ───────────────────────────────────────────────────────────────
    const flag2Folder = gui.addFolder('Flag 2')
    tracked.push(
      flag2Folder.add(tAny, 'flag2X', -100, 100, 0.1).name('Position X').onChange(push('flag2X')),
      flag2Folder.add(tAny, 'flag2Y', -20, 50, 0.1).name('Position Y').onChange(push('flag2Y')),
      flag2Folder.add(tAny, 'flag2Z', -100, 100, 0.1).name('Position Z').onChange(push('flag2Z')),
      flag2Folder.add(tAny, 'flag2RotY', -180, 180, 1).name('Rotation Y (°)').onChange(push('flag2RotY')),
      flag2Folder.add(tAny, 'flag2Scale', 0.01, 20, 0.01).name('Scale').onChange(push('flag2Scale')),
    )

    // ── Rocket ───────────────────────────────────────────────────────────────
    const rocketFolder = gui.addFolder('Rocket')
    tracked.push(
      rocketFolder.add(tAny, 'rocketX', -100, 100, 0.1).name('Position X').onChange(push('rocketX')),
      rocketFolder.add(tAny, 'rocketY', -20, 50, 0.1).name('Position Y').onChange(push('rocketY')),
      rocketFolder.add(tAny, 'rocketZ', -100, 100, 0.1).name('Position Z').onChange(push('rocketZ')),
      rocketFolder.add(tAny, 'rocketRotY', -180, 180, 1).name('Rotation Y (°)').onChange(push('rocketRotY')),
      rocketFolder.add(tAny, 'rocketScale', 0.01, 20, 0.01).name('Scale').onChange(push('rocketScale')),
    )

    // ── Reset / Save buttons (matches astronaut GUI footer) ──────────────────
    gui
      .add(
        {
          resetCharacter: () => useWizardTuning.getState().bumpResetToken(),
        },
        'resetCharacter',
      )
      .name('Reset position')

    gui
      .add(
        {
          saveSettings: () => {
            // Force the persist middleware to flush by re-setting current values.
            const s = useWizardTuning.getState()
            s.setTuning({ moveSpeed: s.moveSpeed })
          },
        },
        'saveSettings',
      )
      .name('💾 Save all settings')

    // Default-folder collapse state mirrors the astronaut demo (everything open).
    return () => {
      gui.destroy()
      guiRef.current = null
      // Suppress unused-tracked warning; refs kept to allow future updateDisplay() reset.
      void tracked
      void DEFAULT_WIZARD_TUNING
    }
  }, [])

  return null
}
