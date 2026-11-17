import { OVERPASS_URL } from './config';

/*
 * Shared Overpass client with fallback servers (the public instances are often at capacity: seen 502/504 on 2026-11-16).
 * Servers other than the configured one are ASSUMPTIONS taken from the OSM wiki list; verify before heavy use.
 */
// maps.mail.ru answered 200 on 2026-11-17; private.coffee and kumi.systems did not answer from this network.
const FALLBACKS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export interface OverpassResult { elements: any[] }

export async function overpass(query: string, perTryMs = 30000): Promise<OverpassResult> {
  const servers = [OVERPASS_URL, ...FALLBACKS.filter((s) => s !== OVERPASS_URL)];
  let lastErr = 'no server answered';
  for (const url of servers) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), perTryMs);
    try {
      const res = await fetch(url, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) { lastErr = `HTTP ${res.status}${res.status === 429 ? ' (rate limited)' : ''}`; continue; }
      return (await res.json()) as OverpassResult;
    } catch (e) {
      lastErr = (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message;
    } finally { clearTimeout(timer); }
  }
  throw new Error(`Overpass unavailable (${lastErr}). Try again in a minute.`);
}
