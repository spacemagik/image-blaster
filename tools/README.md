# tools/

Standalone, single-file browser tools we use alongside the main app.
These are vendored so you can modify them in-repo.

## `splat2mesh.html`

Browser-based pipeline that turns a Gaussian splat (`.spz` / `.ply` / `.splat`)
into a triangle-mesh `.glb` you can use as a Rapier physics collider.

- **Tab 1 — Splat → Mesh**: voxel-fills the splat point cloud and triangulates it.
- **Tab 2 — Simplify Mesh**: meshoptimizer quadric decimation, then exports `.glb`.

### Run it locally

Chrome / Firefox refuse to load ES modules from `file://`, so serve the project
over HTTP and hit the URL.

```bash
# From repo root:
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open: <http://127.0.0.1:8765/tools/splat2mesh.html>

The tool's importmap references `../lib/spark.module.js`. That file is **not**
committed (it's a ~5 MB copy of `@sparkjsdev/spark` and is gitignored). To
populate it after a fresh clone:

```bash
cd app && bun install      # or npm install
mkdir -p ../lib
cp node_modules/@sparkjsdev/spark/dist/spark.module.js ../lib/
cp -R node_modules/@sparkjsdev/spark/dist/assets ../lib/
```

### Suggested workflow for a fantasy2-sized scene (~22 M splats)

1. **Load Splat** → `worlds/<world>/output/world/0-world-full_res.spz`
2. **Downsample**: Sample Rate ~10% (≈2 M points is plenty for a coarse collider).
3. **Generate Mesh**: start with Voxel Resolution 50, Fill Radius 2.0. Raise
   Voxel Resolution to 100–150 if walls merge together; raise Fill Radius if
   you see holes.
4. **Send to Simplify Tab** → Target Reduction 85–95% → **Simplify Mesh**.
5. **Export Simplified .glb** → drop it into the target world as `0-world.glb`.

### Modifying it

`splat2mesh.html` is a single self-contained file (HTML + CSS + ES module JS).
Edit it freely — the only external dependencies are Three.js (CDN) and the
vendored `lib/spark.module.js`.

### Attribution

Original tool from [`61cygni/protoverse`](https://github.com/61cygni/protoverse)
(`tools/splat2mesh.html`), MIT licensed. The unmodified upstream license text
is in [`LICENSE-splat2mesh`](./LICENSE-splat2mesh).
