/**
 * TeleportTrigger — an invisible (or wireframe-debug) axis-aligned box
 * placed in world space that, when the wizard's feet enter it, calls
 * `setLocation('/<targetSlug>')` to swap the active world.
 *
 * The mechanism deliberately reuses the existing `:slug` wouter route
 * in App.tsx — every world is already addressable as `/<slug>`, and
 * changing the URL is what triggers React to unmount the old world's
 * splat / creatures / audio and mount the new one. We don't try to
 * keep both worlds in memory simultaneously: the active SPZ is 350+
 * MB and Spark's WASM decoder runs out of room if asked to hold two
 * of them. The route-based teardown is the cleanest way to free the
 * old world's VRAM before allocating the new one's.
 *
 * Why an AABB instead of a Rapier sensor:
 *   The check is "is point inside box" — three subtract-and-compare
 *   tests per frame. Hooking it through Rapier would mean creating a
 *   sensor collider, registering it with the wizard's RigidBody
 *   group, listening to `onIntersectionEnter`, and dealing with the
 *   tick ordering between Rapier's step and our own onIntersection
 *   debounce. For a one-shot "enter to teleport" the manual AABB is
 *   simpler and the player-position registry (`setPlayerWorldPosition`
 *   in WizardController) already publishes the data we need.
 *
 * Components mounted:
 *
 *   <group ref={proxy}>             ← gizmo target (TRS = box centre + scale)
 *     <mesh wireframe?            ← debug visualizer, gated on teleportShowDebug
 *           visible=teleportEnabled+teleportShowDebug>
 *       <boxGeometry args={[1,1,1]}/>
 *     </mesh>
 *   </group>
 *   <TransformControls object={proxy} mode={…} ?onChange/>
 *
 * useFrame:
 *   1. Pull live tuning values from the store (cheap — selectors).
 *   2. Read player feet position from playerPositionRegistry.
 *   3. AABB inside test on each axis.
 *   4. Edge-triggered fire: only call setLocation when the player
 *      transitions from outside → inside. We also skip if the user
 *      is currently dragging the trigger via the gizmo (otherwise
 *      dragging the box onto the player would teleport instantly).
 *
 * Fire-once latch:
 *   After firing, we set `firedRef.current = true` and don't reset
 *   it. The route change unmounts this component anyway (WorldViewer
 *   re-mounts on slug change), so the latch is effectively cleared
 *   by remount. The latch protects against the (rare) case where
 *   wouter's setLocation completes synchronously but the unmount is
 *   still queued for the next React commit and useFrame might fire
 *   again with stale state.
 */
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { useLocation } from 'wouter'
import * as THREE from 'three'
import { useWizardTuning } from '../character/wizardTuning'
import { getPlayerWorldPosition } from '../character/playerPositionRegistry'

const ignoreRaycast: THREE.Object3D['raycast'] = () => {}

