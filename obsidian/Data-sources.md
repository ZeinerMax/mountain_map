# Data sources
Back: [[Mountain-map-index]]
## Verified
- MapTiler terrain: `api.maptiler.com/tiles/terrain-quantized-mesh-v2/?key=` via `CesiumTerrainProvider.fromUrl`.
- MapTiler satellite: `maps/satellite-v4/{z}/{x}/{y}.jpg?key=`.
- Overpass (OSM wiki): public instance fine under ~10k queries/day; ODbL attribution.
## Not fully verified
- Tracestrack `tile.tracestrack.com/topo__/{z}/{x}/{y}.png?key=` - returns 512px XYZ tiles (verified by request); style name, max zoom, terms unconfirmed.
- Hut tags (alpine_hut, wilderness_hut, shelter) are an assumption.
Keys: `.env` (see `.env.example`). Status: [[Status-and-next-steps]]

## Search (2026-11-17)
- Photon `photon.komoot.io/api/?q=&osm_tag=natural:peak` - verified, fair-use public instance.
- Waymarked Trails `/api/v1/list/search?query=` - verified; no geometry endpoint, so geometry comes from Overpass.
- Overpass fallbacks: maps.mail.ru works; private.coffee/kumi did not answer.
