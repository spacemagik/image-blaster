/**
 * WizardController — third-person KCC + animated character.
 *
 * Ported from the vanilla-Three.js + raw-Rapier template at
 * https://github.com/icurtis1/third-person-controller-splat (MIT) onto image-blaster's
 * react-three-fiber + @react-three/rapier stack. The physics core (kinematic capsule body
 * driven by a Rapier KinematicCharacterController with autostep + snap-to-ground) and
 * animation state machine (smoothed grounded + smoothed horizontal speed selecting between
 * idle/walk/run/fall, with crossfaded one-shot actions on 'F' (pick) and 'E' (heal))
 * mirror that reference, adapted to expose an .reset() handle compatible with the
 * existing CharacterController.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { isEditableTarget } from '../../utils/dom'
import { useWizardTuning } from './wizardTuning'
// `wizardFeetPos` lives in its own data-only module so React Fast Refresh can
// HMR this component without invalidating every consumer (Sparkle, Lighting,
// etc.). Do NOT re-export it from here — mixing a non-component export into a
// component file brings back vite-plugin-react's "incompatible export" warning
// and the cascading invalidations that come with it.
import { wizardFeetPos } from './wizardState'

const WIZARD_URL = '/silo.glb'

const CLIP_IDLE = 'idle'
const CLIP_WALK = 'walk'
const CLIP_RUN = 'run'
const CLIP_FALL = 'fall'
const CLIP_PICK = 'pick'
const CLIP_HEAL = 'heal'
const ONE_SHOT_CLIPS = [CLIP_PICK, CLIP_HEAL] as const
type OneShotName = (typeof ONE_SHOT_CLIPS)[number]

const CAPSULE_RADIUS = 0.28
const CAMERA_INITIAL_DISTANCE = 3.5
const CAMERA_MIN_DISTANCE = 1.2
const CAMERA_MAX_DISTANCE = 12
// Vertical position of the orbit target along the wizard's height
// (0 = feet, 1 = crown of head). Was 0.7 (chest) which framed the
// character with feet visible at the bottom of the screen; bumped to
// 0.85 (~upper chest / neck) so the default sight-line lands higher
// on the model and the feet drop out of the default framing. Manual
// camera tilt still works (see CAMERA_MAX_POLAR_ANGLE) — this just
// makes the *out-of-the-box* shot feel right without the user having
// to drag every time.
const CAMERA_TARGET_HEIGHT_FRACTION = 0.85
// Minimum camera-Y headroom above the character's feet altitude.
// Enforced every frame by:
//   1. Tightening `orbit.maxPolarAngle` so the orbit sphere itself
//      cannot tilt to a polar angle that would push the camera
//      below feet + margin (analytic from spherical coords:
//      `cosθ_max = (floor − target.y) / R`).
//   2. A post-update `camera.position.y = max(…, floor + margin)`
//      safety clamp for edge cases (e.g. floor altitude jumping
//      between frames while the user isn't dragging).
// 0.3 m keeps the lens out of the dirt at the lowest tilt while
// still permitting an aggressive low-angle "look up at the wizard's
// face" shot the user asked for in the previous turn.
const CAMERA_FLOOR_MARGIN = 0.3
const CAMERA_MAX_POLAR_ANGLE = Math.PI / 2 + 0.6
const ONE_SHOT_DEFAULT_DURATION = 1.6
const MAX_SLOPE_CLIMB_RAD = (50 * Math.PI) / 180
const MIN_SLOPE_SLIDE_RAD = (25 * Math.PI) / 180

// ── Jump feel ──────────────────────────────────────────────────────────
// Both windows are deliberately wider than a single 60 Hz frame
// (≈ 16.7 ms) so the standard "tap space, jump immediately" reflex
// always lands a jump — and a press just BEFORE touching down buffers
// into a jump on landing instead of being silently dropped.
//
// JUMP_BUFFER_MS: how long after a Space keydown the request stays
//   valid. With state-tracked jump (old behaviour) a quick tap could
//   set jump=true and then jump=false again BEFORE the next useFrame
//   ran — meaning the player had to hold space across a frame boundary
//   for the jump to register. Now we record the press timestamp and
//   consume any request that's at most this old.
//
// COYOTE_TIME_MS: how long after LEAVING the ground the player can
//   still jump. Standard platformer affordance for walking off a
//   ledge — without it, pressing space ~1 frame too late after an
//   edge feels broken even though the input was barely off.
const JUMP_BUFFER_MS = 150
const COYOTE_TIME_MS = 100

function capsuleHalfHeight(height: number) {
  return Math.max(height / 2 - CAPSULE_RADIUS, 0.01)
}

function capsuleCenterY(height: number) {
  return capsuleHalfHeight(height) + CAPSULE_RADIUS
}

export interface WizardControllerHandle {
  reset: () => void
}

type AnimName = 'idle' | 'walk' | 'run' | 'fall' | OneShotName

interface CharacterPhysicsState {
  desiredVelocity: THREE.Vector3
  linearVelocity: THREE.Vector3
  grounded: boolean
  allowSliding: boolean
  /** perf.now() timestamp of the most recent frame the controller
   *  reported `grounded === true`. Used with COYOTE_TIME_MS to allow
   *  a jump for a brief window after walking off a ledge. Updated
   *  every frame the character is grounded; read every frame to
   *  decide whether the coyote affordance still applies. */
  lastGroundedAt: number
}

