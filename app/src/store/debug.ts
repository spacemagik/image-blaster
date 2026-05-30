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
      dofEnabled: true,
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
      bloomIntensity: 0.4,
      setBloomIntensity: (bloomIntensity) => set({ bloomIntensity }),
      bloomThreshold: 0.85,
      setBloomThreshold: (bloomThreshold) => set({ bloomThreshold }),
      // 0.9 matches the value the original code hard-coded into the
      // BloomEffect constructor before this knob was exposed. Keeping
      // it as the default means a fresh load looks identical to the
      // pre-GUI behaviour.
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
      motionBlurEnabled: true,
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
      version: 16,
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
