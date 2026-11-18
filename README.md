# mountain_map

**Live:** https://mountain-map.vercel.app · **Repo:** https://github.com/ZeinerMax/mountain_map

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
| `huts.ts` | view-based Overpass hut/bivouac search, markers, details panel (also shows peaks/huts picked in the global search) |
| `search.ts` | global search bar: local index for peaks/huts/bivouacs + Waymarked Trails for routes; route geometry via Overpass |
| `poi.ts` | loads and searches the local index `public/data/poi-alps.json` (accent-insensitive, ß/ø handled) |
| `scripts/build-index.mjs` | builds the index from Overpass in 1 degree tiles (resumable, cache in `.cache/`, splits failing tiles) |
| `overpass.ts` | shared Overpass client with fallback servers |
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
| Hut search + markers + details (current view) | implemented; untested against live Overpass |
| Global search bar with suggestions (peaks, huts, bivouacs from local Alps index; routes worldwide) | implemented and browser-tested 2026-11-18 (16/17 automated checks; 1 failure was an Overpass timeout) |
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

## Development log (all on 2026-11-16)

### How it was built
1. **Plan and scaffold.** One autonomous Claude Code run produced the Vite + TypeScript + CesiumJS project and all six feature areas (terrain + overlay, routes, GPX, hut search, compass, info bar). The terminal was then closed by accident, so the work was resumed in a new session by reading the files left on disk.
2. **Review and build check.** `npm run build` passed, but the output was wrong (see problem 1). Dev server was started and its static files requested to confirm they are served.
3. **Documentation.** README, `CLAUDE.md` and Obsidian notes in `obsidian/` were written so a later session can resume without re-analysis.
4. **Keys and live check.** MapTiler and Tracestrack keys were added to `.env` and tested with real requests (see problems 2-4).
5. **Publish.** Committed and pushed to GitHub, then deployed to Vercel with the keys set as production environment variables.

### What was difficult and how it was solved
| # | Problem | How it was found | Fix |
|---|---|---|---|
| 1 | Production build copied Cesium workers/assets to `dist/cesium/node_modules/cesium/Build/Cesium/...`, so the built app could not find them. | Listing `dist/` after the first build. | `rename: { stripBase: 4 }` in `vite.config.ts`, now `dist/cesium/Workers` etc. |
| 2 | MapTiler key in `.env.example` was actually the full terrain URL (`.../tiles.json?key=...`), and sat in the template that gets committed. API answered 403 "Invalid key". | Key length (92) did not match a real key; masked-pattern check of the value. | Moved to git-ignored `.env`, kept only the part after `key=`, blanked `.env.example`. Terrain and satellite then returned 200. |
| 3 | Imagery layers had no tiling scheme. Cesium's `UrlTemplateImageryProvider` defaults to a geographic scheme, but MapTiler/Tracestrack tiles are Web Mercator, so they would be misplaced. | Code review while testing the tile URLs. | `tilingScheme: new Cesium.WebMercatorTilingScheme()` on both layers. |
| 4 | Tracestrack tile size and style name were only assumed (docs site was not reachable). | Real tile request with the key. | Confirmed `topo__` URL returns 512 px PNG tiles in XYZ numbering; set `tileWidth/Height: 512`. Max zoom 19 and licence terms are still unverified. |
| 5 | Public Overpass server answered 502 "at capacity" (and 406 to a bare curl). | Test query. | Not a code bug: the app shows an error message and the user can retry; endpoint is configurable via `VITE_OVERPASS_URL`. |
| 6 | Vercel `env add` for `VITE_*` names refused interactive use and warned the value is public. | CLI output. | Added with `--type config --value ...`. Keys in a client-only app are public by design, so they must be restricted by origin in the provider consoles. |

### Key decisions
- CesiumJS + Vite, no UI framework: native quantized-mesh terrain and imagery layers, light bundler.
- Keys only through `VITE_*` env vars; `.env` is git-ignored; `.env.example` stays blank.
- Overlay is Tracestrack (needs its own key); OSM data for huts comes from Overpass (no key).
- Routes stored in browser `localStorage` (no backend).

### Deployment
- GitHub: `main` pushed 2026-11-16 (commit `2e5c4c4`).
- Vercel: `vercel deploy --prod` from the project folder, project `mountain-map`, alias https://mountain-map.vercel.app. The repo is not connected to Vercel, so pushes do not auto-deploy.
- TODO: restrict both API keys to the Vercel domain and `localhost`; enable 2FA on the Vercel account.

### 2026-11-17: global search bar
- **Goal:** search peaks, huts, bivouacs and routes across the whole world (not just the view), with suggestions while typing.
- **Sources (no keys):** Photon `photon.komoot.io` with `osm_tag` filters (natural:peak, tourism:alpine_hut, tourism:wilderness_hut, amenity:shelter) - verified by request; Waymarked Trails `hiking.waymarkedtrails.org/api/v1/list/search` for routes - verified by request, CORS open. Nominatim rejected: its policy forbids autocomplete. MapTiler geocoding also works with the existing key (not used; returns places/landforms, weaker for huts).
- **Difficult part - route geometry:** Waymarked Trails finds routes but has no simple geometry endpoint (`/geometry/geojson` returns 404). Solved with an Overpass query for the relation and its sub-relations (`rel(ID)->.a;rel(r.a)->.b;(way(r.a);way(r.b););out geom;`), then chaining the ways greedily into one line (`chainWays` in `search.ts`).
- **Difficult part - Overpass reliability:** the public server returned 502/504 and two fallback servers did not answer. `overpass.ts` tries the configured server, then `maps.mail.ru` (answered 200), then `private.coffee`.
- **Measured:** Walker's Haute Route (997 ways, 26,000 points) took ~35 s and 1.9 MB from Overpass. Long routes are slow to load.
- **Known limitation:** routes with alternative variants are chained into one line, so length can exceed the official one (this route: 292 km vs 209 km, with one 25 km straight jump between branches). A proper fix would draw each way as its own segment.
- **Untested:** typing/dropdown/keyboard behaviour and layout in a browser; Photon fair-use terms not read in full.

