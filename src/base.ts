// Must be imported before 'cesium'. In dev, Cesium's static files are served straight from node_modules;
// in the production build vite-plugin-static-copy puts them in /cesium.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = import.meta.env.DEV
  ? '/node_modules/cesium/Build/Cesium'
  : '/cesium';