export function TeleportTrigger() {
  // Subscribing to discrete fields (rather than the whole store) so
  // unrelated changes (e.g. moving a creature) don't re-render this
  // component. The per-frame TRS reads happen inside useFrame via
  // useWizardTuning.getState() — those don't subscribe at all.
  const enabled = useWizardTuning((s) => s.teleportEnabled)
  const showDebug = useWizardTuning((s) => s.teleportShowDebug)
  const gizmoEnabled = useWizardTuning((s) => s.teleportGizmoEnabled)
  const gizmoMode = useWizardTuning((s) => s.teleportGizmoMode)
  // Target slug is read inside useFrame via getState() — no need to
  // subscribe here. The reactive read would just cause a re-render
  // every time the user typed in the slug input field.

  // The proxy group needs to be in component state (not just a ref)
  // so <TransformControls object={…}/> can react to its mount —
  // passing a ref's `.current` to a prop is the classic R3F foot-
  // gun (React only reads it on first render, never updates).
  const [proxy, setProxy] = useState<THREE.Group | null>(null)

  // useLocation gives [currentLocation, setLocation]. We compare
  // `currentLocation` against the target slug for two reasons:
  //   1. As a render-time short-circuit: if we're already on the
  //      target route, the trigger has nothing useful to do (a
  //      successful teleport leaves no return-trip), so we just
  //      return null and skip mounting any geometry or gizmo. This
  //      keeps the cyan debug box and TransformControls out of the
  //      hell-cave scene where they'd be visual noise.
  //   2. As a defensive guard inside useFrame, in case the route
  //      changes mid-frame and we haven't been unmounted yet.
  const [currentLocation, setLocation] = useLocation()
  const targetSlug = useWizardTuning((s) => s.teleportTargetSlug)
  // Trim slashes; wouter gives "/hell-cave" but the slug is "hell-cave".
  const currentSlug = currentLocation.replace(/^\/+/, '').split('/')[0] ?? ''
  const alreadyInTargetWorld = currentSlug === targetSlug

  // Fired latch — true once the trigger has fired this mount. Cleared
  // by remount (route change), not by leaving the box, so a single
  // walk-into can't bounce-fire multiple times.
  const firedRef = useRef(false)

  // Drag latch — true while the user is dragging the gizmo. Prevents
  // the trigger from firing as a side effect of placing the box on
  // the player. Cleared on mouseup.
  const draggingRef = useRef(false)

  // Armed latch — the trigger may only fire once the player has been
  // observed OUTSIDE the box at least once. This makes the fire a true
  // edge-trigger (outside → inside) rather than a level-trigger. Without
  // it, if the trigger box overlaps the spawn point (or the wizard's
  // fall path from spawnFeetY passes through the AABB), the player gets
  // teleported away the instant the world loads and can never actually
  // start in this world. Cleared by remount, re-armed on first outside
  // frame.
  const armedRef = useRef(false)

  // Sync proxy transform from store when not being dragged. (When
  // dragging, the gizmo owns the transform and we write back to the
  // store via `onObjectChange`.) Reads position + halfSize → scale.
  useFrame(() => {
    if (!proxy) return
    if (!draggingRef.current) {
      const t = useWizardTuning.getState()
      proxy.position.set(t.teleportPosX, t.teleportPosY, t.teleportPosZ)
      // Box geometry is 1×1×1 (see <boxGeometry args={[1,1,1]}/> in
      // the JSX); scale to (2 × halfSize) so the visible / collidable
      // edge length matches the AABB test below.
      const edge = Math.max(0.1, t.teleportHalfSize * 2)
      proxy.scale.setScalar(edge)
    }
    if (!enabled) return
    if (firedRef.current) return
    if (draggingRef.current) return

    const playerPos = getPlayerWorldPosition()
    if (!playerPos) return

    // AABB inside test using `teleportHalfSize` directly so a gizmo-
    // driven proxy.scale (which we wrote in store-sync above) doesn't
    // become the source of truth and accumulate float drift.
    const t = useWizardTuning.getState()
    const dx = Math.abs(playerPos.x - t.teleportPosX)
    const dy = Math.abs(playerPos.y - t.teleportPosY)
    const dz = Math.abs(playerPos.z - t.teleportPosZ)
    const h = t.teleportHalfSize
    const inside = dx < h && dy < h && dz < h
    if (!inside) {
      // First (and every) frame the player is outside the box arms the
      // trigger. Until this happens at least once, an inside reading is
      // treated as "spawned inside" and ignored.
      armedRef.current = true
      return
    }
    // Inside, but not yet armed → player spawned inside (or fell through
    // the box). Don't fire; wait until they leave and come back.
    if (!armedRef.current) return

    // If we're somehow already on the target route, don't re-navigate
    // (some routers treat a navigate-to-same as a no-op + remount;
    // wouter doesn't but the explicit guard is cheap insurance).
    const targetPath = '/' + t.teleportTargetSlug
    if (currentLocation === targetPath) return

    firedRef.current = true
    console.log(
      `[TeleportTrigger] wizard entered AABB at ` +
      `(${t.teleportPosX.toFixed(1)}, ${t.teleportPosY.toFixed(1)}, ${t.teleportPosZ.toFixed(1)})` +
      `, navigating to ${targetPath}`,
    )
    setLocation(targetPath)
  })

  // Mirror gizmo edits back to the persisted store. TransformControls
  // mutates the proxy directly; this callback fires on every drag
  // frame. We write position and (for scale mode) recompute halfSize
  // from the proxy's uniform scale so the AABB test stays consistent.
  const handleGizmoChange = () => {
    if (!proxy) return
    // Box mesh args are [1,1,1], so proxy.scale.x IS the edge length.
    // halfSize = edge / 2.
    const edge = Math.max(0.1, proxy.scale.x)
    useWizardTuning.getState().setTuning({
      teleportPosX: proxy.position.x,
      teleportPosY: proxy.position.y,
      teleportPosZ: proxy.position.z,
      teleportHalfSize: edge / 2,
    })
  }

  // Reset the fired latch if teleport is toggled off then on, so the
  // user can re-test placement without remounting the whole world.
  useEffect(() => {
    if (!enabled) {
      firedRef.current = false
      armedRef.current = false
    }
  }, [enabled])

  // Don't render anything in the target world — the trigger has no
  // job here and the box/gizmo would just be visual clutter.
  // (Hooks above this early return are still called every render.)
  if (alreadyInTargetWorld) return null

  return (
    <>
      <group ref={setProxy}>
        {/* Wireframe + translucent fill box. visible only when both
         *  teleport is enabled AND the user wants to SEE the trigger
         *  (placement mode). In normal play they'd flip showDebug off
         *  so the box is invisible while still active. raycast is
         *  suppressed so clicks pass through to the world / character
         *  controls. */}
        <mesh visible={enabled && showDebug} raycast={ignoreRaycast}>
          <boxGeometry args={[1, 1, 1]} />
          {/* Two-pass shading would be nicer (outline + fill) but
           *  costs more draw calls; a single transparent material
           *  with `wireframe: false` + low alpha reads as a soft
           *  ghosted volume against the splat. The cyan colour
           *  matches the cosmic-swirl crystal accents so the
           *  trigger reads as "portal-related". */}
          <meshBasicMaterial
            color={'#5cd1ff'}
            transparent
            opacity={0.18}
            depthWrite={false}
          />
        </mesh>
        {/* Wireframe overlay for a crisper outline. Same edge length,
         *  but drawn with `wireframe: true` so the user can clearly
         *  see the AABB bounds even if the fill is mostly hidden by
         *  splats behind it. Higher opacity for visibility. */}
        <mesh visible={enabled && showDebug} raycast={ignoreRaycast}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            color={'#aef3ff'}
            wireframe
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </mesh>
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