### 2026-11-18: local index, browser test, route fix
- **Photon dropped.** Its public server timed out on every request on 2026-11-17. Replaced by a local index `public/data/poi-alps.json` (108,191 named places: 88,458 peaks, 4,483 alpine huts, 2,148 bivouacs, 13,102 shelters; 6.5 MB, ~2.4 MB gzipped; built 2026-11-17/18, no tiles missing). Served as a static file by Vercel, searched in the browser, loaded on first search.
- **Difficult part - building the index.** One world-wide Overpass query times out, so `scripts/build-index.mjs` queries 1 degree tiles (78 for the Alps). The public servers returned 502/504 for hours; the first run crashed on tile 45 and lost everything because it only wrote at the end. Fixed: per-tile cache in `.cache/` (resume), automatic splitting into quarter tiles, skipped boxes listed in the file's `incomplete` field and retried on rerun. Total time about 12 hours of waiting, mostly Overpass.
- **Search limits.** Only the Alps (lat 43.5-48.3, lon 4.8-17.0). Unnamed huts are not indexed. Up to 6 peaks and 6 huts shown so huts are not crowded out. Index must be refreshed by rerunning the script (delete `.cache/` first for fresh data). Data is OSM, ODbL, attribution in the UI.
- **Browser test** (Playwright driving Edge, headless): typing, suggestions, Enter, details panel, route loading, layout on 1366 px and 390 px. Found and fixed: ß not matched (Großglockner), huts crowded out by peaks.
- **Route geometry fix.** Joining all sub-relations greedily made the Tour du Mont Blanc 299 km / 29,600 m ascent. Now uses the relation's own ways in member order and skips alternative/excursion roles. Result: TMB 182 km (official ~170), Walker's Haute Route 268 km (official ~209, variants remain). Load time 75-105 s, dominated by Overpass.
- **Ascent is approximate.** Terrain-sampled ascent is inflated (TMB ~14,000 m vs ~10,000 m commonly quoted); hysteresis threshold raised 3 m -> 10 m, only a small improvement. Do not treat as survey-grade.
- **Known issues.** Route loading fails when Overpass is down (message shown, retry). Desktop headless screenshots showed a black globe (software WebGL in the test browser), not checked on real hardware by me.

### 2026-11-18 (later): coordinates, fly-to fix, faster search
- **Coordinate search** (`src/coords.ts`): paste `47.0386353N, 13.0670286E`, `47.0386353, 13.0670286`, `N 47.0386 E 13.0670`, DMS `47°02'19.9"N 13°04'01.3"E`, or decimal-minutes; hemisphere letters (any order) decide lat/lon, otherwise lat, lon; south/west give negatives. A "Coordinates" suggestion appears at once; Enter drops a pin labelled with coordinates and terrain elevation and flies there. 24 parser cases tested (node) and 4 formats tested in the browser. Needs a decimal point, hemisphere letter or degree sign so plain numbers in names are not hijacked. Plain "lat, lon" with lat <= 90 is always read as lat, lon (a lon, lat order cannot be detected).
- **Fly-to bug fixed:** the old code looked at a point at sea level from 2.5 km, so at high peaks (Grossglockner 3798 m) the camera was inside the mountain. Now the real terrain height is sampled first (`flyToPlace` in `map.ts`) and the camera sits `FLY_RANGE_M = 250` m away at -35 deg pitch (measured: 150 m gave a ~10 m scale bar, 250 m gives roughly 20 m). Change the constant to taste.
- **Speed:** the index loads in the background at start-up (idle), local results and coordinates are computed on every keystroke without debounce (measured 200-330 ms from typing to suggestions in the headless test, including browser overhead); only the route lookup is debounced (250 ms). Route loading itself (75-105 s for long routes) is still limited by the public Overpass servers.
- **Fixes found by testing:** a pending route search could re-open the dropdown after choosing a result (now cancelled); Waymarked Trails returned loose fuzzy matches such as "Gross - Gross" for "Grossglockner" (now only routes containing all query words are shown).
- **Not tested:** feel of the 250 m distance on real hardware, other coordinate styles (e.g. "47 02 19 N"), route loading on the live site while Overpass was down.

### 2026-11-18 (later): steadier rendering
- **Problem:** Cesium re-picks tile detail on almost every camera move (`globe.maximumScreenSpaceError` default 2) and keeps only 100 tiles (`tileCacheSize`), so the map kept re-sharpening and re-loading while panning.
- **Change:** `Detail` selector in the Layers panel (Low = 8, Medium = 4 (default), High = 2, stored in localStorage), `tileCacheSize = 1000`, `preloadSiblings = false` (`src/map.ts`). Higher error value = detail changes only after larger zoom steps.
- **Measured** (headless browser, 40 identical small camera moves near Grossglockner, one run each so treat as indicative): High 113 tiles drawn / 35 tile requests / 15 render-set changes; Medium 58 / 15 / 14; Low 27 / 14 / 9.
- **Trade-off:** lower detail looks blurrier at a given zoom. Not judged by eye on real hardware.
