import type { HutSearch, Hut } from './huts';
import type { RouteManager } from './routes';
import { overpass } from './overpass';
import { haversine, type Pt } from './geo';
import * as Cesium from 'cesium';
import { loadIndex, searchIndex, indexReady, fold } from './poi';
import { parseCoords, formatCoords, type LatLon } from './coords';
import { flyToPlace, terrainHeight } from './map';
import { WMT_API, fetchWmtRoute } from './wmt';

/*
 * Global search with suggestions.
 *  - Peaks / huts / bivouacs / shelters: LOCAL index (src/poi.ts, public/data/poi-*.json, built from OSM by
 *    scripts/build-index.mjs). Instant, no third-party server. Covers only the regions that were built (currently the Alps).
 *  - Routes: Waymarked Trails API (hiking.waymarkedtrails.org/api/v1/list/search), CORS open, verified by request
 *    (~0.9 s on 2026-11-17). Route lines come from its details endpoint (src/wmt.ts); Overpass is only the fallback.
 *  Photon was dropped (public instance timed out on 2026-11-17); Nominatim is not used: its policy forbids autocomplete.
 */
const WMT_URL = `${WMT_API}/list/search`;

type Kind = Hut['kind'];
interface Suggestion {
  group: 'Coordinates' | 'Peaks' | 'Huts & bivouacs' | 'Routes';
  title: string; sub: string;
  hut?: Hut;
  routeRelId?: number;
  coords?: LatLon;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function wmt(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`${WMT_URL}?query=${encodeURIComponent(q)}&limit=6`, { signal });
  if (!res.ok) throw new Error(`Waymarked Trails HTTP ${res.status}`);
  const json = (await res.json()) as { results: any[] };
  // Waymarked Trails matches loosely ("Grossglockner" -> "Gross - Gross"): keep only routes where every query word
  // appears in the name, ref or itinerary.
  const words = fold(q).split(/\s+/).filter((w) => w.length >= 2);
  const relevant = (r: any) => {
    const hay = fold([r.name, r.ref, ...(Array.isArray(r.itinerary) ? r.itinerary : [])].filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  };
  return json.results
    .filter((r) => r.type === 'relation' && r.name && relevant(r))
    .map((r): Suggestion => ({
      group: 'Routes', title: r.ref && !r.name.includes(r.ref) ? `${r.name} (${r.ref})` : r.name,
      sub: Array.isArray(r.itinerary) ? r.itinerary.join(' → ') : '', routeRelId: r.id,
    }));
}

// Member roles that are not part of the main line of a route relation.
const SIDE_ROLES = /^(alternative|alternate|excursion|approach|connection|spur|variant|stage)/i;

interface RelMember { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }

/** Join ways in relation (member) order, flipping each so it continues from the previous one. Gaps become straight lines. */
function joinInOrder(ways: Pt[][]): Pt[] {
  const list = ways.filter((w) => w.length > 1);
  if (!list.length) return [];
  let chain = list[0].slice();
  if (list.length > 1) {
    // orient the first way towards the second
    const n = list[1], ends = [n[0], n[n.length - 1]];
    const dEnd = Math.min(...ends.map((e) => haversine(chain[chain.length - 1], e)));
    const dStart = Math.min(...ends.map((e) => haversine(chain[0], e)));
    if (dStart < dEnd) chain.reverse();
  }
  for (const w of list.slice(1)) {
    const tail = chain[chain.length - 1];
    const forward = haversine(tail, w[0]) <= haversine(tail, w[w.length - 1]);
    chain = chain.concat(forward ? w : w.slice().reverse());
  }
  // Thin out vertices closer than 10 m to keep the route light.
  const out: Pt[] = [chain[0]];
  for (const p of chain) if (haversine(out[out.length - 1], p) >= 10) out.push(p);
  return out;
}

const wayPts = (m: RelMember): Pt[] | undefined =>
  m.type === 'way' && m.geometry && !SIDE_ROLES.test(m.role) ? m.geometry.map((g) => ({ lat: g.lat, lon: g.lon })) : undefined;

/**
 * Route geometry from the relation's own ways in their official order (alternatives/excursions skipped).
 * Super-relations (no ways of their own) are resolved one level down, in member order.
 * Measured 2026-11-17: the previous "all sub-relations, joined greedily" approach turned the Tour du Mont Blanc
 * into 299 km / 29,600 m ascent because variants were chained in.
 */
async function fetchRouteGeometry(relId: number): Promise<Pt[]> {
  const first = await overpass(`[out:json][timeout:60];rel(${relId});out geom;`, 60000);
  const members: RelMember[] = first.elements[0]?.members ?? [];
  let ways = members.map(wayPts).filter((w): w is Pt[] => !!w);
  if (ways.length < 2) {
    const subIds = members.filter((m) => m.type === 'relation' && !SIDE_ROLES.test(m.role)).map((m) => m.ref);
    if (subIds.length) {
      const sub = await overpass(`[out:json][timeout:60];rel(id:${subIds.slice(0, 60).join(',')});out geom;`, 75000);
      const byId = new Map<number, RelMember[]>(sub.elements.map((e) => [e.id, e.members ?? []]));
      ways = subIds.flatMap((id) => (byId.get(id) ?? []).map(wayPts).filter((w): w is Pt[] => !!w));
    }
  }
  return joinInOrder(ways);
}

/**
 * Main line of a route. Waymarked Trails first (fast, ordered, alternatives already separated; see wmt.ts),
 * Overpass as the fallback when it is down or returns no geometry.
 */
async function loadRoute(relId: number, onFallback: () => void): Promise<Pt[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const pts = await fetchWmtRoute(relId, ctl.signal);
    if (pts.length >= 2) return pts;
  } catch (e) {
    console.warn('Waymarked Trails route failed, using Overpass', e);
  } finally { clearTimeout(timer); }
  onFallback();
  const pts = await fetchRouteGeometry(relId);
  if (pts.length < 2) throw new Error('route has no usable geometry');
  return pts;
}

