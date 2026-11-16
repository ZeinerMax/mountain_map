// Configuration from Vite env vars (see .env.example). Keys are never hard-coded.
// NOTE: VITE_* values are embedded in the client bundle, so restrict keys by origin in the provider consoles.
export const MAPTILER_KEY = (import.meta.env.VITE_MAPTILER_KEY ?? '').trim();
export const TRACESTRACK_KEY = (import.meta.env.VITE_TRACESTRACK_KEY ?? '').trim();
export const OVERPASS_URL: string =
  (import.meta.env.VITE_OVERPASS_URL ?? '').trim() || 'https://overpass-api.de/api/interpreter';

// VERIFIED (docs.maptiler.com/cesium/how-to-use-cesium, 2026-11): terrain + satellite URLs.
export const MAPTILER_TERRAIN_URL = `https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/?key=${MAPTILER_KEY}`;
export const MAPTILER_SAT_URL = `https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`;
// PARTLY VERIFIED: host answers 403 "Key is empty" without key; path/size/maxZoom taken from OSM's
// own layer config as reported by search, not from official Tracestrack docs (docs site not reachable).
export const TRACESTRACK_URL = `https://tile.tracestrack.com/topo__/{z}/{x}/{y}.png?key=${TRACESTRACK_KEY}`;
export const TRACESTRACK_MAX_ZOOM = 19;

export const ROUTES_STORAGE_KEY = 'mountain_map.routes.v1';
