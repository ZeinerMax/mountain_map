import type { Hut } from './huts';

/*
 * Local index of named peaks / huts / bivouacs / shelters built from OpenStreetMap (ODbL) by scripts/build-index.mjs.
 * Files live in public/data/poi-<region>.json and are served as static files. Loaded lazily on first search.
 * Row format: [name, kind(0 peak,1 alpine_hut,2 wilderness_hut,3 shelter), lat, lon, ele|null, "n|w|r"+osmId, altNames].
 */
const REGIONS = ['alps']; // keep in sync with scripts/build-index.mjs and public/data/
const KINDS: Hut['kind'][] = ['peak', 'alpine_hut', 'wilderness_hut', 'shelter'];
const TYPE_NAME: Record<string, string> = { n: 'node', w: 'way', r: 'relation' };

type Row = [string, number, number, number, number | null, string, string];
interface Entry { row: Row; key: string; alt: string }

let entries: Entry[] | undefined;
let loading: Promise<void> | undefined;

/** Lowercase and strip diacritics so "Hornli" finds "Hörnlihütte". */
const SPECIAL: Record<string, string> = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ł': 'l', 'ð': 'd', 'þ': 'th' };
export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[ßæœøđłðþ]/g, (c) => SPECIAL[c]);

export function loadIndex(): Promise<void> {
  loading ??= (async () => {
    const all: Entry[] = [];
    for (const r of REGIONS) {
      const res = await fetch(`/data/poi-${r}.json`);
      if (!res.ok) throw new Error(`index ${r}: HTTP ${res.status}`);
      const json = (await res.json()) as { rows: Row[] };
      for (const row of json.rows) all.push({ row, key: fold(row[0]), alt: row[6] ? fold(row[6]) : '' });
    }
    entries = all;
  })().catch((e) => { loading = undefined; throw e; });
  return loading;
}

export const indexReady = () => !!entries;

export interface PoiHit { hut: Hut; sub: string; peak: boolean }

/** Prefix-of-name or prefix-of-word beats substring; ties broken by elevation (higher first). */
/** Returns up to `limit` peaks AND up to `limit` huts/bivouacs/shelters, so huts are not crowded out by the many peaks. */
export function searchIndex(query: string, limit = 6): PoiHit[] {
  if (!entries) return [];
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const scored: { e: Entry; score: number }[] = [];
  for (const e of entries) {
    let score = 0;
    if (e.key === q) score = 4;
    else if (e.key.startsWith(q)) score = 3;
    else if (e.key.includes(' ' + q) || e.key.includes('-' + q)) score = 2;
    else if (e.key.includes(q)) score = 1;
    else if (e.alt && e.alt.includes(q)) score = 0.5;
    if (score) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || (b.e.row[4] ?? 0) - (a.e.row[4] ?? 0) || a.e.row[0].length - b.e.row[0].length);
  const peaks = scored.filter((x) => x.e.row[1] === 0).slice(0, limit);
  const huts = scored.filter((x) => x.e.row[1] !== 0).slice(0, limit);
  return [...peaks, ...huts].map(({ e }) => {
    const [name, k, lat, lon, ele, id] = e.row;
    const kind = KINDS[k];
    const hut: Hut = {
      id: `${TYPE_NAME[id[0]]}/${id.slice(1)}`, name, kind, lat, lon,
      tags: { name, ...(ele != null ? { ele: String(ele) } : {}) },
    };
    return { hut, peak: kind === 'peak', sub: [ele != null ? `${ele} m` : '', kind === 'peak' ? '' : kind.replace('_', ' ')].filter(Boolean).join(' · ') };
  });
}
