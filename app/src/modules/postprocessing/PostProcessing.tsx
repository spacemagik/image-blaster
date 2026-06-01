/**
 * PostProcessing — the engine's image-space FX chain.
 *
 * Effects are all instantiated as raw `postprocessing` lib classes
 * (not the @react-three/postprocessing JSX wrappers) and mounted via
 * <primitive>. Reasons:
 *
 *   1. @react-three/postprocessing's wrapEffect uses
 *      `useMemo(..., [JSON.stringify(restProps)])`. In React 19 `ref`
 *      is a regular prop, so once the ref populates with the effect
 *      instance, JSON.stringify recurses through render targets /
 *      textures and chokes on circular parent/children references.
 *   2. We need live-update access to the effect's uniforms each frame
 *      (driven by the store). Direct ownership of the instance gives
 *      us that without prop-driven recreation churn.
 *
 * Architecture (read top → bottom = render order):
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ EffectComposer                                             │
 *   │   ↓ MotionBlur          (camera-relative streak smear)     │
 *   │   ↓ DepthOfField        (focus + bokeh)                    │
 *   │   ↓ Bloom               (glow on pixels > threshold)       │
 *   │   ↓ ChromaticAberration (per-channel offset)               │
 *   │   ↓ HueSaturation       (colour grading)                   │
 *   │   ↓ BrightnessContrast  (post-tonemap LDR adjustments)     │
 *   │   ↓ Vignette            (corner darken)                    │
 *   │   ↓ ToneMapping         (HDR → LDR mapping; ALWAYS LAST)   │
 *   └────────────────────────────────────────────────────────────┘
 *
 *   Tone-mapping is positioned LAST because every effect upstream
 *   expects to operate on HDR scene radiance — putting it earlier
 *   would tonemap the input, then re-tonemap the bloom/etc result,
 *   which crushes highlights twice.
 *
 *   Brightness/Contrast + Vignette sit just before tone-mapping so
 *   they read as "studio post" rather than scene illumination tweaks.
 *
 * Source of truth:
 *   All knobs live in `useDebugStore`. The component reads the
 *   "enabled" flags as React state (so toggling rebuilds the
 *   composer chain), and reads the scalar values inside a per-frame
 *   `useFrame` that writes them directly into effect uniforms (no
 *   React rerender per slider drag).
 *
 *   The WizardGui Post-processing folder writes to the SAME store
 *   via direct setter calls, so the lil-gui sliders are a true
 *   surface on the underlying effect uniforms.
 */
import { useEffect, useMemo, useRef } from 'react'
import { EffectComposer } from '@react-three/postprocessing'
import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  HueSaturationEffect,
  KernelSize,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  VignetteTechnique,
} from 'postprocessing'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MotionBlurEffect } from './MotionBlurEffect'
import { useDebugStore, type ToneMappingModeName } from '../../store/debug'

const _prevQuat = new THREE.Quaternion()
const _prevForward = new THREE.Vector3()
const _currentForward = new THREE.Vector3()
const _deltaForward = new THREE.Vector3()
const _cameraRight = new THREE.Vector3()
const _cameraUp = new THREE.Vector3()

/** Maps the persisted-string mode name to the actual lib enum. Done
 *  via a switch (not a dict) so the TS compiler verifies exhaustive
 *  coverage when new modes are added. */
function resolveToneMappingMode(name: ToneMappingModeName): ToneMappingMode {
  switch (name) {
    case 'LINEAR': return ToneMappingMode.LINEAR
    case 'REINHARD': return ToneMappingMode.REINHARD
    case 'REINHARD2': return ToneMappingMode.REINHARD2
    case 'REINHARD2_ADAPTIVE': return ToneMappingMode.REINHARD2_ADAPTIVE
    case 'UNCHARTED2': return ToneMappingMode.UNCHARTED2
    case 'OPTIMIZED_CINEON': return ToneMappingMode.OPTIMIZED_CINEON
    case 'ACES_FILMIC': return ToneMappingMode.ACES_FILMIC
    case 'AGX': return ToneMappingMode.AGX
    case 'NEUTRAL': return ToneMappingMode.NEUTRAL
  }
}

function OptionalEffect({ enabled, object }: { enabled: boolean; object: object }) {
  return enabled ? <primitive object={object} /> : null
}

