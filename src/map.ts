import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  MAPTILER_KEY, MAPTILER_SAT_URL, MAPTILER_TERRAIN_URL,
  TRACESTRACK_KEY, TRACESTRACK_MAX_ZOOM, TRACESTRACK_URL,
} from './config';

export interface MapCtx {
  viewer: Cesium.Viewer;
  overlay?: Cesium.ImageryLayer;
  base?: Cesium.ImageryLayer;
  hasTerrain: boolean;
}

export function createMap(): MapCtx {
  // No Cesium ion usage: avoid the default-token warning.
  Cesium.Ion.defaultAccessToken = '';

  const hasTerrain = !!MAPTILER_KEY;
  const viewer = new Cesium.Viewer('cesiumContainer', {
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false,
    infoBox: false, selectionIndicator: false,
    baseLayer: false,
    // VERIFIED pattern from MapTiler's Cesium tutorial: Terrain wraps CesiumTerrainProvider.fromUrl.
    terrain: hasTerrain
      ? new Cesium.Terrain(Cesium.CesiumTerrainProvider.fromUrl(MAPTILER_TERRAIN_URL, { requestVertexNormals: true }))
      : undefined,
  });
  viewer.scene.globe.depthTestAgainstTerrain = true;
  // Stable level of detail: Cesium refines tiles whenever the screen-space error exceeds this value (default 2), so
  // the map keeps re-sharpening while you move. A higher value switches detail levels only after larger zoom steps.
  // A bigger tile cache (default 100) stops tiles from being evicted and reloaded when panning back and forth.
  viewer.scene.globe.tileCacheSize = 1000;
  viewer.scene.globe.preloadSiblings = false;
  setDetail(viewer, loadDetail());
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#2b3340');

  const ctx: MapCtx = { viewer, hasTerrain };

  if (MAPTILER_KEY) {
    ctx.base = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: MAPTILER_SAT_URL, tilingScheme: new Cesium.WebMercatorTilingScheme(), minimumLevel: 0, maximumLevel: 20, tileWidth: 512, tileHeight: 512,
      }),
    );
  }
  if (TRACESTRACK_KEY) {
    // VERIFIED by request (2026-11-16): plain URL returns 512px PNG tiles in standard XYZ/Web Mercator numbering.
    ctx.overlay = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: TRACESTRACK_URL, tilingScheme: new Cesium.WebMercatorTilingScheme(), minimumLevel: 0, maximumLevel: TRACESTRACK_MAX_ZOOM,
        tileWidth: 512, tileHeight: 512,
      }),
    );
    ctx.overlay.alpha = 0.85;
  }

  // Attribution (MapTiler + OSM verified from MapTiler docs; Tracestrack wording from OSM's own layer config).
  const credits = [
    '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a>',
    '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap contributors</a>',
    '<a href="https://www.tracestrack.com/" target="_blank" rel="noopener">Tiles courtesy of Tracestrack Maps</a>',
  ];
  for (const c of credits) viewer.creditDisplay.addStaticCredit(new Cesium.Credit(c, true));

  // Start over the Bernese Alps.
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(8.0, 46.45, 28000),
    orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-35) },
  });
  return ctx;
}

/** Ground position under a screen coordinate (undefined if off-globe). */
export function pickGround(viewer: Cesium.Viewer, pos: Cesium.Cartesian2): Cesium.Cartesian3 | undefined {
  const ray = viewer.camera.getPickRay(pos);
  return ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
}

/** Camera distance used when jumping to a searched place. At the default 60 deg field of view this gives a
 *  scale bar of roughly 20 m per 100 px (measured: 150 m gave ~10 m, so 250 m). Easy to change. */
export const FLY_RANGE_M = 250;
export const FLY_PITCH_DEG = -35;

/** Terrain height (m) at a position, or 0 if terrain is unavailable. */
export async function terrainHeight(viewer: Cesium.Viewer, lon: number, lat: number): Promise<number> {
  const carto = Cesium.Cartographic.fromDegrees(lon, lat);
  try {
    if (!(viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider)) {
      const [r] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [carto]);
      if (Number.isFinite(r.height)) return r.height;
    }
  } catch { /* fall through */ }
  return viewer.scene.globe.getHeight(carto) ?? 0;
}

/**
 * Fly to a point and look at it from FLY_RANGE_M. The target is placed at the real terrain height; targeting the
 * ellipsoid (height 0) put the camera underground at high peaks (e.g. Grossglockner, 3798 m).
 */
export async function flyToPlace(viewer: Cesium.Viewer, lon: number, lat: number, range = FLY_RANGE_M, ele?: number) {
  const h = ele ?? (await terrainHeight(viewer, lon, lat));
  const target = Cesium.Cartesian3.fromDegrees(lon, lat, h);
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 1), {
    duration: 1.5,
    offset: new Cesium.HeadingPitchRange(viewer.camera.heading, Cesium.Math.toRadians(FLY_PITCH_DEG), range),
  });
}

/** Map detail presets: value = Cesium globe.maximumScreenSpaceError (higher = coarser, fewer re-renders while moving). */
export const DETAIL_LEVELS = { low: 8, medium: 4, high: 2 } as const;
export type DetailLevel = keyof typeof DETAIL_LEVELS;
const DETAIL_KEY = 'mountain_map.detail.v1';

export function loadDetail(): DetailLevel {
  try {
    const v = localStorage.getItem(DETAIL_KEY);
    if (v === 'low' || v === 'medium' || v === 'high') return v;
  } catch { /* storage unavailable */ }
  return 'medium';
}
export function setDetail(viewer: Cesium.Viewer, level: DetailLevel) {
  viewer.scene.globe.maximumScreenSpaceError = DETAIL_LEVELS[level];
  try { localStorage.setItem(DETAIL_KEY, level); } catch { /* ignore */ }
}
