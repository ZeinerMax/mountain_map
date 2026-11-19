import { describe, expect, it } from 'vitest';
import { cloneRoute, sanitizeRoutes, serializeRoutes } from '../src/routeData';

describe('sanitizeRoutes (data from localStorage)', () => {
  it('returns [] for anything that is not an array', () => {
    for (const bad of [null, undefined, 42, 'x', {}, { routes: [] }]) expect(sanitizeRoutes(bad)).toEqual([]);
  });

  it('drops routes with fewer than 2 valid points and invalid points inside routes', () => {
    const out = sanitizeRoutes([
      { id: 'a', name: 'ok', points: [{ lat: 1, lon: 2 }, { lat: 'x', lon: 2 }, { lat: 3, lon: 4, ele: 5 }, null, { lat: 95, lon: 0 }] },
      { id: 'b', name: 'one point', points: [{ lat: 1, lon: 2 }] },
      { id: 'c', points: 'nope' },
      null,
    ]);
    expect(out).toEqual([{ id: 'a', name: 'ok', points: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4, ele: 5 }] }]);
  });

  it('repairs missing names and duplicate or missing ids', () => {
    const pts = [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }];
    const out = sanitizeRoutes([{ id: 'x', points: pts }, { id: 'x', name: 'B', points: pts }, { name: 'C', points: pts }]);
    expect(out[0].name).toBe('Route');
    expect(new Set(out.map((r) => r.id)).size).toBe(3);
    expect(out.every((r) => typeof r.id === 'string' && r.id.length > 0)).toBe(true);
  });

  it('keeps valid waypoints only', () => {
    const out = sanitizeRoutes([{
      id: 'a', name: 'w', points: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
      waypoints: [{ lat: 1, lon: 1, name: 'Hut' }, { lat: 1, lon: 1 }, { lat: 'x', lon: 1, name: 'bad' }, { lat: 2, lon: 2, name: 'W', ele: 10, desc: 7 }],
    }]);
    expect(out[0].waypoints).toEqual([{ lat: 1, lon: 1, name: 'Hut' }, { lat: 2, lon: 2, name: 'W', ele: 10 }]);
  });
});

describe('serializeRoutes / cloneRoute', () => {
  it('rounds coordinates and drops computed stats, and survives a round trip', () => {
    const r = { id: 'a', name: 'n', points: [{ lat: 46.123456789, lon: 7.987654321, ele: 1234.5678 }, { lat: 46.2, lon: 8 }], stats: { big: true } };
    const json = serializeRoutes([r]);
    expect(json).not.toContain('stats');
    expect(sanitizeRoutes(JSON.parse(json))[0].points[0]).toEqual({ lat: 46.123457, lon: 7.987654, ele: 1234.6 });
  });

  it('clones deeply (undo snapshots must not change when the route is edited)', () => {
    const r = { id: 'a', name: 'n', points: [{ lat: 1, lon: 2 }], waypoints: [{ lat: 1, lon: 1, name: 'w' }] };
    const c = cloneRoute(r);
    r.points[0].lat = 99; r.waypoints[0].name = 'changed';
    expect(c.points[0].lat).toBe(1);
    expect(c.waypoints![0].name).toBe('w');
  });
});