export function PostProcessing() {
  const camera = useThree((s) => s.camera)
  // Renderer pulled out at top-level so the per-frame closure below
  // can drive `renderer.toneMappingExposure` without violating
  // hook rules (no calling useThree inside useFrame).
  const renderer = useThree((s) => s.gl)

  // Enable flags read reactively so toggling rebuilds the chain. The
  // EffectComposer keys off `effectKey` below so toggling actually
  // re-mounts the composer with the new effect list — postprocessing
  // doesn't support live add/remove of effects to a running pass.
  const bloomEnabled = useDebugStore((s) => s.bloomEnabled)
  const brightnessContrastEnabled = useDebugStore((s) => s.brightnessContrastEnabled)
  const vignetteEnabled = useDebugStore((s) => s.vignetteEnabled)
  const toneMappingEnabled = useDebugStore((s) => s.toneMappingEnabled)
  const dofPostEnabled = useDebugStore((s) => s.dofPostEnabled)
  const colorGradeEnabled = useDebugStore((s) => s.colorGradeEnabled)
  const chromaticEnabled = useDebugStore((s) => s.chromaticEnabled)
  const motionBlurEnabled = useDebugStore((s) => s.motionBlurEnabled)
  // Tone-mapping MODE drives a rebuild — the underlying shader
  // is selected at construction time per the lib's design (no live
  // uniform for "which curve to use"). So switching curve = swap
  // effect instance, which the toneMappingEffect useMemo handles.
  const toneMappingMode = useDebugStore((s) => s.toneMappingMode)

  // ── Effect instances (constructed once, mutated per-frame) ─────────
  const bloomEffect = useMemo(() => {
    const initial = useDebugStore.getState()
    return new BloomEffect({
      intensity: initial.bloomIntensity,
      luminanceThreshold: initial.bloomThreshold,
      luminanceSmoothing: initial.bloomSmoothing,
      blendFunction: BlendFunction.ADD,
      kernelSize: KernelSize.LARGE,
      // mipmapBlur builds the bloom by repeatedly downsampling +
      // upsampling through a mip pyramid (the technique Unreal /
      // Unity use). Two advantages over the previous single-
      // Gaussian path:
      //
      //   1. The glow spreads across MANY scales — a tight bright
      //      pixel produces both a sharp rim and a soft halo that
      //      reaches dozens of pixels out. Single Gaussian only
      //      produces one falloff width.
      //   2. The wider spread survives ACES tone-mapping. With
      //      the HDR pipeline, bloom adds energy in linear HDR and
      //      ACES then compresses the result — a single-Gaussian
      //      bloom that sits right at the bright pixel gets
      //      crushed by the ACES shoulder, but a mip bloom that
      //      bleeds into surrounding pixels keeps the *halo*
      //      visible even after compression.
      //
      // resolutionScale 0.35 is the sweet spot for this scene:
      // halves the GPU bandwidth vs 0.5 (which had been the prior
      // setting tuned for a smaller world) and the mipmap pyramid
      // hides the lower base resolution by spreading the glow
      // across multiple mip levels — the contour is still smooth.
      // Combined with disabling motion blur, this is the main lever
      // for the "SUPER laggy" fix from May 31 '26 16:08 PT.
      mipmapBlur: true,
      resolutionScale: 0.35,
    })
  }, [])

  const chromaEffect = useMemo(() => {
    const initial = useDebugStore.getState()
    return new ChromaticAberrationEffect({
      offset: new THREE.Vector2(initial.chromaticOffset, initial.chromaticOffset),
      radialModulation: false,
      modulationOffset: 0,
      blendFunction: BlendFunction.NORMAL,
    })
  }, [])

  const blurEffect = useMemo(() => new MotionBlurEffect(), [])

  // Tone mapping needs to be re-instantiated when the mode changes,
  // because the lib bakes the curve into the shader at construction.
  const toneMappingEffect = useMemo(() => {
    return new ToneMappingEffect({
      mode: resolveToneMappingMode(toneMappingMode),
      // SRC = replace pixel (our usual final-pass behaviour). The
      // optional-effect wrapper skips this primitive entirely when
      // disabled, so we don't need a NORMAL fallback blend.
      blendFunction: BlendFunction.SRC,
    })
  }, [toneMappingMode])

  const brightnessContrastEffect = useMemo(
    () => {
      const initial = useDebugStore.getState()
      return new BrightnessContrastEffect({
        brightness: initial.brightness,
        contrast: initial.contrast,
      })
    },
    [],
  )

  const vignetteEffect = useMemo(
    () => {
      const initial = useDebugStore.getState()
      return new VignetteEffect({
        // DEFAULT technique = simple radial darkening. The alternative
        // (ESKIL) gives a softer, more film-like vignette at higher
        // contrast cost; default works for most cases.
        technique: VignetteTechnique.DEFAULT,
        darkness: initial.vignetteDarkness,
        offset: initial.vignetteOffset,
      })
    },
    [],
  )

  const hueSaturationEffect = useMemo(
    () => {
      const initial = useDebugStore.getState()
      return new HueSaturationEffect({
        hue: initial.hue,
        saturation: initial.saturation,
      })
    },
    [],
  )

  const dofEffect = useMemo(() => {
    const initial = useDebugStore.getState()
    return new DepthOfFieldEffect(camera, {
      focusDistance: initial.dofPostFocusDistance,
      focalLength: initial.dofPostFocalLength,
      bokehScale: initial.dofPostBokehScale,
    })
  }, [camera])

  useEffect(() => {
    _prevQuat.copy(camera.quaternion)
    camera.getWorldDirection(_prevForward)
  }, [camera])

  // Capture the renderer's "natural" tone-mapping mode at mount —
  // R3F's <Canvas> defaults this to ACESFilmicToneMapping, but we
  // don't want to hard-code that in case a parent overrides it.
  // Used only when the user opts into our tone-mapping effect; we
  // restore this value when they opt out and on unmount.
  const originalToneMappingRef = useRef(renderer.toneMapping)
  const originalToneMappingExposureRef = useRef(renderer.toneMappingExposure)
  useEffect(() => {
    originalToneMappingRef.current = renderer.toneMapping
    originalToneMappingExposureRef.current = renderer.toneMappingExposure
  }, [renderer])

  // Hand off the tone-mapping responsibility between Three.js and
  // our composer pass — but ONLY when the user has explicitly
  // enabled our tone-mapping effect. Otherwise we never touch
  // `renderer.toneMapping`, so the scene renders exactly as R3F's
  // Canvas configured it (typically ACES Filmic, which is what the
  // user's preferred world look depends on).
  //
  //   toneMappingEnabled = true   →  switch renderer to
  //       `NoToneMapping` so our composer pass owns the curve +
  //       exposure. Restore the captured original on cleanup.
  //   toneMappingEnabled = false  →  no-op. The renderer keeps
  //       whatever the parent set. The other composer effects
  //       still run; they just operate on the LDR pixels the
  //       renderer produces.
  useEffect(() => {
    if (!toneMappingEnabled) return
    renderer.toneMapping = THREE.NoToneMapping
    return () => {
      renderer.toneMapping = originalToneMappingRef.current
      renderer.toneMappingExposure = originalToneMappingExposureRef.current
    }
  }, [renderer, toneMappingEnabled])

  // Dispose every effect on unmount. NOTE: `toneMappingEffect`
  // re-instantiates on mode change — the dependency array on its
  // useMemo ensures the OLD instance is replaced, and the lib's
  // EffectComposer disposes its pass list when re-keyed below.
  useEffect(() => {
    return () => {
      bloomEffect.dispose()
      chromaEffect.dispose()
      blurEffect.dispose()
      toneMappingEffect.dispose()
      brightnessContrastEffect.dispose()
      vignetteEffect.dispose()
      hueSaturationEffect.dispose()
      dofEffect.dispose()
    }
  }, [
    bloomEffect, chromaEffect, blurEffect, toneMappingEffect,
    brightnessContrastEffect, vignetteEffect, hueSaturationEffect, dofEffect,
  ])

  useFrame(() => {
    const s = useDebugStore.getState()

    // Bloom: intensity is exposed as a CLASS SETTER on BloomEffect,
    // not the `intensity` uniform on the underlying material. In
    // mipmap-blur mode (mipmapBlur: true) the mip pyramid path
    // doesn't read from that uniform at all — assigning to it is a
    // silent no-op, which is why the slider previously felt
    // disconnected. Using the property setter routes the value
    // through the lib's internal state and reaches the mip pyramid
    // composite shader correctly.
    //
    // Threshold + smoothing remain on `luminanceMaterial` regardless
    // of mip mode (they drive the bright-pixel mask that feeds both
    // the traditional Gaussian path and the mip pyramid).
    bloomEffect.intensity = s.bloomIntensity
    bloomEffect.luminanceMaterial.threshold = s.bloomThreshold
    bloomEffect.luminanceMaterial.smoothing = s.bloomSmoothing

    // Brightness / contrast: -1..1 each.
    {
      const b = brightnessContrastEffect.uniforms.get('brightness')
      if (b) b.value = s.brightness
      const c = brightnessContrastEffect.uniforms.get('contrast')
      if (c) c.value = s.contrast
    }

    // Vignette: darkness + offset uniforms.
    {
      const d = vignetteEffect.uniforms.get('darkness')
      if (d) d.value = s.vignetteDarkness
      const o = vignetteEffect.uniforms.get('offset')
      if (o) o.value = s.vignetteOffset
    }

    // Hue + Saturation: the lib exposes them as direct setters on
    // the effect instance (they wrap uniform writes). Calling each
    // frame is cheap.
    hueSaturationEffect.hue = s.hue
    hueSaturationEffect.saturation = s.saturation

    // Exposure: written to `renderer.toneMappingExposure`, which is
    // Three's pre-curve scalar on all colour samples. Only write when
    // our tone-mapping effect is enabled — otherwise we'd be silently
    // mutating renderer state at default settings, which is exactly
    // what "do not change colours unless the user opts in" forbids.
    // When `toneMappingEnabled` flips back off, the cleanup in the
    // useEffect above restores the renderer's original exposure.
    if (s.toneMappingEnabled) {
      renderer.toneMappingExposure = s.exposure
    }

    // Depth of field: live uniforms exposed on the effect's
    // sub-materials. Calling each frame keeps the focal plane and
    // bokeh size responsive to slider drags.
    dofEffect.cocMaterial.focusDistance = s.dofPostFocusDistance
    dofEffect.cocMaterial.focalLength = s.dofPostFocalLength
    dofEffect.bokehScale = s.dofPostBokehScale

    // Chromatic aberration offset is a Vector2 — set both
    // components (the lib supports per-axis but our slider is a
    // single scalar, so x == y).
    chromaEffect.offset.set(s.chromaticOffset, s.chromaticOffset)

    // Motion blur: integrates camera angular velocity. Computed
    // here because we need both the previous and current forward
    // vectors, which only this component tracks.
    camera.getWorldDirection(_currentForward)
    _deltaForward.copy(_currentForward).sub(_prevForward)
    _cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
    _cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion)

    const x = _deltaForward.dot(_cameraRight)
    const y = _deltaForward.dot(_cameraUp)
    const angle = _deltaForward.length()
    const strength = Math.min(angle * s.motionBlurStrength * 8, 1)
    blurEffect.setVelocity(x * 0.5, y * 0.5, strength)
    _prevQuat.copy(camera.quaternion)
    _prevForward.copy(_currentForward)
  })

  // Compose the active-effects key so EffectComposer rebuilds the
  // pass chain when the user toggles anything. Tone-mapping mode is
  // part of the key because the lib bakes the curve at construct
  // time (see toneMappingEffect useMemo dependencies).
  const hasEffects =
    bloomEnabled || brightnessContrastEnabled || vignetteEnabled ||
    toneMappingEnabled || dofPostEnabled || colorGradeEnabled ||
    chromaticEnabled || motionBlurEnabled
  if (!hasEffects) return null

  const effectKey = [
    motionBlurEnabled ? 'mb' : '',
    dofPostEnabled ? 'dof' : '',
    bloomEnabled ? 'bloom' : '',
    chromaticEnabled ? 'chroma' : '',
    colorGradeEnabled ? 'hsl' : '',
    brightnessContrastEnabled ? 'bc' : '',
    vignetteEnabled ? 'vig' : '',
    toneMappingEnabled ? `tm:${toneMappingMode}` : '',
  ].join('|')

  return (
    <EffectComposer
      key={effectKey}
      multisampling={0}
      // HALF_FLOAT render targets preserve HDR linear values through
      // the effect chain instead of the @react-three/postprocessing
      // default (UnsignedByteType) which clamps every pixel to [0,1]
      // BEFORE the first effect runs. Without this:
      //   - Spark splats with portalTintEmission = 1.5 get clipped
      //     to 1.0 in the render target before bloom samples it.
      //   - Bloom can't distinguish "truly emissive" (HDR > 1.0) from
      //     "lit but not emissive" (LDR ~ 0.8) — both look the same
      //     after clipping, so the threshold slider can't surface
      //     the difference.
      //   - ACES tone-mapping at the end of the chain operates on
      //     already-LDR data, so its highlight shoulder does nothing.
      // With HalfFloatType, bright pixels stay >1.0 through the
      // pipeline, bloom's threshold becomes a meaningful HDR cutoff,
      // and ACES does its actual job: compressing HDR overshoot
      // back into displayable LDR after bloom has had a chance to
      // distribute that energy.
      frameBufferType={THREE.HalfFloatType}
    >
      {/* Order matters — see top-of-file diagram. */}
      <OptionalEffect key="mb" enabled={motionBlurEnabled} object={blurEffect} />
      <OptionalEffect key="dof" enabled={dofPostEnabled} object={dofEffect} />
      <OptionalEffect key="bloom" enabled={bloomEnabled} object={bloomEffect} />
      <OptionalEffect key="chroma" enabled={chromaticEnabled} object={chromaEffect} />
      <OptionalEffect key="hsl" enabled={colorGradeEnabled} object={hueSaturationEffect} />
      <OptionalEffect key="bc" enabled={brightnessContrastEnabled} object={brightnessContrastEffect} />
      <OptionalEffect key="vig" enabled={vignetteEnabled} object={vignetteEffect} />
      <OptionalEffect key="tm" enabled={toneMappingEnabled} object={toneMappingEffect} />
    </EffectComposer>
  )
}
