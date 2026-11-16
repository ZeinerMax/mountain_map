import * as Cesium from 'cesium';
import { pickGround } from './map';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const deg = Cesium.Math.toDegrees;

/** Compass + pitch/tilt controls. Heading/pitch come straight from the Cesium camera. */
export function initCompass(viewer: Cesium.Viewer) {
  const needle = $('needle'), text = $('compassText');
  const update = () => {
    const h = deg(viewer.camera.heading), p = deg(viewer.camera.pitch);
    needle.setAttribute('transform', `rotate(${(-h).toFixed(1)})`);
    text.textContent = `${Math.round((h + 360) % 360)}° · pitch ${Math.round(p)}°`;
  };
  viewer.scene.postRender.addEventListener(update);

  /** Re-orient around the ground point at screen centre, keeping the camera distance. */
  function orbit(heading: number, pitch: number) {
    const c = viewer.scene.canvas;
    const target = pickGround(viewer, new Cesium.Cartesian2(c.clientWidth / 2, c.clientHeight / 2));
    if (!target) return;
    const range = Cesium.Cartesian3.distance(viewer.camera.positionWC, target);
    viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
  const clampPitch = (p: number) => Cesium.Math.clamp(p, Cesium.Math.toRadians(-90), Cesium.Math.toRadians(-5));
  $('tiltUp').onclick = () => orbit(viewer.camera.heading, clampPitch(viewer.camera.pitch + Cesium.Math.toRadians(10)));
  $('tiltDown').onclick = () => orbit(viewer.camera.heading, clampPitch(viewer.camera.pitch - Cesium.Math.toRadians(10)));
  $('compass').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    orbit(0, viewer.camera.pitch);
  });
}

/** Coordinates, elevation, slope under the cursor and a distance scale bar. */
export function initInfoBar(viewer: Cesium.Viewer) {
  const globe = viewer.scene.globe;
  const ellipsoid = Cesium.Ellipsoid.WGS84;
  const coord = $('ibCoord'), ele = $('ibEle'), slope = $('ibSlope');
  let pending: Cesium.Cartesian2 | undefined;

  const heightAt = (lon: number, lat: number) => globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));

  function sample(pos: Cesium.Cartesian2) {
    const g = pickGround(viewer, pos);
    if (!g) { coord.textContent = '–'; ele.textContent = 'elev –'; slope.textContent = 'slope –'; return; }
    const c = Cesium.Cartographic.fromCartesian(g, ellipsoid);
    const lon = deg(c.longitude), lat = deg(c.latitude);
    coord.textContent = `${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
    const h = heightAt(lon, lat);
    ele.textContent = h != null ? `elev ${Math.round(h)} m` : 'elev –';
    // Slope: central differences over ±15 m on the currently loaded terrain tiles (approximation).
    const d = 15;
    const dLat = deg(d / 6371008.8), dLon = dLat / Math.max(0.05, Math.cos(c.latitude));
    const e = heightAt(lon + dLon, lat), w = heightAt(lon - dLon, lat);
    const n = heightAt(lon, lat + dLat), s = heightAt(lon, lat - dLat);
    if ([e, w, n, s].every((v) => v != null)) {
      const gx = (e! - w!) / (2 * d), gy = (n! - s!) / (2 * d);
      slope.textContent = `slope ${deg(Math.atan(Math.hypot(gx, gy))).toFixed(0)}°`;
    } else slope.textContent = 'slope –';
  }

  viewer.scene.canvas.addEventListener('pointermove', (ev) => {
    const r = viewer.scene.canvas.getBoundingClientRect();
    const first = pending === undefined;
    pending = new Cesium.Cartesian2(ev.clientX - r.left, ev.clientY - r.top);
    if (first) requestAnimationFrame(() => { const p = pending!; pending = undefined; sample(p); });
  });

  // Scale bar: ground distance across 100 px at the bottom centre of the view.
  const bar = $('scaleBar'), label = $('scaleLabel');
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1e6];
  let last = 0;
  viewer.scene.postRender.addEventListener(() => {
    const now = performance.now();
    if (now - last < 300) return;
    last = now;
    const c = viewer.scene.canvas, y = c.clientHeight - 60, x = c.clientWidth / 2;
    const a = pickGround(viewer, new Cesium.Cartesian2(x - 50, y)), b = pickGround(viewer, new Cesium.Cartesian2(x + 50, y));
    if (!a || !b) { label.textContent = ''; bar.style.width = '0'; return; }
    const dist = Cesium.Cartesian3.distance(a, b); // chord ≈ ground distance at these scales
    const m = [...nice].reverse().find((v) => v <= dist) ?? nice[0];
    bar.style.width = `${(m / dist) * 100}px`;
    label.textContent = m >= 1000 ? `${m / 1000} km` : `${m} m`;
  });
}
