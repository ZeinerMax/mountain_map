import type { Pt } from './geo';

export interface GpxRoute { name: string; points: Pt[] }

/** Parse tracks (trk/trkseg/trkpt) and routes (rte/rtept). Waypoints (wpt) are ignored in v0.1. */
export function parseGpx(xml: string): GpxRoute[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not a valid GPX/XML file');
  const readPts = (nodes: Element[]): Pt[] =>
    nodes
      .map((n) => {
        const lat = parseFloat(n.getAttribute('lat') ?? '');
        const lon = parseFloat(n.getAttribute('lon') ?? '');
        const eleTxt = n.getElementsByTagName('ele')[0]?.textContent;
        const ele = eleTxt != null ? parseFloat(eleTxt) : NaN;
        return { lat, lon, ele: Number.isFinite(ele) ? ele : undefined } as Pt;
      })
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const out: GpxRoute[] = [];
  for (const trk of Array.from(doc.getElementsByTagName('trk'))) {
    const pts = readPts(Array.from(trk.getElementsByTagName('trkpt')));
    if (pts.length > 1) out.push({ name: trk.getElementsByTagName('name')[0]?.textContent?.trim() || 'Track', points: pts });
  }
  for (const rte of Array.from(doc.getElementsByTagName('rte'))) {
    const pts = readPts(Array.from(rte.getElementsByTagName('rtept')));
    if (pts.length > 1) out.push({ name: rte.getElementsByTagName('name')[0]?.textContent?.trim() || 'Route', points: pts });
  }
  return out;
}

const ESC: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ESC[c]);

export function buildGpx(routes: GpxRoute[]): string {
  const trks = routes
    .map(
      (r) =>
        `  <trk><name>${esc(r.name)}</name><trkseg>\n` +
        r.points
          .map((p) => `    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}</trkpt>`)
          .join('\n') +
        `\n  </trkseg></trk>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="mountain_map" xmlns="http://www.topografix.com/GPX/1/1">\n${trks}\n</gpx>\n`;
}
