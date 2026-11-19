# Data sources
Back: [[Mountain-map-index]]

## Verified (by real requests)
- **MapTiler terrain:** `https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/?key=KEY`, loaded with `CesiumTerrainProvider.fromUrl`. 200 with a real key (2026-11-16).
- **MapTiler satellite:** `.../maps/satellite-v4/{z}/{x}/{y}.jpg?key=KEY`, 512 px, standard XYZ. Needs `WebMercatorTilingScheme` in Cesium.
- **Tracestrack Topo:** `https://tile.tracestrack.com/topo__/{z}/{x}/{y}.png?key=KEY`, 512 px PNG tiles, XYZ numbering, 200 with a real key.
- **Waymarked Trails search:** `https://hiking.waymarkedtrails.org/api/v1/list/search?query=...&limit=6`, CORS open, about 0.9 s.
- **Waymarked Trails route details:** `.../api/v1/details/relation/{id}` returns a `route` tree (`route` > `linear` > `base` ways with EPSG:3857 LineStrings; `appendix` = alternatives) in 30-300 ms (2026-11-19, 9 routes). `/geometry/*` and `/elevation` sub-paths return 404. `linear: "no"` means the stretches are not in order.
- **Overpass:** (fallback for route lines) relation geometry via `rel(ID);out geom;` (ways in member order). Fallback server that answered: `maps.mail.ru/osm/tools/overpass`. `private.coffee` and `kumi.systems` did not answer from this network. Public servers often return 502/504 or time out.
- **OSM data for the search index:** named `natural=peak`, `tourism=alpine_hut`, `tourism=wilderness_hut`, `amenity=shelter`.

## Not verified / assumptions
- Tracestrack docs and **usage terms were never read** (docs site unreachable). Max zoom 19 comes from secondary sources.
- MapTiler terms of use not re-read in detail.
- Hut tags are my choice; unnamed huts are not in the index.
- Waymarked Trails and Overpass fair-use terms not read in full.

## Rejected
- **Photon** (`photon.komoot.io`): worked on 2026-11-17 but timed out on every request later the same day, so it was replaced by a local index.
- **Nominatim:** its policy forbids search-as-you-type.
- **MapTiler geocoding:** works with the existing key (0.4 s) but weaker for huts; not used.

## Licence / attribution
OSM data is ODbL: attribution is shown in the UI and the local index file records the licence. MapTiler, OpenStreetMap contributors and Tracestrack credits are in the Cesium credit bar.

## Keys
**Key restrictions (set 2026-11-19, verified by request):** MapTiler allowed origins `mountain-map.vercel.app` + `localhost` (403 without/with a foreign referer). Tracestrack "Referers" are matched **letter for letter** against the Referer header, so entries must be exactly what browsers send: `https://mountain-map.vercel.app/`, `http://localhost:5173/`, `http://localhost:4173/` (a bare `mountain-map.vercel.app` broke the live topo layer: "Referrer mismatch"). Changes take a few minutes to reach all Tracestrack servers.
Never in the repo. Project: `.env` (git-ignored); template `.env.example` stays blank. Vercel: set as production env vars (public config type, because `VITE_*` values end up in the browser bundle). See [[How-to-run-and-deploy]]. Back to [[Status-and-next-steps]].
