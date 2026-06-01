/**
 * CreaturesScene — mounts each entry in `CREATURE_CONFIGS` as a draggable
 * GLB prop in the world. One `<CreatureInstance>` per config, each:
 *
 *   <proxy group>                         ← TRS-driven from store
 *     <primitive object={gltf.scene} />   ← cloned GLB
 *   </proxy>
 *   <TransformControls>                   ← only when gizmoEnabled
 *
 * Design mirrors PortalScene's pattern (proxy <group> driven by store +
 * optional TransformControls + dragging gate) minus the dyno/world-modifier
 * plumbing — these are static meshes, not splat effects.
 *
 * Each instance subscribes ONLY to its own slug's slice of the store so a
 * slider drag on creature A doesn't re-render creature B's transform. The
 * useFrame loop reads from the live store every frame (cheap — three
 * property writes) so external updates (GUI sliders, gizmo callbacks, the
 * Snap-to-character button) all converge on the proxy without round-trip
 * through React state.
 *
 * GLB loading goes through `useLoader(GLTFLoader)` like the placement
 * editor's `SceneObject`. We deliberately do NOT clone with SkeletonUtils
 * here because none of the creature GLBs are skinned — they're static
 * meshes — and avoiding the skeleton clone shaves a few ms off first paint.
 */
import { Suspense, useEffect, useRef, useState } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { useWizardTuning } from '../character/wizardTuning'
import { CREATURE_CONFIGS, type CreatureConfig } from './creatureConfigs'
import {
  getActiveSplatMesh,
  subscribeActiveSplatMesh,
} from '../splat/splatMeshRegistry'

const ignoreRaycast: THREE.Object3D['raycast'] = () => {}

// ── GLB optimization ────────────────────────────────────────────────────
// The supplied creature GLBs are very large (the verdant-sentinel alone
// is ~70 MB), and almost all of that weight is 4K texture data. Uploaded
// raw, a single creature can consume 100+ MB of VRAM and saturate the
// fragment pipeline (every PBR sample = 1 indirect + N texture taps),
// which is what was making the swirl animation, bloom slider, and every
// other per-frame uniform update "look frozen" — the GPU was simply too
// busy to commit a coherent frame.
//
// We fix it at load time, ONCE per texture, by:
//   1. Downscaling any texture with a side > MAX_CREATURE_TEX_SIZE down
//      to that cap via a canvas blit (4K → 1024 = 16× less fragment work
//      AND 16× less VRAM). 1024 is the visual sweet spot for props this
//      size; the user can't perceive higher detail past a few meters.
//   2. Pinning anisotropy to 1 (the default of `renderer.capabilities
//      .maxAnisotropy` is usually 16 on desktop GPUs and that's expensive
//      per sample — overkill for matte creature props).
//   3. Stripping the expensive PBR extensions (clearcoat, sheen,
//      transmission, iridescence) that the GLBs ship with but that look
//      identical to plain metallic-roughness on these scenes. Each of
//      these extensions adds 1-3 extra texture samples per pixel.
//
// Using WeakSets keyed by the texture/root so we never double-process a
// shared texture (GLTFLoader caches by URL → multiple instances share
// material/texture refs, which is great: optimizing ONE references frees
// VRAM for ALL clones).
const MAX_CREATURE_TEX_SIZE = 1024
const processedTextures = new WeakSet<THREE.Texture>()
const optimizedRoots = new WeakSet<THREE.Object3D>()

/** Downscale a texture in-place to `MAX_CREATURE_TEX_SIZE` if larger.
 *  Returns the estimated VRAM bytes saved (RGBA8 assumption) or 0 if no
 *  work was done — used only for the summary log. */
function downscaleTextureInPlace(tex: THREE.Texture): number {
  if (processedTextures.has(tex)) return 0
  processedTextures.add(tex)
  tex.anisotropy = 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const img: any = tex.image
  if (!img) return 0
  const w = Number(img.width ?? img.naturalWidth ?? 0)
  const h = Number(img.height ?? img.naturalHeight ?? 0)
  if (w === 0 || h === 0) return 0
  if (w <= MAX_CREATURE_TEX_SIZE && h <= MAX_CREATURE_TEX_SIZE) return 0

  const scale = MAX_CREATURE_TEX_SIZE / Math.max(w, h)
  const newW = Math.max(1, Math.round(w * scale))
  const newH = Math.max(1, Math.round(h * scale))

  try {
    const canvas = document.createElement('canvas')
    canvas.width = newW
    canvas.height = newH
    const ctx = canvas.getContext('2d')
    if (!ctx) return 0
    // drawImage works on ImageBitmap, HTMLImageElement, HTMLCanvasElement
    // — i.e. every source GLTFLoader produces.
    ctx.drawImage(img, 0, 0, newW, newH)
    tex.image = canvas
    tex.needsUpdate = true
    return (w * h - newW * newH) * 4
  } catch (err) {
    console.warn('[Creatures] failed to downscale texture', err)
    return 0
  }
}

