/**
 * PortalScene — loads `/portal.spz` as a small standalone SplatMesh and
 * drives a Spark 2.1 `worldModifier` that twists / tints ONLY that mesh.
 * Mounted alongside `<SparkleScene/>` in WorldViewer.
 *
 * Architecture:
 *
 *   ┌───────────────────────────────┐       attach()
 *   │ portalTwist (dyno modifier)   │──────────────────► portal SplatMesh
 *   │  + mutable uniforms           │      detach()      (the /portal.spz
 *   └───────────────────────────────┘                     mesh owned by
 *             ▲ each frame: copy from store               this component)
 *             │
 *   ┌───────────────────────────────┐
 *   │ PortalScene (this component)  │
 *   │  • SplatMesh for /portal.spz  │  ◄── mounted inside the proxy group
 *   │  • TransformControls gizmo    │      so it inherits the portal's
 *   │  • translucent sphere helper  │      world-space position
 *   │  • per-frame uniform pump     │
 *   └───────────────────────────────┘
 *
 * Why a separate proxy group: TransformControls writes into the Object3D
 * it controls, so it has to outlive React's re-renders. The proxy <group>
 * is mounted once via `useState(setProxy)` and stays put for the
 * component's lifetime; we lerp/snap its position from the store rather
 * than recreating it. Mounting the portal SplatMesh as a child of the
 * proxy means the SPZ's splats automatically follow the portal's world-
 * space position with no extra plumbing — and because the modifier's
 * `portalCenter` uniform tracks the same store value, the twist re-
 * centers on the splats wherever the user drags the gizmo to.
 *
 * Mesh attach lifecycle:
 *   - The portal SplatMesh signals readiness via its `initialized` promise.
 *     We hold off attaching the modifier until that resolves; attaching
 *     mid-init would race the splat source compilation and is a known way
 *     to wedge the dyno pipeline.
 *   - We attach the modifier even when `portalEnabled === false` is FALSE
 *     by design — only when the user has it on. The modifier is the only
 *     reason the splats look like a swirl; with it detached the SPZ just
 *     renders at its base orientation, which is fine because the mesh
 *     itself is hidden in that state too (see `<SplatMeshEl visible=…>`).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { extend, useFrame } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { SplatMesh } from '@sparkjsdev/spark'
import { useWizardTuning } from '../character/wizardTuning'
import { makePortalTwist, type PortalTwistControls } from '../splat/portalTwist'

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
  const portalShowSphere = useWizardTuning((s) => s.portalShowSphere)
  const portalRadius = useWizardTuning((s) => s.portalRadius)

  const portalRef = useRef<PortalTwistControls | null>(null)
  const attachedMeshRef = useRef<SplatMesh | null>(null)
  // The portal SplatMesh ref is populated synchronously by R3F when the
  // <SplatMeshEl> mounts. We then watch its `initialized` promise and
  // flip `portalMeshReady` true; the attach effect below gates on that
  // so the worldModifier never gets bolted onto a half-loaded mesh
  // (which races Spark's async splat-source compilation).
  const portalMeshRef = useRef<SplatMesh | null>(null)
  const [portalMeshReady, setPortalMeshReady] = useState(false)

  // Use state (not ref) for the proxy group so TransformControls re-renders
  // with the actual group reference once it mounts.
  const [proxy, setProxy] = useState<THREE.Group | null>(null)
  const draggingRef = useRef(false)

  // ── Build the modifier once and tear it down on unmount. ─────────────────
  useEffect(() => {
    const t = useWizardTuning.getState()
    portalRef.current = makePortalTwist({
      center: new THREE.Vector3(t.portalPosX, t.portalPosY, t.portalPosZ),
      axis: new THREE.Vector3(t.portalAxisX, t.portalAxisY, t.portalAxisZ),
      radius: t.portalRadius,
      strength: t.portalStrength,
      spinRate: t.portalSpinRate,
      windings: t.portalWindings,
      enabled: t.portalEnabled,
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
        try {
          const box = mesh.getBoundingBox(true)
          bbox = {
            min: box.min.clone(),
            max: box.max.clone(),
            size: box.getSize(new THREE.Vector3()),
          }
        } catch (err) {
          console.warn('[Portal] getBoundingBox failed', err)
        }
        console.log('[Portal] portal SplatMesh initialized', {
          url: PORTAL_SPLAT_URL,
          numSplats: packed?.numSplats,
          objectBboxMin: bbox?.min.toArray(),
          objectBboxMax: bbox?.max.toArray(),
          objectBboxSize: bbox?.size.toArray(),
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
    if (!portal || !mesh || !portalMeshReady) return
    if (portalEnabled) {
      portal.attach(mesh)
      attachedMeshRef.current = mesh
      return () => {
        portal.detach(mesh)
        if (attachedMeshRef.current === mesh) attachedMeshRef.current = null
      }
    }
    if (attachedMeshRef.current) {
      portal.detach(attachedMeshRef.current)
      attachedMeshRef.current = null
    }
  }, [portalEnabled, portalMeshReady])

  // ── Seed proxy transform once it mounts (avoids a frame at origin /
  // identity rotation / scale-1 default before the useFrame loop kicks
  // in). All three transforms are applied so the gizmo's first frame
  // matches the persisted store exactly. ─────────────────────────────────
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

    // Transform: when the gizmo is being dragged, the proxy IS the source
    // of truth (TransformControls writes directly into proxy.position /
    // .rotation / .scale, and `handleGizmoChange` mirrors all three back
    // to the store via `onObjectChange`). Otherwise, the store wins and
    // we copy its values into the proxy so external slider edits show up
    // on the next frame. We always read position into `_center` because
    // that's the one the twist modifier needs as a uniform.
    if (draggingRef.current && proxy) {
      _center.copy(proxy.position)
    } else {
      _center.set(t.portalPosX, t.portalPosY, t.portalPosZ)
      if (proxy) {
        proxy.position.copy(_center)
        proxy.rotation.set(
          THREE.MathUtils.degToRad(t.portalRotationDegX),
          THREE.MathUtils.degToRad(t.portalRotationDegY),
          THREE.MathUtils.degToRad(t.portalRotationDegZ),
        )
        proxy.scale.setScalar(t.portalScale)
      }
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

  // ── Gizmo callbacks: write back ALL three transforms (pos/rot/scale)
  // into the persisted store on every change, regardless of which mode
  // the user is currently in. TransformControls only mutates the active
  // mode's component (e.g. translate-mode drags only touch .position),
  // but mirroring all three is cheap and means switching modes never
  // resets the others. We collapse the per-axis scale to a single
  // uniform value because portalScale is a single-number store field
  // (non-uniform splat scaling distorts Gaussians weirdly anyway).
  const handleGizmoChange = () => {
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

  // Only render the helper sphere when the portal is meaningfully active —
  // either the twist itself is on, or the user has the gizmo enabled to
  // place it. Otherwise the translucent purple bubble at world origin (the
  // default position) looks like a bug to anyone who hasn't opened the
  // Portal twist folder yet.
  const showSphere = portalShowSphere && (portalEnabled || portalGizmoEnabled)

  // The portal splat is always rendered while the component is mounted.
  // (Earlier we gated visibility on `portalEnabled || portalGizmoEnabled`,
  // but that made the mesh effectively invisible while debugging
  // placement — users would toggle the portal on, not see the SPZ, and
  // have no signal whether it failed to load or was just hidden. Always
  // rendering it makes "the portal" a concrete piece of geometry users
  // can see at all times; `portalEnabled` now only controls whether the
  // twist + tint modifier is attached, i.e. whether it *swirls*.)
  return (
    <>
      <group ref={setProxy}>
        {showSphere && (
          <mesh
            scale={[portalRadius, portalRadius, portalRadius]}
            renderOrder={9999}
            raycast={() => {}}
          >
            <primitive object={sphereGeo} attach="geometry" />
            <primitive object={sphereMat} attach="material" />
          </mesh>
        )}
        <SplatMeshEl
          ref={portalMeshRef}
          args={[portalSplatArgs]}
          raycast={ignoreRaycast}
        />
      </group>
      {portalGizmoEnabled && proxy && (
        <TransformControls
          object={proxy}
          mode={portalGizmoMode}
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
