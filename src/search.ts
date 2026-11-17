import type { HutSearch, Hut } from './huts';
import type { RouteManager } from './routes';
import { overpass } from './overpass';
import { haversine, type Pt } from './geo';

/*
 * Global search with suggestions (not limited to the current view).
 *  - Peaks / huts / bivouacs: Photon (photon.komoot.io), OSM-based geocoder built for search-as-you-type, no key.
 *    VERIFIED by request 2026-11-17: osm_tag filter works (natural:peak, tourism:alpine_hut), CORS open.
 *    Public instance is fair-use only (no SLA): self-host or swap PHOTON_URL for production. Terms not read in full.
 *  - Routes: Waymarked Trails API (hiking.waymarkedtrails.org/api/v1/list/search), CORS open, verified by request.
 *    It lists routes but returns no simple geometry, so geometry is fetched from Overpass (relation + sub-relations).
 *  Nominatim is NOT used: its usage policy forbids autocomplete.
 */
const PHOTON_URL = 'https://photon.komoot.io/api/';
const WMT_URL = 'https://hiking.waymarkedtrails.org/api/v1/list/search';

type Kind = Hut['kind'];
interface Suggestion {
  group: 'Peaks' | 'Huts & bivouacs' | 'Routes';
  title: string; sub: string;
  hut?: Hut;
  routeRelId?: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const OSM_TYPE: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };

async function photon(q: string, osmTag: string, kind: Kind, signal: AbortSignal): Promise<Suggestion[]> {
  const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=5&osm_tag=${encodeURIComponent(osmTag)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
  const json = (await res.json()) as { features: any[] };
  return json.features
    .filter((f) => f.properties?.name)
    .map((f): Suggestion => {
      const p = f.properties, [lon, lat] = f.geometry.coordinates;
      const where = [p.city ?? p.county, p.state, p.country].filter(Boolean).join(', ');
      const hut: Hut = {
        id: `${OSM_TYPE[p.osm_type] ?? 'node'}/${p.osm_id}`, name: p.name, kind, lat, lon,
        tags: { name: p.name },
      };
      return { group: kind === 'peak' ? 'Peaks' : 'Huts & bivouacs', title: p.name, sub: where, hut };
    });
}

async function wmt(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`${WMT_URL}?query=${encodeURIComponent(q)}&limit=6`, { signal });
  if (!res.ok) throw new Error(`Waymarked Trails HTTP ${res.status}`);
  const json = (await res.json()) as { results: any[] };
  return json.results
    .filter((r) => r.type === 'relation' && r.name)
    .map((r): Suggestion => ({
      group: 'Routes', title: r.ref && !r.name.includes(r.ref) ? `${r.name} (${r.ref})` : r.name,
      sub: Array.isArray(r.itinerary) ? r.itinerary.join(' → ') : '', routeRelId: r.id,
    }));
}

/** Chain OSM ways into one polyline by greedily attaching the nearest unused way at either end. */
function chainWays(ways: Pt[][]): Pt[] {
  const rest = ways.filter((w) => w.length > 1);
  if (!rest.length) return [];
  let chain = rest.shift()!.slice();
  while (rest.length) {
    const head = chain[0], tail = chain[chain.length - 1];
    let bi = 0, bd = Infinity, bMode = 0;
    rest.forEach((w, i) => {
      const a = w[0], b = w[w.length - 1];
      const opts: [number, number][] = [
        [haversine(tail, a), 0], [haversine(tail, b), 1], [haversine(head, b), 2], [haversine(head, a), 3],
      ];
      for (const [d, m] of opts) if (d < bd) { bd = d; bi = i; bMode = m; }
    });
    const w = rest.splice(bi, 1)[0];
    if (bMode === 0) chain = chain.concat(w);
    else if (bMode === 1) chain = chain.concat(w.slice().reverse());
    else if (bMode === 2) chain = w.concat(chain);
    else chain = w.slice().reverse().concat(chain);
  }
  // Thin out vertices closer than 10 m to keep the route light.
  const out: Pt[] = [chain[0]];
  for (const p of chain) if (haversine(out[out.length - 1], p) >= 10) out.push(p);
  return out;
}

