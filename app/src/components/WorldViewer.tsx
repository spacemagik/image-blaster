import { Component, Suspense, useRef, useEffect, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { SplatRenderer } from '../modules/splat/SplatRenderer'
import { EnvironmentMap } from '../modules/environment/EnvironmentMap'
import { WorldCollider } from '../modules/collider/WorldCollider'
import { GroundPlane } from '../modules/collider/GroundPlane'
import { CharacterController, type CharacterControllerHandle } from '../modules/character/CharacterController'
import { FlyController, type FlyControllerHandle } from '../modules/character/FlyController'
import { WizardController, type WizardControllerHandle } from '../modules/character/WizardController'
import { WizardGui } from '../modules/character/WizardGui'
import { WizardLighting } from '../modules/character/WizardLighting'
import { useWizardTuning } from '../modules/character/wizardTuning'
import { ButterflyScene } from '../modules/butterfly/ButterflyScene'
import { ObjectGrid } from '../modules/scene/ObjectGrid'
import { SparkleScene } from '../modules/sparkle/SparkleScene'
import { PortalScene } from '../modules/portal/PortalScene'
import { PlacementEditorOverlay, PlacementEditorScene, usePlacementEditor } from '../modules/scene/PlacementEditor'
import { OriginHelper } from '../modules/scene/OriginHelper'
import { AudioManager } from '../modules/audio/AudioManager'
import { PostProcessing } from '../modules/postprocessing/PostProcessing'
import { DEFAULT_SHADOW_CATCHER_COLOR, DEFAULT_SHADOW_CATCHER_OPACITY, shadowCatcherColor, shadowCatcherOpacity } from '../modules/scene/shadows'
import { getSplatUrl } from '../utils/worldLoader'
import { useDebugStore } from '../store/debug'
import { WorldRenderMode, ObjectRenderMode, ViewerQuality, type Vec3Tuple, type World, type WorldHoverPreview, type WorldObjectAsset, type WorldSceneProject } from '../types/world'

type CharHandle = CharacterControllerHandle | FlyControllerHandle | WizardControllerHandle
const DEFAULT_ENVIRONMENT_URL = '/hdri.jpg'
const DEFAULT_WORLD_SEMANTICS = {
  metric_scale_factor: 1,
  ground_plane_offset: 0,
  flip_y: true,
}

/**
 * Convert a lil-gui `addColor` RGB tuple (0–1 floats) into the `#rrggbb` hex string
 * format that `shadowCatcherColor()` / WorldCollider's ShadowMaterial expects.
 */
function rgbTupleToHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  const hex = (v: number) => clamp(v).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function sunPositionFromRotation(rotation: Vec3Tuple): Vec3Tuple {
  let x = 0
  let y = 10
  let z = 0
  const [rx, ry, rz] = rotation
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)

  ;[y, z] = [y * cx - z * sx, y * sx + z * cx]
  ;[x, z] = [x * cy + z * sy, -x * sy + z * cy]
  ;[x, y] = [x * cz - y * sz, x * sz + y * cz]

  return [x, y, z]
}

interface OptionalAssetBoundaryProps {
  label: string
  resetKey: string
  fallback?: ReactNode
  children: ReactNode
}

interface OptionalAssetBoundaryState {
  hasError: boolean
}

class OptionalAssetBoundary extends Component<OptionalAssetBoundaryProps, OptionalAssetBoundaryState> {
  state: OptionalAssetBoundaryState = { hasError: false }

  static getDerivedStateFromError(): OptionalAssetBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.warn(`Skipping optional world asset "${this.props.label}" because it failed to load.`, error)
  }

  componentDidUpdate(prevProps: OptionalAssetBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}

function GrayEnvironmentFallback() {
  return (
    <>
      <color attach="background" args={['#6b7280']} />
      <ambientLight color="#ffffff" intensity={0.9} />
    </>
  )
}

function DefaultEnvironment({ intensity }: { intensity: number }) {
  return (
    <OptionalAssetBoundary label={DEFAULT_ENVIRONMENT_URL} resetKey={DEFAULT_ENVIRONMENT_URL} fallback={<GrayEnvironmentFallback />}>
      <Suspense fallback={null}>
        <EnvironmentMap panoUrl={DEFAULT_ENVIRONMENT_URL} intensity={intensity} />
      </Suspense>
    </OptionalAssetBoundary>
  )
}

