import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ObjectRenderMode, ViewerQuality, WorldRenderMode } from '../types/world'

export type ControllerMode = 'fly' | 'fps' | 'wizard'

/** Tone-mapping modes exposed in the GUI. The values are the string
 *  representations of `ToneMappingMode` enum members from the
 *  `postprocessing` library — kept as strings so the persisted state
 *  stays human-readable + stable across lib upgrades. The mapping
 *  back to the enum lives in PostProcessing.tsx so we don't import
 *  the lib at store creation time. */
export type ToneMappingModeName =
  | 'LINEAR'
  | 'REINHARD'
  | 'REINHARD2'
  | 'REINHARD2_ADAPTIVE'
  | 'UNCHARTED2'
  | 'OPTIMIZED_CINEON'
  | 'ACES_FILMIC'
  | 'AGX'
  | 'NEUTRAL'
export const TONE_MAPPING_MODE_NAMES: ToneMappingModeName[] = [
  'LINEAR',
  'REINHARD',
  'REINHARD2',
  'REINHARD2_ADAPTIVE',
  'UNCHARTED2',
  'OPTIMIZED_CINEON',
  'ACES_FILMIC',
  'AGX',
  'NEUTRAL',
]

function defaultViewerQuality() {
  if (typeof window === 'undefined') return ViewerQuality.High
  const mobileQuery = '(hover: none), (pointer: coarse), (max-width: 767px)'
  return window.matchMedia(mobileQuery).matches ? ViewerQuality.Low : ViewerQuality.High
}

