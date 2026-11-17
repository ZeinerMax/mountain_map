# Status and next steps
Back: [[Mountain-map-index]]
- All 5 feature groups implemented; `npm run build` passes; dev server serves files.
- NOT tested in a browser with real keys.
## Next
1. Add keys, test in browser ([[Data-sources]]).
2. Verify Tracestrack docs/terms.
3. Code-split Cesium bundle (~4 MB).
4. Undo, wpt import, better terrain-based elevation.

## 2026-11-17 global search
Search bar added (`src/search.ts`): Photon for peaks/huts/bivouacs, Waymarked Trails for routes, Overpass for route geometry. See README section 'global search'. Not yet tested in browser, not deployed. Known issue: alternative route variants get chained into one line. Sources: [[Data-sources]]