interface Props {
  world?: World
  slug: string
  hoveredWorldPreview?: WorldHoverPreview | null
  objectAssets: WorldObjectAsset[]
  allObjectAssets: WorldObjectAsset[]
  worldSfxUrls: string[]
  sceneProject?: WorldSceneProject
  sceneProjectReady?: boolean
  hoveredObjectAssetId?: string | null
  hoveredObjectInstanceId?: string | null
  editing?: boolean
  uiVisible?: boolean
  onObjectHover?: (asset: WorldObjectAsset, hovering: boolean, instanceId?: string) => void
  onSceneProjectSaved?: (project: WorldSceneProject) => void
}

export function WorldViewer({
  world: desiredWorld,
  slug: desiredSlug,
  hoveredWorldPreview: _hoveredWorldPreview,
  objectAssets: desiredObjectAssets,
  allObjectAssets,
  worldSfxUrls,
  sceneProject,
  sceneProjectReady = true,
  hoveredObjectAssetId,
  hoveredObjectInstanceId,
  editing = false,
  uiVisible = true,
  onObjectHover,
  onSceneProjectSaved,
}: Props) {
  const charRef = useRef<CharHandle>(null)
  const worldRenderMode = useDebugStore((s) => s.worldRenderMode)
  const objectRenderMode = useDebugStore((s) => s.objectRenderMode)
  const viewerQuality = useDebugStore((s) => s.viewerQuality)
  const controllerMode = useDebugStore((s) => s.controllerMode)
  const butterfliesEnabled = useDebugStore((s) => s.butterfliesEnabled)
  const controllerResetToken = useDebugStore((s) => s.controllerResetToken)
  const environmentIntensity = useDebugStore((s) => s.environmentIntensity)
  const sunIntensity = useDebugStore((s) => s.sunIntensity)
  const sunColor = useDebugStore((s) => s.sunColor)
  const colliderUrl = desiredWorld?.assets.mesh.collider_mesh_url.startsWith('/worlds/')
    ? desiredWorld.assets.mesh.collider_mesh_url
    : ''
  const panoUrl = desiredWorld?.assets.imagery.pano_url.startsWith('/worlds/')
    ? desiredWorld.assets.imagery.pano_url
    : ''

  useEffect(() => {
    charRef.current?.reset()
  }, [desiredSlug])

  useEffect(() => {
    if (controllerResetToken > 0) charRef.current?.reset()
  }, [controllerResetToken])

  const splatUrl = desiredWorld ? getSplatUrl(desiredWorld) : ''
  const { ground_plane_offset, flip_y, metric_scale_factor } = desiredWorld?.assets.splats.semantics_metadata ?? DEFAULT_WORLD_SEMANTICS
  const flipY = flip_y ?? true
  const splatFlipYOverride = useWizardTuning((s) => s.splatFlipYOverride)
  // XOR: override flips ONLY the splat without affecting the collider (which keeps `flipY`).
  const splatFlipY = flipY !== splatFlipYOverride
  const baseMetricScaleFactor = metric_scale_factor ?? 1
  const baseGroundPlaneOffset = ground_plane_offset ?? 0
  const isHighQuality = viewerQuality === ViewerQuality.High
  const showScene = worldRenderMode !== WorldRenderMode.ObjectOnly
  const showSplat = showScene && objectRenderMode === ObjectRenderMode.Lit
  const showObjects = worldRenderMode !== WorldRenderMode.SplatOnly
  const placementEditor = usePlacementEditor({
    slug: desiredSlug,
    objects: desiredObjectAssets,
    allObjectAssets,
    sceneProject,
    baseMetricScaleFactor,
    baseGroundPlaneOffset,
    sceneProjectReady,
    editing,
    hoveredObjectAssetId,
    hoveredObjectInstanceId,
    onObjectHover,
    onProjectSaved: onSceneProjectSaved,
  })
  const activeSceneSun = editing ? placementEditor.sun : sceneProject?.sun
  const activeSunIntensity = activeSceneSun?.intensity ?? sunIntensity
  const activeEnvironmentIntensity = activeSceneSun?.environmentIntensity ?? environmentIntensity
  const activeSunPosition = sunPositionFromRotation(activeSceneSun?.rotation ?? [0, 0, 0])
  const activeMetricScaleFactor = editing ? placementEditor.metricScaleFactor : sceneProject?.metricScaleFactor ?? baseMetricScaleFactor
  const defaultGroundPlaneOffset = baseGroundPlaneOffset * (activeMetricScaleFactor / baseMetricScaleFactor)
  const activeGroundPlaneOffset = editing
    ? placementEditor.groundPlaneOffset
    : sceneProject?.groundPlaneOffset ?? defaultGroundPlaneOffset
  const sceneGroundPlaneColliderEnabled = editing
    ? placementEditor.groundPlaneColliderEnabled
    : sceneProject?.groundPlaneColliderEnabled ?? true
  const activeGroundPlaneColliderEnabled = worldRenderMode === WorldRenderMode.ObjectOnly
    ? true
    : sceneGroundPlaneColliderEnabled
  const sceneShadowCatcherOpacity = editing ? placementEditor.shadowCatcherOpacity : sceneProject?.shadowCatcherOpacity
  const sceneShadowCatcherOpacityValue = shadowCatcherOpacity(sceneShadowCatcherOpacity ?? DEFAULT_SHADOW_CATCHER_OPACITY)
  const sceneShadowCatcherColor = editing ? placementEditor.shadowCatcherColor : sceneProject?.shadowCatcherColor
  const sceneShadowCatcherColorValue = shadowCatcherColor(sceneShadowCatcherColor ?? DEFAULT_SHADOW_CATCHER_COLOR)
  // Wizard mode overrides the scene's shadow-catcher tint with the values the user is
  // dragging in the lil-gui Shadows folder, so "Collider GLB shadow tint" actually drives
  // the on-floor shadow color/opacity (porting astronaut's `colliderGlbShadow*` knobs).
  // `activeControllerMode` is declared a few lines below; we read it lazily via the
  // `isWizardMode` derivation right after it's available.
  const wizardShadowColor = useWizardTuning((s) => s.colliderGlbShadowColor)
  const wizardShadowOpacity = useWizardTuning((s) => s.colliderGlbShadowOpacity)
  const colliderOffsetX = useWizardTuning((s) => s.colliderOffsetX)
  const colliderOffsetY = useWizardTuning((s) => s.colliderOffsetY)
  const colliderOffsetZ = useWizardTuning((s) => s.colliderOffsetZ)
  const objectPlacements = sceneProject?.instances ?? placementEditor.instances
  const objectPhysicsAssets = sceneProject?.instances.length ? allObjectAssets : desiredObjectAssets
  const activeControllerMode = editing ? 'fly' : controllerMode
  const isWizardMode = activeControllerMode === 'wizard'
  const activeShadowCatcherOpacity = isWizardMode ? wizardShadowOpacity : sceneShadowCatcherOpacityValue
  const activeShadowCatcherColor = isWizardMode
    ? rgbTupleToHex(wizardShadowColor)
    : sceneShadowCatcherColorValue
  return (
    <>
      <Canvas
        camera={{ fov: 75, near: 0.1, far: 1000 }}
        className="w-full h-full"
        gl={{ antialias: false }}
        // Wizard mode requires shadows even in Low quality — the astronaut character
        // controller demo always runs with renderer.shadowMap.enabled = true so the
        // character casts a real-time shadow on the splat floor. Without this the
        // WizardLighting sun won't render shadows at all in Low mode.
        shadows={isHighQuality || activeControllerMode === 'wizard'}
      >
        <Suspense fallback={null}>
          <AudioManager urls={worldSfxUrls} />
          <Physics key={`${desiredSlug}:${controllerResetToken}`} gravity={[0, -9.81, 0]}>
            {activeControllerMode === 'fly' ? (
              <FlyController ref={charRef as React.RefObject<FlyControllerHandle>} preserveCameraOnMount={editing} />
            ) : activeControllerMode === 'wizard' ? (
              <>
                <WizardController ref={charRef as React.RefObject<WizardControllerHandle>} />
                <WizardLighting />
              </>
            ) : (
              <CharacterController ref={charRef as React.RefObject<CharacterControllerHandle>} />
            )}
            {showScene && colliderUrl && (
              <OptionalAssetBoundary label={colliderUrl} resetKey={colliderUrl}>
                <Suspense fallback={null}>
                  <WorldCollider
                    url={colliderUrl}
                    flipY={flipY}
                    groundPlaneOffset={activeGroundPlaneOffset}
                    metricScaleFactor={activeMetricScaleFactor}
                    shadowOpacity={activeShadowCatcherOpacity}
                    shadowColor={activeShadowCatcherColor}
                    offsetX={colliderOffsetX}
                    offsetY={colliderOffsetY}
                    offsetZ={colliderOffsetZ}
                    forceShadowCatcher={isWizardMode}
                  />
                </Suspense>
              </OptionalAssetBoundary>
            )}
            {/*
              Object placements ride along with the collider GLB offset so they sit on
              the visible GLB floor instead of the y=0 world ground plane. We pass the
              offset down through `ObjectGrid` and bake it into each placement before
              it reaches `SceneObject`, because Rapier's `RigidBody.setTranslation` (in
              `SceneObject`'s useEffect) writes the WORLD position and ignores any
              parent <group> transform — wrapping the grid in a <group position=offset>
              gets silently overridden on every mount.

              Editor mode keeps a plain offset prop too; `EditableObject` uses a vanilla
              <group> (no Rapier), but TransformControls bakes world matrices back to
              scene.json, so we DO NOT pre-offset in editor mode to avoid corrupting
              saved positions. The collider's offset is only visualised at runtime.
            */}
            {showObjects && !editing && (
              <Suspense fallback={null}>
                <ObjectGrid
                  objects={objectPhysicsAssets}
                  placements={objectPlacements}
                  offset={[colliderOffsetX, colliderOffsetY, colliderOffsetZ]}
                />
              </Suspense>
            )}
            {showObjects && editing && (
              <Suspense fallback={null}>
                <PlacementEditorScene controller={placementEditor} renderMode={objectRenderMode} />
              </Suspense>
            )}
            <GroundPlane
              groundColliderEnabled={activeGroundPlaneColliderEnabled}
            />
          </Physics>
          {splatUrl && (
            <OptionalAssetBoundary label={splatUrl} resetKey={splatUrl}>
              <SplatRenderer
                url={splatUrl}
                visible={showSplat}
                groundPlaneOffset={activeGroundPlaneOffset}
                flipY={splatFlipY}
                metricScaleFactor={activeMetricScaleFactor}
              />
            </OptionalAssetBoundary>
          )}
          <directionalLight
            // WizardLighting owns shadow casting in wizard mode (its sun follows the
            // character feet for sharp player-relative shadows); turn the static scene
            // light's shadow off there to avoid double-casting.
            castShadow={isHighQuality && activeSunIntensity > 0 && activeControllerMode !== 'wizard'}
            color={sunColor}
            intensity={activeSunIntensity}
            position={activeSunPosition}
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0001}
            shadow-normalBias={0.02}
            shadow-camera-near={0.5}
            shadow-camera-far={30}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          {panoUrl && (
            <OptionalAssetBoundary label={panoUrl} resetKey={panoUrl} fallback={<DefaultEnvironment intensity={activeEnvironmentIntensity} />}>
              <Suspense fallback={null}>
                <EnvironmentMap panoUrl={panoUrl} intensity={activeEnvironmentIntensity} />
              </Suspense>
            </OptionalAssetBoundary>
          )}
          {!panoUrl && <DefaultEnvironment intensity={activeEnvironmentIntensity} />}
          {butterfliesEnabled && <ButterflyScene />}
          <SparkleScene />
          <PortalScene />
          <OriginHelper />
          {/* PostProcessing wraps the ENTIRE scene render — splats,
              GLB objects, character, sky/HDRI, sparkles, portal. Used
              to be gated on `isHighQuality` so Low-quality viewers got
              no effects at all; that gate is removed so the user's
              GUI knobs always have a surface to act on. Individual
              effects still no-op when their `Enabled` toggle is off,
              which is the more granular cost control. */}
          <PostProcessing />
        </Suspense>
      </Canvas>
      {uiVisible && activeControllerMode === 'wizard' && <WizardGui />}
      {editing && uiVisible && <PlacementEditorOverlay controller={placementEditor} />}
    </>
  )
}
