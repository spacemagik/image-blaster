import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useWizardTuning } from '../character/wizardTuning'
import { wizardFeetPos } from '../character/wizardState'
import { Sparkle } from '../splat/sparkle'

/**
 * SparkleScene — mounts a Spark 2.1 particle effect inside the existing R3F
 * canvas, driven entirely by the `sparkle*` fields in `wizardTuning`.
 *
 * Architecture notes:
 *
 *   ┌──────────────────────────┐    setPosition()
 *   │ Proxy <group> (R3F tree) │───────────────────► Sparkle effect (THREE.Scene)
 *   │  • TransformControls     │    setOpacity()
 *   │  • wireframe box helper  │   (no parent juggling on rebuild)
 *   └──────────────────────────┘
 *
 *   The gizmo is **never** attached to the snow Object3D directly. The snow
 *   gets removed/re-added on every shape change (preset, colour, density,
 *   radius, height, motion), which orphans the Object3D for one render and
 *   makes three.js' TransformControls log "must be a part of the scene
 *   graph". By attaching the gizmo to a long-lived proxy <group> in the R3F
 *   tree we avoid that race entirely.
 *
 * Lifecycle:
 *   - On mount: instantiates a `Sparkle` instance that owns its own
 *     `SparkRenderer` (separate from the world splat's).
 *   - On any *shape* change: full rebuild (Sparkle exposes no live setters).
 *   - On position-only change (slider OR gizmo translate): `setPosition`.
 *   - On opacity-only change: `setOpacity`.
 *   - On unmount: `dispose()` clears the effect + removes the SparkRenderer.
 *
 * Gizmo modes:
 *   - `translate` → live: writes proxy.position to store every onObjectChange.
 *   - `rotate`    → live: rotates the canonical (0,1,0) fall vector by the
 *                   proxy's quaternion and stores into sparkleFallDir{X,Y,Z}.
 *   - `scale`     → drag-end only: reads proxy.scale, maps X/Z → radius and
 *                   Y → height, resets proxy.scale to (1,1,1), then lets the
 *                   rebuild useEffect re-spawn at the new dimensions. We
 *                   defer to mouseUp because rebuilds-per-frame would tank
 *                   FPS and re-spawn every particle on every mouse delta.
 */
