# Architecture
Back: [[Mountain-map-index]]

## Stack (decision)
CesiumJS + Vite + TypeScript, no UI framework. Reason: Cesium loads quantized-mesh terrain and imagery layers natively; Vite is light. All UI markup lives in `index.html`, styling in `src/style.css`.

## Files (`src/`)
| File | Role |
|---|---|
| `base.ts` | sets `CESIUM_BASE_URL`, must be imported first |
| `config.ts` | env keys, tile/terrain/Overpass URLs |
| `map.ts` | Viewer, terrain, satellite base, Topo overlay, credits; `pickGround`, `flyToPlace` (terrain-aware fly-to, `FLY_RANGE_M` = 250), `terrainHeight`, detail presets (`DETAIL_LEVELS`) |
| `routes.ts` | draw/edit/delete routes, undo, waypoint markers, stats, GPX import/export UI, localStorage; `addRoute()` used by search |
| `routeData.ts` | route/waypoint types, validation of saved data (`sanitizeRoutes`), compact serialisation, deep clone for undo |
| `wmt.ts` | Waymarked Trails route details -> main line (alternatives skipped, unsorted stretches reordered) |
| `profile.ts` | elevation profile canvas with hover marker |
| `geo.ts`, `gpx.ts` | haversine, ascent/descent (10 m hysteresis), GPX parse/build incl. waypoints |
| `huts.ts` | view-based hut search (Overpass) + marker/details panel; `show()` used by search |
| `search.ts` | search bar: coordinates, local index, routes (Waymarked Trails); route line via `wmt.ts`, Overpass fallback |
| `poi.ts` | loads/searches `public/data/poi-alps.json` (accent-insensitive, handles ß/ø) |
| `coords.ts` | coordinate parser (decimal, hemisphere letters, DMS) |
| `overpass.ts` | shared Overpass client with fallback servers |
| `hud.ts` | compass + tilt, cursor coords/elevation/slope, scale bar |
| `scripts/build-index.mjs` | builds the search index from Overpass in 1 degree tiles |

Other: `vercel.json` (security + cache headers, also served by `npm run preview`), `tests/` (Vitest).

## Build gotcha
`vite-plugin-static-copy` needs `rename: { stripBase: 4 }`, otherwise Cesium files land in `dist/cesium/node_modules/...` and the built app cannot find them.
Cesium is split into its own chunk (`build.rolldownOptions.output.codeSplitting`).
The CSP needs `'unsafe-eval'` because of Knockout inside Cesium (see [[Dev-log]] 2026-11-19).

## Rendering
`globe.maximumScreenSpaceError` set by the Detail selector (Low 8 / Medium 4 default / High 2) and `tileCacheSize = 1000` so the map stops re-sharpening while moving. See [[Dev-log]].

See [[Data-sources]] for where data comes from.
