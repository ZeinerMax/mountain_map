import type { Pt } from './geo';
import type { Waypoint } from './routeData';

export interface GpxRoute { name: string; points: Pt[]; waypoints?: Waypoint[] }
export interface GpxFile { routes: GpxRoute[]; waypoints: Waypoint[] }

/** Upper limit for one file; bigger files would freeze the tab while parsing and sampling terrain. */
export const GPX_MAX_BYTES = 30 * 1024 * 1024;

const num = (s: string | null | undefined) => (s != null && s.trim() !== '' ? Number(s) : NaN);
const childText = (el: Element, tag: string) => {
  // direct children only: a <name> inside <trkpt> must not become the track name
  for (const c of Array.from(el.children)) if (c.localName === tag) return c.textContent?.trim() || undefined;
  return undefined;
};

/** Parse tracks (trk/trkseg/trkpt), routes (rte/rtept) and waypoints (wpt). */
export function parseGpx(xml: string): GpxFile {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement?.localName !== 'gpx') {
    throw new Error('Not a valid GPX file');
  }
  const readPt = (n: Element): Pt | undefined => {
    const lat = num(n.getAttribute('lat')), lon = num(n.getAttribute('lon'));
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return undefined; // also rejects NaN
    const ele = num(childText(n, 'ele'));
    return Number.isFinite(ele) ? { lat, lon, ele } : { lat, lon };
  };
  const readPts = (nodes: Element[]) => nodes.map(readPt).filter((p): p is Pt => !!p);

  const routes: GpxRoute[] = [];
  for (const trk of Array.from(doc.getElementsByTagName('trk'))) {
    const pts = readPts(Array.from(trk.getElementsByTagName('trkpt')));
    if (pts.length > 1) routes.push({ name: childText(trk, 'name') || 'Track', points: pts });
  }
  for (const rte of Array.from(doc.getElementsByTagName('rte'))) {
    const pts = readPts(Array.from(rte.getElementsByTagName('rtept')));
    if (pts.length > 1) routes.push({ name: childText(rte, 'name') || 'Route', points: pts });
  }
  const waypoints: Waypoint[] = [];
  Array.from(doc.getElementsByTagName('wpt')).forEach((w, i) => {
    const p = readPt(w);
    if (!p) return;
    const desc = childText(w, 'desc') ?? childText(w, 'cmt');
    waypoints.push({ ...p, name: (childText(w, 'name') || `Waypoint ${i + 1}`).slice(0, 200), ...(desc ? { desc: desc.slice(0, 1000) } : {}) });
  });
  return { routes, waypoints };
}

const ESC: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ESC[c]);
// characters that are not allowed in XML 1.0 at all (escaping does not help)
const xmlSafe = (s: string) => esc(s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ''));

export function buildGpx(routes: GpxRoute[]): string {
  const wpts = routes
    .flatMap((r) => r.waypoints ?? [])
    .map((w) =>
      `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}">` +
      (w.ele != null ? `<ele>${w.ele.toFixed(1)}</ele>` : '') +
      `<name>${xmlSafe(w.name)}</name>` + (w.desc ? `<desc>${xmlSafe(w.desc)}</desc>` : '') + `</wpt>`,
    );
  const trks = routes.map(
    (r) =>
      `  <trk><name>${xmlSafe(r.name)}</name><trkseg>\n` +
      r.points
        .map((p) => `    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}</trkpt>`)
        .join('\n') +
      `\n  </trkseg></trk>`,
  );
  // GPX 1.1 requires waypoints before tracks
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="mountain_map" xmlns="http://www.topografix.com/GPX/1/1">\n${[...wpts, ...trks].join('\n')}\n</gpx>\n`;
}
