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
