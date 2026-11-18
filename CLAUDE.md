# CLAUDE.md
3D hiking map: CesiumJS + Vite + TS. MapTiler terrain, Tracestrack Topo overlay. See README.md for details.

## Commands
- `npm install`, `npm run dev` (localhost:5173), `npm run build` (tsc + vite), `npm run preview`
- Keys in `.env` (copy `.env.example`): `VITE_MAPTILER_KEY`, `VITE_TRACESTRACK_KEY`. Never commit `.env`.

## Structure
`src/`: base.ts (import first), config.ts, map.ts, routes.ts, profile.ts, geo.ts, gpx.ts, huts.ts, hud.ts, style.css; `index.html` holds all UI markup.

## Conventions
- No hard-coded keys; all URLs in config.ts. Mark unverified facts with `ASSUMPTION`/`PARTLY VERIFIED` comments.
- Cesium static files: copied to `/cesium` in build (vite.config.ts, `stripBase: 4`), served from node_modules in dev.
- Update README.md + obsidian/ notes after significant changes. Do not commit unless asked.

## Search index
`node scripts/build-index.mjs alps` rebuilds `public/data/poi-alps.json` (hours; resumable via `.cache/`). Add regions in the script AND `REGIONS` in `src/poi.ts`.
