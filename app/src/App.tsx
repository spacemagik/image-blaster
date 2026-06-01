import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useRoute, useLocation, Redirect } from 'wouter'
import { WorldViewer } from './components/WorldViewer'
import { WorldSidebar } from './components/WorldSidebar'
import { BottomLeftControls, ViewerModeHotkeys } from './components/BottomLeftControls'
import { TouchControls } from './components/TouchControls'
import { StartScreen } from './components/StartScreen'
import { useSceneProject } from './modules/scene/useSceneProject'
import { fetchWorlds, loadWorlds } from './utils/worldLoader'
import { useDebugStore } from './store/debug'
import { isEditableTarget } from './utils/dom'
import type { WorldEntry, WorldHoverPreview, WorldObjectAsset } from './types/world'
import { TerminalWindowIcon, XIcon } from '@phosphor-icons/react'

const LevaPanel = import.meta.env.DEV
  ? lazy(() => import('leva').then((module) => ({ default: module.Leva })))
  : null
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('./components/DebugPanel').then((module) => ({ default: module.DebugPanel })))
  : null

export function App() {
  const [worlds, setWorlds] = useState(loadWorlds)
  const refreshTimeoutRef = useRef<number | undefined>(undefined)

  const refreshWorlds = useCallback(async () => {
    if (!import.meta.env.DEV) return
    try {
      setWorlds(await fetchWorlds())
    } catch (error) {
      console.warn('Could not refresh local world assets.', error)
    }
  }, [])

  useEffect(() => {
    refreshWorlds()
  }, [refreshWorlds])

  useEffect(() => {
    if (!import.meta.env.DEV) return

    const refreshSoon = () => {
      window.clearTimeout(refreshTimeoutRef.current)
      refreshTimeoutRef.current = window.setTimeout(() => {
        void refreshWorlds()
      }, 150)
    }

    import.meta.hot?.on('worlds-changed', refreshSoon)
    return () => {
      window.clearTimeout(refreshTimeoutRef.current)
      import.meta.hot?.off('worlds-changed', refreshSoon)
    }
  }, [refreshWorlds])

  if (!worlds.length) {
    return (
      <div className="flex items-center justify-center h-screen text-white bg-black">
        No worlds found in worlds/
      </div>
    )
  }

  return (
    <LoadedApp worlds={worlds} />
  )
}

