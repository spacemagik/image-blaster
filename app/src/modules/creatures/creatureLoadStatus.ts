/**
 * creatureLoadStatus — a tiny shared store that tracks which creature
 * GLBs have finished loading + first-render.
 *
 * Why this exists:
 *   Each `<CreatureInstance>` suspends until its GLB is downloaded,
 *   parsed, and ready to mount. R3F's `<Suspense>` handles the wait
 *   internally, but it gives NO callback for "the suspended subtree
 *   has now rendered" — there's no shared bus reporting completion.
 *
 *   The StartScreen needs that signal: it wants to delay fading out
 *   until the heaviest creature ("hands of the forest" at 52 MB,
 *   "verdant sentinel" at 66 MB) is actually visible. Otherwise the
 *   user clicks PLAY, the world appears, they start running toward
 *   a spawn position, and the hands pops into existence under their
 *   nose mid-stride. Which is exactly what they reported on the
 *   May 31 '26 19:49 message.
 *
 * How it works:
 *   - Each CreatureModel calls `markLoaded(slug)` once, in a useEffect
 *     that fires immediately after first render. Because the component
 *     only renders post-Suspense (i.e. AFTER the GLB ArrayBuffer +
 *     textures are in JS heap), "marked loaded" implies "rendered at
 *     least once".
 *   - `useAllCreaturesLoaded()` is a derived boolean selector that
 *     returns true once we've heard from every slug in
 *     `CREATURE_CONFIGS`. Components subscribe via Zustand so only
 *     they re-render when the count changes; everything else (which
 *     never reads this store) is unaffected.
 *
 * Not persisted:
 *   Load state is ephemeral — every page reload starts at zero. So
 *   this is a plain `create()` store, no `persist` middleware. The
 *   slugs are stashed in a Set for O(1) duplicate-add filtering
 *   (CreatureModel re-renders shouldn't double-count).
 */
import { create } from 'zustand'
import { CREATURE_CONFIGS } from './creatureConfigs'

interface CreatureLoadState {
  /** Slugs whose CreatureModel has rendered at least once this page
   *  lifetime. Compared against `CREATURE_CONFIGS.length` for the
   *  "all loaded" derived flag. */
  loadedSlugs: Set<string>
  /** Idempotent: calling repeatedly with the same slug is a no-op. */
  markLoaded: (slug: string) => void
  /** Useful for testing / world-switch scenarios. Currently unused
   *  in app code because we never tear down + remount creatures
   *  mid-session, but kept here so future world-swap flows have a
   *  clean reset hook. */
  reset: () => void
}

export const useCreatureLoadStore = create<CreatureLoadState>((set, get) => ({
  loadedSlugs: new Set(),
  markLoaded: (slug) => {
    // Skip the set-replace if we'd already counted this slug — saves
    // a re-render on every subsequent useEffect re-run (e.g. if a
    // future code path remounts a CreatureModel).
    if (get().loadedSlugs.has(slug)) return
    set((state) => {
      const next = new Set(state.loadedSlugs)
      next.add(slug)
      return { loadedSlugs: next }
    })
  },
  reset: () => set({ loadedSlugs: new Set() }),
}))

/**
 * Returns true once every creature in `CREATURE_CONFIGS` has been
 * marked loaded. Components using this re-render exactly twice in
 * the page lifetime: false → true. Cheap to use anywhere.
 *
 * If CREATURE_CONFIGS is empty (no creatures registered for the
 * world) we return true immediately so consumers don't deadlock
 * waiting for a count that will never arrive.
 */
export function useAllCreaturesLoaded(): boolean {
  const count = useCreatureLoadStore((s) => s.loadedSlugs.size)
  if (CREATURE_CONFIGS.length === 0) return true
  return count >= CREATURE_CONFIGS.length
}
