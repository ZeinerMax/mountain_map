# Status and next steps
Back: [[Mountain-map-index]]
Updated: 2026-11-19

## What works (browser-tested 2026-11-19 in headless Edge, production build with the production security headers)
- 3D terrain, satellite base, Tracestrack Topo overlay with opacity and toggle; Detail selector.
- Search bar: peaks, huts, bivouacs, shelters (local Alps index), routes (Waymarked Trails), coordinates.
- Route loading: Waymarked Trails route details, 2.5-6.5 s including elevation (was 75-105 s via Overpass). Main line only, alternatives excluded. Overpass is the fallback.
  - Tour du Mont Blanc 162 km, ↗ 9,938 m (official ~170 km / ~10,000 m). West Highland Way 153 km (official 154).
- Routes: draw/edit/delete, Shift+click insert (was broken, fixed), undo (button + Ctrl+Z, 30 steps), GPX import/export incl. waypoints, saved in localStorage. 21 automated UI checks pass.
- Compass, tilt, cursor coordinates/elevation/slope, scale bar.
- Security headers (CSP etc.) in `vercel.json`; 0 CSP violations; `npm audit`: 0 vulnerabilities.
- Unit tests: `npm test` (25), live API tests: `npm run test:live` (4).

## Deployment state
- Live (https://mountain-map.vercel.app) is at commit `ea87383` (deployed 2026-11-19 with `vercel deploy --prod`). Verified on the live site: security headers present, 0 CSP violations, all tiles 200, Tour du Mont Blanc loads in ~6 s, 21/21 UI checks pass.

## Known issues
- Walker's Haute Route is 204 km because the OSM relation itself is that long (Waymarked Trails says 209 km); official ~180 km.
- Small gaps (0.3-1 km) inside some OSM routes are bridged with straight lines.
- Search index covers only the Alps (lat 43.5-48.3, lon 4.8-17.0). Unnamed huts missing.
- CSP must allow `'unsafe-eval'`: Knockout (bundled in Cesium's widgets) evaluates strings at start-up. Everything else is strict.
- Tracestrack usage terms unread.

## TODO (decisions needed from the user in bold)
1. Done 2026-11-19: both API keys restricted (see [[Data-sources]] for the Tracestrack format); 2FA on Vercel enabled by the user.
2. More regions for the index (edit `REGIONS` in `scripts/build-index.mjs` and `src/poi.ts`), then rebuild (hours).
3. Optional: let the user pick a route's alternatives (Waymarked Trails lists them as `appendices`).
4. Judge the 250 m fly-to distance and Detail default on real hardware.

Related: [[Dev-log]], [[Data-sources]], [[How-to-run-and-deploy]]
