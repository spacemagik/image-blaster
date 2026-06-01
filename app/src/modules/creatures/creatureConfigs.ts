/**
 * Creature config — the registry of GLB props that ship into the world from
 * the GUI's "Creatures" folder. Adding a new creature is two steps:
 *
 *   1. Drop `0-<slug>.glb` into `worlds/<worldSlug>/output/<slug>/`
 *      (matching the placement-editor asset convention) and an
 *      `object.json` so the dev-server plugin discovers it.
 *   2. Append a `CreatureConfig` entry below.
 *
 * The shape mirrors the portal pattern (proxy group with TRS + optional
 * TransformControls gizmo) without the dyno/world-modifier plumbing —
 * creatures are static GLBs the user places by hand, not splat effects.
 *
 * The transforms are persisted as a `Record<slug, CreatureTransform>` in
 * `wizardTuning.creatures`. Keying by slug (instead of flat per-creature
 * fields) means adding a creature does NOT require a schema bump — the
 * migration helper seeds any missing slugs with their default transform
 * the next time the store hydrates.
 */

export type CreatureGizmoMode = 'translate' | 'rotate' | 'scale'

export interface CreatureTransform {
  /** Visible in the scene. When false the GLB is not rendered at all
   *  (and TransformControls is hidden along with it). */
  enabled: boolean
  /** Mounts a `<TransformControls>` handle on the creature so the user
   *  can drag / rotate / scale it directly in the canvas. Off by default
   *  because the gizmo intercepts clicks anywhere it overlaps. */
  gizmoEnabled: boolean
  gizmoMode: CreatureGizmoMode
  posX: number
  posY: number
  posZ: number
  /** Rotation stored in degrees (matches every other "rotation" knob in
   *  the GUI). Converted to radians when applied to the proxy group. */
  rotX: number
  rotY: number
  rotZ: number
  /** Uniform scale. Non-uniform scaling skews shadow casting and rarely
   *  what users want for prop placement, so we expose one slider. */
  scale: number
}

export interface CreatureConfig {
  slug: string
  name: string
  /** Served by the worlds Vite middleware (`/worlds/<world>/output/...`). */
  url: string
  defaultTransform: CreatureTransform
}

const defaultTransform = (
  partial: Partial<CreatureTransform> = {},
): CreatureTransform => ({
  enabled: true,
  gizmoEnabled: false,
  gizmoMode: 'translate',
  posX: 0,
  posY: 0,
  posZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scale: 1,
  ...partial,
})

/**
 * Registry of GLBs accessible from the GUI's "Creatures" folder. Default
 * spawn positions are scattered around the character spawn at
 * `(0, spawnFeetY=4, 0)` in a rough semicircle so every creature is
 * findable on first load — the user can then drag them around with the
 * gizmo (one toggleable TransformControls per creature).
 *
 * Adding a creature here automatically:
 *   - Surfaces a "Creatures → <Name>" subfolder in WizardGui with
 *     visibility + gizmo + TRS controls (the GUI just maps over this
 *     list, see WizardGui.tsx).
 *   - Backfills a default transform in `wizardTuning.creatures` on
 *     next hydrate (the v49 migration runs on every hydrate, not
 *     just the v48→v49 hop — see the comment in wizardTuning.ts
 *     beside `seededCreatures`).
 *   - Triggers the GLB-load → texture-downscale → PBR-strip
 *     optimisation pipeline in CreaturesScene.tsx on first mount.
 * No schema bump or GUI edit required.
 */
export const CREATURE_CONFIGS: CreatureConfig[] = [
  {
    slug: 'verdant-guardian',
    name: 'Verdant Guardian',
    url: '/worlds/fantasy2/output/verdant-guardian/0-verdant-guardian.glb',
    defaultTransform: defaultTransform({ posX: 6, posY: 0, posZ: -6 }),
  },
  {
    slug: 'verdant-sentinel',
    name: 'Verdant Sentinel',
    url: '/worlds/fantasy2/output/verdant-sentinel/0-verdant-sentinel.glb',
    defaultTransform: defaultTransform({ posX: 0, posY: 0, posZ: -8 }),
  },
  {
    slug: 'vinebound-sentinel',
    name: 'Vinebound Sentinel',
    url: '/worlds/fantasy2/output/vinebound-sentinel/0-vinebound-sentinel.glb',
    defaultTransform: defaultTransform({ posX: -6, posY: 0, posZ: -6 }),
  },
  {
    slug: 'hands-of-the-forest',
    name: 'Hands of the Forest',
    url: '/worlds/fantasy2/output/hands-of-the-forest/0-hands-of-the-forest.glb',
    defaultTransform: defaultTransform({ posX: 10, posY: 0, posZ: -2 }),
  },
  {
    // Distinct slug from the existing `verdant-sentinel` (different
    // GLB — this one was generated via Meshy AI). Keeping both lets
    // the user A/B them in the scene without one overwriting the
    // other's persisted transform.
    slug: 'verdant-sentinel-meshy',
    name: 'Verdant Sentinel (Meshy)',
    url: '/worlds/fantasy2/output/verdant-sentinel-meshy/0-verdant-sentinel-meshy.glb',
    defaultTransform: defaultTransform({ posX: -10, posY: 0, posZ: -2 }),
  },
]

/** Returns the `{ slug: CreatureTransform }` record used to seed the store
 *  on first load AND to backfill missing slugs in the migration. */
export function defaultCreatureTransforms(): Record<string, CreatureTransform> {
  return Object.fromEntries(
    CREATURE_CONFIGS.map((config) => [config.slug, { ...config.defaultTransform }]),
  )
}