interface DebugStore {
  viewerQuality: ViewerQuality
  setViewerQuality: (v: ViewerQuality) => void
  worldRenderMode: WorldRenderMode
  setWorldRenderMode: (v: WorldRenderMode) => void
  objectRenderMode: ObjectRenderMode
  setObjectRenderMode: (v: ObjectRenderMode) => void
  objectResetToken: number
  controllerResetToken: number
  resetObjects: () => void
  showOrigin: boolean
  setShowOrigin: (v: boolean) => void
  butterfliesEnabled: boolean
  setButterfliesEnabled: (v: boolean) => void
  controllerMode: ControllerMode
  setControllerMode: (v: ControllerMode) => void
  flyMouseSensitivity: number
  setFlyMouseSensitivity: (v: number) => void
  // Splat depth-of-field (Spark 2.0 built-in DoF + circle-bokeh via flat falloff)
  dofEnabled: boolean
  setDofEnabled: (v: boolean) => void
  focalDistance: number
  setFocalDistance: (v: number) => void
  apertureAngle: number
  setApertureAngle: (v: number) => void
  falloff: number
  setFalloff: (v: number) => void
  // Custom DoF curve: 0 within sharpRange of focal plane, exp growth beyond.
  sharpRange: number
  setSharpRange: (v: number) => void
  falloffRate: number
  setFalloffRate: (v: number) => void
  // ── Post-processing ──────────────────────────────────────────────────
  // Bloom: soft glow on bright pixels. The cyan tint pass writes
  // emission > 1 specifically so bloom can pick it up — driving the
  // "plasma vortex" look without a dedicated post effect.
  bloomEnabled: boolean
  setBloomEnabled: (v: boolean) => void
  /** 0..3. Multiplier on the additive bloom contribution. Higher =
   *  more pronounced glow halo. */
  bloomIntensity: number
  setBloomIntensity: (v: number) => void
  /** 0..1 in HDR-tonemapped luminance. Pixels brighter than this
   *  contribute to the bloom mask. */
  bloomThreshold: number
  setBloomThreshold: (v: number) => void
  /** 0..1. Hysteresis on the threshold — softens the edge between
   *  "in bloom" and "out", reducing flicker on shimmery surfaces. */
  bloomSmoothing: number
  setBloomSmoothing: (v: number) => void
  // Brightness / Contrast: simple post adjustments. Applied AFTER
  // tone mapping so the values read as percent-style intensity
  // ('this scene looks too dark' → +0.1 etc.).
  brightnessContrastEnabled: boolean
  setBrightnessContrastEnabled: (v: boolean) => void
  /** -1..1. Additive brightness offset. */
  brightness: number
  setBrightness: (v: number) => void
  /** -1..1. Contrast scale; 0 is neutral, +1 doubles deviation from
   *  middle grey, -1 flattens the image. */
  contrast: number
  setContrast: (v: number) => void
  // Vignette: darken / brighten the screen corners. Reads as
  // cinematic framing on the cosmic SPZ shots.
  vignetteEnabled: boolean
  setVignetteEnabled: (v: boolean) => void
  /** 0..1. How dark the corners get at the worst point. */
  vignetteDarkness: number
  setVignetteDarkness: (v: number) => void
  /** 0..1. Where the falloff starts (0 = vignette covers the whole
   *  frame, 1 = only corners darken). */
  vignetteOffset: number
  setVignetteOffset: (v: number) => void
  // Tone mapping: maps HDR scene radiance to display-referred LDR.
  // Each mode has a different shoulder/toe shape — ACES_FILMIC is the
  // classic "cinematic" look; LINEAR is no-op; NEUTRAL preserves
  // colour accuracy at the cost of perceived contrast.
  toneMappingEnabled: boolean
  setToneMappingEnabled: (v: boolean) => void
  toneMappingMode: ToneMappingModeName
  setToneMappingMode: (v: ToneMappingModeName) => void
  /** 0..3. Exposure multiplier applied before the tone-mapping
   *  curve. >1 brightens the whole scene; <1 darkens. */
  exposure: number
  setExposure: (v: number) => void
  // Depth of field (POST — separate from the splat-DoF above, which
  // is a Spark built-in that fades splats by axial distance). This
  // is the standard screen-space bokeh blur applied to the full
  // composited frame.
  dofPostEnabled: boolean
  setDofPostEnabled: (v: boolean) => void
  /** 0..1, normalised distance along the near→far frustum. */
  dofPostFocusDistance: number
  setDofPostFocusDistance: (v: number) => void
  /** 0..1, fractional focal length (sharpness of the focal plane). */
  dofPostFocalLength: number
  setDofPostFocalLength: (v: number) => void
  /** 0..10, bokeh circle scale. Larger = more dramatic blur. */
  dofPostBokehScale: number
  setDofPostBokehScale: (v: number) => void
  // Color grading: hue rotation + saturation boost. Effectively a
  // mini "Instagram filter" wheel. For more advanced grading the
  // LUTEffect can be added later, but hue/sat covers 90% of the
  // "make the cosmic SPZ more saturated" requests.
  colorGradeEnabled: boolean
  setColorGradeEnabled: (v: boolean) => void
  /** -π..π. Hue rotation in radians. */
  hue: number
  setHue: (v: number) => void
  /** -1..1. Saturation adjustment (0 = neutral, +1 = double, -1 =
   *  greyscale). */
  saturation: number
  setSaturation: (v: number) => void
  // Existing chromatic + motion-blur effects (kept).
  chromaticEnabled: boolean
  setChromaticEnabled: (v: boolean) => void
  chromaticOffset: number
  setChromaticOffset: (v: number) => void
  motionBlurEnabled: boolean
  setMotionBlurEnabled: (v: boolean) => void
  motionBlurStrength: number
  setMotionBlurStrength: (v: number) => void
  // Lighting
  environmentIntensity: number
  setEnvironmentIntensity: (v: number) => void
  sunIntensity: number
  setSunIntensity: (v: number) => void
  sunColor: string
  setSunColor: (v: string) => void
  levaCollapsed: boolean
  setLevaCollapsed: (v: boolean) => void
  /** Hides all overlay UI (sidebar, lil-gui, BottomLeftControls, etc.) so
   *  the canvas reads as a clean game view. Backtick (`) toggles it. */
  playMode: boolean
  setPlayMode: (v: boolean) => void
  togglePlayMode: () => void
}

