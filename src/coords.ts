/*
 * Parse a pasted coordinate string into WGS84 lat/lon. Supported (examples):
 *   47.0386353N, 13.0670286E      47.0386353, 13.0670286      N 47.0386 E 13.0670
 *   -33.8688 151.2093             47°02'19.9"N 13°04'01.3"E   47°2.3318'N 13°4.0217'E
 *   13.0670286E 47.0386353N       (hemisphere letters decide which is lat/lon, in any order)
 * Without hemisphere letters the order is "lat, lon" (Google Maps convention); if the first value cannot be a
 * latitude (|v| > 90) and the second can, they are swapped. Decimal commas are accepted when values are
 * separated by spaces or semicolons ("47,0386 13,0670").
 * To avoid hijacking normal searches, the input must contain a decimal point, a hemisphere letter or a degree sign.
 */
export interface LatLon { lat: number; lon: number }

// Two flavours: letters BEFORE the numbers ("N 47.03 E 13.06") or AFTER ("47.03N 13.06E"); decided by the first character.
const NUM = String.raw`(-?\d+(?:\.\d+)?)\s*(?:°|º|˚|d(?![a-z]))?\s*(?:(\d+(?:\.\d+)?)\s*(?:'|′|’|‘)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|”|“|''|′′|’’))?`;
const TOKEN_PRE = new RegExp(String.raw`([NSEWnsew])?\s*${NUM}\s*`, 'y');
const TOKEN_SUF = new RegExp(String.raw`${NUM}\s*([NSEWnsew])?\s*`, 'y');

interface Tok { hemi?: string; value: number; plain: boolean }

export function parseCoords(input: string): LatLon | null {
  let s = input.trim();
  if (!s || s.length > 80) return null;
  // decimal comma: "47,0386 13,0670" or "47,0386; 13,0670"
  if (/^-?\d+,\d+\s*[;\s]\s*-?\d+,\d+$/.test(s)) s = s.replace(/,/g, '.');
  s = s.replace(/[;,]/g, ' ').replace(/\s+/g, ' ');
  if (!/\.|°|º|˚|[NSEWnsew]/.test(s)) return null;

  const prefixStyle = /^[NSEWnsew]/.test(s);
  const re = prefixStyle ? TOKEN_PRE : TOKEN_SUF;
  const toks: Tok[] = [];
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m || m[0].length === 0) return null;
    pos = re.lastIndex;
    // group layout: prefix style -> [1]=hemi, [2]=deg, [3]=min, [4]=sec; suffix style -> [1]=deg, [2]=min, [3]=sec, [4]=hemi
    const [hemiRaw, degS, minS, secS] = prefixStyle ? [m[1], m[2], m[3], m[4]] : [m[4], m[1], m[2], m[3]];
    const deg = parseFloat(degS);
    const min = minS ? parseFloat(minS) : 0, sec = secS ? parseFloat(secS) : 0;
    if (min >= 60 || sec >= 60) return null;
    const hemi = hemiRaw?.toUpperCase();
    let value = Math.abs(deg) + min / 60 + sec / 3600;
    if (degS.startsWith('-')) value = -value;
    if (hemi === 'S' || hemi === 'W') value = -Math.abs(value);
    toks.push({ hemi, value, plain: !minS && !secS });
  }
  if (toks.length !== 2) return null;
  const [a, b] = toks;
  const isLat = (h?: string) => h === 'N' || h === 'S', isLon = (h?: string) => h === 'E' || h === 'W';
  let lat: number, lon: number;
  if (isLat(a.hemi) && isLon(b.hemi)) { lat = a.value; lon = b.value; }
  else if (isLon(a.hemi) && isLat(b.hemi)) { lat = b.value; lon = a.value; }
  else if (!a.hemi && !b.hemi) {
    if (Math.abs(a.value) > 90 && Math.abs(b.value) <= 90) { lat = b.value; lon = a.value; }
    else { lat = a.value; lon = b.value; }
  } else return null; // one hemisphere letter only, or two of the same axis
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
  return { lat, lon };
}

export function formatCoords(c: LatLon): string {
  return `${Math.abs(c.lat).toFixed(5)}° ${c.lat >= 0 ? 'N' : 'S'}, ${Math.abs(c.lon).toFixed(5)}° ${c.lon >= 0 ? 'E' : 'W'}`;
}
