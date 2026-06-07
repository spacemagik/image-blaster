/**
 * playerPositionRegistry — a module-level "where is the wizard right
 * now" channel, written by WizardController each frame, read by any
 * scene module that needs to react to player movement.
 *
 * Why a registry instead of:
 *   • Passing a ref through React props: would force every component
 *     in the tree that wants player position to receive it explicitly,
 *     and the WizardController is mounted DEEP inside <Canvas> while
 *     consumers (TeleportTrigger, future AI triggers, ambient sound
 *     panners) are scattered.
 *   • A React Context: would re-render every consumer on every frame
 *     update if exposed reactively, OR add the same indirection as
 *     this module without the per-frame cheapness.
 *   • A Zustand store: would force `set()` calls 60×/sec, which IS
 *     fine for Zustand's perf but still allocates more than a direct
 *     vec3.copy(). We don't need any change-detection semantics here
 *     because consumers also read in their own useFrame loops.
 *
 * Pattern: a single mutable THREE.Vector3 the WizardController mutates
 * in-place each frame, plus a flag to distinguish "not yet set" from
 * "0,0,0". Reads return a reference to the live vector — callers must
 * NOT mutate it; they should `.copy()` into their own scratch vec3.
 *
 * Lifecycle:
 *   - Reset on WizardController unmount (e.g. when switching worlds)
 *     so a stale position from the previous world can't trigger a
 *     mistaken collision in the new world.
 */
import * as THREE from 'three'

const _playerPos = new THREE.Vector3()
let _hasPosition = false

/**
 * Update the registry from the WizardController. Pass in the world-
 * space position you want consumers to react to — typically the
 * wizard's feet position (so AABB triggers feel like they fire when
 * the wizard's lower body enters the box, not when their head does).
 *
 * Cheap: one vec3 copy per call. Safe to call every frame.
 */
export function setPlayerWorldPosition(p: THREE.Vector3): void {
  _playerPos.copy(p)
  _hasPosition = true
}

/**
 * Returns a reference to the live position vector, or `null` if the
 * WizardController hasn't reported a position yet (first few frames
 * of a world load, or no character mounted).
 *
 * Callers MUST treat the return as read-only — if you mutate it
 * you'll corrupt every other consumer's read this frame. Always
 * `.copy()` into your own scratch vec3 before doing math.
 */
export function getPlayerWorldPosition(): THREE.Vector3 | null {
  return _hasPosition ? _playerPos : null
}

/**
 * Clears the registry. Call from WizardController's cleanup so a
 * world switch starts with no stale position. Cheap — just flips
 * the readiness flag; the underlying vector is reused.
 */
export function clearPlayerWorldPosition(): void {
  _hasPosition = false
}