export function SparkleScene() {
  const enabled = useWizardTuning((s) => s.sparkleEnabled)
  const preset = useWizardTuning((s) => s.sparklePreset)
  const posX = useWizardTuning((s) => s.sparklePosX)
  const posY = useWizardTuning((s) => s.sparklePosY)
  const posZ = useWizardTuning((s) => s.sparklePosZ)
  const radius = useWizardTuning((s) => s.sparkleRadius)
  const height = useWizardTuning((s) => s.sparkleHeight)
  const density = useWizardTuning((s) => s.sparkleDensity)
  const maxSplats = useWizardTuning((s) => s.sparkleMaxSplats)
  const opacity = useWizardTuning((s) => s.sparkleOpacity)
  const minScale = useWizardTuning((s) => s.sparkleMinScale)
  const maxScale = useWizardTuning((s) => s.sparkleMaxScale)
  const color1 = useWizardTuning((s) => s.sparkleColor1)
  const color2 = useWizardTuning((s) => s.sparkleColor2)
  const fallVel = useWizardTuning((s) => s.sparkleFallVelocity)
  const wanderScale = useWizardTuning((s) => s.sparkleWanderScale)
  const wanderVar = useWizardTuning((s) => s.sparkleWanderVariance)
  const dirX = useWizardTuning((s) => s.sparkleFallDirX)
  const dirY = useWizardTuning((s) => s.sparkleFallDirY)
  const dirZ = useWizardTuning((s) => s.sparkleFallDirZ)
  const gizmoEnabled = useWizardTuning((s) => s.sparkleGizmoEnabled)
  const gizmoMode = useWizardTuning((s) => s.sparkleGizmoMode)
  const showBox = useWizardTuning((s) => s.sparkleShowBox)
  const followCharacter = useWizardTuning((s) => s.sparkleFollowCharacter)
  // Stash latest follow mode in a ref so useFrame (which doesn't re-bind on
  // re-render) always sees the current value without forcing a remount.
  const followCharacterRef = useRef(followCharacter)
  useEffect(() => {
    followCharacterRef.current = followCharacter
  }, [followCharacter])

  // We intentionally only need `scene` — Sparkle piggy-backs on the world
  // splat's existing SparkRenderer (the one mounted by SplatRenderer) instead
  // of constructing a second one. Two SparkRenderers on the same scene both
  // traverse every SplatGenerator each frame, double-driving Spark's WASM
  // sorter/LoD state and triggering "Error: unreachable" traps that nuke the
  // entire SPZ from view. See sparkle.ts SparkleOptions doc-block for details.
  const { scene } = useThree()
  const sparkleRef = useRef<Sparkle | null>(null)
  const effectIdRef = useRef<number | null>(null)
  // Use state instead of a ref so <TransformControls> re-renders with the
  // group reference once it's actually mounted.
  const [proxy, setProxy] = useState<THREE.Group | null>(null)
  // Snapshot of where the gizmo is dragging FROM — used so the position
  // useEffect below doesn't fight the user mid-drag.
  const draggingRef = useRef(false)

  // Reusable wireframe-box helper — unit box, scaled at render time by
  // (radius*2, height*2, radius*2) so plane-like slabs read clearly.
  // Unit geometry + scale (not per-size buffer rebuild) keeps re-sizing
  // to a single matrix update.
  const boxEdgeGeometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), [])
  const boxMaterial = useMemo(
    () => new THREE.LineBasicMaterial({
      color: 0xff9bd1,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    }),
    [],
  )
  useEffect(() => () => {
    boxEdgeGeometry.dispose()
    boxMaterial.dispose()
  }, [boxEdgeGeometry, boxMaterial])

  // ── Sparkle instance lifecycle. One per scene; reuses the existing
  // SparkRenderer mounted by SplatRenderer (no `renderer` arg here on purpose).
  useEffect(() => {
    sparkleRef.current = new Sparkle({ scene })
    return () => {
      sparkleRef.current?.dispose()
      sparkleRef.current = null
      effectIdRef.current = null
    }
  }, [scene])

  // ── Shape rebuild on any non-position / non-opacity change. ───────────────
  useEffect(() => {
    const sparkle = sparkleRef.current
    if (!sparkle) return
    if (effectIdRef.current !== null) {
      sparkle.removeEffect(effectIdRef.current)
      effectIdRef.current = null
    }
    if (!enabled) return

    effectIdRef.current = sparkle.addEffect(preset, {
      position: new THREE.Vector3(posX, posY, posZ),
      radius,
      height,
      density,
      maxSplats,
      opacity,
      minScale,
      maxScale,
      color1: new THREE.Color(color1[0], color1[1], color1[2]),
      color2: new THREE.Color(color2[0], color2[1], color2[2]),
      fallVelocity: fallVel,
      wanderScale,
      wanderVariance: wanderVar,
      fallDirection: new THREE.Vector3(dirX, dirY, dirZ),
    })
    // Position / opacity / fall direction / fall velocity intentionally
    // excluded from deps — they're handled by the cheap-setters below (or
    // overwritten live each frame by the counter-drift useFrame for
    // fallDir / fallVel) so dragging doesn't trigger a full rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    preset,
    radius,
    height,
    density,
    maxSplats,
    minScale,
    maxScale,
    color1,
    color2,
    wanderScale,
    wanderVar,
  ])

  // ── Cheap position update on slider drag — only used when NOT following
  // the character. In follow mode the per-frame loop below owns the position
  // (otherwise this useEffect would fight wizardFeetPos every render).
  // Skipped mid-gizmo-drag so we don't yank the proxy out from under the user.
  useEffect(() => {
    if (followCharacter) return
    const sparkle = sparkleRef.current
    const id = effectIdRef.current
    if (!sparkle || id === null) return
    if (!draggingRef.current && proxy) {
      proxy.position.set(posX, posY, posZ)
    }
    sparkle.setPosition(id, new THREE.Vector3(posX, posY, posZ))
  }, [posX, posY, posZ, proxy, followCharacter])

  // ── Per-frame motion loop. Two independent layers run every frame:
  //
  //   1. SPAWN-BOX transform (`snow.position`) snaps to the player (or lerps,
  //      if `sparkleFollowSmoothing > 0`) when `followCharacter` is on so
  //      we always have particles around them. Skipped when off — the user
  //      placed the slab manually and wants it to stay put.
  //   2. PARTICLE drift inside the box is force-overridden every frame to
  //      cancel the box's translation in world space. Without (2),
  //      translating the box by Δ each frame translates all 8K particles
  //      by Δ too — which reads as fake "snow-globe glued to the player"
  //      motion. With (2) the particles only show their natural drift
  //      (the GUI's Fall direction × velocity); the spawn box quietly
  //      slides under them.
  //
  //      Math: snowBox renders each particle at
  //        world = snow.position + min + (max-min) * mod(hash + globalOffset, 1)
  //      and advances globalOffset += fallDir × fallVel × dt. So:
  //        d(world)/dt = d(snow.position)/dt + (max-min) × fallDir × fallVel
  //      Want d(world)/dt = naturalWorldDrift, so:
  //        effective worldDrift to pass = naturalWorldDrift − boxVelocity
  //      and `Sparkle.setEffectiveDrift` does the divide-by-box-size + dyno
  //      write. Always running this override (even when not following) is
  //      idempotent — `boxVelocity` is zero when the box is stationary, so
  //      the override just re-writes the natural drift each frame.
  //      Bonus: this means the user's GUI fall-dir / fall-vel sliders take
  //      effect on the very next frame without rebuilding the effect.
  //
  //   Smoothing only affects layer (1); layer (2) tracks whatever actual
  //   velocity the box ends up with each frame (snap → instantaneous,
  //   smoothed → eased), so the cancellation stays correct either way.
  const _targetPos = useRef(new THREE.Vector3()).current
  const _prevBoxPos = useRef<THREE.Vector3 | null>(null)
  const _boxVel = useRef(new THREE.Vector3()).current
  const _naturalDrift = useRef(new THREE.Vector3()).current
  const _worldDrift = useRef(new THREE.Vector3()).current
  useFrame((_, dt) => {
    const sparkle = sparkleRef.current
    const id = effectIdRef.current
    if (!sparkle || id === null) return
    if (draggingRef.current) return
    const t = useWizardTuning.getState()

    // ── Layer 1: optional follow ──────────────────────────────────────────
    if (followCharacterRef.current && proxy) {
      _targetPos.set(
        wizardFeetPos.x + posX,
        wizardFeetPos.y + posY,
        wizardFeetPos.z + posZ,
      )
      const tau = t.sparkleFollowSmoothing
      if (tau > 0 && dt > 0) {
        const alpha = 1 - Math.exp(-dt / tau)
        proxy.position.lerp(_targetPos, alpha)
      } else {
        proxy.position.copy(_targetPos)
      }
      sparkle.setPosition(id, proxy.position)
    }

    // ── Layer 2: counter-translate particles so they stay in world space ─
    // Read the live box position. In follow mode this is the (possibly
    // smoothed) follow target; otherwise it's wherever the gizmo / sliders
    // last placed it. We re-derive box velocity from frame-to-frame deltas
    // rather than reading any "intended" velocity, so manual gizmo drags
    // also get cancelled out cleanly.
    const boxPos = proxy ? proxy.position : _targetPos
    if (!_prevBoxPos.current) {
      // First frame: seed previous so boxVel doesn't spike from a
      // "snap-from-origin" delta and briefly hurl the particles backwards.
      _prevBoxPos.current = boxPos.clone()
      _boxVel.set(0, 0, 0)
    } else if (dt > 0) {
      _boxVel.copy(boxPos).sub(_prevBoxPos.current).divideScalar(dt)
      _prevBoxPos.current.copy(boxPos)
    }

    // GUI sliders write raw direction values that may not be unit length;
    // normalise so magnitude semantics match the snowBox presets (where
    // direction is unit and fallVelocity carries the speed).
    _naturalDrift.set(t.sparkleFallDirX, t.sparkleFallDirY, t.sparkleFallDirZ)
    const naturalLen = _naturalDrift.length()
    if (naturalLen > 1e-9) _naturalDrift.divideScalar(naturalLen)

    // naturalWorldDrift = boxSize × natural_dyno_drift. We then subtract
    // boxVel to cancel the spawn-box translation, and hand the result to
    // Sparkle which converts back to dyno space (dividing by boxSize)
    // before writing fallDirection × fallVelocity.
    const fallVelLive = t.sparkleFallVelocity
    const bx = t.sparkleRadius * 2
    const by = t.sparkleHeight * 2
    const bz = t.sparkleRadius * 2
    _worldDrift.set(
      _naturalDrift.x * fallVelLive * bx - _boxVel.x,
      _naturalDrift.y * fallVelLive * by - _boxVel.y,
      _naturalDrift.z * fallVelLive * bz - _boxVel.z,
    )
    sparkle.setEffectiveDrift(id, _worldDrift)
  })

  // ── Cheap opacity update on slider drag. ──────────────────────────────────
  useEffect(() => {
    const sparkle = sparkleRef.current
    const id = effectIdRef.current
    if (!sparkle || id === null) return
    sparkle.setOpacity(id, opacity)
  }, [opacity])

  // ── Seed proxy transform once it mounts so the gizmo grabs the right spot.
  // In follow mode the per-frame loop will overwrite this on its first tick,
  // so the initial value just has to be non-NaN; setting it explicitly avoids
  // a one-frame flash at world origin.
  useEffect(() => {
    if (!proxy) return
    if (followCharacter) {
      proxy.position.set(
        wizardFeetPos.x + posX,
        wizardFeetPos.y + posY,
        wizardFeetPos.z + posZ,
      )
    } else {
      proxy.position.set(posX, posY, posZ)
    }
    // Intentionally only on proxy mount — subsequent slider drags handled
    // by the position useEffect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxy])

  // ── Live gizmo updates ────────────────────────────────────────────────────
  const handleGizmoChange = () => {
    if (!proxy) return
    if (gizmoMode === 'translate') {
      const sparkle = sparkleRef.current
      const id = effectIdRef.current
      if (sparkle && id !== null) sparkle.setPosition(id, proxy.position)
      // In follow mode the proxy position is `feet + offset`, so we subtract
      // feet back out to get the offset the user actually dialed in. Without
      // this, dragging the gizmo 5m forward would write 5m as an *absolute*
      // and then next frame the follow loop would re-add feet on top —
      // making the slab teleport to feet+player+5m and runaway-drift.
      if (followCharacterRef.current) {
        useWizardTuning.getState().setTuning({
          sparklePosX: proxy.position.x - wizardFeetPos.x,
          sparklePosY: proxy.position.y - wizardFeetPos.y,
          sparklePosZ: proxy.position.z - wizardFeetPos.z,
        })
      } else {
        useWizardTuning.getState().setTuning({
          sparklePosX: proxy.position.x,
          sparklePosY: proxy.position.y,
          sparklePosZ: proxy.position.z,
        })
      }
    } else if (gizmoMode === 'rotate') {
      const v = new THREE.Vector3(0, 1, 0).applyQuaternion(proxy.quaternion)
      useWizardTuning.getState().setTuning({
        sparkleFallDirX: v.x,
        sparkleFallDirY: v.y,
        sparkleFallDirZ: v.z,
      })
    }
    // Scale committed on drag-end only — see handleDraggingChanged below.
  }

  // ── drei's `dragging-changed` fires true when grabbed, false on release.
  // We use this both to suppress the slider→proxy sync and to commit the
  // scale gesture in one shot. ─────────────────────────────────────────────
  const handleDraggingChanged = (event: { value: boolean }) => {
    draggingRef.current = event.value
    if (event.value || !proxy) return // grabbed — nothing to commit yet
    if (gizmoMode === 'scale') {
      // Split: average X/Z → horizontal radius; Y → vertical height. This
      // matches the slab-shaped helper — grabbing Y alone thickens/thins
      // the curtain, grabbing X or Z (or uniform) widens it.
      const radiusFactor = (proxy.scale.x + proxy.scale.z) / 2
      const heightFactor = proxy.scale.y
      const newRadius = Math.max(0.05, radius * radiusFactor)
      const newHeight = Math.max(0.05, height * heightFactor)
      proxy.scale.set(1, 1, 1)
      useWizardTuning.getState().setTuning({
        sparkleRadius: newRadius,
        sparkleHeight: newHeight,
      })
    } else if (gizmoMode === 'rotate') {
      // Visual rotation is "consumed" — we've already written the new fall
      // direction into the store, so reset the proxy to identity. Otherwise
      // chained rotates would compound on top of the last orientation.
      proxy.rotation.set(0, 0, 0)
      proxy.quaternion.identity()
    }
  }

  return (
    <>
      <group ref={setProxy}>
        {showBox && (
          <lineSegments scale={[radius * 2, height * 2, radius * 2]} renderOrder={9999}>
            <primitive object={boxEdgeGeometry} attach="geometry" />
            <primitive object={boxMaterial} attach="material" />
          </lineSegments>
        )}
      </group>
      {gizmoEnabled && proxy && (
        <TransformControls
          object={proxy}
          mode={gizmoMode}
          onObjectChange={handleGizmoChange}
          onMouseUp={() => handleDraggingChanged({ value: false })}
          onMouseDown={() => handleDraggingChanged({ value: true })}
        />
      )}
    </>
  )
}
