# How to run and deploy
Back: [[Mountain-map-index]]

## Run locally
```
copy .env.example .env      # then fill in the keys
npm install
npm run dev                 # http://localhost:5173
npm run build               # type-check + production build
npm run preview             # serve dist/ with the production security headers (localhost:4173)
npm test                    # unit tests (Vitest)
npm run test:live           # tests against the real Waymarked Trails API
```
Keys (never commit): `VITE_MAPTILER_KEY`, `VITE_TRACESTRACK_KEY` in `.env`. Put only the key itself, not a full URL.

## Deploy (Vercel)
```
vercel deploy --prod --yes   # from the project folder; project "mountain-map"
```
Needs `vercel login` once (device-code flow opens the browser). Env vars are already set as production config. Alias: https://mountain-map.vercel.app. The repo is not linked to Vercel, so every release needs this command.

## Rebuild the search index
```
node scripts/build-index.mjs alps
```
Takes hours (public Overpass is slow). Resumable: finished tiles are cached in `.cache/index-alps/` (git-ignored). Delete that folder to fetch fresh data. Output: `public/data/poi-alps.json`; check its `incomplete` field is empty. Commit the JSON to publish it.

## Browser tests (not in the repo)
Claude drove headless Edge with `playwright-core` from a scratch folder (`npm i playwright-core`, `executablePath` = Edge, args `--use-gl=angle --use-angle=swiftshader`). Scripts checked (2026-11-19 also: CSP violations, route drawing/editing/undo, GPX waypoints, export, corrupt storage; test against `npm run preview` so the CSP applies): search/suggestions/Enter/details, coordinate formats, fly-to distance, route loading, layout at 1366 px and 390 px, tile requests per detail level. The map object is exposed as `window.mountainMap` for debugging. Route-loading checks fail whenever Overpass is down.

## Git
Do not commit or push unless asked. `.claude/` (local settings) is not committed.

See [[Status-and-next-steps]], [[Architecture]].
