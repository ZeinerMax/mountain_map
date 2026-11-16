# mountain_map

3D hiking/mountaineering map: MapTiler Terrain 3D (Cesium quantized mesh) + Tracestrack Topo overlay (OSM-based, tourist paths).

## Run
```
cp .env.example .env     # then fill in the keys (Windows: copy .env.example .env)
npm install
npm run dev              # http://localhost:5173
npm run build            # type-check + production build -> dist/
npm run preview          # serve dist/
```
Keys go in `.env` (git-ignored): `VITE_MAPTILER_KEY` (https://cloud.maptiler.com/account/keys/) and `VITE_TRACESTRACK_KEY` (Tracestrack console). `VITE_*` values end up in the client bundle: restrict keys by origin in the provider consoles. Without keys the app starts and shows a red banner.

## Stack (decision)
CesiumJS + Vite + TypeScript, no UI framework. Cesium natively loads quantized-mesh terrain and imagery layers; Vite is light and fast. Cesium static assets are copied to `/cesium` by `vite-plugin-static-copy` (`stripBase: 4` so they land in `dist/cesium/Workers` etc.); in dev they are served from `node_modules`.

## Architecture (`src/`)
| File | Role |
|---|---|
| `base.ts` | sets `CESIUM_BASE_URL` (imported first) |
| `config.ts` | env keys, tile/terrain/Overpass URLs |
| `map.ts` | Viewer, terrain, satellite base, Topo overlay, credits, `pickGround` |
| `routes.ts` | draw/edit/delete routes, stats, GPX import/export UI, localStorage |
| `profile.ts` | elevation profile canvas with hover marker |
| `geo.ts`, `gpx.ts` | haversine/ascent/descent, GPX parse/build |
| `huts.ts` | Overpass hut/bivouac search, markers, details panel |
| `hud.ts` | compass + tilt, cursor coords/elevation/slope, scale bar |

## Data sources & status of verification
- **VERIFIED** (MapTiler Cesium docs): terrain `https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/?key=KEY` via `CesiumTerrainProvider.fromUrl`; satellite `maps/satellite-v4/{z}/{x}/{y}.jpg?key=KEY`.
- **PARTLY VERIFIED**: Tracestrack `https://tile.tracestrack.com/topo__/{z}/{x}/{y}.png?key=KEY` (host answers 403 "Key is empty" without key). With a real key the URL returns 512 px PNG tiles in standard XYZ numbering (VERIFIED by request, 2026-11-16). Style name and max zoom 19 still come from secondary sources, not official docs. Tracestrack's usage/licence terms are **NOT verified** - check before public use.
- **VERIFIED** (OSM wiki): Overpass public instance is OK below ~10,000 queries / ~1 GB per day; we query only on button click for the current view. OSM data is ODbL, attribution shown.
- **ASSUMPTION**: hut tags `tourism=alpine_hut|wilderness_hut`, `amenity=shelter`.
- Attribution shown in the Cesium credit bar: MapTiler, OpenStreetMap contributors, Tracestrack. MapTiler terms of use not re-read in detail.

## Feature status
| Feature | Status |
|---|---|
| 3D terrain + Topo overlay, opacity, toggle | implemented; **not tested with real keys** |
| Route draw/edit/delete, distance, ascent/descent, profile | implemented; untested in browser |
| GPX import/export, localStorage | implemented; untested in browser |
| Hut search + markers + details | implemented; untested against live Overpass |
| Compass, pitch/tilt | implemented; untested |
| Cursor coords/elevation/slope, scale | implemented; untested |

Verified by running: MapTiler terrain+satellite and Tracestrack tile requests return 200 with real keys; Web-Mercator tiling scheme set for both imagery layers (was missing). Not yet seen in a browser. Also: `npm run build` passes (tsc + vite); dev server serves index, `/src/main.ts` and Cesium workers/widgets with HTTP 200.

## Open issues / next steps
1. Add real keys and test everything in a browser (terrain loads, overlay URL works, 256 vs 512 px tiles).
2. Verify Tracestrack docs/terms and the exact style name.
3. Bundle is ~4 MB (Cesium); consider code-splitting.
4. Undo for route edits, route elevation from terrain sampling accuracy (`sampleTerrainMostDetailed`), waypoint (wpt) GPX import.
5. Self-host/alternate Overpass for production.

Notes for resuming: `obsidian/`, `CLAUDE.md`.
