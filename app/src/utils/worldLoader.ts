import worlds from 'virtual:worlds'
import { type World, type WorldEntry } from '../types/world'

export function loadWorlds(): WorldEntry[] {
  return worlds as WorldEntry[]
}

export async function fetchWorlds(): Promise<WorldEntry[]> {
  if (!import.meta.env.DEV) return loadWorlds()

  const response = await fetch('/__worlds', { cache: 'no-store' })
  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<WorldEntry[]>
}

function resolvableAssetUrl(url: string | undefined): string {
  if (!url) return ''
  // Local dev-server asset (served out of `worlds/` by the vite plugin)
  if (url.startsWith('/worlds/')) return url
  // Hosted asset (e.g. a CDN-served .rad) — Spark streams it directly via
  // byte-range fetches, so the host must send CORS + Accept-Ranges headers.
  if (/^https?:\/\//.test(url)) return url
  return ''
}

export function getSplatUrl(world: World): string {
  const splats = world.assets.splats
  // Prefer the Spark streaming-LOD `.rad` file when the world ships one —
  // it streams precomputed LOD chunks (faster first paint, far less main-
  // thread work than decoding the full `.spz` + building LOD live). Falls
  // back to the full-res `.spz` for worlds that don't have a `.rad` yet.
  const rad = resolvableAssetUrl(splats.rad_url)
  if (rad) return rad
  return resolvableAssetUrl(splats.spz_urls.full_res)
}