function LoadedApp({ worlds }: { worlds: WorldEntry[] }) {
  const [editMatch, editParams] = useRoute('/:slug/edit')
  const [match, params] = useRoute('/:slug')
  const levaCollapsed = useDebugStore((s) => s.levaCollapsed)
  const setLevaCollapsed = useDebugStore((s) => s.setLevaCollapsed)
  const playMode = useDebugStore((s) => s.playMode)
  const togglePlayMode = useDebugStore((s) => s.togglePlayMode)
  const setPlayMode = useDebugStore((s) => s.setPlayMode)
  // StartScreen gate. Defaults to "showing" on initial mount — the
  // user has to click PLAY before the title overlay disappears. We
  // intentionally do NOT persist this in the debug store: a fresh
  // page load should always start at the title, never drop the user
  // straight into the world. The WorldViewer still MOUNTS under the
  // overlay so heavy assets (SPZ + creature GLBs) can decode while
  // the user is reading the title.
  //
  // Skipped in `/edit` routes so the placement editor still opens
  // directly to its tools (editing through a title screen is silly).
  const [started, setStarted] = useState(false)
  const [location] = useLocation()
  const [sceneProjectEnabled, setSceneProjectEnabled] = useState(true)
  const [selectedWorldVersions, setSelectedWorldVersions] = useState<Record<string, number>>({})
  const [hoveredObjectAssetId, setHoveredObjectAssetId] = useState<string | null>(null)
  const [hoveredObjectInstanceId, setHoveredObjectInstanceId] = useState<string | null>(null)
  const [hoveredWorldPreview, setHoveredWorldPreview] = useState<WorldHoverPreview | null>(null)

  const slug = editParams?.slug ?? params?.slug ?? worlds[0].slug
  const entry = worlds.find((w) => w.slug === slug) ?? worlds[0]
  const editing = Boolean(editMatch)
  const showLeva = import.meta.env.VITE_SHOW_LEVA === 'true'
  // Editor mode forces play-mode off — you can't tune things you can't see.
  const uiVisible = !playMode || editing
  const defaultWorldVersionIndex = entry.worldVersions[entry.worldVersions.length - 1]?.index
  const activeWorldVersionIndex = selectedWorldVersions[entry.slug] ?? defaultWorldVersionIndex
  const activeWorldVersion = entry.worldVersions.find((version) => version.index === activeWorldVersionIndex)
  const activeWorld = activeWorldVersion?.world ?? entry.world
  const renderableObjectAssets = entry.objectAssets.filter((asset) => asset.complete && asset.url)
  const renderableAllObjectAssets = entry.allObjectAssets.filter((asset) => asset.complete && asset.url)
  const hasSidebarWorldRow = Boolean(activeWorldVersion || (activeWorld && Object.values(activeWorld.assets.splats.spz_urls).some(Boolean)))
  const emptyWorld = !hasSidebarWorldRow && !entry.objectAssets.length
  const { sceneProject, sceneProjectReady, updateSceneProject } = useSceneProject(entry.slug, location, entry.sceneProject)
  const sceneProjectActive = Boolean(sceneProject && sceneProjectEnabled)

  useEffect(() => {
    setSceneProjectEnabled(true)
    setHoveredObjectAssetId(null)
    setHoveredObjectInstanceId(null)
    setHoveredWorldPreview(null)
  }, [entry.slug])

  const handleObjectHover = useCallback((asset: WorldObjectAsset, hovering: boolean, instanceId?: string) => {
    setHoveredObjectAssetId((current) => {
      if (hovering) return asset.assetId
      return current === asset.assetId ? null : current
    })
    setHoveredObjectInstanceId((current) => {
      if (hovering) return instanceId ?? null
      return current === instanceId ? null : current
    })
  }, [])

  const handleWorldHover = useCallback((preview: WorldHoverPreview, hovering: boolean) => {
    setHoveredWorldPreview((current) => {
      if (hovering) return preview
      return current?.slug === preview.slug ? null : current
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      // Backtick toggles play-mode (hides all UI). Escape exits play-mode
      // even from arbitrary focus state so the user is never stranded.
      if (event.code === 'Backquote') {
        event.preventDefault()
        togglePlayMode()
      } else if (event.code === 'Escape' && playMode) {
        event.preventDefault()
        setPlayMode(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playMode, togglePlayMode, setPlayMode])

  if (!editMatch && !match) {
    return <Redirect to={`/${worlds[0].slug}`} />
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden select-none [&_*]:focus:outline-none [&_*]:focus-visible:outline-none [&_*]:focus:ring-0 [&_*]:focus-visible:ring-0">
      <ViewerModeHotkeys />
      {!editing && LevaPanel && DebugPanel && showLeva && uiVisible && (
        <div className="hidden md:block">
          <Suspense fallback={null}>
            <LevaPanel
              collapsed={{ collapsed: levaCollapsed, onChange: setLevaCollapsed }}
              theme={{ sizes: { rootWidth: '380px', controlWidth: '180px' } }}
            />
            <DebugPanel />
          </Suspense>
        </div>
      )}
      <WorldViewer
        world={activeWorld}
        slug={entry.slug}
        hoveredWorldPreview={hoveredWorldPreview}
        objectAssets={renderableObjectAssets}
        allObjectAssets={renderableAllObjectAssets}
        worldSfxUrls={entry.worldSfxUrls}
        sceneProject={editing || sceneProjectEnabled ? sceneProject : undefined}
        sceneProjectReady={sceneProjectReady}
        hoveredObjectAssetId={hoveredObjectAssetId}
        hoveredObjectInstanceId={hoveredObjectInstanceId}
        editing={editing}
        uiVisible={uiVisible}
        onObjectHover={handleObjectHover}
        onSceneProjectSaved={updateSceneProject}
      />
      {!editing && uiVisible && emptyWorld && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-6 gap-2">
          <div className="bg-black/25 rounded px-2 py-1 flex items-center gap-2">
            <TerminalWindowIcon size={18} weight="regular" className='animate-pulse' />
            <span className="truncate text-center font-mono text-sm text-white/75">
              waiting for objects and environment...
            </span>
          </div>
        </div>
      )}
      {uiVisible && (
        <div className={`fixed inset-x-4 top-4 sm:left-4 sm:right-auto ${editing ? 'z-30' : 'z-10'}`}>
          <WorldSidebar
            worlds={worlds}
            activeSlug={entry.slug}
            compact={editing}
            activeSceneProject={sceneProject}
            activeSceneProjectEnabled={sceneProjectActive}
            onActiveSceneProjectToggle={() => setSceneProjectEnabled((enabled) => !enabled)}
            activeWorldVersionIndex={activeWorldVersionIndex}
            hoveredObjectAssetId={hoveredObjectAssetId}
            hoveredObjectInstanceId={hoveredObjectInstanceId}
            onObjectHover={handleObjectHover}
            onWorldHover={handleWorldHover}
            onActiveWorldVersionChange={(index) => setSelectedWorldVersions((versions) => ({
              ...versions,
              [entry.slug]: index,
            }))}
          />
        </div>
      )}
      {!editing && uiVisible && (
        <>
          <TouchControls />
        </>
      )}
      {uiVisible && (
        <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center px-4 sm:left-4 sm:right-auto sm:justify-start sm:px-0">
          <BottomLeftControls />
        </div>
      )}
      {playMode && !editing && (
        <button
          type="button"
          onClick={() => setPlayMode(false)}
          className="fixed top-4 right-4 z-30 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md ring-1 ring-white/10 transition hover:bg-black/70"
        >
          <XIcon size={14} weight="bold" />
          Exit play mode
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">esc</span>
        </button>
      )}
      {/* Title screen — sits ABOVE the WorldViewer but BELOW the dev
       *  Leva/Debug panels (z-50 vs Leva's higher z) so we can still
       *  watch perf metrics while we look at the title. Hidden in
       *  the placement editor (`/:slug/edit`) because editing through
       *  a title screen would be silly and would block the editor UI
       *  on first paint. Once the user clicks PLAY we unmount the
       *  overlay entirely — the StartScreen's own fade-out CSS
       *  handles the visual transition before we drop it. */}
      {!editing && !started && (
        <StartScreen onStart={() => setStarted(true)} />
      )}
    </div>
  )
}
