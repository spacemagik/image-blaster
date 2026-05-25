import { useMemo, useEffect, useRef } from 'react'
import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { useDebugStore } from '../../store/debug'
import { ObjectRenderMode, WorldRenderMode } from '../../types/world'
import { useAssetMaterials } from '../scene/useAssetMaterials'
import { DROP_TARGET_LAYER } from '../scene/dropTargets'
import { shadowCatcherColor, shadowCatcherOpacity } from '../scene/shadows'

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
    </>
  )
}
