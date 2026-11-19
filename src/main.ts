import './base';
import './style.css';
import { createMap, loadDetail, setDetail, type DetailLevel } from './map';
import { RouteManager } from './routes';
import { HutSearch } from './huts';
import { initSearch } from './search';
import { initCompass, initInfoBar } from './hud';
import { MAPTILER_KEY, TRACESTRACK_KEY } from './config';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ctx = createMap();

// Missing-key banner (keys come from .env, see .env.example).
const missing = [!MAPTILER_KEY && 'VITE_MAPTILER_KEY (3D terrain + satellite)', !TRACESTRACK_KEY && 'VITE_TRACESTRACK_KEY (Topo overlay)'].filter(Boolean);
if (missing.length) {
  const b = $('banner');
  b.hidden = false;
  b.textContent = `Missing in .env: ${missing.join(', ')}. Copy .env.example to .env, add your keys and restart.`;
}

// Layer controls
const ovToggle = $<HTMLInputElement>('ovToggle'), ovOpacity = $<HTMLInputElement>('ovOpacity'), baseToggle = $<HTMLInputElement>('baseToggle');
ovToggle.disabled = ovOpacity.disabled = !ctx.overlay;
baseToggle.disabled = !ctx.base;
ovToggle.onchange = () => { if (ctx.overlay) ctx.overlay.show = ovToggle.checked; };
ovOpacity.oninput = () => { if (ctx.overlay) ctx.overlay.alpha = parseFloat(ovOpacity.value); };
baseToggle.onchange = () => { if (ctx.base) ctx.base.show = baseToggle.checked; };
const detailSelect = $<HTMLSelectElement>('detailSelect');
detailSelect.value = loadDetail();
detailSelect.onchange = () => setDetail(ctx.viewer, detailSelect.value as DetailLevel);

const routes = new RouteManager(ctx);
const huts = new HutSearch(ctx.viewer);
initSearch(huts, routes, ctx.viewer);
initCompass(ctx.viewer);
initInfoBar(ctx.viewer);

// Mobile panel toggle
$('panelToggle').onclick = () => $('panel').classList.toggle('collapsed');
if (window.innerWidth < 700) $('panel').classList.add('collapsed');

(window as unknown as { mountainMap: unknown }).mountainMap = { ...ctx, routes, huts }; // handy for console debugging and browser tests