/** Walk every property on a material, downscale any texture-typed slot,
 *  and disable expensive PBR extensions. Returns saved bytes (estimate). */
function simplifyMaterial(mat: THREE.Material): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m: any = mat
  let saved = 0
  for (const key of Object.keys(m)) {
    const v = m[key]
    if (v && v.isTexture) saved += downscaleTextureInPlace(v as THREE.Texture)
  }
  // PBR extension knock-downs. Guarded so plain MeshStandardMaterial
  // (which has none of these) is left alone.
  if (typeof m.clearcoat === 'number') m.clearcoat = 0
  if (typeof m.sheen === 'number') m.sheen = 0
  if (typeof m.transmission === 'number') m.transmission = 0
  if (typeof m.iridescence === 'number') m.iridescence = 0
  m.needsUpdate = true
  return saved
}

function optimizeCreatureGltf(root: THREE.Object3D, label: string): void {
  if (optimizedRoots.has(root)) return
  optimizedRoots.add(root)

  let savedBytes = 0
  let meshCount = 0
  let matCount = 0
  root.traverse((child) => {
    child.raycast = ignoreRaycast
    if (child instanceof THREE.Mesh) {
      // Frustum culling needs an accurate bounding sphere or three.js
      // will keep the mesh in the draw list even when the camera is
      // pointed away. Most authoring tools forget to compute one.
      if (child.geometry && !child.geometry.boundingSphere) {
        child.geometry.computeBoundingSphere()
      }
      meshCount++
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        if (!mat) continue
        matCount++
        savedBytes += simplifyMaterial(mat)
      }
    }
  })

  const savedMb = (savedBytes / 1024 / 1024).toFixed(1)
  console.log(
    `[Creatures] ${label}: optimized ${meshCount} meshes / ${matCount} materials, ` +
    `freed ~${savedMb} MB VRAM (textures capped at ${MAX_CREATURE_TEX_SIZE}px)`,
  )
}

function CreatureInstance({ config }: { config: CreatureConfig }) {
  // Subscribe ONLY to the toggles that gate React-level rendering
  // (mount/unmount the GLB, mount/unmount TransformControls). TRS values
  // are read inside useFrame so slider drags don't trigger re-renders.
  const enabled = useWizardTuning((s) => s.creatures[config.slug]?.enabled ?? config.defaultTransform.enabled)
  const gizmoEnabled = useWizardTuning((s) => s.creatures[config.slug]?.gizmoEnabled ?? config.defaultTransform.gizmoEnabled)
  const gizmoMode = useWizardTuning((s) => s.creatures[config.slug]?.gizmoMode ?? config.defaultTransform.gizmoMode)

  // The proxy group needs to be in component state (not just a ref) so
  // <TransformControls object={…}/> can react to its mount — passing a
  // ref's `.current` to a prop is a common foot-gun (React only reads
  // the value at JSX-time and never updates if the ref changes later).
  const [proxy, setProxy] = useState<THREE.Group | null>(null)
  const draggingRef = useRef(false)

  // Seed the proxy transform once it mounts so the first frame already
  // shows the GLB in the right place (avoids a one-frame pop from
  // identity to the persisted pose).
  useEffect(() => {
    if (!proxy) return
    const t = useWizardTuning.getState().creatures[config.slug]
      ?? config.defaultTransform
    proxy.position.set(t.posX, t.posY, t.posZ)
    proxy.rotation.set(
      THREE.MathUtils.degToRad(t.rotX),
      THREE.MathUtils.degToRad(t.rotY),
      THREE.MathUtils.degToRad(t.rotZ),
    )
    proxy.scale.setScalar(t.scale)
  }, [proxy, config.slug, config.defaultTransform])

  // Per-frame: read store → write proxy transform. Skipped while the
  // user is actively dragging the gizmo (the gizmo writes directly to
  // proxy.position/rotation/scale, and `handleGizmoChange` mirrors that
  // back to the store via `onObjectChange`; if we kept overwriting from
  // the store mid-drag the gizmo would fight itself).
  useFrame(() => {
    if (!proxy) return
    if (draggingRef.current) return
    const t = useWizardTuning.getState().creatures[config.slug]
    if (!t) return
    proxy.position.set(t.posX, t.posY, t.posZ)
    proxy.rotation.set(
      THREE.MathUtils.degToRad(t.rotX),
      THREE.MathUtils.degToRad(t.rotY),
      THREE.MathUtils.degToRad(t.rotZ),
    )
    proxy.scale.setScalar(t.scale)
  })

  // Mirror gizmo edits back to the persisted store. TransformControls
  // mutates the proxy directly; this callback fires on every drag tick.
  // We write ALL three (pos/rot/scale) on every change regardless of
  // the active mode — cheap, and means mode-switching never strands a
  // component (e.g. user rotates then switches to scale; without this
  // the old rotation values in the store would briefly fight the
  // proxy's actual rotation).
  const handleGizmoChange = () => {
    if (!proxy) return
    useWizardTuning.getState().setCreatureTransform(config.slug, {
      posX: proxy.position.x,
      posY: proxy.position.y,
      posZ: proxy.position.z,
      rotX: THREE.MathUtils.radToDeg(proxy.rotation.x),
      rotY: THREE.MathUtils.radToDeg(proxy.rotation.y),
      rotZ: THREE.MathUtils.radToDeg(proxy.rotation.z),
      scale: proxy.scale.x,
    })
  }

  if (!enabled) return null

  return (
    <>
      <group ref={setProxy}>
        <Suspense fallback={null}>
          <CreatureModel url={config.url} label={config.name} />
        </Suspense>
      </group>
      {gizmoEnabled && proxy && (
        <TransformControls
          object={proxy}
          mode={gizmoMode}
          onObjectChange={handleGizmoChange}
          onMouseDown={() => {
            draggingRef.current = true
          }}
          onMouseUp={() => {
            draggingRef.current = false
          }}
        />
      )}
    </>
  )
}