async function fetchRouteGeometry(relId: number): Promise<Pt[]> {
  // Ways of the relation and of its sub-relations (super-routes like long-distance paths).
  const q = `[out:json][timeout:70];rel(${relId})->.a;rel(r.a)->.b;(way(r.a);way(r.b););out geom;`;
  const json = await overpass(q, 75000);
  const ways = json.elements
    .filter((e) => e.type === 'way' && Array.isArray(e.geometry))
    .map((e) => (e.geometry as { lat: number; lon: number }[]).map((g) => ({ lat: g.lat, lon: g.lon })));
  return chainWays(ways);
}

export function initSearch(huts: HutSearch, routes: RouteManager) {
  const input = $<HTMLInputElement>('searchInput'), list = $('suggest'), status = $('searchStatus');
  let items: Suggestion[] = [];
  let active = -1;
  let ctl: AbortController | undefined;
  let timer: number | undefined;
  let seq = 0;

  const setStatus = (t: string) => { status.textContent = t; status.hidden = !t; };

  function render() {
    list.innerHTML = '';
    let last = '';
    items.forEach((s, i) => {
      if (s.group !== last) {
        last = s.group;
        const g = document.createElement('li');
        g.className = 'grp'; g.textContent = s.group;
        list.append(g);
      }
      const li = document.createElement('li');
      li.className = 'item' + (i === active ? ' active' : '');
      li.setAttribute('role', 'option');
      const b = document.createElement('b'); b.textContent = s.title;
      const sm = document.createElement('small'); sm.textContent = s.sub;
      li.append(b, sm);
      li.onmousedown = (e) => { e.preventDefault(); void choose(s); };
      list.append(li);
    });
    list.hidden = items.length === 0;
  }

  async function run(q: string) {
    ctl?.abort();
    ctl = new AbortController();
    const my = ++seq, sig = ctl.signal;
    setStatus('Searching…');
    const jobs: [string, Promise<Suggestion[]>][] = [
      ['peaks', photon(q, 'natural:peak', 'peak', sig)],
      ['alpine huts', photon(q, 'tourism:alpine_hut', 'alpine_hut', sig)],
      ['bivouacs', photon(q, 'tourism:wilderness_hut', 'wilderness_hut', sig)],
      ['shelters', photon(q, 'amenity:shelter', 'shelter', sig)],
      ['routes', wmt(q, sig)],
    ];
    const settled = await Promise.allSettled(jobs.map((j) => j[1]));
    if (my !== seq) return; // a newer query superseded this one
    const failed: string[] = [];
    const all: Suggestion[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') all.push(...r.value);
      else if ((r.reason as Error)?.name !== 'AbortError') failed.push(jobs[i][0]);
    });
    const seen = new Set<string>();
    const order = ['Peaks', 'Huts & bivouacs', 'Routes'];
    items = all
      .filter((s) => { const k = s.hut ? s.hut.id : `r${s.routeRelId}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    active = items.length ? 0 : -1;
    render();
    setStatus(
      items.length
        ? (failed.length ? `Some sources failed: ${failed.join(', ')}` : '')
        : failed.length ? `Search failed (${failed.join(', ')}). Try again.` : 'No results.',
    );
  }

  async function choose(s: Suggestion) {
    list.hidden = true;
    input.value = s.title;
    input.blur();
    if (s.hut) {
      setStatus('');
      huts.show(s.hut);
      // Enrich the details panel with the full OSM tags (elevation, phone, ...). Best effort.
      const [type, id] = s.hut.id.split('/');
      try {
        const r = await overpass(`[out:json][timeout:20];${type}(${id});out tags;`, 15000);
        const tags = r.elements[0]?.tags;
        if (tags) huts.show({ ...s.hut, tags }, false);
      } catch { /* keep the basic info */ }
    } else if (s.routeRelId) {
      setStatus('Loading route geometry from OpenStreetMap…');
      try {
        const pts = await fetchRouteGeometry(s.routeRelId);
        if (pts.length < 2) throw new Error('route has no usable geometry');
        routes.addRoute(s.title, pts);
        setStatus('');
      } catch (e) { setStatus(`Could not load route: ${(e as Error).message}`); }
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { ctl?.abort(); seq++; items = []; render(); setStatus(''); return; }
    timer = window.setTimeout(() => void run(q), 350);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[active]) void choose(items[active]);
      else if (input.value.trim().length >= 2) { clearTimeout(timer); void run(input.value.trim()); }
    } else if (e.key === 'Escape') { list.hidden = true; input.blur(); }
  });
  input.addEventListener('focus', () => { if (items.length) list.hidden = false; });
  input.addEventListener('blur', () => { setTimeout(() => (list.hidden = true), 150); });
}
