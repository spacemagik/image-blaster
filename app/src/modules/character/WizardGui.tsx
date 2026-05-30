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
  PORTAL_LOOK_PRESETS,
  SPLAT_PERF_PRESETS,
  useWizardTuning,
  type PortalLookPreset,
  type ShadowMapType,
  type SplatPerfPreset,
  type WizardTuning,
} from './wizardTuning'
import { SPARKLE_PRESETS, type SparklePreset } from '../splat/sparkle'
import { useDebugStore } from '../../store/debug'
import { wizardFeetPos } from './wizardState'

const SPARKLE_PRESET_NAMES = Object.keys(SPARKLE_PRESETS) as SparklePreset[]

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
      // Wider snap distance keeps the character planted on sparse collider GLBs
      // (e.g. fantasy8.glb). Below ~0.6 m the character flips into airborne /
      // "fly mode" on every triangle edge.
      physFolder.add(tAny, 'stickToFloorDistance', 0.1, 5, 0.05).name('Floor snap dist (m)').onChange(push('stickToFloorDistance')),
      physFolder.add(tAny, 'maxSlopeClimbDeg', 20, 85, 1).name('Max slope climb (°)').onChange(push('maxSlopeClimbDeg')),
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
      splatFolder.add(tAny, 'splatFlipYOverride').name('Flip Y (splat only)').onChange(push('splatFlipYOverride')),
    )

    // ── Spark renderer ───────────────────────────────────────────────────────
    const sparkRendererFolder = gui.addFolder('Spark renderer')
    tracked.push(
      sparkRendererFolder.add(tAny, 'sparkFocalDistance', 0, 120, 0.05).name('Focal distance (Ln)').onChange(push('sparkFocalDistance')),
      sparkRendererFolder.add(tAny, 'sparkApertureAngleDeg', 0, 45, 0.05).name('Aperture angle (°)').onChange(push('sparkApertureAngleDeg')),
    )

    // ── Splat performance (Spark 2.1 LoD) ───────────────────────────────────
    // Drag these LEFT for more FPS on heavy splats (20M+). Spark streams a working
    // set out of the file's baked LOD tree at runtime — these knobs decide how big
    // that set is and how aggressively peripheral splats get culled.
    const splatPerfFolder = gui.addFolder('Splat performance')
    // Live sliders that the preset buttons also have to refresh.
    const splatPerfControls = [
      splatPerfFolder.add(tAny, 'splatLodEnabled').name('LOD enabled').onChange(push('splatLodEnabled')),
      splatPerfFolder.add(tAny, 'splatLodSplatCount', 0, 5_000_000, 50_000).name('Splat budget (0=auto)').onChange(push('splatLodSplatCount')),
      splatPerfFolder.add(tAny, 'splatLodSplatScale', 0.05, 2, 0.01).name('Scale × platform default').onChange(push('splatLodSplatScale')),
      splatPerfFolder.add(tAny, 'splatLodRenderScale', 1, 5, 0.1).name('Min splat size (px)').onChange(push('splatLodRenderScale')),
      splatPerfFolder.add(tAny, 'splatMinPixelRadius', 0, 4, 0.05).name('Min pixel radius').onChange(push('splatMinPixelRadius')),
      splatPerfFolder.add(tAny, 'splatMaxStdDev', Math.sqrt(4), Math.sqrt(9), 0.01).name('Max std dev').onChange(push('splatMaxStdDev')),
      splatPerfFolder.add(tAny, 'splatLodInflate').name('LoD inflate (soften)').onChange(push('splatLodInflate')),
    ]
    tracked.push(...splatPerfControls)

    // Foveation sub-folder — under-promoted Spark 2.1 power. Tightening the front cone
    // (`splatConeFov0Deg`) is usually the single biggest perf win because the renderer
    // streams way fewer chunks for what's not in front of you.
    const foveationFolder = splatPerfFolder.addFolder('Foveation (cone fade-off)')
    const foveationControls = [
      foveationFolder.add(tAny, 'splatConeFov0Deg', 0, 180, 1).name('Full-res cone (°)').onChange(push('splatConeFov0Deg')),
      foveationFolder.add(tAny, 'splatConeFovDeg', 0, 180, 1).name('Outer cone (°)').onChange(push('splatConeFovDeg')),
      foveationFolder.add(tAny, 'splatConeFoveate', 0, 1, 0.01).name('Peripheral detail').onChange(push('splatConeFoveate')),
      foveationFolder.add(tAny, 'splatBehindFoveate', 0, 1, 0.01).name('Behind detail').onChange(push('splatBehindFoveate')),
    ]
    tracked.push(...foveationControls)

    // Preset buttons — one-click reset everything to a curated performance/quality point.
    const refreshPerfDisplay = () => {
      splatPerfControls.forEach((c) => c.updateDisplay())
      foveationControls.forEach((c) => c.updateDisplay())
    }
    const applyPreset = (preset: SplatPerfPreset) => () => {
      useWizardTuning.getState().applySplatPerfPreset(preset)
      Object.assign(tAny, SPLAT_PERF_PRESETS[preset])
      refreshPerfDisplay()
    }
    splatPerfFolder.add({ p: applyPreset('performance') }, 'p').name('▶ Preset: Performance')
    splatPerfFolder.add({ p: applyPreset('balanced') }, 'p').name('▶ Preset: Balanced')
    splatPerfFolder.add({ p: applyPreset('quality') }, 'p').name('▶ Preset: Quality')
    // Keep the tracked array in sync with sliders so the global Reset still works.
    const unsubSplatPerfTuning = useWizardTuning.subscribe((s, prev) => {
      if (
        s.splatLodEnabled !== prev.splatLodEnabled ||
        s.splatLodSplatCount !== prev.splatLodSplatCount ||
        s.splatLodSplatScale !== prev.splatLodSplatScale ||
        s.splatLodRenderScale !== prev.splatLodRenderScale ||
        s.splatMinPixelRadius !== prev.splatMinPixelRadius ||
        s.splatMaxStdDev !== prev.splatMaxStdDev ||
        s.splatLodInflate !== prev.splatLodInflate ||
        s.splatConeFov0Deg !== prev.splatConeFov0Deg ||
        s.splatConeFovDeg !== prev.splatConeFovDeg ||
        s.splatConeFoveate !== prev.splatConeFoveate ||
        s.splatBehindFoveate !== prev.splatBehindFoveate
      ) {
        Object.assign(tAny, {
          splatLodEnabled: s.splatLodEnabled,
          splatLodSplatCount: s.splatLodSplatCount,
          splatLodSplatScale: s.splatLodSplatScale,
          splatLodRenderScale: s.splatLodRenderScale,
          splatMinPixelRadius: s.splatMinPixelRadius,
          splatMaxStdDev: s.splatMaxStdDev,
          splatLodInflate: s.splatLodInflate,
          splatConeFov0Deg: s.splatConeFov0Deg,
          splatConeFovDeg: s.splatConeFovDeg,
          splatConeFoveate: s.splatConeFoveate,
          splatBehindFoveate: s.splatBehindFoveate,
        })
        refreshPerfDisplay()
      }
    })

    // ── Sparkles (Spark 2.1 particle FX) ─────────────────────────────────────
    // Mirror the inline sparkle.js demo's controls inside the existing lil-gui.
    // Preset picker re-seeds every per-field knob below; switching presets
    // updates the visible sliders to that preset's defaults so users can
    // tweak from there. Position / opacity edits hot-update; everything else
    // triggers a Sparkle.removeEffect + addEffect in SparkleScene.
    const sparkleFolder = gui.addFolder('Sparkles')
    const sparkleControls: Array<{ updateDisplay: () => void }> = []
    sparkleControls.push(
      sparkleFolder.add(tAny, 'sparkleEnabled').name('Enable').onChange(push('sparkleEnabled')),
    )
    const refreshSparkleDisplay = () => sparkleControls.forEach((c) => c.updateDisplay())
    sparkleControls.push(
      sparkleFolder
        .add(tAny, 'sparklePreset', SPARKLE_PRESET_NAMES)
        .name('Preset')
        .onChange((value: SparklePreset) => {
          useWizardTuning.getState().applySparklePreset(value)
          // Local snapshot stays in sync so the freshly-seeded preset values
          // show up in the sliders below without a manual refresh click.
          Object.assign(tAny, useWizardTuning.getState())
          refreshSparkleDisplay()
        }),
    )
    const posFolder = sparkleFolder.addFolder('Position')
    sparkleControls.push(
      // Follow toggle: when on, X/Y/Z are offsets from the character's feet
      // (the slab rides with the player). When off, they're absolute world
      // coords (the slab stays put). The slider labels intentionally stay
      // "X / Y / Z" in both modes — the meaning is documented in the folder
      // name (kept as "Position") and via the Follow toggle next to it.
      posFolder.add(tAny, 'sparkleFollowCharacter').name('Follow character').onChange(push('sparkleFollowCharacter')),
      // Exponential lag in seconds. 0 = snap (was previous default — looks
      // like an obvious teleport when walking because all particles
      // translate by the same step distance each frame). 0.6 s is the
      // default and feels like ambient mist that slowly catches up to the
      // player. >1.5 s starts to look like the particles are stuck to the
      // ground (slab takes longer to recenter than the player takes to walk
      // through it). Capped at 3 s to keep the slider useful.
      posFolder.add(tAny, 'sparkleFollowSmoothing', 0, 3, 0.05).name('Follow lag (s)').onChange(push('sparkleFollowSmoothing')),
      posFolder.add(tAny, 'sparklePosX', -50, 50, 0.1).name('X (offset)').onChange(push('sparklePosX')),
      posFolder.add(tAny, 'sparklePosY', -20, 30, 0.1).name('Y (offset)').onChange(push('sparklePosY')),
      posFolder.add(tAny, 'sparklePosZ', -50, 50, 0.1).name('Z (offset)').onChange(push('sparklePosZ')),
    )
    const sizeFolder = sparkleFolder.addFolder('Size')
    sparkleControls.push(
      // No min/max passed → lil-gui renders a plain number input (no slider
      // cap). User can type any value, drag the field, or use the stepper.
      // `Radius` is the X/Z half-extent (wide-the-plane); `Height` is the
      // Y half-extent (thin-the-slab). A wide radius + small height gives a
      // plane / curtain spawn; equal values give a cube.
      sizeFolder.add(tAny, 'sparkleRadius').step(0.1).name('Radius (XZ)').onChange(push('sparkleRadius')),
      sizeFolder.add(tAny, 'sparkleHeight').step(0.1).name('Height (Y)').onChange(push('sparkleHeight')),
      sizeFolder.add(tAny, 'sparkleMinScale', 0.0005, 0.05, 0.0005).name('Min particle size').onChange(push('sparkleMinScale')),
      sizeFolder.add(tAny, 'sparkleMaxScale', 0.001, 0.1, 0.001).name('Max particle size').onChange(push('sparkleMaxScale')),
    )
    const lookFolder = sparkleFolder.addFolder('Look')
    sparkleControls.push(
      lookFolder.add(tAny, 'sparkleDensity', 1, 600, 1).name('Density').onChange(push('sparkleDensity')),
      // Hard cap on particle count. Density × volume can hit millions on
      // a wide slab; this is the brake. 8000 covers most "forest mist"
      // looks; bump to 20k+ for very dense effects, but expect FPS hit.
      lookFolder.add(tAny, 'sparkleMaxSplats', 100, 200000, 100).name('Max splats').onChange(push('sparkleMaxSplats')),
      lookFolder.add(tAny, 'sparkleOpacity', 0, 1, 0.01).name('Opacity').onChange(push('sparkleOpacity')),
      lookFolder.addColor(tAny, 'sparkleColor1').name('Color 1').onChange(push('sparkleColor1')),
      lookFolder.addColor(tAny, 'sparkleColor2').name('Color 2').onChange(push('sparkleColor2')),
    )
    const motionFolder = sparkleFolder.addFolder('Motion')
    sparkleControls.push(
      motionFolder.add(tAny, 'sparkleFallVelocity', 0, 0.2, 0.001).name('Velocity').onChange(push('sparkleFallVelocity')),
      motionFolder.add(tAny, 'sparkleWanderScale', 0, 0.1, 0.001).name('Wander amp').onChange(push('sparkleWanderScale')),
      motionFolder.add(tAny, 'sparkleWanderVariance', 0, 10, 1).name('Wander freq').onChange(push('sparkleWanderVariance')),
      motionFolder.add(tAny, 'sparkleFallDirX', -1, 1, 0.05).name('Dir X').onChange(push('sparkleFallDirX')),
      motionFolder.add(tAny, 'sparkleFallDirY', -1, 1, 0.05).name('Dir Y').onChange(push('sparkleFallDirY')),
      motionFolder.add(tAny, 'sparkleFallDirZ', -1, 1, 0.05).name('Dir Z').onChange(push('sparkleFallDirZ')),
    )
    const gizmoFolder = sparkleFolder.addFolder('Gizmo + helpers')
    sparkleControls.push(
      gizmoFolder.add(tAny, 'sparkleShowBox').name('Show spawn box').onChange(push('sparkleShowBox')),
      gizmoFolder.add(tAny, 'sparkleGizmoEnabled').name('3D gizmo').onChange(push('sparkleGizmoEnabled')),
      gizmoFolder.add(tAny, 'sparkleGizmoMode', ['translate', 'rotate', 'scale']).name('Gizmo mode').onChange(push('sparkleGizmoMode')),
    )
    tracked.push(...sparkleControls)
    // Keep the snapshot+display in sync when the store changes externally
    // (e.g. Reset button, preset action). Without this, lil-gui sliders would
    // show stale values until a manual `updateDisplay`.
    const unsubSparkle = useWizardTuning.subscribe((s, prev) => {
      const keys: Array<keyof WizardTuning> = [
        'sparkleEnabled', 'sparklePreset',
        'sparklePosX', 'sparklePosY', 'sparklePosZ',
        'sparkleRadius', 'sparkleHeight',
        'sparkleDensity', 'sparkleMaxSplats', 'sparkleOpacity',
        'sparkleMinScale', 'sparkleMaxScale',
        'sparkleColor1', 'sparkleColor2',
        'sparkleFallVelocity', 'sparkleWanderScale', 'sparkleWanderVariance',
        'sparkleFallDirX', 'sparkleFallDirY', 'sparkleFallDirZ',
        'sparkleGizmoEnabled', 'sparkleGizmoMode', 'sparkleShowBox',
        'sparkleFollowCharacter', 'sparkleFollowSmoothing',
      ]
      if (keys.some((k) => s[k] !== prev[k])) {
        for (const k of keys) tAny[k] = s[k]
        refreshSparkleDisplay()
      }
    })

    // ── Cosmic swirl ─────────────────────────────────────────────────────────
    // Loads `/portal.spz` as a standalone SplatMesh and drives a Spark 2.1
    // `worldModifier` that twists / tints ONLY that mesh (the surrounding
    // world is untouched). The folder name was once "Portal twist" — kept
    // the store keys (`portal*`) under that prefix so existing persisted
    // localStorage state still hydrates without migration churn, but the
    // user-facing name is now "Cosmic swirl" since that better describes
    // what the SPZ actually looks like on screen.
    //
    // Gizmo: one TransformControls handle attached to the portal SPZ;
    // `Gizmo mode` cycles it between translate / rotate / scale. All three
    // mirror straight into the persisted store on every drag — see
    // `handleGizmoChange` in PortalScene.
    const portalFolder = gui.addFolder('Cosmic swirl')
    const portalControls: Array<{ updateDisplay: () => void }> = []
    const refreshPortalDisplay = () => portalControls.forEach((c) => c.updateDisplay())
    portalControls.push(
      portalFolder.add(tAny, 'portalShowSphere').name('Show region sphere').onChange(push('portalShowSphere')),
      portalFolder.add(tAny, 'portalGizmoEnabled').name('3D gizmo (visual)').onChange(push('portalGizmoEnabled')),
      // Target picker: choose what the single in-canvas gizmo controls.
      // 'splat' = the cosmic SPZ proxy (full TRS).
      // 'region' = the swirl falloff sphere centre (translate-only).
      // Decoupled in v39 so the swirl region can be dragged onto the
      // visible splat without moving the splat itself — fixes "Enable
      // swirl does nothing" when the SPZ's internal centroid is offset
      // from its object-space origin (cosmic SPZ is several metres off).
      portalFolder.add(tAny, 'portalGizmoTarget', ['splat', 'region'])
        .name('Gizmo target').onChange(push('portalGizmoTarget')),
      // Mode picker mirrors the world splat's `splatGizmoMode` UX so
      // translate/rotate/scale all share one handle in the canvas — no
      // need to keep three separate gizmos mounted at once. (When the
      // gizmo target is 'region' the mode is forced to translate inside
      // PortalScene because rotation/scale don't affect the falloff.)
      portalFolder.add(tAny, 'portalGizmoMode', ['translate', 'rotate', 'scale'])
        .name('Gizmo mode (splat only)').onChange(push('portalGizmoMode')),
    )
    // ── Look presets: one-click between mesmerising "Hypnosis" (the
    // current default) and the previous "Dramatic" look. Each preset
    // re-seats the full swirl-shape + tint field set, so flipping
    // back and forth is a true round-trip with no leftover values
    // from the other mode. Mirrors the SPLAT_PERF_PRESETS button
    // pattern further up the GUI for consistency.
    const applyPortalLook = (preset: PortalLookPreset) => () => {
      useWizardTuning.getState().applyPortalLookPreset(preset)
      Object.assign(tAny, PORTAL_LOOK_PRESETS[preset])
      refreshPortalDisplay()
    }
    portalFolder.add({ p: applyPortalLook('hypnosis') }, 'p').name('▶ Preset: Hypnosis')
    portalFolder.add({ p: applyPortalLook('dramatic') }, 'p').name('▶ Preset: Dramatic')
    // Panic button: flips the swirl OFF without losing any other tuning.
    // Use this if the SPZ appears to have "vanished" — toggling the
    // modifier off proves whether the disappearance is the worldModifier
    // rotating splats out of view (most common: they snap right back
    // after the toggle) vs. a real load / render failure of the SPZ
    // itself (still gone with swirl off → check console for errors).
    portalFolder.add({
      p: () => {
        useWizardTuning.getState().setTuning({ portalEnabled: false })
        tAny.portalEnabled = false
        refreshPortalDisplay()
      },
    }, 'p').name('⏸ Pause swirl (recover SPZ)')
    const portalPosFolder = portalFolder.addFolder('Splat position (world)')
    portalControls.push(
      portalPosFolder.add(tAny, 'portalPosX', -200, 200, 0.1).name('X').onChange(push('portalPosX')),
      portalPosFolder.add(tAny, 'portalPosY', -50, 100, 0.1).name('Y').onChange(push('portalPosY')),
      portalPosFolder.add(tAny, 'portalPosZ', -200, 200, 0.1).name('Z').onChange(push('portalPosZ')),
    )
    // ── Swirl region position (independent from splat) — the centre of
    // the falloff sphere that the worldModifier reads from. Must overlap
    // the visible splat content for `Enable swirl` to do anything; the
    // "Snap region to splat" action below puts it on top of the SPZ's
    // proxy origin which is the usual desired starting point.
    const portalRegionPosFolder = portalFolder.addFolder('Region position (world)')
    portalControls.push(
      portalRegionPosFolder.add(tAny, 'portalRegionPosX', -200, 200, 0.1).name('X').onChange(push('portalRegionPosX')),
      portalRegionPosFolder.add(tAny, 'portalRegionPosY', -50, 100, 0.1).name('Y').onChange(push('portalRegionPosY')),
      portalRegionPosFolder.add(tAny, 'portalRegionPosZ', -200, 200, 0.1).name('Z').onChange(push('portalRegionPosZ')),
    )
    const snapRegionAction = {
      'Snap region to splat': () => {
        const s = useWizardTuning.getState()
        s.setTuning({
          portalRegionPosX: s.portalPosX,
          portalRegionPosY: s.portalPosY,
          portalRegionPosZ: s.portalPosZ,
        })
      },
    }
    portalRegionPosFolder.add(snapRegionAction, 'Snap region to splat')
    // Rotation: degrees so users have intuitive numbers to type. The
    // PortalScene converts to radians at apply time. ±360 range so a user
    // can scrub past a full revolution without the slider clamping.
    const portalRotFolder = portalFolder.addFolder('Rotation (deg)')
    portalControls.push(
      portalRotFolder.add(tAny, 'portalRotationDegX', -360, 360, 0.5).name('X').onChange(push('portalRotationDegX')),
      portalRotFolder.add(tAny, 'portalRotationDegY', -360, 360, 0.5).name('Y').onChange(push('portalRotationDegY')),
      portalRotFolder.add(tAny, 'portalRotationDegZ', -360, 360, 0.5).name('Z').onChange(push('portalRotationDegZ')),
    )
    // Uniform scale only — see store doc on `portalScale` for why we
    // don't expose per-axis splat scaling here.
    const portalScaleFolder = portalFolder.addFolder('Scale')
    portalControls.push(
      portalScaleFolder.add(tAny, 'portalScale', 0.05, 20, 0.05).name('Uniform').onChange(push('portalScale')),
    )
    // ── Effects — everything that runs as part of the Spark dyno
    // worldModifier on the cosmic SPZ. Grouped under one folder so the
    // top-level Cosmic swirl panel stays focused on placement (gizmo +
    // position/rotation/scale) while the visual effect controls live
    // together. The "Enable swirl" master toggle is the first child so
    // it reads as the on/off switch for the whole effect block — every
    // sub-folder below it only matters when this is on.
    const portalEffectsFolder = portalFolder.addFolder('Effects')
    portalControls.push(
      portalEffectsFolder.add(tAny, 'portalEnabled').name('Enable swirl (dyno)').onChange(push('portalEnabled')),
      // Rigid spin — the headline knob for "make the SPZ rotate". This
      // path rotates the SPZ as a single rigid body each frame (one
      // matrix multiply, splats stay perfectly intact). It is
      // INDEPENDENT from the dyno "Enable swirl" toggle above: you
      // can run rigid spin with the dyno entirely off (recommended
      // for the smoothest look), with just the tint dyno on (so
      // colour bands sweep over the spinning SPZ), or stack both
      // for max effect. 0 = no rigid spin. ±6.28 rad/s ≈ ±1 rev/s.
      portalEffectsFolder.add(tAny, 'portalRigidSpinRate', -6.28, 6.28, 0.01).name('Rigid spin (rad/s)').onChange(push('portalRigidSpinRate')),
    )
    const portalShapeFolder = portalEffectsFolder.addFolder('Swirl shape + spin')
    portalControls.push(
      // No min/max on radius so users can scale up to a "warp the whole
      // world" stress test; sane scrub step keeps the slider usable.
      portalShapeFolder.add(tAny, 'portalRadius').step(0.1).name('Radius (m)').onChange(push('portalRadius')),
      // Strength in radians. Half-rotation (π) is the most legibly "portal"
      // look; 2π wraps once, 4π+ starts looking like a candy-cane stripe
      // because nearby splats wind multiple times around each other.
      portalShapeFolder.add(tAny, 'portalStrength', -6.28, 6.28, 0.01).name('Twist (rad)').onChange(push('portalStrength')),
      // Spiral arms — extra rotation per unit of radial distance. THIS is
      // what turns a "smooth twist" into a "portal spiral". 2π = 1 arm,
      // 4π (default) = 2 arms, 6π = 3 arms, etc. Combined with `Spin` the
      // whole arm pattern rotates around the axis.
      portalShapeFolder.add(tAny, 'portalWindings', 0, 25, 0.05).name('Windings (arms)').onChange(push('portalWindings')),
      // Spin rate adds continuous animation. 1 rad/s ≈ one revolution every
      // 6.3 s at the centre. Negative values reverse the swirl direction.
      portalShapeFolder.add(tAny, 'portalSpinRate', -6.28, 6.28, 0.01).name('Spin (rad/s)').onChange(push('portalSpinRate')),
      // Disk shape: 1.0 = sphere falloff (rotates a 3D region), 0.2 =
      // thin disk perpendicular to the axis (rotates a 2D slice). For
      // a 2D-spiral SPZ like the cosmic vortex, keep this LOW (≤ 0.3)
      // so the swirl stays in-plane and doesn't fluff the disk into a
      // 3D ball. Bump toward 1.0 if you want a 3D smoke-warp effect.
      portalShapeFolder.add(tAny, 'portalAxialExtent', 0.05, 1, 0.01).name('Axial extent (disk↔sphere)').onChange(push('portalAxialExtent')),
      // Splat-rotation amount. THIS is the "don't shred my SPZ" knob.
      //   0 → splats stay in their authored positions; the rotation
      //       illusion comes from the tint pass animating its arm
      //       bands around the axis. Crisp authored spiral pattern is
      //       preserved exactly.
      //   1 → splats physically rotate (full geometric twist). With
      //       non-zero Windings, outer splats rotate more than inner
      //       ones and you see visible shearing on a stationary SPZ.
      //   ~0.15-0.3 → subtle physical wobble while mostly keeping the
      //       authored pattern. Often the most "alive" look.
      // Tint speed (spinRate) and arm count are unaffected by this
      // slider, so colour flow keeps moving regardless.
      portalShapeFolder.add(tAny, 'portalGeometryAmount', 0, 1, 0.01).name('Splat rotation (0=tint only)').onChange(push('portalGeometryAmount')),
    )
    const portalAxisFolder = portalEffectsFolder.addFolder('Swirl axis (will normalise)')
    portalControls.push(
      // Range widened from ±1 → ±5 so the user can express axis
      // directions more precisely. Values are normalised in the
      // shader so absolute magnitude doesn't matter — but a vector
      // like (1, 0, 5) describes a different unit direction (mostly
      // +Z with a small +X tilt) than (0.2, 0, 1) would describe
      // at the same nominal step size. ±5 gives ~25× finer angular
      // control near the major-axis directions without losing the
      // ability to type any value (lil-gui lets users override the
      // clamp by clicking the number and typing).
      portalAxisFolder.add(tAny, 'portalAxisX', -5, 5, 0.01).name('X').onChange(push('portalAxisX')),
      portalAxisFolder.add(tAny, 'portalAxisY', -5, 5, 0.01).name('Y (up = vortex)').onChange(push('portalAxisY')),
      portalAxisFolder.add(tAny, 'portalAxisZ', -5, 5, 0.01).name('Z').onChange(push('portalAxisZ')),
    )
    // ── Splat tint — the recolour pass baked into the worldModifier itself.
    // This is what makes the swirled splats actually LOOK like a cyan portal
    // (glowing arms, dark core) instead of just bent forest. Pairs naturally
    // with the geometry twist above: the falloff sphere is shared, so the
    // colour boundary always matches the bend boundary.
    const portalTintFolder = portalEffectsFolder.addFolder('Splat tint (in-portal)')
    portalControls.push(
      portalTintFolder.add(tAny, 'portalTintEnabled').name('Enable recolour').onChange(push('portalTintEnabled')),
      portalTintFolder.addColor(tAny, 'portalTintColor').name('Tint colour').onChange(push('portalTintColor')),
      // Emission > 1 starts triggering the bloom pass and gives the
      // "glowing rim" look from the reference; 0 keeps it matte.
      portalTintFolder.add(tAny, 'portalTintEmission', 0, 5, 0.05).name('Emission (×)').onChange(push('portalTintEmission')),
      portalTintFolder.add(tAny, 'portalTintArms', 1, 12, 1).name('Arm count').onChange(push('portalTintArms')),
      portalTintFolder.add(tAny, 'portalTintWindings', 1, 30, 0.1).name('Winding tightness').onChange(push('portalTintWindings')),
      portalTintFolder.add(tAny, 'portalTintContrast', 1, 5, 0.05).name('Arm sharpness').onChange(push('portalTintContrast')),
      portalTintFolder.add(tAny, 'portalTintCoreDarkness', 0, 1, 0.01).name('Core darkness').onChange(push('portalTintCoreDarkness')),
    )

    // ── Spiral overlay — a procedural rotating-spiral particle layer
    // parented to the cosmic SPZ proxy. Unlike the dyno geometric
    // twist above, this never touches splat positions, so it can't
    // shear / NaN / wedge the GPU. Spins as a single rigid body — the
    // SPZ stays crisp, the spiral sells the motion. Recommended as
    // the primary "is this portal alive?" effect; turn the dyno
    // Geometry slider above to 0 when this is on to avoid the two
    // motion systems fighting each other.
    const portalSpiralFolder = portalEffectsFolder.addFolder('Spiral overlay (rigid)')
    portalControls.push(
      portalSpiralFolder.add(tAny, 'portalSpiralEnabled').name('Enable spiral').onChange(push('portalSpiralEnabled')),
      // Spin rate is the headline knob — pulling this above the other
      // controls so the user can immediately answer "is it moving?".
      // ±6.28 rad/s ≈ ±1 revolution/sec at most extreme.
      portalSpiralFolder.add(tAny, 'portalSpiralSpinRate', -6.28, 6.28, 0.01).name('Spin (rad/s)').onChange(push('portalSpiralSpinRate')),
      portalSpiralFolder.add(tAny, 'portalSpiralArmCount', 1, 8, 1).name('Arms').onChange(push('portalSpiralArmCount')),
      // Density rebuilds the buffer — keep the upper bound conservative
      // so the user can't accidentally crank to a million-point buffer.
      portalSpiralFolder.add(tAny, 'portalSpiralDensity', 10, 400, 1).name('Density / arm').onChange(push('portalSpiralDensity')),
      portalSpiralFolder.add(tAny, 'portalSpiralTurns', 0.1, 5, 0.05).name('Spiral tightness').onChange(push('portalSpiralTurns')),
      portalSpiralFolder.add(tAny, 'portalSpiralRadius', 0.5, 20, 0.1).name('Radius (m)').onChange(push('portalSpiralRadius')),
      portalSpiralFolder.addColor(tAny, 'portalSpiralCoreColor').name('Core colour').onChange(push('portalSpiralCoreColor')),
      portalSpiralFolder.addColor(tAny, 'portalSpiralTailColor').name('Tail colour').onChange(push('portalSpiralTailColor')),
      portalSpiralFolder.add(tAny, 'portalSpiralPointSize', 0.02, 1, 0.01).name('Point size (m)').onChange(push('portalSpiralPointSize')),
      // Glow above 1 drives bloom — that's where the "plasma vortex"
      // look comes from. Below 1 produces a softer painted feel.
      portalSpiralFolder.add(tAny, 'portalSpiralGlow', 0.1, 5, 0.05).name('Glow (×)').onChange(push('portalSpiralGlow')),
      portalSpiralFolder.add(tAny, 'portalSpiralTaper', 0, 1, 0.01).name('Tail taper').onChange(push('portalSpiralTaper')),
      portalSpiralFolder.add(tAny, 'portalSpiralOffsetZ', -2, 2, 0.01).name('Offset (local Z)').onChange(push('portalSpiralOffsetZ')),
    )

    // ── Quick-action: drop the portal centre on the wizard's current feet
    // position. Without this the user has to either drag the 3D gizmo
    // hundreds of metres across empty world space or manually type X/Y/Z
    // into three sliders — both are painful when iterating on tint/spin
    // settings. The little floating object hack on the position folder
    // gives `lil-gui` a callable function it can render as a button.
    const snapAction = {
      'Snap portal to character': () => {
        // Place the centre at the wizard's chest height (≈ feet + 1.2 m) so
        // the portal naturally wraps the upper torso rather than spawning
        // half-buried in the floor — much easier to see the tint effect on
        // first glance.
        const fx = wizardFeetPos.x
        const fy = wizardFeetPos.y + 1.2
        const fz = wizardFeetPos.z
        useWizardTuning.getState().setTuning({
          portalPosX: fx,
          portalPosY: fy,
          portalPosZ: fz,
        })
      },
    }
    portalControls.push(
      portalPosFolder.add(snapAction, 'Snap portal to character'),
    )
    tracked.push(...portalControls)
    // Sync slider readouts when the gizmo / store writes them externally.
    const unsubPortal = useWizardTuning.subscribe((s, prev) => {
      const keys: Array<keyof WizardTuning> = [
        'portalEnabled', 'portalShowSphere',
        'portalGizmoEnabled', 'portalGizmoMode', 'portalGizmoTarget',
        'portalPosX', 'portalPosY', 'portalPosZ',
        'portalRegionPosX', 'portalRegionPosY', 'portalRegionPosZ',
        'portalRotationDegX', 'portalRotationDegY', 'portalRotationDegZ',
        'portalScale',
        'portalRadius', 'portalStrength', 'portalWindings', 'portalSpinRate',
        'portalAxialExtent', 'portalGeometryAmount',
        'portalAxisX', 'portalAxisY', 'portalAxisZ',
        'portalTintEnabled', 'portalTintColor', 'portalTintEmission',
        'portalTintArms', 'portalTintWindings', 'portalTintContrast',
        'portalTintCoreDarkness',
        'portalSpiralEnabled', 'portalSpiralArmCount', 'portalSpiralDensity',
        'portalSpiralTurns', 'portalSpiralRadius', 'portalSpiralSpinRate',
        'portalSpiralCoreColor', 'portalSpiralTailColor',
        'portalSpiralPointSize', 'portalSpiralGlow', 'portalSpiralTaper',
        'portalSpiralOffsetZ',
        'portalRigidSpinRate',
      ]
      if (keys.some((k) => s[k] !== prev[k])) {
        for (const k of keys) tAny[k] = s[k]
        refreshPortalDisplay()
      }
    })

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
      dogOffsetFolder.add(tAny, 'dogOffsetY', -15, 6, 0.01).name('Y (up)').onChange(push('dogOffsetY')),
      dogOffsetFolder.add(tAny, 'dogOffsetZ', -5, 2, 0.01).name('Z').onChange(push('dogOffsetZ')),
    )

    // ── Spawn (image-blaster addition — variable world scale needs a tunable spawn) ─
    const spawnFolder = gui.addFolder('Spawn')
    tracked.push(
      spawnFolder.add(tAny, 'spawnFeetY', 0, 50, 0.1).name('Feet Y').onChange(push('spawnFeetY')),
    )
    // Respawn re-keys the <Physics> tree, which forces the character RigidBody to
    // re-mount at the current spawnFeetY. Use after swapping in a new world / collider
    // GLB to unstick a character spawned inside geometry.
    spawnFolder.add({
      respawn: () => useDebugStore.getState().resetObjects(),
    }, 'respawn').name('Respawn')

    // ── Splat position + rotation offset (image-blaster addition) ───────────
    // Adjusts the visible SPZ relative to the world manifest's transform.
    // For aligning a splat to a collider GLB that was authored in a different
    // reference frame. The 3D gizmo toggle mounts a draggable handle in the scene
    // — clicking handles also writes back into these sliders.
    const splatOffsetFolder = gui.addFolder('Splat position + rotation')
    const splatOffsetTracked = [
      splatOffsetFolder.add(tAny, 'splatOffsetX', -50, 50, 0.05).name('Pos X').onChange(push('splatOffsetX')),
      splatOffsetFolder.add(tAny, 'splatOffsetY', -50, 50, 0.05).name('Pos Y').onChange(push('splatOffsetY')),
      splatOffsetFolder.add(tAny, 'splatOffsetZ', -50, 50, 0.05).name('Pos Z').onChange(push('splatOffsetZ')),
      splatOffsetFolder.add(tAny, 'splatRotationDegX', -180, 180, 0.5).name('Rot X (°)').onChange(push('splatRotationDegX')),
      splatOffsetFolder.add(tAny, 'splatRotationDegY', -180, 180, 0.5).name('Rot Y (°)').onChange(push('splatRotationDegY')),
      splatOffsetFolder.add(tAny, 'splatRotationDegZ', -180, 180, 0.5).name('Rot Z (°)').onChange(push('splatRotationDegZ')),
    ]
    tracked.push(...splatOffsetTracked)
    const refreshSplatOffsetDisplay = () => splatOffsetTracked.forEach((c) => c.updateDisplay())
    // Re-sync the slider readouts when the in-scene gizmo updates the store.
    const unsubSplatTuning = useWizardTuning.subscribe((s, prev) => {
      if (
        s.splatOffsetX !== prev.splatOffsetX ||
        s.splatOffsetY !== prev.splatOffsetY ||
        s.splatOffsetZ !== prev.splatOffsetZ ||
        s.splatRotationDegX !== prev.splatRotationDegX ||
        s.splatRotationDegY !== prev.splatRotationDegY ||
        s.splatRotationDegZ !== prev.splatRotationDegZ
      ) {
        tAny.splatOffsetX = s.splatOffsetX
        tAny.splatOffsetY = s.splatOffsetY
        tAny.splatOffsetZ = s.splatOffsetZ
        tAny.splatRotationDegX = s.splatRotationDegX
        tAny.splatRotationDegY = s.splatRotationDegY
        tAny.splatRotationDegZ = s.splatRotationDegZ
        refreshSplatOffsetDisplay()
      }
    })
    tracked.push(
      splatOffsetFolder.add(tAny, 'splatGizmoEnabled').name('3D gizmo (visual)').onChange(push('splatGizmoEnabled')),
      splatOffsetFolder.add(tAny, 'splatGizmoMode', ['translate', 'rotate', 'scale']).name('Gizmo mode').onChange(push('splatGizmoMode')),
    )
    splatOffsetFolder.add({
      reset: () => {
        const zeros = {
          splatOffsetX: 0,
          splatOffsetY: 0,
          splatOffsetZ: 0,
          splatRotationDegX: 0,
          splatRotationDegY: 0,
          splatRotationDegZ: 0,
        }
        Object.assign(tAny, zeros)
        useWizardTuning.getState().setTuning(zeros)
        refreshSplatOffsetDisplay()
      },
    }, 'reset').name('Reset splat transform')

    // ── Collider position offset (image-blaster addition) ───────────────────
    // Live-translates the collider GLB via Rapier setTranslation so a misaligned
    // export from Blender can be nudged into the splat without re-exporting.
    const colliderOffsetFolder = gui.addFolder('Collider position offset')
    const refreshOffsetDisplay = () => colliderOffsetTracked.forEach((c) => c.updateDisplay())
    const colliderOffsetTracked = [
      colliderOffsetFolder.add(tAny, 'colliderOffsetX', -50, 50, 0.05).name('X').onChange(push('colliderOffsetX')),
      colliderOffsetFolder.add(tAny, 'colliderOffsetY', -50, 50, 0.05).name('Y (up)').onChange(push('colliderOffsetY')),
      colliderOffsetFolder.add(tAny, 'colliderOffsetZ', -50, 50, 0.05).name('Z').onChange(push('colliderOffsetZ')),
    ]
    tracked.push(...colliderOffsetTracked)
    colliderOffsetFolder.add({
      reset: () => {
        tAny.colliderOffsetX = 0
        tAny.colliderOffsetY = 0
        tAny.colliderOffsetZ = 0
        useWizardTuning.getState().setTuning({
          colliderOffsetX: 0,
          colliderOffsetY: 0,
          colliderOffsetZ: 0,
        })
        refreshOffsetDisplay()
      },
    }, 'reset').name('Reset to 0,0,0')

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
      unsubSplatTuning()
      unsubSplatPerfTuning()
      unsubSparkle()
      unsubPortal()
      gui.destroy()
      guiRef.current = null
      // Suppress unused-tracked warning; refs kept to allow future updateDisplay() reset.
      void tracked
      void DEFAULT_WIZARD_TUNING
    }
  }, [])

  return null
}
