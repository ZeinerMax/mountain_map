# Dev log
Back: [[Mountain-map-index]]

## 2026-11-16
- One autonomous Claude Code run built the first version (terrain + overlay, routes, GPX, hut search, compass, info bar). Terminal closed by accident; work resumed from the files on disk.
- **Problem:** production build copied Cesium files to `dist/cesium/node_modules/...`. **Fix:** `rename: { stripBase: 4 }` in `vite.config.ts`.
- README, `CLAUDE.md` and these notes written.
- MapTiler key was pasted as a full URL into the committed template `.env.example`. Moved to git-ignored `.env`, kept only the key, blanked the template.
- **Problem:** imagery layers had no tiling scheme (Cesium defaults to geographic, tiles are Web Mercator). **Fix:** `WebMercatorTilingScheme`, 512 px tile size.
- Committed and pushed; deployed to Vercel (https://mountain-map.vercel.app); keys set as production env vars.

## 2026-11-17
- **Global search bar** added. First version: Photon for peaks/huts, Waymarked Trails for routes, Overpass for route geometry.
- Photon timed out all day, so a **local index** was built instead (`scripts/build-index.mjs`). One world query times out on Overpass, so it works in 1 degree tiles. The first run crashed on tile 45 and lost everything; the script now caches per tile, splits failing tiles and writes even when some patches fail.
- Index finished 2026-11-18: 108,191 places in the Alps (88,458 peaks, 4,483 alpine huts, 2,148 bivouacs, 13,102 shelters), 6.5 MB, about 2.4 MB gzipped. About 12 hours, mostly Overpass being slow.

## 2026-11-18
- Browser testing with headless Edge driven by Playwright. Found: ß not matched (Großglockner), huts crowded out by 88,000 peaks (now 6 peaks + 6 huts), route joining made the Tour du Mont Blanc 299 km (now follows the relation's member order: 182 km vs ~170 official).
- **Coordinate search:** paste `47.0386353N, 13.0670286E` (also decimal, DMS, N/E first) and press Enter for a pin and fly-to.
- **Fly-to bug:** camera targeted sea level so it ended up inside high peaks. Now samples terrain height first and stops 250 m away (about a 20 m scale bar).
- **Speed:** index preloaded at start-up, local results without debounce; routes debounced 250 ms.
- **Steadier rendering:** Detail selector (Low/Medium/High), bigger tile cache. Measured over 40 small moves: High 35 tile requests, Medium 15, Low 14.
- Commits: `de15d40` (local index), `2c2d8fe` (coordinates, fly-to; deployed), `98953a8` (detail selector; pushed, **not yet deployed**).

## 2026-11-19
- **Security pass.** `npm audit`: 0 vulnerabilities. Every place where OSM, search or GPX text reaches the page was checked: escaped or set as plain text. New `vercel.json` with Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS; `npm run preview` serves the same headers.
- **Problem:** with a strict CSP the map did not start at all. **Cause:** Knockout (bundled inside Cesium) runs `eval("this")` at load and builds its UI bindings from strings. **Fix:** allow `'unsafe-eval'` only; scripts from other sites and injected scripts stay blocked.
- **Route loading rewritten.** Waymarked Trails `/api/v1/details/relation/{id}` (thought to have no geometry) returns the whole route tree with geometry in 30-300 ms, main line and alternatives (`appendices`) separated. New `src/wmt.ts`; Overpass is now only the fallback. TMB: 162 km / 9,938 m (was 182 km / ~14,000 m with variants).
- **Problem:** Stubaier Höhenweg had a 14.6 km straight jump. **Cause:** WMT marks it `linear: "no"` and lists a 1.2 km middle piece last. **Fix:** for unsorted routes, order stretches by nearest ends.
- **Ascent** was not changed: the inflated figure came from the variants, not from the formula.
- **Bug found by browser test:** Shift+click insert never worked (Cesium sends Shift-clicks only to actions registered with the SHIFT modifier). Fixed.
- **New:** undo (button + Ctrl+Z, 30 steps), GPX waypoints (import, markers, export, saved with the route), validation of saved routes (corrupt storage no longer breaks start-up), visible warning when the browser storage is full, coordinates rounded on save (~40% smaller), 30 MB GPX limit, favicon.
- **Bundle:** Cesium split into its own chunk (4.2 MB); the app chunk is 40 KB, so updates do not re-download Cesium (`/assets` cached as immutable).
- **Tests added:** Vitest unit tests (25) and live Waymarked Trails tests (4); browser UI test with 21 checks (scratch script, not in the repo).

## Lessons
- Public OSM-related servers are unreliable: always cache, retry, fall back, and show errors.
- Test in a real browser: several bugs only appeared there.
- Write long-running job output incrementally.

Next: [[Status-and-next-steps]]
