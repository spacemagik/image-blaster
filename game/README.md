# Silo Game (Three.js + Spark 2.0 + Rapier)

A standalone vanilla Three.js game in this repo (separate from the `app/` viewer). Third-person `silo` character on a Gaussian splat world, with Rapier physics, Spark 2.0 splat rendering (built-in LOD), and a `lil-gui` tuning panel.

## Stack

- [`three`](https://threejs.org/) — renderer / scene graph
- [`@sparkjsdev/spark`](https://www.npmjs.com/package/@sparkjsdev/spark) — `.spz` splat rendering + LOD
- [`@dimforge/rapier3d-compat`](https://rapier.rs/) — kinematic character controller + trimesh collider
- [`postprocessing`](https://github.com/pmndrs/postprocessing) — bloom / vignette / brightness-contrast
- [`lil-gui`](https://lil-gui.georgealways.com/) — live tuning panel
- Vite + TypeScript

## Quick start

```bash
cd game
npm install
npm run dev
```

Opens `http://localhost:5173/`.

## Controls

| Key | Action |
|-----|--------|
| `WASD` | Move (camera-relative) |
| `Shift` | Sprint |
| `Space` | Jump |
| Mouse drag | Orbit camera around character |
| Mouse wheel | Zoom |

The `lil-gui` panel (top right) controls character size, speeds, camera, lighting, post-processing, and physics.

## Swap the world / character

In `src/main.ts`:

- `CHARACTER_GLB_URL` — character GLB path under `public/`. Animations expected: `idle`, `walk`, `run`, `fall` (see `CLIP_*` constants).
- `WORLD_ASSETS` — the splat (`.spz`) + invisible collider mesh (`.glb`). Tune `colliderGlbUniformScale` if your splat and collider don't match the same world units.

Current assets in `public/`:
- `silo.glb` — character (idle / walk / run / fall / pick / heal)
- `fantasy2.spz` — environment splat (gitignored — too big for GitHub; keep a local copy)
- `fantasy2-collider.glb` — invisible collision mesh for the splat

## Notes

- `.spz` files over 100 MB are gitignored (see repo root `.gitignore`). Keep them locally or host externally and adjust the URL in `WORLD_ASSETS`.
- Build target is `es2022` because Rapier uses top-level `await` for WASM init.
- For production: `npm run build && npm run preview`.
