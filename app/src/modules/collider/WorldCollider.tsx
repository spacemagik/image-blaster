import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { TransformControls, useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { useDebugStore } from '../../store/debug'
import { ObjectRenderMode, WorldRenderMode } from '../../types/world'
import { useAssetMaterials } from '../scene/useAssetMaterials'
import { DROP_TARGET_LAYER } from '../scene/dropTargets'
import { shadowCatcherColor, shadowCatcherOpacity } from '../scene/shadows'
import { useWizardTuning } from '../character/wizardTuning'

interface Props {
  url: string
  flipY?: boolean
  groundPlaneOffset?: number
  metricScaleFactor?: number
  shadowOpacity?: number
  shadowColor?: string
  /** Runtime nudge for misaligned collider GLBs — applied as a translation only, no BVH rebuild. */
  offsetX?: number
  offsetY?: number
  offsetZ?: number
  /**
   * Always mount an invisible ShadowMaterial clone of the collider in parallel with
   * whatever visible render mode is active. Used by Wizard mode so the floor catches
   * the character's real-time shadow without forcing the user into Lit object render
   * mode (the wireframe / shaded modes don't render a shadow catcher otherwise).
   */
  forceShadowCatcher?: boolean
}

const ignoreRaycast: THREE.Object3D['raycast'] = () => {}

export function WorldCollider({ url, flipY, groundPlaneOffset, metricScaleFactor, shadowOpacity, shadowColor, offsetX, offsetY, offsetZ, forceShadowCatcher }: Props) {
  const { scene: rawScene } = useGLTF(url)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  // Gizmo subscribes here (not via prop) because the toggle is
  // independent of the alignment props plumbed from WorldViewer and
  // we don't want to widen every WorldCollider call site for a
  // debug-only feature. Reads are cheap (zustand selectors are
  // ref-equality short-circuited) so this doesn't cost re-renders
  // unless the boolean actually flips.
  const gizmoEnabled = useWizardTuning((s) => s.colliderGizmoEnabled)
  const { wireframeMaterial, shadedMaterial, wireframeOverlayMaterial } = useAssetMaterials()
  const normalizedGroundPlaneOffset = groundPlaneOffset ?? 0
  const normalizedMetricScaleFactor = metricScaleFactor ?? 1
  const normalizedOffsetX = offsetX ?? 0
  const normalizedOffsetY = offsetY ?? 0
  const normalizedOffsetZ = offsetZ ?? 0
  const normalizedRotation = flipY ? Math.PI : 0
  // Translation deliberately omitted from the key — we update it via setTranslation
  // (cheap) instead of remounting the RigidBody (rebuilds the trimesh BVH, ~seconds
  // for a 2M-vertex collider).
  const colliderTransformKey = `${url}:${normalizedRotation}:${normalizedGroundPlaneOffset}:${normalizedMetricScaleFactor}`
  const bodyRef = useRef<RapierRigidBody | null>(null)
  const initialBodyPosition: [number, number, number] = [
    normalizedOffsetX,
    normalizedGroundPlaneOffset + normalizedOffsetY,
    normalizedOffsetZ,
  ]
  const visualPosition: [number, number, number] = initialBodyPosition

  // Gizmo proxy: an invisible group at the same world-space position
  // as the collider body. TransformControls drives this proxy, and
  // `handleGizmoChange` mirrors its position back into the wizard-
  // tuning store. The collider's existing live-update `useEffect`
  // (calls `setTranslation` on the RigidBody) picks up the store
  // change and moves the actual physics body — no BVH rebuild,
  // because translation is decoupled from the trimesh key.
  // useState (not useRef) because TransformControls' `object` prop
  // needs to trigger a re-render when the proxy mounts so the gizmo
  // can attach on the same frame.
  const [gizmoProxy, setGizmoProxy] = useState<THREE.Group | null>(null)
  const handleGizmoChange = useCallback(() => {
    const g = gizmoProxy
    if (!g) return
    // Subtract ground plane offset because that piece is authored in
    // the world manifest, not a user knob. We only want to write the
    // user-controlled delta back into the store; otherwise dragging
    // would slowly drift the offset by `groundPlaneOffset` each time
    // the gizmo re-snaps to the proxy's world position.
    useWizardTuning.getState().setTuning({
      colliderOffsetX: g.position.x,
      colliderOffsetY: g.position.y - normalizedGroundPlaneOffset,
      colliderOffsetZ: g.position.z,
    })
  }, [gizmoProxy, normalizedGroundPlaneOffset])

  // Live-update the fixed body's translation when the GUI offset sliders change.
  // setTranslation reuses the existing collider/BVH so trimesh stays mounted.
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    body.setTranslation({
      x: normalizedOffsetX,
      y: normalizedGroundPlaneOffset + normalizedOffsetY,
      z: normalizedOffsetZ,
    }, true)
  }, [normalizedOffsetX, normalizedOffsetY, normalizedOffsetZ, normalizedGroundPlaneOffset, colliderTransformKey])

  // Own shadow material instance — not shared, so shader compiles correctly per-mesh
  const shadowMat = useMemo(() => new THREE.ShadowMaterial({
    color: shadowCatcherColor(shadowColor),
    opacity: shadowCatcherOpacity(shadowOpacity),
    transparent: true,
    depthWrite: false,
  }), [shadowColor, shadowOpacity])
  useEffect(() => () => shadowMat.dispose(), [shadowMat])

  useEffect(() => {
    shadowMat.color.set(shadowCatcherColor(shadowColor))
    shadowMat.opacity = shadowCatcherOpacity(shadowOpacity)
    shadowMat.needsUpdate = true
  }, [shadowColor, shadowMat, shadowOpacity])

  const { scene, overlayScene, dropTargetScene, shadowCatcherScene } = useMemo(() => {
    const dropTargetScene = cloneSkeleton(rawScene)
    dropTargetScene.traverse((child) => {
      child.layers.set(DROP_TARGET_LAYER)
    })
    return {
      scene: cloneSkeleton(rawScene),
      overlayScene: cloneSkeleton(rawScene),
      dropTargetScene,
      shadowCatcherScene: cloneSkeleton(rawScene),
    }
  }, [rawScene])

  // Configure the parallel shadow-catcher clone — applied unconditionally so it's ready
  // the moment `forceShadowCatcher` flips on. ShadowMaterial is transparent everywhere
  // except shadowed pixels, so leaving the clone mounted always is visually a no-op
  // (we still gate the JSX below on `forceShadowCatcher` to avoid an extra draw pass).
  useEffect(() => {
    shadowCatcherScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.material = shadowMat
      child.castShadow = false
      child.receiveShadow = true
      child.raycast = ignoreRaycast
    })
  }, [shadowCatcherScene, shadowMat])

  const showMesh = worldRenderMode !== WorldRenderMode.ObjectOnly

  useEffect(() => {
    const isShadowCatcher = objectRenderMode === ObjectRenderMode.Lit
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.visible = showMesh
      child.raycast = ignoreRaycast
      child.receiveShadow = isShadowCatcher
      if (child.material !== wireframeMaterial && child.material !== shadedMaterial && child.material !== shadowMat) {
        const old = Array.isArray(child.material) ? child.material : [child.material]
        old.forEach((m) => m?.dispose?.())
      }
      child.material = isShadowCatcher ? shadowMat
        : objectRenderMode === ObjectRenderMode.ShadedWireframe ? shadedMaterial
        : wireframeMaterial
      child.material.needsUpdate = true
    })
  }, [scene, showMesh, objectRenderMode, wireframeMaterial, shadedMaterial, shadowMat])

  useEffect(() => {
    overlayScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.material = wireframeOverlayMaterial
      child.renderOrder = 1
      child.raycast = ignoreRaycast
    })
  }, [overlayScene, wireframeOverlayMaterial])

  return (
    <>
      <RigidBody
        key={colliderTransformKey}
        ref={bodyRef}
        type="fixed"
        colliders="trimesh"
        rotation={[normalizedRotation, 0, 0]}
        position={initialBodyPosition}
        scale={[normalizedMetricScaleFactor, normalizedMetricScaleFactor, normalizedMetricScaleFactor]}
      >
        <primitive object={scene} />
        {objectRenderMode === ObjectRenderMode.ShadedWireframe && showMesh && (
          <primitive object={overlayScene} />
        )}
      </RigidBody>
      <primitive
        object={dropTargetScene}
        rotation={[normalizedRotation, 0, 0]}
        position={visualPosition}
        scale={[normalizedMetricScaleFactor, normalizedMetricScaleFactor, normalizedMetricScaleFactor]}
      />
      {forceShadowCatcher && (
        <primitive
          object={shadowCatcherScene}
          rotation={[normalizedRotation, 0, 0]}
          position={visualPosition}
          scale={[normalizedMetricScaleFactor, normalizedMetricScaleFactor, normalizedMetricScaleFactor]}
        />
      )}
      {/* Gizmo proxy lives OUTSIDE the RigidBody — TransformControls
       *  can only drive a plain Object3D, not a rapier body, so we
       *  use a separate <group> at the same world position and mirror
       *  it back into the store. The group renders nothing visible
       *  itself (no children); only the TransformControls handles
       *  draw. We position the proxy via the same arithmetic the body
       *  uses so the gizmo snaps to the collider exactly. */}
      <group ref={setGizmoProxy} position={visualPosition} />
      {gizmoEnabled && gizmoProxy && (
        <TransformControls
          object={gizmoProxy}
          mode="translate"
          onObjectChange={handleGizmoChange}
        />
      )}
    </>
  )
}
