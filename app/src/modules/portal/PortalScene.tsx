/**
 * PortalScene — loads `/portal.spz` as a small standalone SplatMesh and
 * drives a Spark 2.1 `worldModifier` that twists / tints ONLY that mesh.
 * Mounted alongside `<SparkleScene/>` in WorldViewer.
 *
 * Architecture (two independent proxies):
 *
 *   ┌─────────────────────────────────┐   attach()
 *   │ portalTwist (dyno modifier)     │──────────► portal SplatMesh
 *   │  + mutable uniforms             │ detach()    (inside splatProxy)
 *   │      .center ◄────────────────────────┐
 *   └─────────────────────────────────┘     │
 *             ▲ per-frame uniform pump      │
 *             │                              │
 *   ┌─────────────────────────────────┐     │
 *   │ PortalScene (this component)    │     │
 *   │                                 │     │
 *   │  splatProxy <group>             │     │
 *   │   • TRS = portalPos/Rot/Scale   │     │
 *   │   • portal SplatMesh (child)    │     │
 *   │                                 │     │
 *   │  regionProxy <group>            │     │
 *   │   • position = portalRegionPos  │─────┘  ← swirl uniform tracks
 *   │   • translucent sphere (child)  │         this group's world pos
 *   │                                 │
 *   │  TransformControls              │
 *   │   • attached to splatProxy OR   │
 *   │     regionProxy based on        │
 *   │     portalGizmoTarget           │
 *   └─────────────────────────────────┘
 *
 * Why TWO proxies instead of one: the cosmic SPZ's visible mass is offset
 * by several metres from its object-space origin. With one shared proxy,
 * the region sphere (sphere mesh + worldModifier falloff centre) ended up
 * at the proxy origin while the splats rendered elsewhere — meaning the
 * Gaussian falloff window covered empty world space and `Enable swirl`
 * was a no-op (no splats inside the influence sphere). Decoupling lets
 * the user drag the swirl region directly onto the visible vortex.
 *
 * Each proxy is mounted once via `useState(setX)` so the TransformControls
 * (which mutates the Object3D it controls) has a stable target across
 * React re-renders. The gizmo target is switched by simply pointing
 * `<TransformControls object={…}/>` at the other proxy on flag flip —
 * cheap, no remount, and the unselected proxy keeps its transform.
 *
 * Mesh attach lifecycle:
 *   - The portal SplatMesh signals readiness via its `initialized` promise.
 *     We hold off attaching the modifier until that resolves; attaching
 *     mid-init would race the splat source compilation and is a known way
 *     to wedge the dyno pipeline.
 *   - We attach the modifier even when `portalEnabled === false` is FALSE
 *     by design — only when the user has it on. The modifier is the only
 *     reason the splats look like a swirl; with it detached the SPZ just
 *     renders at its base orientation.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { extend, useFrame } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { SplatMesh } from '@sparkjsdev/spark'
import { useWizardTuning } from '../character/wizardTuning'
import { makePortalTwist, type PortalTwistControls } from '../splat/portalTwist'
import { PortalSpiralOverlay } from './PortalSpiralOverlay'

const SplatMeshEl = extend(SplatMesh)
const ignoreRaycast: THREE.Object3D['raycast'] = () => {}
const PORTAL_SPLAT_URL = '/portal.spz'
const portalSplatArgs = { url: PORTAL_SPLAT_URL } as const

export function PortalScene() {
  // GUI-tunable fields. Subscribed individually so a slider drag only
  // re-renders this component when its own value changes.
  const portalEnabled = useWizardTuning((s) => s.portalEnabled)
  const portalGizmoEnabled = useWizardTuning((s) => s.portalGizmoEnabled)
  const portalGizmoMode = useWizardTuning((s) => s.portalGizmoMode)
  const portalGizmoTarget = useWizardTuning((s) => s.portalGizmoTarget)
  const portalShowSphere = useWizardTuning((s) => s.portalShowSphere)
  const portalRadius = useWizardTuning((s) => s.portalRadius)
  // Helper mesh shape mirrors the dyno falloff: ellipsoid scaled to
  // (radius, radius × axialExtent, radius) and rotated so its local
  // Y axis aligns with `portalAxis`. Reading these in render so the
  // shape updates live as the user drags the sliders.
  const portalAxisX = useWizardTuning((s) => s.portalAxisX)
  const portalAxisY = useWizardTuning((s) => s.portalAxisY)
  const portalAxisZ = useWizardTuning((s) => s.portalAxisZ)
  const portalAxialExtent = useWizardTuning((s) => s.portalAxialExtent ?? 1)

  const portalRef = useRef<PortalTwistControls | null>(null)
  const attachedMeshRef = useRef<SplatMesh | null>(null)
  // The portal SplatMesh ref is populated synchronously by R3F when the
  // <SplatMeshEl> mounts. We then watch its `initialized` promise and
  // flip `portalMeshReady` true; the attach effect below gates on that
  // so the worldModifier never gets bolted onto a half-loaded mesh
  // (which races Spark's async splat-source compilation).
  const portalMeshRef = useRef<SplatMesh | null>(null)
  const [portalMeshReady, setPortalMeshReady] = useState(false)

  // Two independent proxy groups — `proxy` holds the SPZ (full TRS),
  // `regionProxy` holds the translucent sphere + drives the swirl
  // uniform centre (translate-only). State (not ref) so TransformControls
  // re-evaluates its `object={…}` prop once the actual <group> mounts.
  const [proxy, setProxy] = useState<THREE.Group | null>(null)
  const [regionProxy, setRegionProxy] = useState<THREE.Group | null>(null)
  const draggingRef = useRef(false)

  // Rigid-spin group: lives INSIDE `proxy` and wraps the SplatMesh.
  // Each frame we rotate this group's local quaternion around
  // `portalAxis` by `dt * portalRigidSpinRate`. Because the gizmo writes
  // to `proxy` (not to this child), the rigid spin accumulates cleanly
  // on top of whatever orientation the user dialled in — no fighting
  // the store, no need to write rotation back through Zustand.
  // Using a ref (not state) because the rotation mutates the matrix
  // directly and shouldn't trigger React re-renders.
  const rigidSpinGroupRef = useRef<THREE.Group | null>(null)
  // Reusable scratch vector for the axis read in useFrame. Allocating
  // a new Vector3 each frame would churn GC at 60 Hz.
  const _spinAxisScratch = useRef(new THREE.Vector3()).current
  // Identity quaternion sentinel — used to detect whether the rigid
  // spin group is currently rotated (and therefore needs resetting
  // when rate goes to 0). Allocated once; never mutated.
  const _identityQuaternion = useRef(new THREE.Quaternion()).current
  // SPZ centroid offset: the cosmic SPZ's splats are authored in some
  // arbitrary object-space frame whose origin may NOT be the SPZ's
  // visual centre (the authoring tool decides). Without compensation,
  // `rigidSpinGroup.rotateOnAxis` rotates around the GROUP's local
  // origin — and if the SPZ centroid is offset from that origin, the
  // SPZ orbits around an off-centre pivot ("axis is at the bottom of
  // the SPZ") instead of spinning in place. We read the bbox after
  // mesh init and translate the inner wrapper group by `-centroid`
  // so the SPZ's visual centre coincides with the rigid-spin origin.
  // Stored as state (not ref) so React rerenders the JSX once we know
  // the offset — refs would require a manual `setMatrix` call.
  const [spzCentroidOffset, setSpzCentroidOffset] = useState<THREE.Vector3>(() => new THREE.Vector3())

  // ── Build the modifier once and tear it down on unmount. ─────────────────
  useEffect(() => {
    const t = useWizardTuning.getState()
    portalRef.current = makePortalTwist({
      // Seed from `portalRegionPos*` (NOT portalPos*) — the swirl centre
      // is independent from the SPZ's proxy origin since v39 so the
      // user can drag the falloff sphere onto the visible splat without
      // moving the splat itself.
      center: new THREE.Vector3(t.portalRegionPosX, t.portalRegionPosY, t.portalRegionPosZ),
      axis: new THREE.Vector3(t.portalAxisX, t.portalAxisY, t.portalAxisZ),
      radius: t.portalRadius,
      strength: t.portalStrength,
      spinRate: t.portalSpinRate,
      windings: t.portalWindings,
      // See useFrame body for why we fall back to 1 — protects against
      // pre-v43 persisted states that don't yet have this field.
      axialExtent: t.portalAxialExtent ?? 1,
      // Default 1.0 (full geometric twist) for pre-v45 stores. The
      // useFrame pump immediately overwrites with the live value, so
      // this is only a NaN-safe construction-time placeholder.
      geometryAmount: t.portalGeometryAmount ?? 1,
      // Safety: ALWAYS construct the modifier in the disabled state.
      // The useFrame loop below will flip `enabled.value` to whatever
      // the persisted store says on the very next frame. The reason
      // we don't honour the persisted value here is: if the store
      // holds a partially-migrated state (e.g. a stale localStorage
      // from before a uniform was added), the dyno could compile
      // against `undefined` and feed NaN into the GPU on its first
      // frame, which produces a runaway render loop that wedges the
      // tab so hard the user can't refresh. Forcing the kernel to
      // produce a no-op for the first ~16ms gives the per-frame pump
      // a chance to install sane values before any rotation math
      // runs against them.
      enabled: false,
      // Seed splat-tint defaults from the store so the very first
      // attached frame already shows the cyan vortex (before useFrame
      // overwrites these from the live store). Without this seed the
      // modifier would briefly render with the kernel's hard-coded
      // fallbacks (which differ slightly from the persisted defaults).
      tintEnabled: t.portalTintEnabled,
      tintColor: new THREE.Color(
        t.portalTintColor[0],
        t.portalTintColor[1],
        t.portalTintColor[2],
      ),
      tintEmission: t.portalTintEmission,
      tintArms: t.portalTintArms,
      tintWindings: t.portalTintWindings,
      tintContrast: t.portalTintContrast,
      tintCoreDarkness: t.portalTintCoreDarkness,
    })
    return () => {
      if (attachedMeshRef.current && portalRef.current) {
        portalRef.current.detach(attachedMeshRef.current)
      }
      attachedMeshRef.current = null
      portalRef.current = null
    }
  }, [])

  // ── Watch the portal SplatMesh's initialized promise. We can't attach
  // the modifier until Spark has actually decoded the SPZ and built the
  // splat source; attaching earlier wires `mesh.worldModifier = …` →
  // `updateGenerator()` against an unfinished source and the dyno
  // pipeline compiles against nothing.
  //
  // We also dump the splats' object-space bounding box once init resolves.
  // The portal SPZ was authored independently of the host world, so its
  // internal origin / scale may not line up with the wizard's world frame —
  // logging the bbox + the live proxy position is the fastest way to
  // diagnose "where IS the portal" when it appears off-camera.
  useEffect(() => {
    const mesh = portalMeshRef.current
    if (!mesh) {
      setPortalMeshReady(false)
      return
    }
    let cancelled = false
    mesh.initialized
      .then(() => {
        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const packed: any = (mesh as any).packedSplats
        const t = useWizardTuning.getState()
        let bbox: { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3 } | null = null
        let centroid: THREE.Vector3 | null = null
        try {
          const box = mesh.getBoundingBox(true)
          bbox = {
            min: box.min.clone(),
            max: box.max.clone(),
            size: box.getSize(new THREE.Vector3()),
          }
          // Centroid of the bbox in OBJECT space. This is the offset
          // we need to translate the inner wrapper group by (negated)
          // so the SPZ's visual centre coincides with the rigid-spin
          // pivot. Without this, rotating the rigid-spin group makes
          // the SPZ orbit around the bottom/edge of itself instead of
          // spinning in place.
          centroid = box.getCenter(new THREE.Vector3())
          setSpzCentroidOffset(centroid.clone())
        } catch (err) {
          console.warn('[Portal] getBoundingBox failed', err)
        }
        console.log('[Portal] portal SplatMesh initialized', {
          url: PORTAL_SPLAT_URL,
          numSplats: packed?.numSplats,
          objectBboxMin: bbox?.min.toArray(),
          objectBboxMax: bbox?.max.toArray(),
          objectBboxSize: bbox?.size.toArray(),
          centroid: centroid?.toArray(),
          proxyPos: [t.portalPosX, t.portalPosY, t.portalPosZ],
          portalEnabled: t.portalEnabled,
        })
        setPortalMeshReady(true)
      })
      .catch((err: unknown) => {
        console.warn('PortalScene: portal SplatMesh failed to initialize', err)
      })
    return () => {
      cancelled = true
      setPortalMeshReady(false)
    }
  }, [])

  // ── Attach / detach the dyno worldModifier ONLY when the user actually
  // wants the twist AND the portal SplatMesh is ready. Every attach forces
  // `mesh.updateGenerator()` which recompiles the dyno pipeline — cheap on
  // a few-thousand-splat portal SPZ but still not free, so we gate it. ─────
  useEffect(() => {
    const portal = portalRef.current
    const mesh = portalMeshRef.current
    if (!portal || !mesh || !portalMeshReady) {
      console.log('[Portal] swirl attach skipped (not ready)', {
        portalEnabled,
        hasPortal: !!portal,
        hasMesh: !!mesh,
        portalMeshReady,
      })
      return
    }
    if (portalEnabled) {
      const t = useWizardTuning.getState()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meshAny = mesh as any
      portal.attach(mesh)
      attachedMeshRef.current = mesh
      console.log('[Portal] swirl ATTACHED', {
        url: PORTAL_SPLAT_URL,
        meshNumSplats: meshAny.packedSplats?.numSplats,
        worldModifierSet: meshAny.worldModifier === portal.modifier,
        worldModifiersIncluded: meshAny.worldModifiers?.includes?.(portal.modifier),
        params: {
          strength: t.portalStrength,
          spinRate: t.portalSpinRate,
          windings: t.portalWindings,
          radius: t.portalRadius,
          axis: [t.portalAxisX, t.portalAxisY, t.portalAxisZ],
          proxyScale: t.portalScale,
        },
      })
      return () => {
        portal.detach(mesh)
        if (attachedMeshRef.current === mesh) attachedMeshRef.current = null
        console.log('[Portal] swirl detached', { url: PORTAL_SPLAT_URL })
      }
    }
    if (attachedMeshRef.current) {
      portal.detach(attachedMeshRef.current)
      attachedMeshRef.current = null
      console.log('[Portal] swirl detached (toggle off)')
    }
  }, [portalEnabled, portalMeshReady])

  // ── Seed both proxy transforms once they mount (avoids a frame at
  // origin / identity rotation / scale-1 default before the useFrame
  // loop kicks in). The splat proxy gets full TRS; the region proxy
  // is translate-only (rotation and scale don't change the swirl
  // falloff sphere's shape — radius lives in `portalRadius`). ─────
  useEffect(() => {
    if (!proxy) return
    const t = useWizardTuning.getState()
    proxy.position.set(t.portalPosX, t.portalPosY, t.portalPosZ)
    proxy.rotation.set(
      THREE.MathUtils.degToRad(t.portalRotationDegX),
      THREE.MathUtils.degToRad(t.portalRotationDegY),
      THREE.MathUtils.degToRad(t.portalRotationDegZ),
    )
    proxy.scale.setScalar(t.portalScale)
  }, [proxy])
  useEffect(() => {
    if (!regionProxy) return
    const t = useWizardTuning.getState()
    regionProxy.position.set(t.portalRegionPosX, t.portalRegionPosY, t.portalRegionPosZ)
  }, [regionProxy])

  // ── Per-frame uniform pump: read store → write into dyno uniforms +
  // advance time. Cheap: every write is a single property assignment, no
  // shader recompile.
  const _center = useRef(new THREE.Vector3()).current
  const _axis = useRef(new THREE.Vector3(0, 1, 0)).current
  // Scratch THREE.Color used to copy the tuple-shaped store value into the
  // dyno's mutable color uniform without allocating per-frame. Allocating a
  // fresh Color every frame here would cause GC churn at ~60 hz.
  const _tintColorScratch = useRef(new THREE.Color()).current
  useFrame((_, dt) => {
    const portal = portalRef.current
    if (!portal) return
    const t = useWizardTuning.getState()

    // ── Splat proxy transform ─────────────────────────────────────────
    // When the user is dragging the gizmo and the gizmo target is
    // 'splat', the proxy IS the source of truth — TransformControls
    // writes directly into proxy.position / .rotation / .scale and
    // `handleSplatGizmoChange` mirrors back to the store via
    // `onObjectChange`. Otherwise the store wins.
    const draggingSplat = draggingRef.current && portalGizmoTarget === 'splat'
    if (!draggingSplat && proxy) {
      proxy.position.set(t.portalPosX, t.portalPosY, t.portalPosZ)
      proxy.rotation.set(
        THREE.MathUtils.degToRad(t.portalRotationDegX),
        THREE.MathUtils.degToRad(t.portalRotationDegY),
        THREE.MathUtils.degToRad(t.portalRotationDegZ),
      )
      proxy.scale.setScalar(t.portalScale)
    }

    // ── Region proxy transform + swirl centre uniform ─────────────────
    // Same gizmo-dragging dance, but the region only has a position
    // (rotation/scale don't change the falloff sphere). The world-space
    // position of the region proxy becomes the `portalCenter` uniform
    // that the dyno reads each frame for its Gaussian falloff window.
    const draggingRegion = draggingRef.current && portalGizmoTarget === 'region'
    if (draggingRegion && regionProxy) {
      _center.copy(regionProxy.position)
    } else {
      _center.set(t.portalRegionPosX, t.portalRegionPosY, t.portalRegionPosZ)
      if (regionProxy) regionProxy.position.copy(_center)
    }
    portal.center.value.copy(_center)

    // Axis is always store-driven (no axis gizmo right now).
    _axis.set(t.portalAxisX, t.portalAxisY, t.portalAxisZ)
    const axisLen = _axis.length()
    if (axisLen > 1e-6) _axis.divideScalar(axisLen)
    else _axis.set(0, 1, 0)
    portal.axis.value.copy(_axis)

    portal.radius.value = t.portalRadius
    portal.strength.value = t.portalStrength
    portal.spinRate.value = t.portalSpinRate
    portal.windings.value = t.portalWindings
    // Defensive fallback to 1.0 (sphere falloff) when `portalAxialExtent`
    // is undefined. HMR can swap module code in-place without re-running
    // the Zustand persist migration, so during the brief window after
    // a v43 hot-reload but before the user does a full page refresh,
    // existing localStorage states still lack this field. Feeding
    // `undefined` straight into a `d.dynoFloat` value writes NaN into
    // the GPU uniform, the GLSL falloff becomes NaN, every splat's
    // alpha multiplies to NaN, and the cosmic SPZ disappears
    // entirely. The `?? 1` makes us behave like the previous spherical
    // version until persisted state catches up.
    portal.axialExtent.value = t.portalAxialExtent ?? 1
    // Same NaN-guard rationale as `portalAxialExtent` above: pre-v45
    // persisted stores don't carry this field, so HMR before refresh
    // would feed undefined → NaN into the dyno. The fallback of 1.0
    // matches the original behaviour (full geometric twist).
    portal.geometryAmount.value = t.portalGeometryAmount ?? 1
    portal.enabled.value = t.portalEnabled

    // Splat-tint uniforms. Cheap scalar/Color writes — the dyno
    // system flushes these to GPU uniforms during `advance(dt)` below.
    portal.tintEnabled.value = t.portalTintEnabled
    _tintColorScratch.setRGB(
      t.portalTintColor[0],
      t.portalTintColor[1],
      t.portalTintColor[2],
    )
    portal.tintColor.value.copy(_tintColorScratch)
    portal.tintEmission.value = t.portalTintEmission
    portal.tintArms.value = t.portalTintArms
    portal.tintWindings.value = t.portalTintWindings
    portal.tintContrast.value = t.portalTintContrast
    portal.tintCoreDarkness.value = t.portalTintCoreDarkness

    portal.advance(dt)

    // ── Rigid SPZ spin ──────────────────────────────────────────────
    // ONE rotation per frame, around the SPZ's local portalAxis, by
    // `dt × portalRigidSpinRate`. This is the smoothest possible
    // motion the SPZ can have: a single matrix multiply, no per-splat
    // shader work, no shearing (every splat moves together because
    // they're all children of the same rotating group).
    //
    // Comparison to the dyno path above:
    //   - Dyno  → vertex-shader rotates each splat's center + quat.
    //             Scales with splat count, can shear with windings.
    //   - Rigid → group.rotateOnAxis once, splats stay in their
    //             authored object-space positions. O(1) per frame.
    //
    // We rotate in the group's LOCAL frame (rotateOnAxis applies the
    // axis in the group's own coordinate system), so tilting the SPZ
    // via the gizmo tilts the spin axis with it.
    //
    // CRITICAL NaN-safety:
    //   A single NaN going into `rotateOnAxis(axis, angle)` corrupts
    //   the group's matrix to all-NaN, which propagates to every
    //   child SplatMesh's world transform, which makes Spark's splat
    //   sorter go berserk and wedges the GPU hard enough that the
    //   tab can't refresh. So we explicitly `Number.isFinite()`-gate
    //   every scalar that touches the angle calculation. `??` is
    //   NOT sufficient — it only catches null/undefined, not NaN,
    //   and NaN is the realistic threat (stale persisted state, an
    //   HMR cycle that landed mid-store-update, etc.).
    const rigidGroup = rigidSpinGroupRef.current
    const rawRate = t.portalRigidSpinRate
    const rigidRate = (typeof rawRate === 'number' && Number.isFinite(rawRate)) ? rawRate : 0
    const dtSafe = Number.isFinite(dt) ? Math.min(0.1, Math.max(0, dt)) : 0
    // When the rate is parked at 0, EAGERLY reset the group's
    // rotation to identity. Two reasons:
    //   1. After a previous spin session left the group at some
    //      arbitrary tilted orientation, the user expects "0 rate" to
    //      snap the SPZ back to its authored pose — not freeze it at
    //      the last orientation reached. Otherwise they see "still
    //      spinning incorrectly" symptoms after every migration that
    //      sets rate to 0.
    //   2. Defends against accumulated floating-point drift from many
    //      tiny rotateOnAxis calls. After hours of running, the
    //      group's quaternion might be subtly non-unit; resetting on
    //      every 0-rate frame is cheap insurance.
    if (rigidGroup && rigidRate === 0) {
      // Only reset if the rotation is actually non-identity. Avoids
      // touching the matrix every frame when nothing's happening.
      // `equals` on quaternion compares all 4 components exactly.
      if (!rigidGroup.quaternion.equals(_identityQuaternion)) {
        rigidGroup.quaternion.identity()
      }
    }
    if (rigidGroup && rigidRate !== 0 && dtSafe > 0) {
      const rawAx = t.portalAxisX
      const rawAy = t.portalAxisY
      const rawAz = t.portalAxisZ
      const ax = (typeof rawAx === 'number' && Number.isFinite(rawAx)) ? rawAx : 0
      const ay = (typeof rawAy === 'number' && Number.isFinite(rawAy)) ? rawAy : 1
      const az = (typeof rawAz === 'number' && Number.isFinite(rawAz)) ? rawAz : 0
      _spinAxisScratch.set(ax, ay, az)
      const axisLen = _spinAxisScratch.length()
      // Skip the frame on degenerate axis. The fallback values above
      // (0, 1, 0) already protect against NaN inputs, so this only
      // catches the genuine "all three sliders parked at zero" case.
      if (axisLen > 1e-6 && Number.isFinite(axisLen)) {
        _spinAxisScratch.divideScalar(axisLen)
        const angle = dtSafe * rigidRate
        // Final scalar check on the actual angle that's about to
        // multiply into the rotation matrix. Defense in depth: even
        // if every input above passed, the product could in theory
        // overflow to Infinity at very high rates × large dt. This
        // is the last gate between us and a wedged tab.
        if (Number.isFinite(angle)) {
          rigidGroup.rotateOnAxis(_spinAxisScratch, angle)
        }
      }
    }
  })

  // ── Translucent sphere helper (one geometry shared across all radii;
  // we scale it via the wrapping group to avoid rebuilding buffers).
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 32, 24), [])
  const sphereMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0x8c5cff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => () => {
    sphereGeo.dispose()
    sphereMat.dispose()
  }, [sphereGeo, sphereMat])

  // ── Gizmo callbacks ─────────────────────────────────────────────────
  // Splat target: mirror ALL three transforms (pos/rot/scale) to the
  // store on every change, regardless of which mode (TransformControls
  // only mutates the active mode's component, but writing all three is
  // cheap and means mode-switching never strands the others).
  // Region target: position only — rotation/scale don't change the
  // swirl falloff (only `portalRadius` does), so we don't expose them
  // for the region proxy and don't write them back.
  const handleSplatGizmoChange = () => {
    if (!proxy) return
    useWizardTuning.getState().setTuning({
      portalPosX: proxy.position.x,
      portalPosY: proxy.position.y,
      portalPosZ: proxy.position.z,
      portalRotationDegX: THREE.MathUtils.radToDeg(proxy.rotation.x),
      portalRotationDegY: THREE.MathUtils.radToDeg(proxy.rotation.y),
      portalRotationDegZ: THREE.MathUtils.radToDeg(proxy.rotation.z),
      portalScale: proxy.scale.x,
    })
  }
  const handleRegionGizmoChange = () => {
    if (!regionProxy) return
    useWizardTuning.getState().setTuning({
      portalRegionPosX: regionProxy.position.x,
      portalRegionPosY: regionProxy.position.y,
      portalRegionPosZ: regionProxy.position.z,
    })
  }

  // Only render the helper sphere when the portal is meaningfully active —
  // either the twist itself is on, or the user has the gizmo enabled to
  // place it. Otherwise the translucent purple bubble at world origin (the
  // default position) looks like a bug to anyone who hasn't opened the
  // Portal twist folder yet.
  const showSphere = portalShowSphere && (portalEnabled || portalGizmoEnabled)

  // ── Helper transform: ellipsoid scaled (radius × radius × axialExtent
  // × radius) so the user sees the ACTUAL disk-shaped falloff region
  // instead of a misleading sphere. Aligning the helper's local Y to
  // the rotation axis matches the dyno's math (axial falloff is along
  // `_axis`, which is just normalize(portalAxis)). When axialExtent
  // = 1 the scale collapses to (r, r, r) = uniform sphere (matches
  // the old behaviour). When axialExtent < 1 the helper flattens
  // into a disk whose normal points along `portalAxis` — i.e. you
  // can VISUALLY confirm whether your disk is horizontal (Y axis),
  // vertical (X/Z axis), or tilted.
  const helperQuaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    const len = Math.hypot(portalAxisX, portalAxisY, portalAxisZ)
    if (len < 1e-6) return q // identity — degenerate axis, fall back to upright
    const axis = new THREE.Vector3(
      portalAxisX / len,
      portalAxisY / len,
      portalAxisZ / len,
    )
    // SphereGeometry has its poles on +Y / -Y, so a non-uniform
    // (1, axialExtent, 1) scale flattens it along its local Y. We
    // therefore align local +Y to the world `portalAxis` so the
    // ellipsoid's "flat" axis is the rotation axis.
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
    return q
  }, [portalAxisX, portalAxisY, portalAxisZ])
  const helperScale: [number, number, number] = useMemo(
    () => [portalRadius, portalRadius * portalAxialExtent, portalRadius],
    [portalRadius, portalAxialExtent],
  )

  // The portal splat is always rendered while the component is mounted.
  // (Earlier we gated visibility on `portalEnabled || portalGizmoEnabled`,
  // but that made the mesh effectively invisible while debugging
  // placement — users would toggle the portal on, not see the SPZ, and
  // have no signal whether it failed to load or was just hidden. Always
  // rendering it makes "the portal" a concrete piece of geometry users
  // can see at all times; `portalEnabled` now only controls whether the
  // twist + tint modifier is attached, i.e. whether it *swirls*.)
  // Region proxy only allows translation — clamping the mode here so a
  // user who left the gizmo on `rotate` or `scale` for the splat doesn't
  // get a broken-looking handle when they flip the target to `region`
  // (rotation/scale do nothing for the swirl, only the centre position
  // matters for the falloff). Splat keeps the full TRS picker.
  const effectiveGizmoMode =
    portalGizmoTarget === 'region' ? 'translate' : portalGizmoMode
  const gizmoTargetObject = portalGizmoTarget === 'region' ? regionProxy : proxy
  const onGizmoChange =
    portalGizmoTarget === 'region' ? handleRegionGizmoChange : handleSplatGizmoChange

  return (
    <>
      {/* Splat proxy — TRS-controlled by the gizmo (writes back into
       *  `portalPos/Rot/Scale`). Children inherit those transforms.
       *
       *  Layout:
       *    <proxy>                       ← gizmo target (TRS from store)
       *      <rigidSpinGroup>            ← per-frame rotateOnAxis here
       *        <recenter>                ← translates SPZ so its
       *                                    bbox-centroid coincides with
       *                                    the rigid-spin pivot
       *          <SplatMeshEl />         ← cosmic SPZ (also dyno target)
       *        </recenter>
       *      </rigidSpinGroup>
       *      <PortalSpiralOverlay/>      ← off by default; if on, sits
       *                                    in the gizmo's frame (NOT
       *                                    spun by the rigid path — it
       *                                    has its own internal spin)
       *    </proxy>
       *
       *  The recenter group is what fixes "the axis is at the bottom of
       *  the SPZ". Its position is `-bboxCentroid` (in SPZ object
       *  space), which puts the SPZ's visual centre at the rigidSpin
       *  origin — so rotateOnAxis pivots through the SPZ's middle
       *  rather than orbiting around an authored-frame corner.
       *
       *  Putting the SPZ inside `rigidSpinGroup` (instead of spinning
       *  `proxy` directly) means the rigid rotation accumulates each
       *  frame without fighting the store's `portalRotationDeg*` →
       *  proxy.rotation pipeline. Cleanest separation: the gizmo owns
       *  the orientation slot; the rigid spin owns the motion slot. */}
      <group ref={setProxy}>
        <group ref={rigidSpinGroupRef}>
          <group position={[-spzCentroidOffset.x, -spzCentroidOffset.y, -spzCentroidOffset.z]}>
            <SplatMeshEl
              ref={portalMeshRef}
              args={[portalSplatArgs]}
              raycast={ignoreRaycast}
            />
          </group>
        </group>
        <PortalSpiralOverlay />
      </group>
      {/* Region proxy — translate-only, parents the translucent helper
       *  sphere. Decoupled from the splat proxy so the swirl falloff
       *  centre can be dragged onto the visible vortex without moving
       *  the splat itself. */}
      <group ref={setRegionProxy}>
        {showSphere && (
          <mesh
            scale={helperScale}
            quaternion={helperQuaternion}
            renderOrder={9999}
            raycast={() => {}}
          >
            <primitive object={sphereGeo} attach="geometry" />
            <primitive object={sphereMat} attach="material" />
          </mesh>
        )}
      </group>
      {portalGizmoEnabled && gizmoTargetObject && (
        <TransformControls
          // Key on the target so React tears down + recreates the
          // TransformControls instance when the user swaps splat ↔
          // region, avoiding stale internal state in three.js's
          // TransformControlsGizmo (otherwise the handles can show
          // the previous target's bounding box for a frame).
          key={portalGizmoTarget}
          object={gizmoTargetObject}
          mode={effectiveGizmoMode}
          onObjectChange={onGizmoChange}
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
