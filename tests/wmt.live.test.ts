import { describe, expect, it } from 'vitest';
import { fetchWmtRoute } from '../src/wmt';
import { haversine, lengthM } from '../src/geo';

// Talks to the real Waymarked Trails API (OSM data changes, so ranges are generous). Run with: npm run test:live
const maxJump = (pts: { lat: number; lon: number }[]) => {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m = Math.max(m, haversine(pts[i - 1], pts[i]));
  return m;
};

describe.runIf(import.meta.env.MODE === 'live')('Waymarked Trails (live)', () => {
  // [relation id, name, km min, km max] - lengths measured 2026-11-19; official figures in comments.
  const cases: [number, string, number, number][] = [
    [124456, 'Tour du Mont Blanc', 150, 185], // official ~170 km (variants excluded)
    [6560812, 'Stubaier Höhenweg', 65, 85], // unsorted on WMT: had a 14.6 km jump before reordering
    [16287, 'West Highland Way', 140, 165], // official 154 km
    [177743, 'Alta Via 1 (Dolomites)', 100, 130], // official ~120 km
  ];
  for (const [id, name, lo, hi] of cases) {
    it(`${name}: main line ${lo}-${hi} km, no jump over 2 km`, async () => {
      const pts = await fetchWmtRoute(id);
      const km = lengthM(pts) / 1000;
      expect(km).toBeGreaterThan(lo);
      expect(km).toBeLessThan(hi);
      expect(maxJump(pts)).toBeLessThan(2000);
    }, 30000);
  }
});
