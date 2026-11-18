# Status and next steps
Back: [[Mountain-map-index]]
Updated: 2026-11-18

## What works (browser-tested unless noted)
- 3D terrain, satellite base, Tracestrack Topo overlay with opacity and toggle; Detail selector.
- Search bar: peaks, huts, bivouacs, shelters (local Alps index), routes (Waymarked Trails), coordinates. Details panel, markers, fly-to.
- Routes: draw/edit/delete, distance, ascent/descent, elevation profile, GPX import/export, saved in localStorage. (Drawing and editing by hand were NOT tested in the browser.)
- Compass, tilt, cursor coordinates/elevation/slope, scale bar.

## Deployment state
- Live (https://mountain-map.vercel.app) is at commit `2c2d8fe`.
- GitHub `main` is at `98953a8` (adds the Detail selector). **Needs `vercel deploy --prod` to go live.** The repo is not connected to Vercel, so pushes do not auto-deploy.

## Known issues
- Loading a route's line depends on public Overpass servers: 75-105 s for long routes, fails when they are down (message shown, retry).
- Ascent is approximate (terrain-sampled, inflated): Tour du Mont Blanc about 14,000 m vs about 10,000 m quoted. Routes with variants (Walker's Haute Route: 268 km vs 209 km) include the variants.
- Search index covers only the Alps (lat 43.5-48.3, lon 4.8-17.0). Unnamed huts missing.
- Black globe seen in desktop headless screenshots (software rendering); not checked on real hardware by Claude.
- Tracestrack usage terms unread.

## TODO (decisions needed from the user in bold)
1. **Restrict both API keys to the Vercel domain and `localhost`** (keys are public in the browser bundle). Enable 2FA on Vercel.
2. Deploy the latest commit.
3. More regions for the index (edit `REGIONS` in `scripts/build-index.mjs` and `src/poi.ts`), then rebuild.
4. Draw each route piece separately to remove variants; better ascent calculation.
5. Self-host or pick a more reliable Overpass source; consider storing popular route geometries.
6. Split the ~4 MB Cesium bundle; undo for route edits; GPX waypoint import.
7. Judge the 250 m fly-to distance and Detail default on real hardware.

Related: [[Dev-log]], [[Data-sources]], [[How-to-run-and-deploy]]