export function initSearch(huts: HutSearch, routes: RouteManager, viewer: Cesium.Viewer) {
  const input = $<HTMLInputElement>('searchInput'), list = $('suggest'), status = $('searchStatus');
  let items: Suggestion[] = [];
  let active = -1;
  let ctl: AbortController | undefined;
  let timer: number | undefined;
  let seq = 0;
  let pin: Cesium.Entity | undefined;
  const ORDER = ['Coordinates', 'Peaks', 'Huts & bivouacs', 'Routes'];

  const setStatus = (t: string) => { status.textContent = t; status.hidden = !t; };

  // Speed: fetch and parse the local index in the background right after start-up, not on the first keystroke.
  const preload = () => { void loadIndex().catch(() => { /* retried on first search */ }); };
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle.call(window, preload, { timeout: 4000 });
  else window.setTimeout(preload, 1500);
  input.addEventListener('focus', preload, { once: true });

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

  const localSuggestions = (q: string): Suggestion[] =>
    searchIndex(q, 6).map((h): Suggestion => ({
      group: h.peak ? 'Peaks' : 'Huts & bivouacs', title: h.hut.name, sub: h.sub, hut: h.hut,
    }));

  function show(parts: Suggestion[]) {
    items = parts.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
    active = items.length ? 0 : -1;
    render();
  }

  /** Synchronous part: coordinates and local index. Runs on every keystroke with no debounce. */
  function instant(q: string): { local: Suggestion[]; isCoords: boolean } {
    const c = parseCoords(q);
    if (c) {
      show([{ group: 'Coordinates', title: formatCoords(c), sub: 'Go to this place', coords: c }]);
      setStatus('');
      return { local: [], isCoords: true };
    }
    const local = indexReady() ? localSuggestions(q) : [];
    show(local);
    return { local, isCoords: false };
  }

  /** Asynchronous part: wait for the index if needed, then fetch routes (debounced by the caller). */
  async function slow(q: string, local: Suggestion[]) {
    ctl?.abort();
    ctl = new AbortController();
    const my = ++seq, sig = ctl.signal;
    const timeout = window.setTimeout(() => ctl?.abort(), 6000); // a slow server must not stall the dropdown
    let failed = '';
    if (!indexReady()) {
      setStatus('Loading local index…');
      try {
        await loadIndex();
        if (my !== seq) { clearTimeout(timeout); return; }
        local = localSuggestions(q);
        show(local);
      } catch (e) { failed = `local index (${(e as Error).message})`; }
    }
    setStatus('Searching routes…');
    let remote: Suggestion[] = [];
    try { remote = await wmt(q, sig); } catch { failed ||= 'routes'; }
    clearTimeout(timeout);
    if (my !== seq) return;
    show([...local, ...remote]);
    setStatus(
      items.length
        ? (failed ? `Source unavailable: ${failed}` : '')
        : failed ? `Search failed (${failed}). Try again.` : 'No results. The local index covers the Alps only.',
    );
  }

  /** Marker with coordinates and terrain elevation at a searched position. Returns the terrain height. */
  async function dropPin(c: LatLon): Promise<number> {
    const h = await terrainHeight(viewer, c.lon, c.lat);
    if (pin) viewer.entities.remove(pin);
    pin = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, h),
      point: { pixelSize: 12, color: Cesium.Color.fromCssColorString('#00e5ff'), outlineColor: Cesium.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: `${formatCoords(c)}\n${Math.round(h)} m`, font: '13px system-ui', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -34), disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    return h;
  }

  async function choose(s: Suggestion) {
    // Cancel any pending/in-flight route search so it cannot re-open the dropdown afterwards.
    clearTimeout(timer); ctl?.abort(); seq++;
    list.hidden = true;
    input.value = s.coords ? formatCoords(s.coords) : s.title;
    input.blur();
    if (s.coords) {
      setStatus('');
      const h = await dropPin(s.coords);
      void flyToPlace(viewer, s.coords.lon, s.coords.lat, undefined, h);
    } else if (s.hut) {
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
      setStatus('Loading route…');
      try {
        const pts = await loadRoute(s.routeRelId, () => setStatus('Waymarked Trails unavailable, trying OpenStreetMap (can take a minute)…'));
        routes.addRoute(s.title, pts);
        setStatus('');
      } catch (e) { setStatus(`Could not load route: ${(e as Error).message}`); }
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { ctl?.abort(); seq++; items = []; render(); setStatus(''); return; }
    const { local, isCoords } = instant(q);
    if (isCoords) { ctl?.abort(); seq++; return; }
    timer = window.setTimeout(() => void slow(q, local), 250); // only the network part is debounced
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
      else if (input.value.trim().length >= 2) {
        clearTimeout(timer);
        const q = input.value.trim();
        const { local } = instant(q);
        void slow(q, local);
      }
    } else if (e.key === 'Escape') { list.hidden = true; input.blur(); }
  });
  input.addEventListener('focus', () => { if (items.length) list.hidden = false; });
  input.addEventListener('blur', () => { setTimeout(() => (list.hidden = true), 150); });
}
