import { describe, expect, it } from 'vitest';
import { formatCoords, parseCoords } from '../src/coords';

describe('parseCoords', () => {
  const near = (s: string, lat: number, lon: number) => {
    const c = parseCoords(s);
    expect(c, s).not.toBeNull();
    expect(c!.lat).toBeCloseTo(lat, 4);
    expect(c!.lon).toBeCloseTo(lon, 4);
  };

  it('reads the formats listed in coords.ts', () => {
    near('47.0386353N, 13.0670286E', 47.0386353, 13.0670286);
    near('47.0386353, 13.0670286', 47.0386353, 13.0670286);
    near('N 47.0386 E 13.0670', 47.0386, 13.067);
    near('-33.8688 151.2093', -33.8688, 151.2093);
    near(`47°02'19.9"N 13°04'01.3"E`, 47.038861, 13.067028);
    near(`47°2.3318'N 13°4.0217'E`, 47.038863, 13.067028);
    near('13.0670286E 47.0386353N', 47.0386353, 13.0670286);
    near('47,0386 13,0670', 47.0386, 13.067);
  });

  it('swaps lat/lon when only that order is valid', () => {
    near('151.2093, -33.8688', -33.8688, 151.2093);
  });

  it('does not hijack normal searches or accept impossible values', () => {
    for (const s of ['Matterhorn', 'Tour du Mont Blanc', 'AV1 2', '12 34', '95.0, 100.0', '47.1N 13.1N', '', '1.2.3 4']) {
      expect(parseCoords(s), s).toBeNull();
    }
  });

  it('formats with hemisphere letters', () => {
    expect(formatCoords({ lat: -33.8688, lon: 151.2093 })).toBe('33.86880° S, 151.20930° E');
  });
});
