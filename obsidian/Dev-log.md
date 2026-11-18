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

## Lessons
- Public OSM-related servers are unreliable: always cache, retry, fall back, and show errors.
- Test in a real browser: several bugs only appeared there.
- Write long-running job output incrementally.

Next: [[Status-and-next-steps]]
