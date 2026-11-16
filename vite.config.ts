import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// CesiumJS needs its Workers/Assets/ThirdParty/Widgets served as static files.
// They are copied to /cesium and window.CESIUM_BASE_URL points there (see index.html).
const cesiumBuild = 'node_modules/cesium/Build/Cesium';

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map((d) => ({
        src: `${cesiumBuild}/${d}`,
        dest: 'cesium',
        rename: { stripBase: 4 }, // drop node_modules/cesium/Build/Cesium so output is dist/cesium/Workers etc.
      })),
    }),
  ],
  build: { chunkSizeWarningLimit: 6000 },
});
