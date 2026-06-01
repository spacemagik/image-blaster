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
  SPLAT_PERF_PRESETS,
  useWizardTuning,
  type ShadowMapType,
  type SplatPerfPreset,
  type WizardTuning,
} from './wizardTuning'
import { SPARKLE_PRESETS, type SparklePreset } from '../splat/sparkle'
import { useDebugStore, TONE_MAPPING_MODE_NAMES, type ToneMappingModeName } from '../../store/debug'
import { wizardFeetPos } from './wizardState'
import {
  CREATURE_CONFIGS,
  type CreatureTransform,
} from '../creatures/creatureConfigs'

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
    // Wired through `useDebugStore` (not `useWizardTuning`) — that's
    // the store the PostProcessing component actually reads. The old
    // `ppEnabled / ppBloomThreshold / ppBloomSmoothing / ppBrightness
    // / ppContrast / ppVignetteDarkness / ppVignetteOffset` fields on
    // wizardTuning are orphaned (never had a consumer); kept in the
    // store for backwards compatibility but no GUI surface points at
    // them anymore.
    //
    // Pattern: a `ppProxy` object snapshots the current effect store
    // values, lil-gui binds to it, and each onChange handler calls
    // the corresponding `useDebugStore` setter. A subscription at
    // the bottom keeps ppProxy values in sync when other code (e.g.
    // a preset, the Debug Panel) writes to the store, and refreshes
    // the lil-gui display so the visible slider matches.
    const ppFolder = gui.addFolder('Post-processing')
    const ppState0 = useDebugStore.getState()
    const ppProxy = {
      bloomEnabled: ppState0.bloomEnabled,
      bloomIntensity: ppState0.bloomIntensity,
      bloomThreshold: ppState0.bloomThreshold,
      bloomSmoothing: ppState0.bloomSmoothing,
      brightnessContrastEnabled: ppState0.brightnessContrastEnabled,
      brightness: ppState0.brightness,
      contrast: ppState0.contrast,
      vignetteEnabled: ppState0.vignetteEnabled,
      vignetteDarkness: ppState0.vignetteDarkness,
      vignetteOffset: ppState0.vignetteOffset,
      toneMappingEnabled: ppState0.toneMappingEnabled,
      toneMappingMode: ppState0.toneMappingMode,
      exposure: ppState0.exposure,
      dofPostEnabled: ppState0.dofPostEnabled,
      dofPostFocusDistance: ppState0.dofPostFocusDistance,
      dofPostFocalLength: ppState0.dofPostFocalLength,
      dofPostBokehScale: ppState0.dofPostBokehScale,
      colorGradeEnabled: ppState0.colorGradeEnabled,
      hue: ppState0.hue,
      saturation: ppState0.saturation,
      chromaticEnabled: ppState0.chromaticEnabled,
      chromaticOffset: ppState0.chromaticOffset,
      motionBlurEnabled: ppState0.motionBlurEnabled,
      motionBlurStrength: ppState0.motionBlurStrength,
    }
    // Generic pusher: maps a proxy key to the matching setter
    // (`bloomEnabled` → `setBloomEnabled`). Hand-typed for safety —
    // a runtime symbol-stringify would lose TS coverage.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ppPush = (setterName: string) => (value: any) => {
      const setter = (useDebugStore.getState() as unknown as Record<string, (v: unknown) => void>)[setterName]
      if (typeof setter === 'function') setter(value)
    }

    const ppBloomFolder = ppFolder.addFolder('Bloom (glow on bright pixels)')
    // Single proxy for the splat-HDR-boost slider — lives in
    // `wizardTuning` (not `useDebugStore`) because it's logically a
    // splat-renderer feature, but is exposed in the Bloom panel so
    // the user discovers it together with the bloom knobs it feeds.
    const splatBoostProxy = { splatBrightness: tAny.splatBrightness ?? 1.5 }
    const ppBloomControls = [
      ppBloomFolder.add(ppProxy, 'bloomEnabled').name('Enabled').onChange(ppPush('setBloomEnabled')),
      // 0..3 covers "subtle rim glow" → "extreme plasma halo". With
      // splat brightness ≥1.2 (default), 1-1.5 reads as obvious;
      // crank to 2+ for dramatic glow on light splat pixels.
      ppBloomFolder.add(ppProxy, 'bloomIntensity', 0, 3, 0.01).name('Intensity').onChange(ppPush('setBloomIntensity')),
      ppBloomFolder.add(ppProxy, 'bloomThreshold', 0, 1, 0.01).name('Threshold').onChange(ppPush('setBloomThreshold')),
      ppBloomFolder.add(ppProxy, 'bloomSmoothing', 0, 1, 0.01).name('Smoothing').onChange(ppPush('setBloomSmoothing')),
      // Splat HDR boost — a multiplier applied to every world-splat
      // RGB pixel by a Spark worldModifier (splatGain.ts). This is
      // the *enabler* for "bloom catches bright SPZ pixels": SPZ
      // colours are stored in LDR [0,1], so without a boost their
      // brightest pixels sit RIGHT AT the bloom threshold and only
      // the rare hottest spots qualify. At 1.5 the brightest splats
      // hit ~1.5 linear (clearly HDR), so the threshold catches
      // them cleanly; dark splats scale proportionally and stay
      // below threshold. 1.0 = no boost; 3.0 = aggressive HDR.
      ppBloomFolder.add(splatBoostProxy, 'splatBrightness', 1, 3, 0.01)
        .name('Splat HDR boost')
        .onChange((v: number) => {
          useWizardTuning.getState().setTuning({ splatBrightness: v })
        }),
    ]
    // Keep the proxy in sync if the store is written externally
    // (e.g. a reset or another preset toggling it). Mirrors the
    // pattern used by the ppProxy subscribe below.
    const unsubSplatBoost = useWizardTuning.subscribe((s, prev) => {
      if (s.splatBrightness !== prev.splatBrightness) {
        splatBoostProxy.splatBrightness = s.splatBrightness
        for (const c of ppBloomControls) c.updateDisplay()
      }
    })

    const ppBCFolder = ppFolder.addFolder('Brightness / Contrast')
    const ppBCControls = [
      ppBCFolder.add(ppProxy, 'brightnessContrastEnabled').name('Enabled').onChange(ppPush('setBrightnessContrastEnabled')),
      ppBCFolder.add(ppProxy, 'brightness', -1, 1, 0.01).name('Brightness').onChange(ppPush('setBrightness')),
      ppBCFolder.add(ppProxy, 'contrast', -1, 1, 0.01).name('Contrast').onChange(ppPush('setContrast')),
    ]

    const ppVignetteFolder = ppFolder.addFolder('Vignette (dark corners)')
    const ppVignetteControls = [
      ppVignetteFolder.add(ppProxy, 'vignetteEnabled').name('Enabled').onChange(ppPush('setVignetteEnabled')),
      ppVignetteFolder.add(ppProxy, 'vignetteDarkness', 0, 1, 0.01).name('Darkness').onChange(ppPush('setVignetteDarkness')),
      ppVignetteFolder.add(ppProxy, 'vignetteOffset', 0, 1, 0.01).name('Offset').onChange(ppPush('setVignetteOffset')),
    ]

    const ppToneFolder = ppFolder.addFolder('Tone mapping')
    const ppToneControls = [
      ppToneFolder.add(ppProxy, 'toneMappingEnabled').name('Enabled').onChange(ppPush('setToneMappingEnabled')),
      // Curve dropdown — selecting a different mode rebuilds the
      // shader in PostProcessing (the curve is baked at construction
      // time per the lib's design).
      ppToneFolder.add(ppProxy, 'toneMappingMode', TONE_MAPPING_MODE_NAMES as readonly ToneMappingModeName[]).name('Curve').onChange(ppPush('setToneMappingMode')),
      // Exposure is applied as a pre-curve multiply via
      // renderer.toneMappingExposure. 0 = pitch black; 1 = neutral.
      ppToneFolder.add(ppProxy, 'exposure', 0, 3, 0.01).name('Exposure (×)').onChange(ppPush('setExposure')),
    ]

    const ppDofFolder = ppFolder.addFolder('Depth of field (post)')
    const ppDofControls = [
      ppDofFolder.add(ppProxy, 'dofPostEnabled').name('Enabled').onChange(ppPush('setDofPostEnabled')),
      // 0..1 normalised along near→far frustum. 0.02 ≈ subject ~ 5m
      // away on a typical 50° FOV camera.
      ppDofFolder.add(ppProxy, 'dofPostFocusDistance', 0, 1, 0.001).name('Focus distance').onChange(ppPush('setDofPostFocusDistance')),
      ppDofFolder.add(ppProxy, 'dofPostFocalLength', 0, 1, 0.001).name('Focal length').onChange(ppPush('setDofPostFocalLength')),
      // 0 = sharp everywhere, 10 = extreme bokeh. Increase
      // gradually; high values are expensive (per-pixel disk
      // gather).
      ppDofFolder.add(ppProxy, 'dofPostBokehScale', 0, 10, 0.05).name('Bokeh scale').onChange(ppPush('setDofPostBokehScale')),
    ]

    const ppColorFolder = ppFolder.addFolder('Colour grade')
    const ppColorControls = [
      ppColorFolder.add(ppProxy, 'colorGradeEnabled').name('Enabled').onChange(ppPush('setColorGradeEnabled')),
      // Hue rotation in radians. -π..+π = full wheel rotation.
      ppColorFolder.add(ppProxy, 'hue', -Math.PI, Math.PI, 0.01).name('Hue (rad)').onChange(ppPush('setHue')),
      // -1 = greyscale, 0 = neutral, +1 = saturation doubled.
      ppColorFolder.add(ppProxy, 'saturation', -1, 1, 0.01).name('Saturation').onChange(ppPush('setSaturation')),
    ]

    const ppChromaFolder = ppFolder.addFolder('Chromatic aberration')
    const ppChromaControls = [
      ppChromaFolder.add(ppProxy, 'chromaticEnabled').name('Enabled').onChange(ppPush('setChromaticEnabled')),
      ppChromaFolder.add(ppProxy, 'chromaticOffset', 0, 0.01, 0.0001).name('Offset (px-equiv)').onChange(ppPush('setChromaticOffset')),
    ]

    const ppMotionFolder = ppFolder.addFolder('Motion blur')
    const ppMotionControls = [
      ppMotionFolder.add(ppProxy, 'motionBlurEnabled').name('Enabled').onChange(ppPush('setMotionBlurEnabled')),
      ppMotionFolder.add(ppProxy, 'motionBlurStrength', 0, 2, 0.01).name('Strength').onChange(ppPush('setMotionBlurStrength')),
    ]

    const ppAllControls = [
      ...ppBloomControls,
      ...ppBCControls,
      ...ppVignetteControls,
      ...ppToneControls,
      ...ppDofControls,
      ...ppColorControls,
      ...ppChromaControls,
      ...ppMotionControls,
    ]
    tracked.push(...ppAllControls)

    // Sync proxy + slider display when the underlying store changes
    // (e.g. another component flips bloomEnabled, or a hot-reload
    // re-runs the migration). Without this the GUI's displayed
    // values drift away from reality after external writes.
    const unsubPP = useDebugStore.subscribe((s) => {
      // Track every proxy key. Adding more is "add to ppProxy +
      // copy-line here" — easy to keep in sync.
      ppProxy.bloomEnabled = s.bloomEnabled
      ppProxy.bloomIntensity = s.bloomIntensity
      ppProxy.bloomThreshold = s.bloomThreshold
      ppProxy.bloomSmoothing = s.bloomSmoothing
      ppProxy.brightnessContrastEnabled = s.brightnessContrastEnabled
      ppProxy.brightness = s.brightness
      ppProxy.contrast = s.contrast
      ppProxy.vignetteEnabled = s.vignetteEnabled
      ppProxy.vignetteDarkness = s.vignetteDarkness
      ppProxy.vignetteOffset = s.vignetteOffset
      ppProxy.toneMappingEnabled = s.toneMappingEnabled
      ppProxy.toneMappingMode = s.toneMappingMode
      ppProxy.exposure = s.exposure
      ppProxy.dofPostEnabled = s.dofPostEnabled
      ppProxy.dofPostFocusDistance = s.dofPostFocusDistance
      ppProxy.dofPostFocalLength = s.dofPostFocalLength
      ppProxy.dofPostBokehScale = s.dofPostBokehScale
      ppProxy.colorGradeEnabled = s.colorGradeEnabled
      ppProxy.hue = s.hue
      ppProxy.saturation = s.saturation
      ppProxy.chromaticEnabled = s.chromaticEnabled
      ppProxy.chromaticOffset = s.chromaticOffset
      ppProxy.motionBlurEnabled = s.motionBlurEnabled
      ppProxy.motionBlurStrength = s.motionBlurStrength
      for (const c of ppAllControls) c.updateDisplay()
    })

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
    // Stripped down to a single user-facing toggle: "Enable rotation".
    // Internally the cosmic SPZ has FOUR overlapping motion systems
    // (dyno world-modifier twist, dyno tint pass, procedural spiral
    // overlay, rigid group-spin). Exposing them all in the GUI made it
    // easy to land in a state where one of them was off / mis-tuned and
    // looked broken — so the panel now hides everything except the one
    // that worked reliably: rigid group-spin. The toggle drives
    // `portalRigidSpinRate` (0 ↔ FIXED_SPIN_RATE rad/s); every other
    // dyno/spiral/tint field is permanently held at neutral by the v51
    // migration (see wizardTuning.ts) so they cannot interfere with
    // each other.
    //
    // Placement controls (position, rotation, scale, gizmo) stay
    // because the SPZ still needs to be placeable — that's separate
    // from "should the swirl effect run".
    const FIXED_SPIN_RATE = 0.5 // rad/s, ~1 revolution every 12.6 s
    const portalFolder = gui.addFolder('Cosmic swirl')
    const portalControls: Array<{ updateDisplay: () => void }> = []
    const refreshPortalDisplay = () => portalControls.forEach((c) => c.updateDisplay())

    // Master toggle: backed by a derived boolean (rate > 0). lil-gui
    // wants a property to bind to, so we keep a proxy object whose
    // `enabled` field is recomputed from the store on every external
    // change (see the subscribe loop below).
    const swirlProxy = { enabled: tAny.portalRigidSpinRate > 0 }
    portalControls.push(
      portalFolder.add(swirlProxy, 'enabled').name('Enable rotation').onChange((v: boolean) => {
        useWizardTuning.getState().setTuning({
          portalRigidSpinRate: v ? FIXED_SPIN_RATE : 0,
        })
      }),
      portalFolder.add(tAny, 'portalGizmoEnabled').name('3D gizmo').onChange(push('portalGizmoEnabled')),
      portalFolder.add(tAny, 'portalGizmoMode', ['translate', 'rotate', 'scale'])
        .name('Gizmo mode').onChange(push('portalGizmoMode')),
    )

    const portalPosFolder = portalFolder.addFolder('Position (world)')
    portalControls.push(
      portalPosFolder.add(tAny, 'portalPosX', -200, 200, 0.1).name('X').onChange(push('portalPosX')),
      portalPosFolder.add(tAny, 'portalPosY', -50, 100, 0.1).name('Y').onChange(push('portalPosY')),
      portalPosFolder.add(tAny, 'portalPosZ', -200, 200, 0.1).name('Z').onChange(push('portalPosZ')),
    )
    const portalRotFolder = portalFolder.addFolder('Rotation (deg)')
    portalControls.push(
      portalRotFolder.add(tAny, 'portalRotationDegX', -360, 360, 0.5).name('X').onChange(push('portalRotationDegX')),
      portalRotFolder.add(tAny, 'portalRotationDegY', -360, 360, 0.5).name('Y').onChange(push('portalRotationDegY')),
      portalRotFolder.add(tAny, 'portalRotationDegZ', -360, 360, 0.5).name('Z').onChange(push('portalRotationDegZ')),
    )
    const portalScaleFolder = portalFolder.addFolder('Scale')
    portalControls.push(
      portalScaleFolder.add(tAny, 'portalScale', 0.05, 20, 0.05).name('Uniform').onChange(push('portalScale')),
    )

    // Snap-to-character: same UX as before but moved up to the top
    // level since there's no longer a competing "Region position"
    // folder to disambiguate from.
    const snapAction = {
      'Snap to character': () => {
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
    portalControls.push(portalFolder.add(snapAction, 'Snap to character'))
    tracked.push(...portalControls)

    // Mirror external store writes (gizmo drags, snap button) back
    // into the slider/checkbox readouts. Watch list is now just the
    // small set we actually surface in the GUI.
    const unsubPortal = useWizardTuning.subscribe((s, prev) => {
      const keys: Array<keyof WizardTuning> = [
        'portalGizmoEnabled', 'portalGizmoMode',
        'portalPosX', 'portalPosY', 'portalPosZ',
        'portalRotationDegX', 'portalRotationDegY', 'portalRotationDegZ',
        'portalScale',
        'portalRigidSpinRate',
      ]
      if (keys.some((k) => s[k] !== prev[k])) {
        for (const k of keys) tAny[k] = s[k]
        swirlProxy.enabled = s.portalRigidSpinRate > 0
        refreshPortalDisplay()
      }
    })

    // ── Creatures ────────────────────────────────────────────────────────────
    // One subfolder per entry in CREATURE_CONFIGS. Each subfolder binds to a
    // per-slug snapshot of the creature's transform (lil-gui mutates the
    // snapshot in place; onChange pushes back into the store via
    // `setCreatureTransform`). A subscribe loop mirrors store edits (e.g.
    // gizmo drags, Snap-to-character) back into the snapshot so the slider
    // readouts stay accurate.
    const creaturesFolder = gui.addFolder('Creatures')
    // No bulk "hide/show all" buttons — they were panic switches from
    // when the GLBs (esp. the 70 MB verdant-sentinel) were causing
    // frame drops, but CreatureModel now downscales textures and
    // strips expensive PBR features at load (see
    // `optimizeCreatureGltf` in CreaturesScene.tsx) so the full set
    // can stay visible while the swirl + bloom keep working. Per-
    // creature Visible toggles below cover the rare case where the
    // user wants to hide one for staging.
    // Per-slug lookup so the subscribe can fan out to the right snapshot
    // + control set without scanning the whole tree.
    const creatureSnapshots: Record<string, CreatureTransform> = {}
    const creatureControls: Record<string, Array<{ updateDisplay: () => void }>> = {}
    for (const config of CREATURE_CONFIGS) {
      const initial = useWizardTuning.getState().creatures[config.slug]
        ?? config.defaultTransform
      // Shallow snapshot: lil-gui will read/write fields on THIS object.
      // We re-sync it below in the store subscription.
      const snap: CreatureTransform = { ...initial }
      creatureSnapshots[config.slug] = snap
      const ctrls: Array<{ updateDisplay: () => void }> = []
      creatureControls[config.slug] = ctrls

      const subFolder = creaturesFolder.addFolder(config.name)
      // Generic helper: push a single field on this creature's slug into
      // the store. Typed against `CreatureTransform[K]` so a typo in the
      // key would surface at compile time.
      const pushKey = <K extends keyof CreatureTransform>(key: K) =>
        (value: CreatureTransform[K]) =>
          useWizardTuning.getState().setCreatureTransform(config.slug, { [key]: value } as Partial<CreatureTransform>)

      ctrls.push(
        subFolder.add(snap, 'enabled').name('Visible').onChange(pushKey('enabled')),
        subFolder.add(snap, 'gizmoEnabled').name('3D gizmo').onChange(pushKey('gizmoEnabled')),
        subFolder.add(snap, 'gizmoMode', ['translate', 'rotate', 'scale'])
          .name('Gizmo mode').onChange(pushKey('gizmoMode')),
      )

      const posFolder = subFolder.addFolder('Position (world)')
      ctrls.push(
        posFolder.add(snap, 'posX', -200, 200, 0.05).name('X').onChange(pushKey('posX')),
        posFolder.add(snap, 'posY', -50, 100, 0.05).name('Y').onChange(pushKey('posY')),
        posFolder.add(snap, 'posZ', -200, 200, 0.05).name('Z').onChange(pushKey('posZ')),
      )

      const rotFolder = subFolder.addFolder('Rotation (deg)')
      ctrls.push(
        rotFolder.add(snap, 'rotX', -180, 180, 0.5).name('X').onChange(pushKey('rotX')),
        rotFolder.add(snap, 'rotY', -180, 180, 0.5).name('Y').onChange(pushKey('rotY')),
        rotFolder.add(snap, 'rotZ', -180, 180, 0.5).name('Z').onChange(pushKey('rotZ')),
      )

      ctrls.push(
        // Wide scale range (0.01–500) because the source GLBs vary enormously
        // — some authored at metres (~1 scale), others at sub-metre or
        // hundreds-of-metres depending on the export software. The slider
        // accepts manual entry too if the user needs to go beyond 500.
        subFolder.add(snap, 'scale', 0.01, 500, 0.1).name('Scale').onChange(pushKey('scale')),
      )

      // Snap-to-character: drop the creature at the wizard's feet (matches
      // the portal's snap button — convenient when iterating on a creature
      // that's spawned far from where the character is currently standing).
      subFolder.add({
        snap: () => {
          const f = wizardFeetPos
          useWizardTuning.getState().setCreatureTransform(config.slug, {
            posX: f.x,
            posY: f.y,
            posZ: f.z,
          })
        },
      }, 'snap').name('Snap to character')

      tracked.push(...ctrls)
    }

    // Mirror store edits (gizmo drags, Snap button, manual `setCreatureTransform`
    // calls from outside the GUI) back into each subfolder's snapshot + slider
    // readouts. Without this, dragging the in-canvas gizmo would silently
    // update the persisted state while the sliders kept showing the pre-drag
    // values until the next page refresh.
    const refreshCreatureDisplays = () => {
      for (const config of CREATURE_CONFIGS) {
        for (const ctrl of creatureControls[config.slug]) ctrl.updateDisplay()
      }
    }
    const unsubCreatures = useWizardTuning.subscribe((s, prev) => {
      if (s.creatures === prev.creatures) return
      let dirty = false
      for (const config of CREATURE_CONFIGS) {
        const cur = s.creatures[config.slug]
        const old = prev.creatures[config.slug]
        if (cur === old) continue
        const snap = creatureSnapshots[config.slug]
        if (!cur || !snap) continue
        // Mutate the existing snapshot object (don't replace it) — lil-gui
        // holds onto the same reference for its controllers, so swapping
        // it out would break the binding silently.
        Object.assign(snap, cur)
        dirty = true
      }
      if (dirty) refreshCreatureDisplays()
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
      unsubCreatures()
      unsubPP()
      unsubSplatBoost()
      gui.destroy()
      guiRef.current = null
      // Suppress unused-tracked warning; refs kept to allow future updateDisplay() reset.
      void tracked
      void DEFAULT_WIZARD_TUNING
    }
  }, [])

  return null
}