/** Fields in `useDebugStore` that are remembered PER WORLD by the
 *  wizardTuning store. The tuning store maintains a parallel
 *  `worldDebugOverrides[slug]` snapshot for each of these; on every
 *  edit through the WizardGui PP folder we write to BOTH the live
 *  debug store (so PostProcessing.tsx sees the change immediately)
 *  AND the tuning store's snapshot (so the value survives a world
 *  swap). On slug change, `applyDebugOverrides` below replays the
 *  saved snapshot back into the debug store.
 *
 *  Why mirror two stores instead of moving these fields into
 *  wizardTuning?
 *    PostProcessing.tsx already reads from useDebugStore via 20+
 *    selectors and a long subscribe pipeline (it sizes shader
 *    uniforms, swaps EffectComposer passes, etc.). Migrating that
 *    component to a different store risks breaking the entire
 *    post-processing chain — and the user is mid-iteration and
 *    can't afford a regression. The mirror approach is one extra
 *    cheap call per slider edit and one extra setState batch on
 *    slug change. */
export const PER_WORLD_DEBUG_KEYS = [
  'bloomEnabled',
  'bloomIntensity',
  'bloomThreshold',
  'bloomSmoothing',
  'brightnessContrastEnabled',
  'brightness',
  'contrast',
  'vignetteEnabled',
  'vignetteDarkness',
  'vignetteOffset',
  'toneMappingEnabled',
  'toneMappingMode',
  'exposure',
  'dofPostEnabled',
  'dofPostFocusDistance',
  'dofPostFocalLength',
  'dofPostBokehScale',
  'colorGradeEnabled',
  'hue',
  'saturation',
  'chromaticEnabled',
  'chromaticOffset',
  'motionBlurEnabled',
  'motionBlurStrength',
] as const satisfies readonly (keyof DebugStore)[]

export type PerWorldDebugKey = (typeof PER_WORLD_DEBUG_KEYS)[number]

/** Setter-name lookup so `applyDebugOverrides` can call the right
 *  store action for each field. Hand-typed (rather than synthesised
 *  from the key name with `set${capitalised}`) for TypeScript safety:
 *  a typo in either the key or the setter name surfaces here at
 *  build time, not at runtime when the user moves a slider. */
export const PER_WORLD_DEBUG_SETTERS: Record<PerWorldDebugKey, keyof DebugStore> = {
  bloomEnabled: 'setBloomEnabled',
  bloomIntensity: 'setBloomIntensity',
  bloomThreshold: 'setBloomThreshold',
  bloomSmoothing: 'setBloomSmoothing',
  brightnessContrastEnabled: 'setBrightnessContrastEnabled',
  brightness: 'setBrightness',
  contrast: 'setContrast',
  vignetteEnabled: 'setVignetteEnabled',
  vignetteDarkness: 'setVignetteDarkness',
  vignetteOffset: 'setVignetteOffset',
  toneMappingEnabled: 'setToneMappingEnabled',
  toneMappingMode: 'setToneMappingMode',
  exposure: 'setExposure',
  dofPostEnabled: 'setDofPostEnabled',
  dofPostFocusDistance: 'setDofPostFocusDistance',
  dofPostFocalLength: 'setDofPostFocalLength',
  dofPostBokehScale: 'setDofPostBokehScale',
  colorGradeEnabled: 'setColorGradeEnabled',
  hue: 'setHue',
  saturation: 'setSaturation',
  chromaticEnabled: 'setChromaticEnabled',
  chromaticOffset: 'setChromaticOffset',
  motionBlurEnabled: 'setMotionBlurEnabled',
  motionBlurStrength: 'setMotionBlurStrength',
}

/** Shipped defaults for every PP knob, used as the fall-back when a
 *  world has NO saved override for that key. Kept in sync with the
 *  store's initial values (a sanity-check test in debug.test.ts
 *  would be a good follow-up). */
