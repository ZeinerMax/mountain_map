import * as Cesium from 'cesium';
import type { MapCtx } from './map';
import { pickGround } from './map';
import { ascentDescent, densify, fmtKm, haversine, lengthM, type Pt } from './geo';
import { GPX_MAX_BYTES, buildGpx, parseGpx } from './gpx';
import { ROUTES_STORAGE_KEY } from './config';
import { initProfile } from './profile';
import { cloneRoute, sanitizeRoutes, serializeRoutes, uid, type RouteData } from './routeData';

export interface ProfilePt { dist: number; ele: number; lon: number; lat: number }
export interface RouteStats {
  length: number; ascent: number; descent: number; min: number; max: number;
  source: 'terrain' | 'gpx' | 'none'; profile: ProfilePt[];
}
export interface Route extends RouteData { stats?: RouteStats }

type Mode = 'idle' | 'draw' | 'edit';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class RouteManager {
  routes: Route[] = [];
  selectedId?: string;
  mode: Mode = 'idle';
  private draft?: Route;
  private lines = new Map<string, Cesium.Entity>();
  private handles: Cesium.Entity[] = [];
  private hover?: Cesium.Entity;
  private dragIdx = -1;
  private dragMoved = false;
  private statsVersion = new Map<string, number>();
  private profile = initProfile((p) => this.setHover(p));
  private handler: Cesium.ScreenSpaceEventHandler;
  private viewer: Cesium.Viewer;

  constructor(private ctx: MapCtx) {
    this.viewer = ctx.viewer;
    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    // Double-click is used to finish drawing; disable Cesium's default double-click zoom.
    this.viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    this.bindMap();
    this.bindUi();
    this.load();
    this.renderAll();
  }

  /* ---------- persistence ---------- */
  private saveWarned = false;
  private save() {
    try {
      localStorage.setItem(ROUTES_STORAGE_KEY, serializeRoutes(this.routes));
      this.saveWarned = false;
    } catch (e) {
      console.warn('Could not save routes', e);
      // Usually the ~5 MB browser storage limit. Tell the user once instead of silently losing work.
      if (!this.saveWarned) {
        this.saveWarned = true;
        alert('Routes could not be saved in this browser (storage full or disabled). Export them as GPX to keep them, or delete some long routes.');
      }
    }
  }
  private load() {
    try {
      const raw = localStorage.getItem(ROUTES_STORAGE_KEY);
      if (raw) this.routes = sanitizeRoutes(JSON.parse(raw));
    } catch (e) { console.warn('Could not load routes', e); }
  }

  /* ---------- undo ---------- */
  // Snapshots of all routes (without stats) taken before each change; the last UNDO_LIMIT are kept.
  private undoStack: { routes: Route[]; selectedId?: string }[] = [];
  private snapshot() {
    this.undoStack.push({ routes: this.routes.map(cloneRoute), selectedId: this.selectedId });
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.renderButtons();
  }
  undo() {
    if (this.mode === 'draw' && this.draft) { // while drawing: remove the last point
      this.draft.points.pop();
      this.refreshLine(this.draft); this.renderHandles(); this.renderButtons();
      return;
    }
    const s = this.undoStack.pop();
    if (!s) return;
    this.dragIdx = -1;
    this.viewer.scene.screenSpaceCameraController.enableInputs = true;
    this.routes = s.routes;
    for (const r of this.routes) this.statsVersion.set(r.id, (this.statsVersion.get(r.id) ?? 0) + 1); // drop in-flight stats
    this.save();
    const keep = this.routes.some((r) => r.id === s.selectedId) ? s.selectedId : undefined;
    if (!keep && this.mode === 'edit') this.mode = 'idle';
    if (keep) this.select(keep);
    else { this.selectedId = undefined; this.profile.show(undefined); this.renderStats(undefined); this.renderAll(); }
  }

  /* ---------- rendering ---------- */
  private positions(pts: Pt[]) {
    return Cesium.Cartesian3.fromDegreesArray(pts.flatMap((p) => [p.lon, p.lat]));
  }
  private lineEntity(r: Route): Cesium.Entity {
    const sel = r.id === this.selectedId || r === this.draft;
    return this.viewer.entities.add({
      id: `route:${r.id}`,
      polyline: {
        positions: r.points.length > 1 ? this.positions(r.points) : [],
        width: sel ? 6 : 4,
        clampToGround: true,
        material: sel ? Cesium.Color.fromCssColorString('#ffb300') : Cesium.Color.fromCssColorString('#e53935'),
      },
    });
  }
  private refreshLine(r: Route) {
    const e = this.lines.get(r.id);
    if (e?.polyline) e.polyline.positions = new Cesium.ConstantProperty(r.points.length > 1 ? this.positions(r.points) : []);
  }
  private renderAll() {
    for (const e of this.lines.values()) this.viewer.entities.remove(e);
    this.lines.clear();
    for (const r of this.routes) this.lines.set(r.id, this.lineEntity(r));
    if (this.draft) this.lines.set(this.draft.id, this.lineEntity(this.draft));
    this.renderWaypoints();
    this.renderHandles();
    this.renderList();
    this.renderButtons();
  }
  /** GPX waypoints of all routes as labelled markers (labels only when close, to keep wide views readable). */
  private wptEntities: Cesium.Entity[] = [];
  private renderWaypoints() {
    for (const e of this.wptEntities) this.viewer.entities.remove(e);
    this.wptEntities = [];
    for (const r of this.routes) {
      for (const w of r.waypoints ?? []) {
        this.wptEntities.push(this.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(w.lon, w.lat),
          point: {
            pixelSize: 9, color: Cesium.Color.fromCssColorString('#ffb300'), outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: w.name, font: '12px system-ui', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK, outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -16),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 40000),
          },
        }));
      }
    }
  }
  private activeRoute(): Route | undefined {
    return this.draft ?? this.routes.find((r) => r.id === this.selectedId);
  }
  private renderHandles() {
    for (const h of this.handles) this.viewer.entities.remove(h);
    this.handles = [];
    const r = this.activeRoute();
    if (!r || this.mode === 'idle') return;
    r.points.forEach((p, i) => {
      this.handles.push(
        this.viewer.entities.add({
          id: `handle:${i}`,
          position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
          point: {
            pixelSize: 12, color: Cesium.Color.WHITE, outlineColor: Cesium.Color.fromCssColorString('#e53935'),
            outlineWidth: 3, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
    });
  }
  private setHover(p: ProfilePt | null) {
    if (this.hover) { this.viewer.entities.remove(this.hover); this.hover = undefined; }
    if (!p) return;
    this.hover = this.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
      point: {
        pixelSize: 14, color: Cesium.Color.fromCssColorString('#00e5ff'), outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  /* ---------- UI ---------- */
  private renderList() {
    const ul = $('routeList');
    ul.innerHTML = '';
    for (const r of this.routes) {
      const li = document.createElement('li');
      li.className = r.id === this.selectedId ? 'sel' : '';
      const name = document.createElement('span');
      name.textContent = r.name;
      name.onclick = () => this.select(r.id);
      const len = document.createElement('small');
      len.textContent = fmtKm(lengthM(r.points));
      const ren = document.createElement('button');
      ren.textContent = '✎'; ren.title = 'Rename';
      ren.onclick = () => {
        const n = prompt('Route name', r.name);
        if (n?.trim() && n.trim() !== r.name) {
          this.snapshot();
          r.name = n.trim(); this.save(); this.renderList();
          if (r.id === this.selectedId) this.renderStats(r);
        }
      };
      li.append(name, len, ren);
      ul.append(li);
    }
  }
  private renderButtons() {
    const hasSel = !!this.routes.find((r) => r.id === this.selectedId);
    $<HTMLButtonElement>('btnDraw').textContent = this.mode === 'draw' ? 'Cancel' : 'Draw';
    $<HTMLButtonElement>('btnFinish').disabled = this.mode !== 'draw';
    $<HTMLButtonElement>('btnEdit').disabled = !hasSel && this.mode !== 'edit';
    $<HTMLButtonElement>('btnEdit').textContent = this.mode === 'edit' ? 'Done' : 'Edit';
    $<HTMLButtonElement>('btnDelete').disabled = !hasSel || this.mode === 'draw';
    $<HTMLButtonElement>('btnExport').disabled = this.routes.length === 0;
    $<HTMLButtonElement>('btnUndo').disabled = this.mode === 'draw' ? !this.draft?.points.length : this.undoStack.length === 0;
    $('cesiumContainer').style.cursor = this.mode === 'draw' ? 'crosshair' : '';
  }
  private renderStats(r?: Route) {
    const el = $('routeStats');
    const s = r?.stats;
    if (!r) { el.textContent = ''; return; }
    if (!s) { el.textContent = 'Computing elevation…'; return; }
    el.innerHTML =
      `<b>${escapeHtml(r.name)}</b><br>Distance ${fmtKm(s.length)}` +
      (s.source === 'none' ? ' · elevation n/a' : ` · ↗ ${Math.round(s.ascent)} m · ↘ ${Math.round(s.descent)} m`);
  }

  private bindUi() {
    $('btnDraw').onclick = () => (this.mode === 'draw' ? this.cancelDraw() : this.startDraw());
    $('btnFinish').onclick = () => this.finishDraw();
    $('btnEdit').onclick = () => this.setMode(this.mode === 'edit' ? 'idle' : 'edit');
    $('btnDelete').onclick = () => {
      const r = this.routes.find((x) => x.id === this.selectedId);
      if (r && confirm(`Delete "${r.name}"?`)) this.deleteRoute(r.id);
    };
    $('btnImport').onclick = () => $<HTMLInputElement>('gpxFile').click();
    $<HTMLInputElement>('gpxFile').onchange = async (ev) => {
      const input = ev.target as HTMLInputElement;
      const f = input.files?.[0];
      input.value = '';
      if (!f) return;
      if (f.size > GPX_MAX_BYTES) { alert(`GPX file is too large (${Math.round(f.size / 1048576)} MB, limit ${GPX_MAX_BYTES / 1048576} MB).`); return; }
      try {
        const { routes: parsed, waypoints } = parseGpx(await f.text());
        const target = this.routes.find((r) => r.id === this.selectedId);
        if (!parsed.length && !(waypoints.length && target)) {
          alert(waypoints.length
            ? `This file has ${waypoints.length} waypoint(s) but no track. Select a route first to attach them to it.`
            : 'No tracks, routes or waypoints found in this GPX file.');
          return;
        }
        this.snapshot();
        if (!parsed.length && target) { // waypoints only: attach to the selected route
          target.waypoints = [...(target.waypoints ?? []), ...waypoints];
          this.save();
          this.renderAll();
          return;
        }
        // Waypoints go with the first track of the file (GPX does not say which track they belong to).
        parsed.forEach((g, i) => this.routes.push({
          id: uid(), name: g.name, points: g.points, ...(i === 0 && waypoints.length ? { waypoints } : {}),
        }));
        this.save();
        this.select(this.routes[this.routes.length - 1].id);
        this.zoomTo(this.routes[this.routes.length - 1]);
      } catch (e) { alert(`GPX import failed: ${(e as Error).message}`); }
    };
    $('btnExport').onclick = () => {
      const sel = this.routes.find((r) => r.id === this.selectedId);
      const list = sel ? [sel] : this.routes;
      const blob = new Blob([buildGpx(list.map((r) => ({ name: r.name, points: r.points, waypoints: r.waypoints })))], { type: 'application/gpx+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(sel?.name ?? 'mountain_map_routes').replace(/[^\w.-]+/g, '_')}.gpx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000); // revoking at once can cancel the download in some browsers
    };
    $('btnUndo').onclick = () => this.undo();
    window.addEventListener('keydown', (e) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select');
      if (e.key === 'Escape' && this.mode === 'draw') this.cancelDraw();
      if (e.key === 'Enter' && this.mode === 'draw' && !typing) this.finishDraw();
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        this.undo();
      }
    });
  }

  /* ---------- modes ---------- */
  private setMode(m: Mode) {
    this.mode = m;
    if (m !== 'draw') this.draft = undefined;
    $('routeHint').classList.toggle('active', m !== 'idle');
    this.renderAll();
  }
  private startDraw() {
    this.selectedId = undefined;
    this.draft = { id: uid(), name: `Route ${this.routes.length + 1}`, points: [] };
    this.setMode('draw');
    this.profile.show(undefined);
    this.renderStats(undefined);
  }
  private cancelDraw() { this.draft = undefined; this.setMode('idle'); }
  private finishDraw() {
    const d = this.draft;
    if (!d) return;
    if (d.points.length < 2) { this.cancelDraw(); return; }
    this.snapshot();
    this.routes.push(d);
    this.draft = undefined;
    this.selectedId = d.id;
    this.setMode('idle');
    this.save();
    this.select(d.id);
  }
  private deleteRoute(id: string) {
    this.snapshot();
    this.routes = this.routes.filter((r) => r.id !== id);
    this.statsVersion.delete(id);
    this.selectedId = undefined;
    this.mode = 'idle';
    this.save();
    this.profile.show(undefined);
    this.renderStats(undefined);
    this.renderAll();
  }
  /** Add a route obtained elsewhere (e.g. the global search), select it and fly to it. */
  addRoute(name: string, points: Pt[]) {
    const r: Route = { id: uid(), name, points };
    this.snapshot();
    this.routes.push(r);
    this.save();
    this.select(r.id);
    this.zoomTo(r);
  }
  select(id: string) {
    this.selectedId = id;
    if (this.mode === 'draw') this.mode = 'idle';
    this.renderAll();
    const r = this.routes.find((x) => x.id === id);
    this.renderStats(r);
    this.profile.show(r?.stats);
    if (r) void this.computeStats(r);
  }
  private zoomTo(r: Route) {
    const rect = Cesium.Rectangle.fromCartographicArray(r.points.map((p) => Cesium.Cartographic.fromDegrees(p.lon, p.lat)));
    this.viewer.camera.flyTo({ destination: new Cesium.Rectangle(rect.west - rect.width * 0.3, rect.south - rect.height * 0.3, rect.east + rect.width * 0.3, rect.north + rect.height * 0.3), duration: 1.2 });
  }

  /* ---------- map input ---------- */
  private bindMap() {
    const T = Cesium.ScreenSpaceEventType;
    const handleIdx = (pos: Cesium.Cartesian2): number => {
      const picked = this.viewer.scene.pick(pos);
      const id = picked?.id instanceof Cesium.Entity ? String(picked.id.id) : '';
      return id.startsWith('handle:') ? parseInt(id.slice(7), 10) : -1;
    };

    this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      if (this.dragIdx >= 0) return;
      if (this.mode === 'draw' && this.draft) {
        const g = pickGround(this.viewer, e.position);
        if (!g) return;
        this.draft.points.push(cartToPt(g));
        this.refreshLine(this.draft);
        this.renderHandles();
        this.renderButtons();
        return;
      }
      if (this.mode === 'edit') return; // plain clicks do nothing while editing; Shift+click inserts (below)
      // idle: select route by clicking its line
      const picked = this.viewer.scene.pick(e.position);
      const id = picked?.id instanceof Cesium.Entity ? String(picked.id.id) : '';
      if (id.startsWith('route:')) this.select(id.slice(6));
    }, T.LEFT_CLICK);

    // Shift+click inserts a vertex into the nearest segment. Cesium delivers clicks made with Shift held ONLY to
    // actions registered with the SHIFT modifier, so this needs its own registration (found by browser test
    // 2026-11-19: the old "track Shift with keydown" approach never fired).
    this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      if (this.mode !== 'edit' || this.dragIdx >= 0) return;
      const r = this.routes.find((x) => x.id === this.selectedId);
      const g = pickGround(this.viewer, e.position);
      if (!r || !g) return;
      const p = cartToPt(g);
      let best = 0, bd = Infinity;
      for (let i = 0; i < r.points.length - 1; i++) {
        const d = haversine(r.points[i], p) + haversine(p, r.points[i + 1]) - haversine(r.points[i], r.points[i + 1]);
        if (d < bd) { bd = d; best = i; }
      }
      this.snapshot();
      r.points.splice(best + 1, 0, p);
      this.afterEdit(r);
    }, T.LEFT_CLICK, Cesium.KeyboardEventModifier.SHIFT);

    this.handler.setInputAction(() => {
      if (this.mode === 'draw' && this.draft) {
        // The two clicks of a double-click each added a point: drop the duplicate.
        if (this.draft.points.length > 2) this.draft.points.pop();
        this.finishDraw();
      }
    }, T.LEFT_DOUBLE_CLICK);

    this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      if (this.mode !== 'edit') return;
      const i = handleIdx(e.position);
      if (i < 0) return;
      this.dragIdx = i;
      this.dragMoved = false;
      this.viewer.scene.screenSpaceCameraController.enableInputs = false;
    }, T.LEFT_DOWN);

    this.handler.setInputAction((e: { endPosition: Cesium.Cartesian2 }) => {
      if (this.dragIdx < 0) return;
      const r = this.routes.find((x) => x.id === this.selectedId);
      const g = pickGround(this.viewer, e.endPosition);
      if (!r || !g) return;
      if (!this.dragMoved) { this.snapshot(); this.dragMoved = true; } // one undo step per drag
      r.points[this.dragIdx] = cartToPt(g);
      this.handles[this.dragIdx].position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(r.points[this.dragIdx].lon, r.points[this.dragIdx].lat));
      this.refreshLine(r);
    }, T.MOUSE_MOVE);

    this.handler.setInputAction(() => {
      if (this.dragIdx < 0) return;
      this.dragIdx = -1;
      this.viewer.scene.screenSpaceCameraController.enableInputs = true;
      const r = this.routes.find((x) => x.id === this.selectedId);
      if (r && this.dragMoved) this.afterEdit(r);
    }, T.LEFT_UP);

    this.handler.setInputAction((e: { position: Cesium.Cartesian2 }) => {
      if (this.mode === 'edit') {
        const i = handleIdx(e.position);
        const r = this.routes.find((x) => x.id === this.selectedId);
        if (i >= 0 && r && r.points.length > 2) { this.snapshot(); r.points.splice(i, 1); this.afterEdit(r); }
      } else if (this.mode === 'draw' && this.draft && this.draft.points.length) {
        this.undo(); // right-click undoes the last point while drawing
      }
    }, T.RIGHT_CLICK);

  }

  private afterEdit(r: Route) {
    r.stats = undefined;
    this.save();
    this.refreshLine(r);
    this.renderHandles();
    this.renderList();
    this.renderStats(r);
    this.profile.show(undefined);
    void this.computeStats(r);
  }

  /* ---------- stats ---------- */
  async computeStats(r: Route) {
    const ver = (this.statsVersion.get(r.id) ?? 0) + 1;
    this.statsVersion.set(r.id, ver);
    const dense = densify(r.points);
    const length = lengthM(r.points);
    const tp = this.viewer.terrainProvider;
    const haveTerrain = this.ctx.hasTerrain && !(tp instanceof Cesium.EllipsoidTerrainProvider);
    let eles: number[] | undefined;
    let source: RouteStats['source'] = 'none';

    if (haveTerrain) {
      try {
        // Samples the terrain at its finest available level (MapTiler max zoom 15 per dataset docs).
        const carts = dense.map((d) => Cesium.Cartographic.fromDegrees(d.p.lon, d.p.lat));
        const vcarts = r.points.map((p) => Cesium.Cartographic.fromDegrees(p.lon, p.lat));
        await Cesium.sampleTerrainMostDetailed(tp, carts);
        await Cesium.sampleTerrainMostDetailed(tp, vcarts);
        if (this.statsVersion.get(r.id) !== ver) return;
        eles = carts.map((c) => c.height);
        vcarts.forEach((c, i) => { r.points[i].ele = c.height; });
        source = 'terrain';
      } catch (e) { console.warn('Terrain sampling failed', e); }
    }
    if (!eles && r.points.every((p) => p.ele != null)) {
      // Interpolate GPX elevations along the dense path.
      const cum: number[] = [0];
      for (let i = 1; i < r.points.length; i++) cum.push(cum[i - 1] + haversine(r.points[i - 1], r.points[i]));
      let seg = 0;
      eles = dense.map((d) => {
        while (seg < r.points.length - 2 && d.dist > cum[seg + 1]) seg++;
        const span = cum[seg + 1] - cum[seg] || 1;
        const t = Math.min(1, Math.max(0, (d.dist - cum[seg]) / span));
        return r.points[seg].ele! + (r.points[seg + 1].ele! - r.points[seg].ele!) * t;
      });
      source = 'gpx';
    }
    if (this.statsVersion.get(r.id) !== ver) return;
    const e = eles ?? dense.map(() => 0);
    const ad = ascentDescent(e);
    r.stats = {
      length, ascent: ad.ascent, descent: ad.descent,
      min: Math.min(...e), max: Math.max(...e), source,
      profile: dense.map((d, i) => ({ dist: d.dist, ele: e[i], lon: d.p.lon, lat: d.p.lat })),
    };
    if (r.id === this.selectedId) {
      this.renderStats(r);
      this.profile.show(r.stats);
    }
    if (source === 'terrain') this.save(); // persist sampled vertex elevations for GPX export
  }
}

const UNDO_LIMIT = 30;

function cartToPt(c: Cesium.Cartesian3): Pt {
  const g = Cesium.Cartographic.fromCartesian(c);
  return { lon: Cesium.Math.toDegrees(g.longitude), lat: Cesium.Math.toDegrees(g.latitude) };
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
