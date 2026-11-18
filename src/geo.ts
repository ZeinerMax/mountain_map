export interface Pt { lon: number; lat: number; ele?: number }

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: Pt, b: Pt): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lengthM(pts: Pt[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
  return d;
}

/** Resample a polyline at roughly even spacing; returns points with cumulative distance. */
export function densify(pts: Pt[], maxSamples = 1200, minStep = 20): { p: Pt; dist: number }[] {
  if (pts.length === 0) return [];
  const total = lengthM(pts);
  if (pts.length === 1 || total === 0) return [{ p: pts[0], dist: 0 }];
  const step = Math.max(minStep, total / maxSamples);
  const out: { p: Pt; dist: number }[] = [{ p: { lon: pts[0].lon, lat: pts[0].lat }, dist: 0 }];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = haversine(a, b);
    const n = Math.max(1, Math.round(seg / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ p: { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t }, dist: acc + seg * t });
    }
    acc += seg;
  }
  return out;
}

/** Ascent/descent with a hysteresis threshold (10 m) to suppress terrain-sampling noise (3 m inflated the Tour du Mont Blanc to 15,000 m ascent). */
export function ascentDescent(eles: number[], threshold = 10): { ascent: number; descent: number } {
  if (eles.length === 0) return { ascent: 0, descent: 0 };
  let ascent = 0, descent = 0, ref = eles[0];
  for (const e of eles) {
    if (e - ref >= threshold) { ascent += e - ref; ref = e; }
    else if (ref - e >= threshold) { descent += ref - e; ref = e; }
  }
  return { ascent, descent };
}

export const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
