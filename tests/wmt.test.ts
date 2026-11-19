import { describe, expect, it } from 'vitest';
import { chain, mainLine, mainStretches, mercToPt, thin, type WmtDetails } from '../src/wmt';
import { haversine, lengthM, type Pt } from '../src/geo';

const R = 6378137;
const toMerc = (lon: number, lat: number) => [
  (lon * Math.PI / 180) * R,
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * R,
];
const way = (...pts: [number, number][]) => ({ route_type: 'base', geometry: { type: 'LineString', coordinates: pts.map(([lon, lat]) => toMerc(lon, lat)) } });
const close = (a: Pt, b: Pt) => haversine(a, b) < 0.01;

describe('mercToPt', () => {
  it('converts Web Mercator metres to degrees', () => {
    expect(mercToPt([0, 0])).toEqual({ lon: 0, lat: 0 });
    const p = mercToPt(toMerc(6.8652, 45.8326)); // Mont Blanc
    expect(p.lon).toBeCloseTo(6.8652, 9);
    expect(p.lat).toBeCloseTo(45.8326, 9);
  });
});

describe('chain', () => {
  it('flips parts so they continue from the end of the chain', () => {
    const a: Pt[] = [{ lon: 0, lat: 0 }, { lon: 0.001, lat: 0 }];
    const bReversed: Pt[] = [{ lon: 0.002, lat: 0 }, { lon: 0.001, lat: 0 }];
    const out = chain([a, bReversed]);
    expect(out.map((p) => p.lon)).toEqual([0, 0.001, 0.002]); // shared vertex not duplicated
  });
  it('orients the first part towards the second', () => {
    const aReversed: Pt[] = [{ lon: 0.001, lat: 0 }, { lon: 0, lat: 0 }];
    const b: Pt[] = [{ lon: 0.001, lat: 0 }, { lon: 0.002, lat: 0 }];
    expect(chain([aReversed, b]).map((p) => p.lon)).toEqual([0, 0.001, 0.002]);
  });
  it('ignores empty parts', () => {
    expect(chain([[], [{ lon: 1, lat: 1 }]])).toEqual([]);
  });
});

describe('mainStretches / mainLine', () => {
  const details: WmtDetails = {
    id: 1,
    route: {
      route_type: 'route',
      main: [
        { route_type: 'linear', ways: [way([7, 46], [7.01, 46]), way([7.02, 46], [7.01, 46])] },
        {
          route_type: 'route', // sub-relation (a stage)
          main: [{ route_type: 'linear', ways: [way([7.02, 46], [7.03, 46])] }],
          appendices: [{ route_type: 'appendix', main: [{ route_type: 'linear', ways: [way([9, 47], [9.1, 47])] }] }],
        },
      ],
      appendices: [{ route_type: 'appendix', main: [{ route_type: 'linear', ways: [way([8, 46], [8.5, 46])] }] }],
    } as WmtDetails['route'],
  };

  it('keeps the main line and skips every appendix (alternatives, excursions)', () => {
    const s = mainStretches(details.route);
    expect(s).toHaveLength(2);
    expect(s.flat().every((p) => p.lon >= 7 && p.lon <= 7.03 + 1e-9)).toBe(true);
  });

  it('joins the stretches into one line in route order', () => {
    const line = mainLine(details);
    expect(close(line[0], { lon: 7, lat: 46 })).toBe(true);
    expect(close(line[line.length - 1], { lon: 7.03, lat: 46 })).toBe(true);
    expect(lengthM(line)).toBeCloseTo(haversine({ lon: 7, lat: 46 }, { lon: 7.03, lat: 46 }), 0);
  });

  it('returns nothing for a route without geometry', () => {
    expect(mainLine({ id: 2 })).toEqual([]);
  });
});

describe('unsorted routes (linear "no")', () => {
  // Shape of the Stubaier Höhenweg: the short piece that belongs between B and C is listed last.
  const A = way([7.0, 46], [7.1, 46]);
  const B = way([7.1, 46], [7.2, 46]);
  const C = way([7.3, 46], [7.4, 46]);
  const D = way([7.2, 46], [7.3, 46]);
  const lin = (w: ReturnType<typeof way>) => ({ route_type: 'linear', ways: [w] });

  it('reorders stretches by proximity so the line has no long jump', () => {
    const line = mainLine({ id: 3, route: { route_type: 'route', linear: 'no', main: [lin(A), lin(B), lin(C), lin(D)] } as WmtDetails['route'] });
    let maxGap = 0;
    for (let i = 1; i < line.length; i++) maxGap = Math.max(maxGap, haversine(line[i - 1], line[i]));
    expect(maxGap).toBeLessThan(8000); // one segment is ~7.7 km; a wrong order would jump back ~15 km
    expect(lengthM(line)).toBeCloseTo(haversine({ lon: 7, lat: 46 }, { lon: 7.4, lat: 46 }), -2);
  });

  it('keeps member order for sorted routes', () => {
    const s = mainStretches({ route_type: 'route', linear: 'sorted', main: [lin(A), lin(C), lin(B)] } as never);
    expect(s.map((p) => p[0].lon.toFixed(1))).toEqual(['7.0', '7.3', '7.1']);
  });
});

describe('thin', () => {
  it('drops vertices closer than the threshold but keeps both ends', () => {
    const pts: Pt[] = [0, 0.00001, 0.00002, 0.001, 0.00101].map((lon) => ({ lon, lat: 0 }));
    const out = thin(pts, 10);
    expect(out[0]).toBe(pts[0]);
    expect(out[out.length - 1]).toBe(pts[4]);
    expect(out.length).toBe(3);
  });
});
