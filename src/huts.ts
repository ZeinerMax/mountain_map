import * as Cesium from 'cesium';
import { overpass } from './overpass';

/*
 * Hut / bivouac search via the Overpass API (OpenStreetMap data, ODbL: attribution required).
 * VERIFIED (wiki.openstreetmap.org/wiki/Overpass_API): the public FOSSGIS instance is fine below ~10,000
 * queries and ~1 GB per day; we only query on an explicit button click, for the current view box.
 * Browsers cannot set User-Agent; the Referer identifies the app. Self-host or use another instance via VITE_OVERPASS_URL for production.
 * Tag choice is an ASSUMPTION based on common OSM usage: tourism=alpine_hut, tourism=wilderness_hut, amenity=shelter.
 */
export interface Hut {
  id: string; name: string; kind: 'alpine_hut' | 'wilderness_hut' | 'shelter' | 'peak';
  lat: number; lon: number; tags: Record<string, string>;
}

const KIND_LABEL: Record<Hut['kind'], string> = {
  alpine_hut: 'Alpine hut (staffed/serviced)',
  wilderness_hut: 'Wilderness hut / bivouac',
  shelter: 'Shelter',
  peak: 'Peak',
};
const KIND_COLOR: Record<Hut['kind'], string> = { alpine_hut: '#d81b60', wilderness_hut: '#8e24aa', shelter: '#00897b', peak: '#6d4c41' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function icon(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="13" fill="${color}" stroke="white" stroke-width="2.5"/><path d="M7 20 L15 8 L23 20 Z" fill="white"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class HutSearch {
  private huts: Hut[] = [];
  private entities = new Map<string, Cesium.Entity>();
  private handler: Cesium.ScreenSpaceEventHandler;

  constructor(private viewer: Cesium.Viewer) {
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(e.position);
      const id = picked?.id instanceof Cesium.Entity ? String(picked.id.id) : '';
      if (id.startsWith('hut:')) this.showDetails(id.slice(4));
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    $('btnHuts').onclick = () => void this.search();
    $('hutFilter').oninput = () => this.render();
  }

  private bbox(): { s: number; w: number; n: number; e: number } | undefined {
    const rect = this.viewer.camera.computeViewRectangle();
    if (!rect) return undefined;
    const d = Cesium.Math.toDegrees;
    return { s: d(rect.south), w: d(rect.west), n: d(rect.north), e: d(rect.east) };
  }

  async search() {
    const status = $('hutStatus');
    const b = this.bbox();
    if (!b) { status.textContent = 'Point the camera at the ground first.'; return; }
    if (b.n - b.s > 0.6 || b.e - b.w > 0.9) { status.textContent = 'View too large – zoom in (≈ under 60 km).'; return; }
    const bb = `${b.s.toFixed(5)},${b.w.toFixed(5)},${b.n.toFixed(5)},${b.e.toFixed(5)}`;
    const q =
      `[out:json][timeout:25];(` +
      `nwr["tourism"~"^(alpine_hut|wilderness_hut)$"](${bb});` +
      `nwr["amenity"="shelter"](${bb});` +
      `);out center tags 400;`;
    status.textContent = 'Searching OpenStreetMap…';
    ($('btnHuts') as HTMLButtonElement).disabled = true;
    try {
      const json = await overpass(q);
      this.huts = json.elements
        .map((el): Hut | undefined => {
          const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
          if (lat == null || lon == null) return undefined;
          const t: Record<string, string> = el.tags ?? {};
          const kind: Hut['kind'] = t.tourism === 'alpine_hut' ? 'alpine_hut' : t.tourism === 'wilderness_hut' ? 'wilderness_hut' : 'shelter';
          return { id: `${el.type}/${el.id}`, name: t.name ?? '(unnamed)', kind, lat, lon, tags: t };
        })
        .filter((h): h is Hut => !!h);
      status.textContent = `${this.huts.length} found${json.elements.length >= 400 ? ' (limit 400 – zoom in for more)' : ''}.`;
      this.render();
    } catch (e) {
      status.textContent = `Search failed: ${(e as Error).message}`;
    } finally {
      ($('btnHuts') as HTMLButtonElement).disabled = false;
    }
  }

  private visible(): Hut[] {
    const f = ($('hutFilter') as HTMLInputElement).value.trim().toLowerCase();
    return f ? this.huts.filter((h) => h.name.toLowerCase().includes(f)) : this.huts;
  }

  private render() {
    for (const e of this.entities.values()) this.viewer.entities.remove(e);
    this.entities.clear();
    const list = $('hutList');
    list.innerHTML = '';
    for (const h of this.visible()) {
      this.entities.set(
        h.id,
        this.viewer.entities.add({
          id: `hut:${h.id}`,
          position: Cesium.Cartesian3.fromDegrees(h.lon, h.lat),
          billboard: {
            image: icon(KIND_COLOR[h.kind]), width: 28, height: 28,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(2e3, 1.2, 1.5e5, 0.6),
          },
        }),
      );
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = h.name;
      name.onclick = () => { this.showDetails(h.id); this.flyTo(h); };
      const k = document.createElement('small');
      k.textContent = h.kind.replace('_', ' ');
      li.append(name, k);
      list.append(li);
    }
  }

  /** Show a hut/peak found by the global search: marker, details panel and fly-to. */
  show(h: Hut, fly = true) {
    const i = this.huts.findIndex((x) => x.id === h.id);
    if (i >= 0) this.huts[i] = h; else this.huts.push(h);
    this.render();
    this.showDetails(h.id);
    if (fly) this.flyTo(h);
  }

  private flyTo(h: Hut) {
    this.viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(h.lon, h.lat), 1), {
      duration: 1.2, offset: new Cesium.HeadingPitchRange(this.viewer.camera.heading, Cesium.Math.toRadians(-35), 2500),
    });
  }

  private showDetails(id: string) {
    const h = this.huts.find((x) => x.id === id);
    const box = $('hutDetails');
    if (!h) { box.hidden = true; return; }
    const t = h.tags;
    const rows: [string, string | undefined][] = [
      ['Type', KIND_LABEL[h.kind]], ['Elevation', t.ele ? `${t.ele} m` : undefined], ['Beds', t.beds ?? t.capacity],
      ['Operator', t.operator], ['Opening hours', t.opening_hours], ['Season', t.seasonal ?? t.opening_hours_note],
      ['Phone', t.phone ?? t['contact:phone']], ['Website', t.website ?? t['contact:website']],
      ['Reservation', t.reservation], ['Fee', t.fee], ['Water', t.drinking_water], ['Description', t.description],
    ];
    const web = (v: string) => (/^https?:\/\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v));
    box.innerHTML =
      `<button class="close" aria-label="Close">×</button><h3>${esc(h.name)}</h3><table>` +
      rows.filter(([, v]) => v).map(([k, v]) => `<tr><th>${k}</th><td>${k === 'Website' ? web(v!) : esc(v!)}</td></tr>`).join('') +
      `<tr><th>Position</th><td>${h.lat.toFixed(5)}, ${h.lon.toFixed(5)}</td></tr></table>` +
      `<p><a href="https://www.openstreetmap.org/${h.id}" target="_blank" rel="noopener">View on OpenStreetMap</a> · data &copy; OpenStreetMap contributors (ODbL)</p>`;
    box.hidden = false;
    (box.querySelector('.close') as HTMLButtonElement).onclick = () => (box.hidden = true);
  }
}
