import { haversine, type Pt } from './geo';

/*
 * Waymarked Trails route details (hiking.waymarkedtrails.org).
 * VERIFIED by request 2026-11-19: GET /api/v1/details/relation/{id} returns, besides name/tags, a `route` tree:
 *   route    { main: [route|linear...], appendices: [appendix...] }  - a (sub-)relation
 *   linear   { ways: [base...] }                                    - one continuous stretch, ways in order
 *   base     { geometry: LineString (EPSG:3857), direction, length }  - one OSM way
 *   appendix { role: "alternative"|"excursion"|..., main: [...] }    - side branches: NOT part of the main line
 * Took 30-300 ms for 9 sample routes (Overpass: 75-105 s for long routes). The Tour du Mont Blanc main line is
 * 165.8 km here, with its 7 alternatives listed separately. Route types other than these four were not seen.
 */
export const WMT_API = 'https://hiking.waymarkedtrails.org/api/v1';

interface WmtNode {
  route_type: string;
  /** "yes"/"sorted": stretches are in route order; "no": WMT could not sort them (seen on Stubaier Höhenweg). */
  linear?: string;
  main?: WmtNode[];
  ways?: WmtNode[];
  geometry?: { type: string; coordinates: number[][] };
}
export interface WmtDetails { id: number; name?: string; ref?: string; route?: WmtNode & { length?: number } }

const R_MERC = 6378137;
/** EPSG:3857 (Web Mercator metres) to WGS84 degrees. */
export function mercToPt([x, y]: number[]): Pt {
  return {
    lon: (x / R_MERC) * (180 / Math.PI),
    lat: (2 * Math.atan(Math.exp(y / R_MERC)) - Math.PI / 2) * (180 / Math.PI),
  };
}

/** Join polylines in the given order, flipping each one so it continues from the end of the chain. */
export function chain(parts: Pt[][]): Pt[] {
  const list = parts.filter((p) => p.length > 1);
  if (!list.length) return [];
  let out = list[0].slice();
  if (list.length > 1) {
    // orient the first part towards the second
    const n = list[1], ends = [n[0], n[n.length - 1]];
    const dEnd = Math.min(...ends.map((e) => haversine(out[out.length - 1], e)));
    const dStart = Math.min(...ends.map((e) => haversine(out[0], e)));
    if (dStart < dEnd) out.reverse();
  }
  for (const p of list.slice(1)) {
    const tail = out[out.length - 1];
    const forward = haversine(tail, p[0]) <= haversine(tail, p[p.length - 1]);
    const next = forward ? p : p.slice().reverse();
    // skip the shared vertex where two ways meet
    out = out.concat(haversine(tail, next[0]) < 0.5 ? next.slice(1) : next);
  }
  return out;
}

/** Continuous stretches of the main line, in route order (appendices/alternatives skipped). */
export function mainStretches(node: WmtNode | undefined): Pt[][] {
  if (!node) return [];
  switch (node.route_type) {
    case 'linear':
      return [chain((node.ways ?? []).map((w) => (w.geometry?.coordinates ?? []).map(mercToPt)))];
    case 'base':
      return [(node.geometry?.coordinates ?? []).map(mercToPt)];
    case 'appendix':
      return [];
    default: { // 'route' (the relation itself or a sub-relation)
      const parts = (node.main ?? []).flatMap(mainStretches);
      return node.linear === 'no' ? orderByProximity(parts) : parts;
    }
  }
}

/**
 * Put unsorted stretches in a plausible order: starting from the first one, repeatedly attach the remaining stretch
 * whose nearer end is closest to either end of the line built so far. Measured on the Stubaier Höhenweg
 * (WMT: linear "no"): a 1.2 km stretch listed last belongs in the middle; member order gave a 14.6 km straight jump.
 */
export function orderByProximity(parts: Pt[][]): Pt[][] {
  const rest = parts.filter((p) => p.length > 0);
  if (rest.length < 3) return rest;
  const first = rest.shift()!;
  const out = [first];
  let head = first[0], tail = first[first.length - 1];
  while (rest.length) {
    let best = 0, bestD = Infinity, atTail = true, flip = false;
    rest.forEach((p, i) => {
      const s = p[0], e = p[p.length - 1];
      const cands: [number, boolean, boolean][] = [
        [haversine(tail, s), true, false], [haversine(tail, e), true, true],
        [haversine(head, e), false, false], [haversine(head, s), false, true],
      ];
      for (const [d, t, f] of cands) if (d < bestD) { bestD = d; best = i; atTail = t; flip = f; }
    });
    const p = rest.splice(best, 1)[0];
    const piece = flip ? p.slice().reverse() : p;
    if (atTail) { out.push(piece); tail = piece[piece.length - 1]; }
    else { out.unshift(piece); head = piece[0]; }
  }
  return out;
}

/** Thin out vertices closer than `minM` metres (keeps first and last). */
export function thin(pts: Pt[], minM = 10): Pt[] {
  if (pts.length < 3) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (haversine(out[out.length - 1], pts[i]) >= minM) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  return out;
}

/** Main line of a route as one polyline. Gaps between stretches are bridged with a straight line. */
export function mainLine(details: WmtDetails): Pt[] {
  return thin(chain(mainStretches(details.route)));
}

export async function fetchWmtRoute(relId: number, signal?: AbortSignal): Promise<Pt[]> {
  const res = await fetch(`${WMT_API}/details/relation/${Math.trunc(relId)}`, { signal });
  if (!res.ok) throw new Error(`Waymarked Trails HTTP ${res.status}`);
  return mainLine((await res.json()) as WmtDetails);
}
