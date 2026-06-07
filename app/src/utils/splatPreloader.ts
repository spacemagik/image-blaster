/**
 * splatPreloader — background HTTP prefetch for SPZ files.
 *
 * Why this exists:
 *   The first teleport into a new world is slow because Spark has to
 *   (a) DOWNLOAD ~200-350 MB of SPZ bytes over HTTP, then (b) decode
 *   them in a WASM worker, then (c) run Quick-LoD on the decoded
 *   GsplatArray. We can't do (b) or (c) without mounting a SplatMesh
 *   (which would also allocate GPU memory we don't have room for —
 *   Spark's WASM heap can only hold one big SPZ at a time). But we
 *   CAN do (a) cheaply, in the background, while the user is playing
 *   the active world: a plain `fetch(url)` populates the browser's
 *   HTTP cache without touching the GPU or WASM heap. When the user
 *   later walks into the teleport square, Spark's loader sees the
 *   bytes already in cache and skips the slow network round-trip.
 *
 * What this does NOT do:
 *   - It does NOT decode the SPZ. The bytes sit in the HTTP cache
 *     as opaque blobs; Spark still has to decode them on teleport.
 *     Expect teleport time to drop from "download + decode" (30-60s
 *     on a fresh visit) to just "decode" (5-15s).
 *   - It does NOT preload textures, GLBs, or audio. Those are tiny
 *     compared to the SPZ and are already preloaded by their own
 *     systems (see CreaturesScene's preloadCreatureGltfs).
 *
 * Design choices:
 *   - We use `fetch(url, { cache: 'force-cache' })` with a
 *     deliberately-discarded body. The browser still streams the
 *     bytes into the HTTP cache as a side effect; we then read
 *     `.body` once and let it drain so no memory pressure builds
 *     up in the JS heap. (Skipping `.body` would let the response
 *     sit in memory until the GC notices.)
 *   - A module-level Set tracks which URLs we've already kicked off
 *     so repeated calls (e.g. on every re-render of App) don't pile
 *     up duplicate network requests. The set persists for the lifetime
 *     of the page, which matches the lifetime of the HTTP cache.
 *   - Errors are logged but never thrown. A prefetch failure just
 *     means the next teleport falls back to the slow path; no game
 *     behaviour depends on prefetch succeeding.
 *   - We wait for `requestIdleCallback` (or a fallback timeout) so
 *     the prefetch starts during a quiet frame, not while Spark is
 *     still hammering the WASM worker to load the active world. This
 *     keeps the initial-load CPU/network for the active SPZ from
 *     being squeezed by the prefetch.
 */

const prefetched = new Set<string>()
const inFlight = new Map<string, Promise<void>>()

/**
 * Kick off a background fetch for `url` if we haven't already.
 * Returns a promise that resolves when the fetch finishes (or
 * rejects silently — callers don't need to await this).
 *
 * Safe to call repeatedly with the same URL; second+ calls are no-ops.
 */
export function prefetchSplat(url: string): Promise<void> {
  if (!url) return Promise.resolve()
  if (prefetched.has(url)) return Promise.resolve()
  const existing = inFlight.get(url)
  if (existing) return existing

  const run = (async () => {
    try {
      // `cache: 'force-cache'` means: if the resource is in the HTTP
      // cache, use it; if not, fetch and store. This is the gentlest
      // option — it never bypasses the cache and never forces a
      // re-fetch of a perfectly-good cached copy.
      const response = await fetch(url, {
        cache: 'force-cache',
        // `priority: 'low'` is a Chrome/Edge hint that says "this
        // is background work, don't queue ahead of user-visible
        // requests like images or fonts". Firefox/Safari ignore it.
        // The cast is because TypeScript's RequestInit doesn't ship
        // the priority field yet (it's been in the Fetch spec for
        // years but TS lib types lag).
        priority: 'low',
      } as RequestInit & { priority: 'low' })
      if (!response.ok) {
        // 404s here are not catastrophic — the world just won't be
        // pre-cached. Log loudly so dev notices though.
        console.warn(
          `[splatPreloader] HTTP ${response.status} for ${url}; ` +
          `teleport into this world will use the slow path.`
        )
        prefetched.add(url)
        return
      }
      // Drain the body. We don't care about the bytes — we just need
      // the browser to commit them to the HTTP cache before we
      // release the response. Reading body via `arrayBuffer()` would
      // hold the whole 200+ MB in memory; streaming via the reader
      // and discarding chunks keeps peak memory near zero.
      const reader = response.body?.getReader()
      if (reader) {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      }
      prefetched.add(url)
      console.info(`[splatPreloader] cached ${url}`)
    } catch (err) {
      // Network failure, abort, etc. — not fatal. Don't mark as
      // prefetched so a future call can retry.
      console.warn(`[splatPreloader] prefetch failed for ${url}`, err)
    } finally {
      inFlight.delete(url)
    }
  })()
  inFlight.set(url, run)
  return run
}

/**
 * Kick off prefetches for a list of URLs, skipping the one currently
 * active in the SplatRenderer. Uses requestIdleCallback (with a
 * setTimeout fallback) so we don't compete with the active world's
 * initial decode for network/CPU.
 *
 * @param allUrls   Every SPZ URL we might want to teleport into.
 * @param activeUrl The URL currently being loaded/rendered; skipped.
 * @param delayMs   Setting a delay gives the active world some quiet
 *                  time to finish its WASM decode before background
 *                  work starts. 8s is roughly "average time for the
 *                  first SPZ to finish Quick-LoD".
 */
export function prefetchOtherSplats(
  allUrls: readonly string[],
  activeUrl: string,
  delayMs = 8000,
): void {
  const targets = allUrls.filter((u) => u && u !== activeUrl && !prefetched.has(u))
  if (targets.length === 0) return

  const kickoff = () => {
    // requestIdleCallback is the polite "do this when the browser is
    // bored" API. Where unavailable (Safari), setTimeout(0) just
    // queues us as a macrotask, which is good enough.
    const idle = (window as unknown as {
      requestIdleCallback?: (cb: () => void) => void
    }).requestIdleCallback
    const start = () => {
      for (const u of targets) {
        void prefetchSplat(u)
      }
    }
    if (typeof idle === 'function') {
      idle(start)
    } else {
      setTimeout(start, 0)
    }
  }

  if (delayMs > 0) {
    setTimeout(kickoff, delayMs)
  } else {
    kickoff()
  }
}

/** Inspection helper — useful in console for verifying state. */
export function listPrefetchedSplats(): string[] {
  return Array.from(prefetched)
}
