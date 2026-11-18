// Builds public/data/poi-<region>.json: named peaks, alpine huts, bivouacs (wilderness huts) and shelters from OpenStreetMap.
// Usage: node scripts/build-index.mjs [region]      (regions defined below; default "alps")
// Data (c) OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright
// Tiles are 1x1 degree so each Overpass query stays small (a single world-wide query times out).
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';

const REGIONS = {
  // [south, west, north, east]
  alps: [43.5, 4.8, 48.3, 17.0],
};
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const region = process.argv[2] ?? 'alps';
const [S, W, N, E] = REGIONS[region] ?? (() => { throw new Error('unknown region ' + region); })();

const KIND = { peak: 0, alpine_hut: 1, wilderness_hut: 2, shelter: 3 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(q) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = SERVERS[attempt % SERVERS.length];
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 120000);
      const res = await fetch(url, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mountain_map-index-build' },
        body: 'data=' + encodeURIComponent(q),
      });
      clearTimeout(t);
      if (res.ok) return await res.json();
      console.warn(`  ${url} -> HTTP ${res.status}`);
    } catch (e) { console.warn(`  ${url} -> ${e.name}`); }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error('tile failed after retries');
}

const out = new Map();
const CACHE = `.cache/index-${region}`; // per-tile results so an interrupted run resumes (git-ignored)
mkdirSync(CACHE, { recursive: true });

function parse(json) {
  const rows = [];
  for (const el of json.elements) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || !t.name) continue;
    const kind = t.natural === 'peak' ? 'peak' : t.tourism === 'alpine_hut' ? 'alpine_hut' : t.tourism === 'wilderness_hut' ? 'wilderness_hut' : 'shelter';
    const ele = parseFloat(t.ele);
    // [name, kind, lat, lon, ele|null, "n|w|r"+id, alt-name for matching|""]
    const alt = [t['name:en'], t['name:de'], t['name:fr'], t['name:it'], t.alt_name, t.int_name]
      .filter((a) => a && a !== t.name).join(' ');
    rows.push([`${el.type}${el.id}`, [
      t.name, KIND[kind], +lat.toFixed(5), +lon.toFixed(5), Number.isFinite(ele) ? Math.round(ele) : null,
      el.type[0] + el.id, alt,
    ]]);
  }
  return rows;
}

const mkQuery = (bb) => `[out:json][timeout:100];(node["natural"="peak"]["name"](${bb});` +
  `nwr["tourism"~"^(alpine_hut|wilderness_hut)$"]["name"](${bb});nwr["amenity"="shelter"]["name"](${bb}););out center tags;`;

/** Fetch one box; on repeated failure split it into 4 quarters (smaller queries) down to a minimum size. */
async function fetchBox(s, w, n, e, depth = 0) {
  const bb = `${s},${w},${n},${e}`;
  try { return parse(await query(mkQuery(bb))); }
  catch (err) {
    if (depth >= 2) { failedBoxes.push(bb); console.warn(`  SKIPPED ${bb}`); return []; }
    console.warn(`  splitting ${bb}`);
    const ms = (s + n) / 2, mw = (w + e) / 2, rows = [];
    for (const [a, b, c, d] of [[s, w, ms, mw], [s, mw, ms, e], [ms, w, n, mw], [ms, mw, n, e]]) rows.push(...(await fetchBox(a, b, c, d, depth + 1)));
    return rows;
  }
}

const failedBoxes = [];
const tiles = [];
for (let s = Math.floor(S); s < N; s++) for (let w = Math.floor(W); w < E; w++) tiles.push([s, w]);
let done = 0;
for (const [s, w] of tiles) {
  const f = `${CACHE}/${s}_${w}.json`;
  let rows, cached = false;
  if (existsSync(f)) { rows = JSON.parse(readFileSync(f, 'utf8')); cached = true; }
  else {
    const before = failedBoxes.length;
    rows = await fetchBox(s, w, s + 1, w + 1);
    if (failedBoxes.length === before) writeFileSync(f, JSON.stringify(rows)); // only cache complete tiles
    await sleep(1500);
  }
  for (const [k, row] of rows) out.set(k, row);
  done++;
  console.log(`tile ${done}/${tiles.length} [${s},${w}]${cached ? ' (cached)' : ''} total ${out.size}`);
}
if (failedBoxes.length) console.warn(`WARNING: ${failedBoxes.length} sub-boxes skipped (rerun the script to retry): ${failedBoxes.join(' | ')}`);

mkdirSync('public/data', { recursive: true });
const file = `public/data/poi-${region}.json`;
const rows = [...out.values()].sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(file, JSON.stringify({ region, built: new Date().toISOString(), license: 'ODbL, (c) OpenStreetMap contributors', incomplete: failedBoxes, rows }));
const c = [0, 0, 0, 0];
for (const r of rows) c[r[1]]++;
console.log(`wrote ${file}: ${rows.length} rows (peaks ${c[0]}, alpine huts ${c[1]}, bivouacs ${c[2]}, shelters ${c[3]})`);
