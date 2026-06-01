/**
 * Splat gain — a Spark 2.1 `worldModifier` that multiplies every splat's
 * RGB by a uniform scalar. Sole purpose: push bright splat pixels into
 * HDR (>1.0 linear) so the composer's bloom pass has something above
 * its threshold to glow on.
 *
 * Why we need it:
 *   SPZ files store colour in the [0,1] LDR range. Even fully-lit
 *   splats (the brightest patches of forest, white surfaces, sky) max
 *   out near 1.0 — meaning they sit RIGHT AT the bloom threshold
 *   (0.7 in our HDR pipeline) and only the rare brightest pixels
 *   qualify. With `gain = 1.5` a splat at luminance 0.7 becomes 1.05
 *   (above threshold, blooms cleanly) while a splat at 0.3 becomes
 *   0.45 (still well below threshold, stays clean). That's the
 *   "bloom only on bright splat pixels" semantics the user asked for.
 *
 * Why a worldModifier (not a shader patch):
 *   Spark already runs every splat through a `gsplat → gsplat` dyno
 *   pipeline. We slot into that pipeline as one more block, which:
 *     - Avoids monkey-patching the SparkRenderer's internal shader
 *       (and the version-skew risk that comes with it).
 *     - Composes cleanly with other modifiers on the same mesh
 *       (e.g. portalTwist's tint dyno on the cosmic SPZ — though
 *       in practice we only attach this to the WORLD splat).
 *     - Is `enabled = false` cheap: the shader still runs but with
 *       the gain uniform at 1.0 the math is a no-op multiply.
 *
 * Shader body is intentionally trivial — read each splat's rgba,
 * multiply rgb by the gain uniform, write it back. No falloff, no
 * region check, no NaN guard (the input is already validated by
 * Spark's decoder). One uniform, one multiply per splat.
 */
import {
  dyno as d,
  type SplatMesh,
  type GsplatModifier,
} from '@sparkjsdev/spark'

export interface SplatGainHandle {
  /** Live gain multiplier. Write `handle.gain.value = 1.6` to update
   *  the GPU uniform on the next frame (no recompile). */
  readonly gain: { value: number }
  /** Underlying Spark modifier; attach with `attach(mesh)`. */
  readonly modifier: GsplatModifier
  /** Push the modifier onto `mesh.worldModifier`. Idempotent — calling
   *  twice on the same mesh is a no-op. */
  attach(mesh: SplatMesh): void
  /** Detach from a SplatMesh. Safe to call even if never attached. */
  detach(mesh: SplatMesh): void
}

export function makeSplatGain(initialGain = 1.5): SplatGainHandle {
  const dGain = d.dynoFloat(initialGain)

  const gainKernel = d.dyno<
    { rgba: 'vec4'; gain: 'float' },
    { newRgba: 'vec4' }
  >({
    inTypes: { rgba: 'vec4', gain: 'float' },
    outTypes: { newRgba: 'vec4' },
    inputs: { gain: dGain },
    // Multiply RGB by gain, keep alpha untouched. Defensive: if
    // gain ever lands as NaN (stale persisted state, a slider
    // drag that produced 0/0, etc.) the splat would output NaN
    // colour and the sorter would tile-render forever. Substitute
    // 1.0 in that case so the splat just renders at its original
    // brightness. (NaN check uses `x == x` — false only for NaN —
    // which works in every GLSL version, unlike `isnan` which is
    // GLSL ES 3.00 only.)
    statements: ({ inputs, outputs }) => [
      `float _safeGain = (${inputs.gain} == ${inputs.gain} && abs(${inputs.gain}) < 1e30) ? ${inputs.gain} : 1.0;`,
      `vec4 _orig = ${inputs.rgba};`,
      `${outputs.newRgba} = vec4(_orig.rgb * _safeGain, _orig.a);`,
    ],
  })

  const modifier = d.dynoBlock(
    { gsplat: d.Gsplat },
    { gsplat: d.Gsplat },
    ({ gsplat }) => {
      if (!gsplat) throw new Error('splat gain: missing gsplat input')
      const split = d.splitGsplat(gsplat).outputs
      const out = gainKernel.apply({ rgba: split.rgba })
      return {
        gsplat: d.combineGsplat({
          gsplat,
          rgba: out.newRgba,
        }),
      }
    },
  ) as unknown as GsplatModifier

  const attached = new WeakSet<SplatMesh>()

  return {
    gain: dGain,
    modifier,
    attach(mesh) {
      if (attached.has(mesh)) return
      // Append to existing worldModifiers if any (e.g. PortalScene
      // would never attach this to the cosmic SPZ, but defensively
      // we don't want to clobber a different effect's modifier
      // either). Using `worldModifier` (singular) is the
      // append-by-push API — Spark moves it into the
      // `worldModifiers` array on next `updateGenerator()` call.
      mesh.worldModifier = modifier
      mesh.updateGenerator()
      attached.add(mesh)
    },
    detach(mesh) {
      if (!attached.has(mesh)) return
      if (mesh.worldModifiers && mesh.worldModifiers.includes(modifier)) {
        mesh.worldModifier = undefined
        mesh.updateGenerator()
      }
      attached.delete(mesh)
    },
  }
}
