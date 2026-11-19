// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildGpx, parseGpx } from '../src/gpx';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="45.8326" lon="6.8652"><ele>4805</ele><name>Mont Blanc</name><desc>Summit</desc></wpt>
  <wpt lat="45.9" lon="6.9"></wpt>
  <wpt lat="999" lon="6.9"><name>broken</name></wpt>
  <trk><name>Day 1</name><trkseg>
    <trkpt lat="45.90" lon="6.80"><ele>1000</ele><name>not the track name</name></trkpt>
    <trkpt lat="45.91" lon="6.81"><ele>1100</ele></trkpt>
    <trkpt lat="abc" lon="6.82"></trkpt>
  </trkseg></trk>
  <rte><rtept lat="46.0" lon="7.0"/><rtept lat="46.1" lon="7.1"/></rte>
</gpx>`;

describe('parseGpx', () => {
  const f = parseGpx(GPX);

  it('reads tracks and routes, skipping invalid points', () => {
    expect(f.routes.map((r) => r.name)).toEqual(['Day 1', 'Route']);
    expect(f.routes[0].points).toEqual([{ lat: 45.9, lon: 6.8, ele: 1000 }, { lat: 45.91, lon: 6.81, ele: 1100 }]);
  });

  it('reads waypoints with name, elevation and description; skips invalid ones; names unnamed ones', () => {
    expect(f.waypoints).toEqual([
      { lat: 45.8326, lon: 6.8652, ele: 4805, name: 'Mont Blanc', desc: 'Summit' },
      { lat: 45.9, lon: 6.9, name: 'Waypoint 2' },
    ]);
  });

  it('rejects files that are not GPX', () => {
    expect(() => parseGpx('<html><body>hi</body></html>')).toThrow(/GPX/);
    expect(() => parseGpx('not xml at all <')).toThrow();
  });
});

describe('buildGpx', () => {
  it('round-trips tracks and waypoints, with waypoints before tracks', () => {
    const xml = buildGpx([{ name: 'A & B <test>', points: [{ lat: 1, lon: 2, ele: 3 }, { lat: 1.5, lon: 2.5 }], waypoints: [{ lat: 1, lon: 2, name: 'Hut "x"', desc: 'water' }] }]);
    expect(xml.indexOf('<wpt')).toBeLessThan(xml.indexOf('<trk>'));
    const back = parseGpx(xml);
    expect(back.routes[0].name).toBe('A & B <test>');
    expect(back.routes[0].points).toEqual([{ lat: 1, lon: 2, ele: 3 }, { lat: 1.5, lon: 2.5 }]);
    expect(back.waypoints).toEqual([{ lat: 1, lon: 2, name: 'Hut "x"', desc: 'water' }]);
  });

  it('cannot be broken by names containing markup or control characters', () => {
    const xml = buildGpx([{ name: '</name></trk><script>alert(1)</script>\u0001', points: [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }] }]);
    expect(xml).not.toContain('<script>');
    expect(parseGpx(xml).routes[0].name).toBe('</name></trk><script>alert(1)</script>');
  });
});
