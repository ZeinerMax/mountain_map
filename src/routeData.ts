import type { Pt } from './geo';

/** A named point from a GPX <wpt> (hut, water, pass...). Stored with the route it was imported with. */
export interface Waypoint { lat: number; lon: number; ele?: number; name: string; desc?: string }
export interface RouteData { id: string; name: string; points: Pt[]; waypoints?: Waypoint[] }

export const uid = () => Math.random().toString(36).slice(2, 10);

const okLatLon = (p: any) =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

export const cloneRoute = <T extends RouteData>(r: T): RouteData => ({
  id: r.id, name: r.name, points: r.points.map((p) => ({ ...p })),
  ...(r.waypoints?.length ? { waypoints: r.waypoints.map((w) => ({ ...w })) } : {}),
});

/** JSON for localStorage. Coordinates rounded to 6 decimals (~0.1 m) and elevations to 0.1 m: about 40% smaller. */
export function serializeRoutes(routes: RouteData[]): string {
  return JSON.stringify(routes.map(cloneRoute), (k, v) =>
    typeof v === 'number' && (k === 'lat' || k === 'lon') ? Math.round(v * 1e6) / 1e6
      : typeof v === 'number' && k === 'ele' ? Math.round(v * 10) / 10 : v);
}

/** Keep only well-formed routes from untrusted storage (a corrupt entry must not break the app on every start). */
export function sanitizeRoutes(data: unknown): RouteData[] {
  if (!Array.isArray(data)) return [];
  const out: RouteData[] = [];
  const ids = new Set<string>();
  for (const r of data) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.points)) continue;
    const points: Pt[] = r.points
      .filter(okLatLon)
      .map((p: any) => ({ lat: p.lat, lon: p.lon, ...(Number.isFinite(p.ele) ? { ele: p.ele } : {}) }));
    if (points.length < 2) continue;
    const waypoints: Waypoint[] = (Array.isArray(r.waypoints) ? r.waypoints : [])
      .filter((w: any) => okLatLon(w) && typeof w.name === 'string')
      .map((w: any) => ({
        lat: w.lat, lon: w.lon, name: w.name,
        ...(Number.isFinite(w.ele) ? { ele: w.ele } : {}), ...(typeof w.desc === 'string' ? { desc: w.desc } : {}),
      }));
    let id = typeof r.id === 'string' && r.id ? r.id : uid();
    while (ids.has(id)) id = uid(); // duplicate ids would make select/delete hit the wrong route
    ids.add(id);
    out.push({
      id, name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Route', points,
      ...(waypoints.length ? { waypoints } : {}),
    });
  }
  return out;
}
