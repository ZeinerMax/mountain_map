# Architecture
Back: [[Mountain-map-index]]
- Stack: CesiumJS + Vite + TypeScript, no framework. Reason: native quantized-mesh terrain + imagery layers.
- `base.ts` sets CESIUM_BASE_URL; `map.ts` builds Viewer/layers; `routes.ts` + `profile.ts` + `geo.ts` + `gpx.ts` = routes; `huts.ts` = Overpass search; `hud.ts` = compass/info bar.
- Build gotcha: static-copy needs `rename: { stripBase: 4 }` or Cesium files land in `dist/cesium/node_modules/...`.
- Data: [[Data-sources]]