export const DEFAULT_PER_WORLD_DEBUG_VALUES: Record<PerWorldDebugKey, unknown> = {
  bloomEnabled: true,
  bloomIntensity: 0.8,
  bloomThreshold: 0.85,
  bloomSmoothing: 0.9,
  brightnessContrastEnabled: false,
  brightness: 0,
  contrast: 0,
  vignetteEnabled: false,
  vignetteDarkness: 0.5,
  vignetteOffset: 0.5,
  toneMappingEnabled: true,
  toneMappingMode: 'ACES_FILMIC' as ToneMappingModeName,
  exposure: 1,
  dofPostEnabled: false,
  dofPostFocusDistance: 0.02,
  dofPostFocalLength: 0.05,
  dofPostBokehScale: 2.0,
  colorGradeEnabled: false,
  hue: 0,
  saturation: 0,
  chromaticEnabled: false,
  chromaticOffset: 0.0008,
  motionBlurEnabled: false,
  motionBlurStrength: 0.3,
}

/** Replay a per-world snapshot back into `useDebugStore`. Missing
 *  keys fall back to `DEFAULT_PER_WORLD_DEBUG_VALUES` so a world
 *  without overrides reverts to the shipped baseline (otherwise
 *  the PREVIOUS world's tuning would leak into the new one).
 *
 *  Calls each setter individually rather than batch-setting because
 *  the store's setters are individual `set({ key })` calls — there
 *  isn't a multi-field setter, and batching wouldn't change anything
 *  visible (react-three-fiber renders on requestAnimationFrame
 *  regardless of how many setState calls fired in this tick). */
export function applyDebugOverrides(
  overrides: Partial<Record<PerWorldDebugKey, unknown>>,
): void {
  const state = useDebugStore.getState()
  for (const key of PER_WORLD_DEBUG_KEYS) {
    const value = key in overrides
      ? overrides[key]
      : DEFAULT_PER_WORLD_DEBUG_VALUES[key]
    const setterName = PER_WORLD_DEBUG_SETTERS[key]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setter = (state as any)[setterName]
    if (typeof setter === 'function') setter(value)
  }
}

/** Snapshot the CURRENT debug-store values for every per-world key.
 *  Used by App.tsx on first mount (before any user edits) to seed
 *  the active world's overrides with what the user is already
 *  looking at — otherwise switching to the OTHER world would
 *  silently reset the PP they'd carefully tuned. */
export function snapshotCurrentDebugOverrides(): Record<PerWorldDebugKey, unknown> {
  const state = useDebugStore.getState()
  const snap = {} as Record<PerWorldDebugKey, unknown>
  for (const key of PER_WORLD_DEBUG_KEYS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snap[key] = (state as any)[key]
  }
  return snap
}