/**
 * Loads the GLB and renders its scene graph. Split out as a child so the
 * `<Suspense>` fallback in the parent only suspends GLB loading — the
 * proxy group stays mounted, which keeps TransformControls' `object={…}`
 * binding stable while the (potentially large) GLB streams in.
 *
 * Each instance gets its OWN cloned scene graph: useLoader caches the
 * underlying GLTF result by URL (so concurrent mounts of the same URL
 * share the parse), but we always `.clone()` the scene so adding the
 * same GLB twice doesn't reparent the original (three.js objects can
 * only have one parent — without the clone, mounting a duplicate would
 * silently steal the first instance's mesh).
 */
function CreatureModel({ url, label }: { url: string; label: string }) {
  const gltf = useLoader(GLTFLoader, url)
  const scene = useRef<THREE.Object3D | null>(null)
  if (!scene.current) {
    const cloned = gltf.scene.clone(true)
    // Optimization pipeline: raycast suppression + texture downscale +
    // material simplification + bounding-sphere recompute. Runs ONCE per
    // GLB (the WeakSet dedupes on the cloned root) so re-mounting an
    // already-optimized creature is free. Shadow casting is also left
    // OFF intentionally — even with 1024px textures, asking these
    // high-poly meshes to re-render from the sun's POV every frame
    // tanks the framerate on the user's hardware and is what was making
    // the swirl tint and bloom slider look like the toggles "didn't
    // work".
    optimizeCreatureGltf(cloned, label)
    scene.current = cloned
  }
  return <primitive object={scene.current} dispose={null} />
}

/**
 * Gate the entire creature mount on "world splat is ready". Without this
 * gate, the GLBLoader fetches + parses 100+ MB of GLB while the world
 * SPZ is still decoding in Spark's WASM worker — and on systems with a
 * tight tab heap budget that race trips a WASM `unreachable` trap
 * inside Spark's decoder (visible in console as
 * `SplatRenderer: splat mesh failed to initialize` with a giant base64
 * `data:application/wasm` URL in the stack), which leaves the user
 * with an empty scene.
 *
 * The fix: subscribe to `splatMeshRegistry`, which Spark notifies once
 * the world splat's `initialized` promise resolves. We then wait an
 * extra ~1.5 s so the GPU has time to upload the decoded splats and
 * settle before we start dropping creature textures into the same VRAM
 * pool. After that grace period the creatures mount as before.
 *
 * On URL changes (e.g. user switches worlds) Spark sets the active
 * mesh back to `null` BEFORE the new mesh loads — we keep the
 * creatures up during that gap because tearing them down would force
 * a re-parse of all three GLBs every world switch. The new world's
 * splat decode is the bottleneck again, but Spark seems to handle
 * that better than the first-load case (the GLBs and their decoded
 * textures already live in VRAM by then).
 */
const STARTUP_GRACE_MS = 1500

export function CreaturesScene() {
  const [worldReady, setWorldReady] = useState(
    () => getActiveSplatMesh() !== null,
  )

  useEffect(() => {
    if (worldReady) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const promote = () => {
      if (timer || cancelled) return
      timer = setTimeout(() => {
        if (cancelled) return
        console.log('[Creatures] world splat ready, mounting GLBs')
        setWorldReady(true)
      }, STARTUP_GRACE_MS)
    }

    // Synchronous check — covers the case where the splat is
    // already loaded before this effect runs (e.g. HMR after an
    // initial successful load).
    if (getActiveSplatMesh()) {
      promote()
    }
    const unsubscribe = subscribeActiveSplatMesh((mesh) => {
      if (mesh) promote()
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [worldReady])

  if (!worldReady) return null

  return (
    <>
      {CREATURE_CONFIGS.map((config) => (
        <CreatureInstance key={config.slug} config={config} />
      ))}
    </>
  )
}
