import type { RouteStats, ProfilePt } from './routes';
import { fmtKm } from './geo';

/** Elevation profile canvas with hover read-out; calls onHover so the map can show a marker. */
export function initProfile(onHover: (p: ProfilePt | null) => void) {
  const wrap = document.getElementById('profile') as HTMLElement;
  const canvas = document.getElementById('profileCanvas') as HTMLCanvasElement;
  const info = document.getElementById('profileInfo') as HTMLElement;
  const ctx = canvas.getContext('2d')!;
  let stats: RouteStats | undefined;
  let hoverIdx = -1;
  const PAD = { l: 46, r: 10, t: 8, b: 18 };

  function css(v: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!stats || stats.profile.length < 2 || stats.source === 'none') return;
    const prof = stats.profile;
    const total = prof[prof.length - 1].dist || 1;
    let lo = Infinity, hi = -Infinity;
    for (const p of prof) { lo = Math.min(lo, p.ele); hi = Math.max(hi, p.ele); }
    const span = Math.max(20, hi - lo);
    lo -= span * 0.05; hi += span * 0.05;
    const X = (d: number) => PAD.l + (d / total) * (w - PAD.l - PAD.r);
    const Y = (e: number) => PAD.t + (1 - (e - lo) / (hi - lo)) * (h - PAD.t - PAD.b);

    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = css('--fg2');
    ctx.strokeStyle = css('--grid');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const e = lo + ((hi - lo) * i) / 3;
      ctx.beginPath(); ctx.moveTo(PAD.l, Y(e)); ctx.lineTo(w - PAD.r, Y(e)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(`${Math.round(e)} m`, PAD.l - 4, Y(e) + 4);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) ctx.fillText(fmtKm((total * i) / 4), X((total * i) / 4), h - 4);

    ctx.beginPath();
    ctx.moveTo(X(0), Y(lo));
    for (const p of prof) ctx.lineTo(X(p.dist), Y(p.ele));
    ctx.lineTo(X(total), Y(lo)); ctx.closePath();
    ctx.fillStyle = css('--accent-fill'); ctx.fill();
    ctx.beginPath();
    prof.forEach((p, i) => (i ? ctx.lineTo(X(p.dist), Y(p.ele)) : ctx.moveTo(X(p.dist), Y(p.ele))));
    ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2; ctx.stroke();

    if (hoverIdx >= 0) {
      const p = prof[hoverIdx];
      ctx.strokeStyle = css('--fg'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(p.dist), PAD.t); ctx.lineTo(X(p.dist), h - PAD.b); ctx.stroke();
      ctx.fillStyle = css('--accent');
      ctx.beginPath(); ctx.arc(X(p.dist), Y(p.ele), 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function setInfo() {
    if (!stats) { info.textContent = ''; return; }
    if (stats.source === 'none') { info.textContent = 'No elevation data (add MapTiler key or import a GPX with elevations).'; return; }
    const p = hoverIdx >= 0 ? stats.profile[hoverIdx] : undefined;
    info.textContent =
      `↗ ${Math.round(stats.ascent)} m   ↘ ${Math.round(stats.descent)} m   ` +
      `min ${Math.round(stats.min)} m · max ${Math.round(stats.max)} m` +
      (p ? `   |   ${fmtKm(p.dist)} · ${Math.round(p.ele)} m` : '') +
      (stats.source === 'gpx' ? '   (elevations from GPX)' : '');
  }

  function move(clientX: number) {
    if (!stats || stats.profile.length < 2 || stats.source === 'none') return;
    const r = canvas.getBoundingClientRect();
    const total = stats.profile[stats.profile.length - 1].dist || 1;
    const d = ((clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r)) * total;
    let best = 0, bd = Infinity;
    stats.profile.forEach((p, i) => { const k = Math.abs(p.dist - d); if (k < bd) { bd = k; best = i; } });
    hoverIdx = best;
    draw(); setInfo(); onHover(stats.profile[best]);
  }
  function leave() { hoverIdx = -1; draw(); setInfo(); onHover(null); }

  canvas.addEventListener('mousemove', (e) => move(e.clientX));
  canvas.addEventListener('mouseleave', leave);
  canvas.addEventListener('touchmove', (e) => { move(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', leave);
  new ResizeObserver(draw).observe(canvas);

  return {
    show(s?: RouteStats) {
      stats = s; hoverIdx = -1;
      wrap.hidden = !s;
      requestAnimationFrame(() => { draw(); setInfo(); });
    },
  };
}