export const useDebugStore = create<DebugStore>()(
  persist(
    (set) => ({
      viewerQuality: defaultViewerQuality(),
      setViewerQuality: (viewerQuality) => set({ viewerQuality }),
      worldRenderMode: WorldRenderMode.Combined,
      setWorldRenderMode: (worldRenderMode) => set({ worldRenderMode }),
      objectRenderMode: ObjectRenderMode.Lit,
      setObjectRenderMode: (objectRenderMode) => set({ objectRenderMode }),
      objectResetToken: 0,
      controllerResetToken: 0,
      resetObjects: () => set((s) => ({
        objectResetToken: s.objectResetToken + 1,
        controllerResetToken: s.controllerResetToken + 1,
      })),
      showOrigin: false,
      setShowOrigin: (showOrigin) => set({ showOrigin }),
      butterfliesEnabled: false,
      setButterfliesEnabled: (butterfliesEnabled) => set({ butterfliesEnabled }),
      controllerMode: 'wizard' as ControllerMode,
      setControllerMode: (controllerMode) => set({ controllerMode }),
      flyMouseSensitivity: 0.003,
      setFlyMouseSensitivity: (flyMouseSensitivity) => set({ flyMouseSensitivity }),
      // v21: was true. This is the SPLAT-RENDERER depth of field (a
      // per-splat shader cost that runs on every one of the world's
      // ~21M splats whenever viewerQuality === High). On most scenes
      // the effect is subtle, but the per-splat math is one of the
      // biggest contributors to "SUPER laggy" frame times reported
      // on May 31 '26 16:32 PT. Default off so the splat shader
      // short-circuits the focal/aperture math entirely; the GUI
      // toggle is still wired so users can opt back in.
      dofEnabled: false,
      setDofEnabled: (dofEnabled) => set({ dofEnabled }),
      focalDistance: 5,
      setFocalDistance: (focalDistance) => set({ focalDistance }),
      apertureAngle: 0.01,
      setApertureAngle: (apertureAngle) => set({ apertureAngle }),
      falloff: 1,
      setFalloff: (falloff) => set({ falloff }),
      sharpRange: 0,
      setSharpRange: (sharpRange) => set({ sharpRange }),
      falloffRate: 0.01,
      setFalloffRate: (falloffRate) => set({ falloffRate }),
      bloomEnabled: true,
      setBloomEnabled: (bloomEnabled) => set({ bloomEnabled }),
      // Defaults tuned for "bloom only affects light pixels" — the
      // user-requested contract. With sun intensity 1.62 and an HDR
      // pipeline (HalfFloat composer), pixels in direct sun reach
      // luminance ≈ (albedo × 1.62) in linear:
      //   • Dark vegetation / shadows / midtones (< 0.43 albedo)
      //     stay below 0.7 → NO bloom ✓
      //   • Light surfaces / sky / specular highlights
      //     (> 0.43 albedo in sun, or any HDR > 1.0)
      //     clear 0.7 → glow ✓
      // Intensity 1.2 makes the additive halo obviously visible
      // without washing out the scene. Previous defaults (intensity
      // 0.4, threshold 0.85) were tuned for a scene that had the
      // cosmic-SPZ tint pass emitting at 1.5; once v51 disabled
      // that, bloom had nothing to bite onto, which read as "bloom
      // doesn't do anything".
      // v19 (intensity 0.3 / threshold 0.85 / splatBrightness 1.05) made
      // bloom invisible — the high threshold + tiny gain meant almost
      // no pixels qualified, and the few that did barely glowed.
      //
      // v20 keeps the SELECTIVITY (threshold 0.85, splatBrightness
      // stays 1.05 to preserve colours / keep ACES out of its
      // desaturation curve) and only boosts INTENSITY so the few
      // qualifying highlights actually glow visibly. Net result:
      // unchanged colours, visible "subtle glow on bright pixels"
      // exactly as the user asked.
      bloomIntensity: 0.8,
      setBloomIntensity: (bloomIntensity) => set({ bloomIntensity }),
      bloomThreshold: 0.85,
      setBloomThreshold: (bloomThreshold) => set({ bloomThreshold }),
      // 0.9 = soft cutoff at the threshold so surfaces near the
      // boundary don't pop/flicker as the camera moves.
      bloomSmoothing: 0.9,
      setBloomSmoothing: (bloomSmoothing) => set({ bloomSmoothing }),
      brightnessContrastEnabled: false,
      setBrightnessContrastEnabled: (brightnessContrastEnabled) => set({ brightnessContrastEnabled }),
      brightness: 0,
      setBrightness: (brightness) => set({ brightness }),
      contrast: 0,
      setContrast: (contrast) => set({ contrast }),
      vignetteEnabled: false,
      setVignetteEnabled: (vignetteEnabled) => set({ vignetteEnabled }),
      vignetteDarkness: 0.5,
      setVignetteDarkness: (vignetteDarkness) => set({ vignetteDarkness }),
      vignetteOffset: 0.5,
      setVignetteOffset: (vignetteOffset) => set({ vignetteOffset }),
      // Tone mapping ON by default at ACES_FILMIC. This sounds like
      // it would change the world's colour, but it doesn't — Three's
      // renderer was *already* applying ACES Filmic per-material as
      // its default. The only difference now is WHERE in the
      // pipeline the curve lives: instead of being baked into the
      // scene render (which then hands LDR data to bloom), we
      // disable Three's per-material tonemap and apply the SAME
      // ACES curve as the last pass of the composer. Final pixels
      // are visually identical, but every other effect (bloom,
      // vignette, brightness, etc.) now operates on the HDR linear
      // data the scene actually produces — so bloom's threshold
      // means "pixels brighter than 1.0 in linear space" (truly
      // emissive things like the portal's tinted splats), not
      // "pixels brighter than 0.85 of the already-compressed LDR
      // range" (most of the forest).
      toneMappingEnabled: true,
      setToneMappingEnabled: (toneMappingEnabled) => set({ toneMappingEnabled }),
      toneMappingMode: 'ACES_FILMIC' as ToneMappingModeName,
      setToneMappingMode: (toneMappingMode) => set({ toneMappingMode }),
      exposure: 1,
      setExposure: (exposure) => set({ exposure }),
      dofPostEnabled: false,
      setDofPostEnabled: (dofPostEnabled) => set({ dofPostEnabled }),
      dofPostFocusDistance: 0.02,
      setDofPostFocusDistance: (dofPostFocusDistance) => set({ dofPostFocusDistance }),
      dofPostFocalLength: 0.05,
      setDofPostFocalLength: (dofPostFocalLength) => set({ dofPostFocalLength }),
      dofPostBokehScale: 2.0,
      setDofPostBokehScale: (dofPostBokehScale) => set({ dofPostBokehScale }),
      colorGradeEnabled: false,
      setColorGradeEnabled: (colorGradeEnabled) => set({ colorGradeEnabled }),
      hue: 0,
      setHue: (hue) => set({ hue }),
      saturation: 0,
      setSaturation: (saturation) => set({ saturation }),
      chromaticEnabled: false,
      setChromaticEnabled: (chromaticEnabled) => set({ chromaticEnabled }),
      chromaticOffset: 0.0008,
      setChromaticOffset: (chromaticOffset) => set({ chromaticOffset }),
      // v20: was true. Motion blur is a per-frame full-screen pass
      // (camera-velocity sample shader + an extra render target) and
      // contributes a flat ~1–3 ms on the user's machine regardless
      // of how slow the camera is moving. With bloom + HDR composer
      // + 5 large GLB creatures + 21M-splat world, that overhead is
      // enough to be noticeably "SUPER laggy" — and visually it's
      // doing very little when the camera isn't whipping around. Off
      // by default; the GUI toggle is still wired so the user can
      // turn it back on for cinematic sweeps if they want.
      motionBlurEnabled: false,
      setMotionBlurEnabled: (motionBlurEnabled) => set({ motionBlurEnabled }),
      motionBlurStrength: 0.3,
      setMotionBlurStrength: (motionBlurStrength) => set({ motionBlurStrength }),
      environmentIntensity: 2,
      setEnvironmentIntensity: (environmentIntensity) => set({ environmentIntensity }),
      sunIntensity: 1,
      setSunIntensity: (sunIntensity) => set({ sunIntensity }),
      sunColor: '#ffffff',
      setSunColor: (sunColor) => set({ sunColor }),
      levaCollapsed: false,
      setLevaCollapsed: (levaCollapsed) => set({ levaCollapsed }),
      // Intentionally NOT in `partialize` below — play mode always starts
      // off on a fresh page so the user never gets surprise-hidden tools.
      playMode: false,
      setPlayMode: (playMode) => set({ playMode }),
      togglePlayMode: () => set((s) => ({ playMode: !s.playMode })),
    }),
    {
      name: 'image-blaster-debug',
      version: 21,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted
        const state = persisted as Record<string, unknown>
        if (state.controllerMode === 'butterfly') state.controllerMode = 'fly'
        if (version < 10) state.butterfliesEnabled = true
        if (version < 12 && state.controllerMode === 'fps') state.controllerMode = 'wizard'
        delete state.hotReloadEnabled
        // v13: introduces the full post-processing chain (bloom
        // smoothing, brightness/contrast, vignette, tone mapping
        // mode + exposure, post-DoF, hue/saturation). Older states
        // don't carry these keys, so any sliders the user drags
        // would feed undefined → NaN into postprocessing uniforms
        // and either no-op silently OR throw inside the lib. Seed
        // them all to neutral defaults here so the migration moment
        // is invisible.
        if (version < 13) {
          if (state.bloomSmoothing === undefined) state.bloomSmoothing = 0.025
          if (state.brightnessContrastEnabled === undefined) state.brightnessContrastEnabled = false
          if (state.brightness === undefined) state.brightness = 0
          if (state.contrast === undefined) state.contrast = 0
          if (state.vignetteEnabled === undefined) state.vignetteEnabled = false
          if (state.vignetteDarkness === undefined) state.vignetteDarkness = 0.5
          if (state.vignetteOffset === undefined) state.vignetteOffset = 0.5
          if (state.toneMappingMode === undefined) state.toneMappingMode = 'ACES_FILMIC'
          if (state.exposure === undefined) state.exposure = 1
          if (state.dofPostEnabled === undefined) state.dofPostEnabled = false
          if (state.dofPostFocusDistance === undefined) state.dofPostFocusDistance = 0.02
          if (state.dofPostFocalLength === undefined) state.dofPostFocalLength = 0.05
          if (state.dofPostBokehScale === undefined) state.dofPostBokehScale = 2.0
          if (state.colorGradeEnabled === undefined) state.colorGradeEnabled = false
          if (state.hue === undefined) state.hue = 0
          if (state.saturation === undefined) state.saturation = 0
        }
        // v14: force tone-mapping effect OFF. v13 had it ON-by-default
        // which double-tonemapped the scene (R3F's renderer ACES +
        // our composer pass) — visible as a flat/crushed look that
        // didn't match the user's preferred forest palette. Off
        // means Three's renderer keeps its native ACES curve; users
        // who want to swap curves / drive exposure via the composer
        // can opt in via the GUI toggle.
        if (version < 14) {
          state.toneMappingEnabled = false
        }
        // v15: restore `bloomSmoothing = 0.9` for anyone whose
        // persisted state still carries the v13-era 0.025 default.
        // 0.9 is what the original code hard-coded into BloomEffect
        // before the knob was exposed — anything else is a visible
        // colour-grading change at default settings. Force-write
        // (don't gate on undefined) because v13 cached states have
        // the bad value already filled in.
        if (version < 15) {
          state.bloomSmoothing = 0.9
        }
        // v16: flip tone-mapping effect back ON. v14 turned it off
        // to "preserve original colours", but that left the pipeline
        // in LDR mode — meaning bloom operates on tone-mapped data
        // and catches every moderately bright pixel, washing out
        // the entire world when intensity > ~0.5. v16 establishes
        // the proper HDR pipeline: Three's per-material tonemap is
        // disabled, our composer applies the SAME ACES Filmic curve
        // as the final pass, and bloom now reads HDR linear data so
        // its threshold means "truly emissive" (e.g. portal tint at
        // 1.5 emission). Visual output is identical to the
        // pre-v14 look; the difference is bloom selectivity.
        if (version < 16) {
          state.toneMappingEnabled = true
        }
        // v17: re-baseline bloom defaults for "glow only on light
        // pixels" semantics. The previous defaults
        // (intensity 0.4, threshold 0.85) were tuned for a scene
        // whose cosmic SPZ wrote tinted pixels at emission 1.5 —
        // the only HDR-bright thing in view. After v51 in
        // wizardTuning forced that tint pass off, nothing else in
        // the forest exceeded threshold 0.85, so bloom became
        // invisible (user-reported "bloom doesn't do anything").
        //
        // New defaults: threshold 0.7, intensity 1.2. Combined
        // with sun intensity 1.62 (see wizardTuning DEFAULT) and
        // the HDR HalfFloat composer, this means:
        //   - albedo > ~0.43 in direct sun  → glows
        //   - sky / specular highlights / emissive  → glows strongly
        //   - dark surfaces / shadows / midtones    → stay dark
        // i.e. "bloom only affects light pixels", as requested.
        //
        // Force-write (don't gate on undefined) because users who
        // tweaked the sliders in earlier sessions have stale values
        // that defeat the new look. Smoothing left at 0.9.
        if (version < 17) {
          state.bloomIntensity = 1.2
          state.bloomThreshold = 0.7
          state.bloomSmoothing = 0.9
          state.bloomEnabled = true
        }
        // v18: dial back the v17 bloom defaults. The (1.2 / 0.7) combo
        // was tuned with `splatBrightness = 1.5` in mind, which over-
        // boosted midtones into the bloom band — rocks, foliage, water
        // all glowed and the scene felt washed-out. New defaults limit
        // bloom to genuine highlights; pair with the matching v53
        // `splatBrightness = 1.2` migration in wizardTuning.ts. Force-
        // write again so users who still have the v17 values pick up
        // the calmer look without manually resetting.
        if (version < 18) {
          state.bloomIntensity = 0.55
          state.bloomThreshold = 0.85
          state.bloomSmoothing = 0.9
          state.bloomEnabled = true
        }
        // v19: even 0.55 still washed colors out because ACES Filmic
        // tone mapping desaturates highlights aggressively, and the
        // v18 `splatBrightness = 1.2` was pushing enough pixels into
        // HDR that ACES caught a lot of midtones in its highlight-
        // squashing curve. Lower bloom to 0.3 (faint glow) and rely
        // on v54 dropping `splatBrightness` to 1.05 so midtones stay
        // in LDR and ACES leaves them alone.
        if (version < 19) {
          state.bloomIntensity = 0.3
          state.bloomThreshold = 0.85
          state.bloomEnabled = true
        }
        // v20: v19's intensity=0.3 went too far the other way — the
        // bloom became invisible. Bump intensity to 0.8 (visible
        // glow) while keeping threshold high so only true highlights
        // qualify. Same colour-preservation behaviour because we
        // didn't touch the gain or threshold.
        //
        // Also default `motionBlurEnabled` to false — full-screen
        // pass that contributes flat overhead even when standing
        // still, and the user reported "SUPER laggy" with it on.
        if (version < 20) {
          state.bloomIntensity = 0.8
          state.bloomThreshold = 0.85
          state.bloomEnabled = true
          state.motionBlurEnabled = false
        }
        // v21: even with motion blur off the user reported continued
        // lag. The biggest remaining frame-cost is the splat-renderer
        // DoF shader (`dofEnabled`) which runs per-splat across the
        // ~21M-splat world whenever viewerQuality === High. Most users
        // don't notice the visual effect but DO feel the framerate.
        // Force off; users who liked the focal-blur can re-enable.
        if (version < 21) {
          state.dofEnabled = false
        }
        return state
      },
      // Persist user-facing viewer controls so the Leva/debug panel survives reloads.
      partialize: (s) => ({
        viewerQuality: s.viewerQuality,
        worldRenderMode: s.worldRenderMode,
        objectRenderMode: s.objectRenderMode,
        butterfliesEnabled: s.butterfliesEnabled,
        controllerMode: s.controllerMode,
        flyMouseSensitivity: s.flyMouseSensitivity,
        dofEnabled: s.dofEnabled,
        focalDistance: s.focalDistance,
        apertureAngle: s.apertureAngle,
        falloff: s.falloff,
        sharpRange: s.sharpRange,
        falloffRate: s.falloffRate,
        bloomEnabled: s.bloomEnabled,
        bloomIntensity: s.bloomIntensity,
        bloomThreshold: s.bloomThreshold,
        bloomSmoothing: s.bloomSmoothing,
        brightnessContrastEnabled: s.brightnessContrastEnabled,
        brightness: s.brightness,
        contrast: s.contrast,
        vignetteEnabled: s.vignetteEnabled,
        vignetteDarkness: s.vignetteDarkness,
        vignetteOffset: s.vignetteOffset,
        toneMappingEnabled: s.toneMappingEnabled,
        toneMappingMode: s.toneMappingMode,
        exposure: s.exposure,
        dofPostEnabled: s.dofPostEnabled,
        dofPostFocusDistance: s.dofPostFocusDistance,
        dofPostFocalLength: s.dofPostFocalLength,
        dofPostBokehScale: s.dofPostBokehScale,
        colorGradeEnabled: s.colorGradeEnabled,
        hue: s.hue,
        saturation: s.saturation,
        chromaticEnabled: s.chromaticEnabled,
        chromaticOffset: s.chromaticOffset,
        motionBlurEnabled: s.motionBlurEnabled,
        motionBlurStrength: s.motionBlurStrength,
        levaCollapsed: s.levaCollapsed,
      }),
    },
  ),
)