const _move = new THREE.Vector3()
const _verticalVel = new THREE.Vector3()
const _gravity = new THREE.Vector3()
const _newVel = new THREE.Vector3()
const _camFwd = new THREE.Vector3()
const _camRight = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
const _facing = new THREE.Vector3()
const _feet = new THREE.Vector3()
const _prevFeet = new THREE.Vector3()
const _feetDelta = new THREE.Vector3()
const _targetWorld = new THREE.Vector3()

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function lerpAngleRad(current: number, target: number, t: number) {
  return current + shortestAngleDelta(current, target) * t
}

export const WizardController = forwardRef<WizardControllerHandle>(
  function WizardController(_props, ref) {
    const { camera, gl } = useThree()
    const { world } = useRapier()
    const bodyRef = useRef<RapierRigidBody>(null)
    const orbitRef = useRef<OrbitControlsImpl>(null)
    const facingPivotRef = useRef<THREE.Group>(null)
    const meshOffsetRef = useRef<THREE.Group>(null)
    const controllerRef = useRef<ReturnType<typeof world.createCharacterController> | null>(null)

    // Subscribe only to the slice we need for re-rendering / re-creating physics on shape change.
    const dogHeight = useWizardTuning((s) => s.dogHeight)
    const spawnFeetY = useWizardTuning((s) => s.spawnFeetY)
    const resetToken = useWizardTuning((s) => s.resetToken)
    const halfHeight = capsuleHalfHeight(dogHeight)
    const centerYOffset = capsuleCenterY(dogHeight)

    const gltf = useGLTF(WIZARD_URL)

    const { model, mixer, clips } = useMemo(() => {
      const cloned = SkeletonUtils.clone(gltf.scene) as THREE.Group
      cloned.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
          mesh.frustumCulled = false
        }
      })

      // Mirror Astronaut/character-controller-final `layoutDogModel`: auto-scale, recenter
      // XZ on origin, ground Y at 0. We apply `dogYawDeg` later in useFrame so changes are
      // live without rebuilding the cloned mesh.
      cloned.position.set(0, 0, 0)
      cloned.quaternion.identity()
      cloned.scale.set(1, 1, 1)
      cloned.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(cloned)
      const meshHeight = Math.max(bounds.max.y - bounds.min.y, 1e-4)
      const scale = dogHeight / meshHeight
      cloned.scale.setScalar(scale)
      cloned.updateMatrixWorld(true)
      bounds.setFromObject(cloned)
      cloned.position.set(
        -(bounds.min.x + bounds.max.x) / 2,
        -bounds.min.y,
        -(bounds.min.z + bounds.max.z) / 2,
      )

      const mixerInstance = new THREE.AnimationMixer(cloned)
      const byName: Record<string, THREE.AnimationAction> = {}
      for (const clip of gltf.animations) {
        const action = mixerInstance.clipAction(clip)
        action.setLoop(THREE.LoopRepeat, Infinity)
        action.clampWhenFinished = false
        byName[clip.name] = action
      }
      for (const name of ONE_SHOT_CLIPS) {
        const action = byName[name]
        if (action) {
          action.setLoop(THREE.LoopOnce, 1)
          action.clampWhenFinished = true
        }
      }

      return { model: cloned, mixer: mixerInstance, clips: byName }
    }, [gltf.scene, gltf.animations, dogHeight])

    const actionFor = useCallback((name: AnimName): THREE.AnimationAction | undefined => {
      switch (name) {
        case 'idle':
          return clips[CLIP_IDLE] ?? clips[CLIP_WALK]
        case 'walk':
          return clips[CLIP_WALK] ?? clips[CLIP_IDLE]
        case 'run':
          return clips[CLIP_RUN] ?? clips[CLIP_WALK] ?? clips[CLIP_IDLE]
        case 'fall':
          return clips[CLIP_FALL] ?? clips[CLIP_IDLE]
        case 'pick':
          return clips[CLIP_PICK]
        case 'heal':
          return clips[CLIP_HEAL]
      }
    }, [clips])

    const inputRef = useRef({
      forward: false,
      back: false,
      left: false,
      right: false,
      sprint: false,
      /** perf.now() timestamp of the most recent un-consumed Space
       *  keydown, or null if no jump is pending. Frame loop reads
       *  this and fires a jump when grounded (or within coyote
       *  window) AND the request is within JUMP_BUFFER_MS. Edge-
       *  triggered on keydown (not state-tracked) so a quick tap
       *  always registers regardless of how soon it's released. */
      jumpRequestedAt: null as number | null,
    })

    const stateRef = useRef<CharacterPhysicsState>({
      desiredVelocity: new THREE.Vector3(),
      linearVelocity: new THREE.Vector3(),
      grounded: false,
      allowSliding: false,
      lastGroundedAt: 0,
    })

    const animStateRef = useRef({
      current: 'idle' as AnimName,
      stableGrounded: false,
      airAccum: 0,
      smoothedHSpeed: 0,
      oneShotEndTime: 0,
    })
    const smoothedFacingYawRef = useRef(0)
    const prevFeetSeededRef = useRef(false)

    useEffect(() => {
      const initial = actionFor('idle')
      if (initial) {
        initial.reset().setEffectiveWeight(1).play()
        animStateRef.current.current = 'idle'
      }
      return () => {
        mixer.stopAllAction()
      }
    }, [actionFor, mixer])

    useEffect(() => {
      const ctrl = world.createCharacterController(0.02)
      ctrl.setUp({ x: 0, y: 1, z: 0 })
      ctrl.setSlideEnabled(true)
      ctrl.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB_RAD)
      ctrl.setMinSlopeSlideAngle(MIN_SLOPE_SLIDE_RAD)
      ctrl.setApplyImpulsesToDynamicBodies(true)
      ctrl.setCharacterMass(80)
      controllerRef.current = ctrl
      return () => {
        try {
          world.removeCharacterController(ctrl)
        } catch {
          // Rapier world may already be tearing down on route change.
        }
        controllerRef.current = null
      }
    }, [world])

    const triggerOneShot = useCallback((name: OneShotName) => {
      const next = clips[name]
      if (!next) return
      const t = useWizardTuning.getState()
      const duration = next.getClip().duration || ONE_SHOT_DEFAULT_DURATION
      animStateRef.current.oneShotEndTime = performance.now() / 1000 + duration
      const prev = actionFor(animStateRef.current.current)
      next.reset().setEffectiveWeight(1).play()
      if (prev && prev !== next) prev.crossFadeTo(next, t.dogAnimCrossfade, false)
      animStateRef.current.current = name
    }, [actionFor, clips])

    useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
        if (isEditableTarget(event.target)) {
          inputRef.current.forward = false
          inputRef.current.back = false
          inputRef.current.left = false
          inputRef.current.right = false
          inputRef.current.sprint = false
          inputRef.current.jumpRequestedAt = null
          return
        }
        const down = event.type === 'keydown'
        switch (event.code) {
          case 'KeyW':
          case 'ArrowUp':
            inputRef.current.forward = down
            break
          case 'KeyS':
          case 'ArrowDown':
            inputRef.current.back = down
            break
          case 'KeyA':
          case 'ArrowLeft':
            inputRef.current.left = down
            break
          case 'KeyD':
          case 'ArrowRight':
            inputRef.current.right = down
            break
          case 'ShiftLeft':
          case 'ShiftRight':
            inputRef.current.sprint = down
            break
          case 'Space':
            // Edge-trigger ONLY on the initial keydown (event.repeat
            // filters out OS-level key auto-repeat) so holding space
            // doesn't queue up a stream of jumps. The frame loop
            // consumes this timestamp the next time we're grounded
            // (or within COYOTE_TIME_MS of leaving the ground)
            // PROVIDED we're still inside JUMP_BUFFER_MS — otherwise
            // it expires silently.
            if (down) {
              if (!event.repeat) inputRef.current.jumpRequestedAt = performance.now()
              event.preventDefault()
            }
            // keyup is intentionally ignored: the buffer window
            // (not the key-up edge) is what expires a stale
            // request, so a quick tap-and-release still buffers
            // into the next grounded frame.
            break
          case 'KeyF':
            if (down && !event.repeat) triggerOneShot('pick')
            break
          case 'KeyE':
            if (down && !event.repeat) triggerOneShot('heal')
            break
        }
      }
      window.addEventListener('keydown', onKey)
      window.addEventListener('keyup', onKey)
      return () => {
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('keyup', onKey)
      }
    }, [triggerOneShot])

    const reset = useCallback(() => {
      const body = bodyRef.current
      if (!body) return
      const t = useWizardTuning.getState()
      body.setTranslation(
        { x: 0, y: t.spawnFeetY + capsuleCenterY(t.dogHeight), z: 0 },
        true,
      )
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      stateRef.current.desiredVelocity.set(0, 0, 0)
      stateRef.current.linearVelocity.set(0, 0, 0)
      stateRef.current.grounded = false
      inputRef.current.forward = false
      inputRef.current.back = false
      inputRef.current.left = false
      inputRef.current.right = false
      inputRef.current.sprint = false
      inputRef.current.jumpRequestedAt = null
      stateRef.current.lastGroundedAt = 0
      prevFeetSeededRef.current = false
      animStateRef.current.smoothedHSpeed = 0
      animStateRef.current.airAccum = 0
    }, [])

    useImperativeHandle(ref, () => ({ reset }), [reset])

    // Re-fire reset when the GUI's "Reset position" button bumps the token.
    useEffect(() => {
      if (resetToken > 0) reset()
    }, [resetToken, reset])

    // After a dogHeight change re-mounts the RigidBody, drop the camera-follow seed
    // and animation state so the new spawn doesn't trigger a huge feet-delta camera jump.
    useEffect(() => {
      prevFeetSeededRef.current = false
      stateRef.current.desiredVelocity.set(0, 0, 0)
      stateRef.current.linearVelocity.set(0, 0, 0)
      stateRef.current.grounded = false
      animStateRef.current.smoothedHSpeed = 0
      animStateRef.current.airAccum = 0
      animStateRef.current.current = 'idle'
    }, [dogHeight])

    // Position the orbit camera behind the wizard on first frame so the user starts looking
    // at the back of the character rather than wherever the canvas left the camera.
    useEffect(() => {
      camera.position.set(0, spawnFeetY + dogHeight * 1.4, CAMERA_INITIAL_DISTANCE)
      const orbit = orbitRef.current
      if (orbit) {
        orbit.target.set(0, spawnFeetY + dogHeight * CAMERA_TARGET_HEIGHT_FRACTION, 0)
        orbit.update()
      }
    }, [camera, dogHeight, spawnFeetY])

    useFrame((_, dtRaw) => {
      const dt = Math.min(dtRaw, 1 / 30)
      const body = bodyRef.current
      const controller = controllerRef.current
      const state = stateRef.current
      const t = useWizardTuning.getState()
      if (!body || !controller) return

      // Apply tuning-driven KCC settings each frame so toggles in the GUI take effect live.
      if (t.enableWalkStairs) controller.enableAutostep(0.4, 0.2, true)
      else controller.disableAutostep()
      // Per-frame snap-to-ground distance + max slope, driven by the GUI. Sparse
      // collider GLBs (e.g. fantasy8.glb) need a wider snap distance than the
      // 0.5 m Rapier default or the character un-grounds on every triangle edge
      // and slides into "fly mode" while walking.
      if (t.enableStickToFloor) controller.enableSnapToGround(t.stickToFloorDistance)
      else controller.disableSnapToGround()
      controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(t.maxSlopeClimbDeg))

      // ── 1. Build camera-relative input direction ─────────────────────────────
      // Ported from Astronaut/character-controller-final main.ts (lines 1299–1313):
      // take the camera's world-space forward, drop its Y so pitch doesn't affect
      // ground movement, then build a right-vector via cross(fwd, up). This avoids
      // the brittle "rotate (strafe, 0, -fwd) by camera quaternion" approach.
      camera.getWorldDirection(_camFwd)
      _camFwd.y = 0
      _camFwd.normalize()
      _camRight.crossVectors(_camFwd, _worldUp)

      const forwardInput = inputRef.current.forward ? 1 : inputRef.current.back ? -1 : 0
      const rightInput = inputRef.current.right ? 1 : inputRef.current.left ? -1 : 0
      _move.set(0, 0, 0)
      _move.addScaledVector(_camFwd, forwardInput)
      _move.addScaledVector(_camRight, rightInput)
      const inputLen = _move.length()
      if (inputLen > 1e-6) _move.multiplyScalar(1 / inputLen)

      // ── 2. Horizontal + vertical velocity (inertia + gravity + jump) ─────────
      const moveSpeed = t.moveSpeed * (inputRef.current.sprint ? t.sprintMoveMultiplier : 1)
      const grounded = state.grounded
      const playerControlsHorizontalVelocity = t.controlMovementDuringJump || grounded
      if (playerControlsHorizontalVelocity) {
        state.allowSliding = inputLen > 1e-6
        if (t.enableCharacterInertia) {
          if (inputLen > 1e-6) {
            state.desiredVelocity.multiplyScalar(0.75)
            state.desiredVelocity.addScaledVector(_move, 0.25 * moveSpeed)
          } else {
            // Astronaut snaps to zero when no input so the character actually stops
            // (without this the multiply-by-0.75 ramp never reaches 0 → tiny glide).
            state.desiredVelocity.set(0, 0, 0)
          }
        } else {
          state.desiredVelocity.copy(_move).multiplyScalar(moveSpeed)
        }
      } else {
        state.allowSliding = true
      }

      _verticalVel.set(0, state.linearVelocity.y, 0)
      _gravity.set(0, t.gravityY, 0)
      _newVel.set(0, 0, 0)

      // ── Jump consumption with input buffer + coyote time ──────────
      // The jump request is a TIMESTAMP, not a boolean (see the
      // Space case in the keydown handler). Two timing windows
      // decide whether to consume it:
      //
      //   1. JUMP_BUFFER_MS — how long the request stays valid
      //      after the key was pressed. Wider than one frame so
      //      a quick tap can never be silently dropped between
      //      keydown and useFrame.
      //   2. COYOTE_TIME_MS — grace period to still jump after
      //      walking off a ledge. Reads from `state.lastGroundedAt`,
      //      which is refreshed below on every grounded frame.
      //
      // The request is consumed (set back to null) the moment we
      // fire a jump. If the buffer window expires without consumption
      // we explicitly null it so a stale press from seconds ago can't
      // fire whenever the player finally lands.
      const nowMs = performance.now()
      const reqAt = inputRef.current.jumpRequestedAt
      const reqIsRecent = reqAt !== null && (nowMs - reqAt) <= JUMP_BUFFER_MS
      const inCoyote = (nowMs - state.lastGroundedAt) <= COYOTE_TIME_MS
      const canJump = reqIsRecent && (grounded || inCoyote)

      if (grounded) {
        _newVel.set(0, 0, 0)
      } else {
        _newVel.copy(_verticalVel)
      }
      if (canJump) {
        _newVel.y = t.jumpSpeed
        inputRef.current.jumpRequestedAt = null
      } else if (reqAt !== null && !reqIsRecent) {
        // Buffer window expired without us landing — drop the
        // stale request so a future landing doesn't surprise-jump.
        inputRef.current.jumpRequestedAt = null
      }
      _newVel.addScaledVector(_gravity, dt)
      _newVel.x += state.desiredVelocity.x
      _newVel.z += state.desiredVelocity.z

      state.linearVelocity.copy(_newVel)
      controller.setSlideEnabled(state.allowSliding)

      // ── 3. Kinematic Character Controller step ───────────────────────────────
      const collider = body.collider(0)
      if (!collider) return
      controller.computeColliderMovement(collider, {
        x: _newVel.x * dt,
        y: _newVel.y * dt,
        z: _newVel.z * dt,
      })
      const movement = controller.computedMovement()
      const current = body.translation()
      body.setNextKinematicTranslation({
        x: current.x + movement.x,
        y: current.y + movement.y,
        z: current.z + movement.z,
      })
      state.grounded = controller.computedGrounded()
      // Refresh the coyote-time anchor every frame we're grounded so
      // the next frame's coyote check sees a near-zero age. Read by
      // the jump-consumption block at the top of the next useFrame.
      if (state.grounded) state.lastGroundedAt = nowMs
      if (dt > 1e-8) {
        // X/Z come from actual movement so swept-collision side-slides feel
        // physical. Y intentionally uses the *planned* velocity (`_newVel.y`,
        // which is gravity + jump impulse only) instead of the snap-inflated
        // actual y. Rapier's snap-to-ground can move the character down by
        // several meters in a single frame (≈ -60 m/s to -180 m/s at 60 fps),
        // and if `grounded` then flips false for one frame, that velocity
        // gets reused as `_verticalVel` next tick, plus more gravity, and
        // the character rockets through the floor. Sprint surfaces this fast
        // because 17.5 m/s horizontal crosses more triangle edges per frame.
        state.linearVelocity.set(movement.x / dt, _newVel.y, movement.z / dt)
      }

      // ── 4. Animation stability + horizontal-speed smoothing ──────────────────
      // `dogAnimGroundReleaseHold` (~0.75s) intentionally delays the
      // grounded→airborne animation flip to absorb one-frame phantom
      // ground losses on bumpy/sparse terrain. The flaw: it ALSO
      // delayed the jump animation, so a space-press produced a
      // perfectly-timed physics jump but the wizard kept playing
      // idle/walk through the rise. We special-case the `canJump`
      // branch (computed in section 2) to bypass the hold — that flag
      // is true ONLY on the exact frame we consumed a deliberate
      // jump request, so terrain-glitch protection stays intact for
      // every other off-ground transition.
      if (canJump) {
        animStateRef.current.stableGrounded = false
        // Seed airAccum to the threshold so even the cancellation
        // path below ("if airAccum >= hold") would also have flipped
        // us to false — keeps the invariant that stableGrounded and
        // airAccum agree.
        animStateRef.current.airAccum = t.dogAnimGroundReleaseHold
      } else if (state.grounded) {
        animStateRef.current.stableGrounded = true
        animStateRef.current.airAccum = 0
      } else {
        animStateRef.current.airAccum += dt
        if (animStateRef.current.airAccum >= t.dogAnimGroundReleaseHold) {
          animStateRef.current.stableGrounded = false
        }
      }
      const hSpeed = Math.hypot(state.linearVelocity.x, state.linearVelocity.z)
      const speedSmoothK = 1 - Math.exp(-t.dogAnimWalkSpeedSmoothing * dt)
      animStateRef.current.smoothedHSpeed += (hSpeed - animStateRef.current.smoothedHSpeed) * speedSmoothK

      // Walk-clip speed scaling so the walk animation cycle aligns with horizontal motion.
      const walkAction = clips[CLIP_WALK]
      if (walkAction) {
        let ts = t.dogWalkAnimTimeScale
        if (inputRef.current.sprint && animStateRef.current.current === 'walk') ts *= t.sprintWalkAnimMultiplier
        walkAction.setEffectiveTimeScale(ts)
      }

      // ── 5. Animation state machine + crossfade ───────────────────────────────
      const currentName = animStateRef.current.current
      const isOneShot = (ONE_SHOT_CLIPS as readonly string[]).includes(currentName)
      const oneShotPlaying = isOneShot && performance.now() / 1000 < animStateRef.current.oneShotEndTime
      if (!oneShotPlaying && isOneShot) {
        // one-shot ended naturally — fall through to normal selection below
        animStateRef.current.oneShotEndTime = 0
      }
      if (!oneShotPlaying) {
        const inAir = !animStateRef.current.stableGrounded
        const sm = animStateRef.current.smoothedHSpeed
        const runThreshold = t.moveSpeed * 1.05
        let want: AnimName
        if (inAir) want = 'fall'
        else if (sm > runThreshold) want = 'run'
        else if (sm > t.dogWalkSpeedThreshold) want = 'walk'
        else want = 'idle'

        if (want !== animStateRef.current.current) {
          const next = actionFor(want)
          const prev = actionFor(animStateRef.current.current)
          if (next) {
            next.reset().setEffectiveWeight(1).play()
            if (prev && prev !== next) prev.crossFadeTo(next, t.dogAnimCrossfade, false)
            else next.fadeIn(t.dogAnimCrossfade)
            animStateRef.current.current = want
          }
        }
      }
      mixer.update(dt)

      // ── 6. Smooth character facing toward steering / velocity ────────────────
      // Ported from Astronaut `updateDogMovementFacing` (main.ts line 895). NOTE: the
      // live facing yaw is just `atan2(dx, dz)` — the astronaut demo applies `dogYawDeg`
      // as a static rotation on the model inside the facing pivot (see model.rotation.y
      // below), NOT as an offset added to the smoothed facing yaw. Combining them in one
      // sum like the previous version worked mathematically but made the yaw slider feel
      // unpredictable (each adjustment also rotated the smoothed-direction target).
      const facingPivot = facingPivotRef.current
      if (facingPivot) {
        let dx = 0
        let dz = 0
        if (inputLen > 1e-5) {
          dx = _move.x
          dz = _move.z
        } else {
          const lv = state.linearVelocity
          const lvLen = Math.hypot(lv.x, lv.z)
          if (lvLen > 1e-5) {
            dx = lv.x / lvLen
            dz = lv.z / lvLen
          }
        }
        if (dx !== 0 || dz !== 0) {
          _facing.set(dx, 0, dz)
          const targetYaw = Math.atan2(_facing.x, _facing.z)
          const turnT = 1 - Math.exp(-t.dogTurnSpeed * dt)
          smoothedFacingYawRef.current = lerpAngleRad(smoothedFacingYawRef.current, targetYaw, turnT)
          facingPivot.rotation.y = smoothedFacingYawRef.current
        }
      }

      // Astronaut applies `dogYawDeg` as a static model rotation in `layoutDogModel`;
      // we do it every frame so the slider responds live without rebuilding the mesh.
      model.rotation.y = (t.dogYawDeg * Math.PI) / 180

      // Apply the GUI's Position-offset (rig-space) translation to the inner mesh group.
      const offsetGroup = meshOffsetRef.current
      if (offsetGroup) {
        offsetGroup.position.set(t.dogOffsetX, t.dogOffsetY, t.dogOffsetZ)
      }

      // ── 7. Third-person camera: follow character delta, keep orbit angle ─────
      const after = body.translation()
      _feet.set(after.x, after.y - centerYOffset, after.z)
      wizardFeetPos.copy(_feet)
      if (!prevFeetSeededRef.current) {
        _prevFeet.copy(_feet)
        prevFeetSeededRef.current = true
      }
      _feetDelta.subVectors(_feet, _prevFeet)
      camera.position.add(_feetDelta)
      _prevFeet.copy(_feet)

      _targetWorld.set(_feet.x, _feet.y + t.dogHeight * CAMERA_TARGET_HEIGHT_FRACTION, _feet.z)
      const orbit = orbitRef.current
      if (orbit) {
        orbit.target.copy(_targetWorld)

        // Dynamic camera-floor clamp: prevent the orbit sphere from
        // ever dropping the camera below `_feet.y + CAMERA_FLOOR_MARGIN`.
        //
        // On a sphere of radius R around target, camera.y is:
        //   camera.y = target.y + R · cos(θ)        (θ = polar angle)
        // so the constraint  camera.y ≥ floor  becomes:
        //   cos(θ) ≥ (floor − target.y) / R
        //   ⇒ θ ≤ acos((floor − target.y) / R)
        // (since target.y > floor in normal play, the RHS is negative
        //  and the resulting cap is somewhere in (π/2, π))
        //
        // We then take the tighter of:
        //   • the floor-driven cap above, and
        //   • the artistic CAMERA_MAX_POLAR_ANGLE upper bound,
        // and write it into OrbitControls each frame so user drags
        // hit the floor as a soft wall.
        const floorY = _feet.y + CAMERA_FLOOR_MARGIN
        const camToTarget = camera.position.distanceTo(_targetWorld)
        if (camToTarget > 1e-4) {
          const cosCap = THREE.MathUtils.clamp(
            (floorY - _targetWorld.y) / camToTarget,
            -0.9999,
            0.9999,
          )
          const floorPolarMax = Math.acos(cosCap)
          orbit.maxPolarAngle = Math.min(CAMERA_MAX_POLAR_ANGLE, floorPolarMax)
        } else {
          orbit.maxPolarAngle = CAMERA_MAX_POLAR_ANGLE
        }

        orbit.update()

        // Safety net: between frames the floor altitude can change
        // (e.g. wizard walks off a ledge and `_feet.y` drops sharply
        // — see the snap-to-ground behaviour in section 3) before
        // the polar-angle cap above has had a chance to apply on a
        // user drag. If that ever leaves the camera below the floor,
        // shove it back up. We don't restore the corresponding polar
        // angle because the next frame's recomputation handles it.
        if (camera.position.y < floorY) camera.position.y = floorY
      }
    })

    const initialPos: [number, number, number] = [0, spawnFeetY + centerYOffset, 0]
    // Force a fresh RigidBody + CapsuleCollider whenever dogHeight changes — @react-three/rapier
    // doesn't reactively resize an existing capsule from `args`, so without this the physics
    // capsule keeps the old size while the visible mesh rescales, leaving the character
    // "hovering" or stuck mid-air relative to its physics shape.
    const bodyKey = `wizard-h-${dogHeight.toFixed(3)}`

    return (
      <>
        <RigidBody
          key={bodyKey}
          ref={bodyRef}
          type="kinematicPosition"
          position={initialPos}
          colliders={false}
          enabledRotations={[false, false, false]}
        >
          <CapsuleCollider args={[halfHeight, CAPSULE_RADIUS]} />
          <group position={[0, -centerYOffset, 0]}>
            <group ref={facingPivotRef}>
              <group ref={meshOffsetRef}>
                <primitive object={model} />
              </group>
            </group>
          </group>
        </RigidBody>
        <OrbitControls
          ref={orbitRef}
          makeDefault
          domElement={gl.domElement}
          enableDamping
          dampingFactor={0.12}
          enablePan={false}
          minDistance={CAMERA_MIN_DISTANCE}
          maxDistance={CAMERA_MAX_DISTANCE}
          // Polar angle is measured from world +Y (0 = directly above
          // target, π/2 = horizon, π = directly below).
          //   • minPolarAngle 0.2 (~11°) keeps a top-down view possible
          //     without hitting the +Y pole singularity.
          //   • maxPolarAngle (~124°, see CAMERA_MAX_POLAR_ANGLE) lets
          //     the camera dip below chest height to look UP at the
          //     wizard's face.
          // This is only the static UPPER BOUND on the tilt range; the
          // useFrame loop tightens `orbit.maxPolarAngle` further every
          // frame so the camera never crosses below the floor
          // (see CAMERA_FLOOR_MARGIN comment).
          minPolarAngle={0.2}
          maxPolarAngle={CAMERA_MAX_POLAR_ANGLE}
        />
      </>
    )
  },
)

useGLTF.preload(WIZARD_URL)
