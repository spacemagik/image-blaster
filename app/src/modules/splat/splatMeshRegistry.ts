/**
 * Tiny pub/sub for the currently mounted world `SplatMesh`.
 *
 * Lives in its own data-only module (NOT inside `SplatRenderer.tsx`) for the
 * same reason `wizardFeetPos` does — React Fast Refresh refuses to HMR-update
 * a component file that also exports non-component values, and silently
 * forces a full re-mount of every consumer (including SplatRenderer itself),
 * which during the swap briefly leaves the scene with two SparkRenderers and
 * can wedge Spark's WASM splat sorter.
 *
 * Consumers that want to drive Spark `worldModifier` / `objectModifier`
 * effects against the active world splat (the portal twist is the first
 * example) subscribe here instead of reaching into SplatRenderer's ref tree.
 * That keeps SplatRenderer ignorant of every downstream effect and means
 * the active splat is always live at a known module-level address.
 *
 * Lifecycle contract:
 *   - `SplatRenderer` calls `setActiveSplatMesh(mesh)` after the mesh's
 *     `initialized` promise resolves (so consumers don't try to compile a
 *     dyno pipeline against a mesh whose splat source is still loading).
 *   - `SplatRenderer` calls `setActiveSplatMesh(null)` on unmount / URL
 *     change so consumers can detach their modifiers cleanly.
 *   - Listeners receive the current value immediately via `getActiveSplatMesh`
 *     after subscribing; React effects typically just call both
 *     `getActiveSplatMesh()` + `subscribeActiveSplatMesh()` in the same tick.
 */
import type { SplatMesh } from '@sparkjsdev/spark'

type Listener = (mesh: SplatMesh | null) => void

let activeMesh: SplatMesh | null = null
const listeners = new Set<Listener>()

export function setActiveSplatMesh(mesh: SplatMesh | null): void {
  if (activeMesh === mesh) return
  activeMesh = mesh
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as { __splatMesh: SplatMesh | null }).__splatMesh = mesh
  }
  for (const cb of listeners) cb(mesh)
}

export function getActiveSplatMesh(): SplatMesh | null {
  return activeMesh
}

/**
 * Subscribe to mount/unmount of the world `SplatMesh`. Returns the
 * unsubscribe function. Callbacks fire on every change, NOT on initial
 * subscription — consumers should also call `getActiveSplatMesh()` once
 * synchronously to pick up the value if the mesh is already live.
 */
export function subscribeActiveSplatMesh(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
