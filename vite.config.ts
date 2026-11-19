import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import vercel from './vercel.json' with { type: 'json' };

// CesiumJS needs its Workers/Assets/ThirdParty/Widgets served as static files.
// They are copied to /cesium and window.CESIUM_BASE_URL points there (see index.html).
const cesiumBuild = 'node_modules/cesium/Build/Cesium';

// Security headers live in vercel.json (production). `npm run preview` serves the same headers (minus HSTS, which
// must never be sent for localhost), so the Content-Security-Policy can be tested locally before deploying.
// Not applied to `npm run dev`: Vite's dev client needs a looser policy.
const previewHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [])
    .filter((h) => h.key !== 'Strict-Transport-Security')
    .map((h) => [h.key, h.value]),
);

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
  preview: { headers: previewHeaders },
  build: {
    chunkSizeWarningLimit: 6000,
    rolldownOptions: {
      output: {
        // Cesium (~4 MB) in its own file: app updates then leave it in the browser cache
        // (/assets/* is served as immutable, see vercel.json), so returning visitors only fetch the small app chunk.
        codeSplitting: { groups: [{ name: 'cesium', test: /node_modules[\\/](cesium|@cesium)[\\/]/ }] },
      },
    },
  },
});
