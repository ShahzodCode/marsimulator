import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { SurfaceHit } from '../planet/CameraController';
import { gameStore, roadSet } from '../state/gameStore';
import { ResourceManager } from '../simulation/ResourceManager';
import { Roads } from './Roads';
import { ROAD_COST, ROAD_PROBLEM_TEXT, ROAD_TILE, canRemoveRoad, checkRoad, pointToTile, roadKey } from './RoadRules';
import type { SettlementGrid } from './SettlementGrid';

const VALID = new THREE.Color('#58ff9a');
const INVALID = new THREE.Color('#ff5a4f');
const REMOVE = new THREE.Color('#ffb347');

type Tile = [number, number];
type OverlayKind = 'ok' | 'bad' | 'remove';

/**
 * The shortest edge-connected run of tiles from `a` to `b` (|dx|+|dy|+1 pieces) that hugs
 * the straight segment between them: aligned ends give a straight road, a small sideways
 * offset gives one jog, and a diagonal drag gives an angled, stepped road.
 */
export function roadLine(a: Tile, b: Tile): Tile[] {
  const [ax, ay] = a;
  const nx = Math.abs(b[0] - ax);
  const ny = Math.abs(b[1] - ay);
  const sx = Math.sign(b[0] - ax);
  const sy = Math.sign(b[1] - ay);
  const line: Tile[] = [[ax, ay]];
  let x = ax;
  let y = ay;
  // Step along whichever axis lags the ideal line more (compare (ix+½)/nx with (iy+½)/ny
  // by cross-multiplying); ties go to the longer axis so the road starts straight.
  for (let ix = 0, iy = 0; ix < nx || iy < ny; ) {
    const ex = (2 * ix + 1) * ny;
    const ey = (2 * iy + 1) * nx;
    if (iy >= ny || (ix < nx && (ex < ey || (ex === ey && nx >= ny)))) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    line.push([x, y]);
  }
  return line;
}

interface Overlay {
  fill: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  lines: THREE.LineSegments;
}

/**
 * The road tool: highlights the tile under the pointer (green = can build, red = can't,
 * amber = existing road that a click would remove). Pressing and dragging previews the
 * shortest road from the press point to the pointer (see roadLine); letting go lays it. Each piece
 * must join the Storage Depot or another piece, so a line can start or end on the network.
 */
export class RoadPlacement {
  readonly group = new THREE.Group();
  private overlays: Record<OverlayKind, Overlay>;
  /** Faded road models on the tiles that would be built (under the green squares). */
  private ghost: Roads;
  private active = false;
  private tile: { tx: number; ty: number } | null = null;
  /** Current drag: the tile it started on and the road from there to the pointer. */
  private stroke: { anchor: Tile; line: Tile[] } | null = null;
  private placedInStroke = false;
  private readonly v = new THREE.Vector3();

  constructor(
    private grid: SettlementGrid,
    private events: EventBus,
  ) {
    this.group.name = 'road-preview';
    const mk = (color: THREE.Color): Overlay => {
      const fill = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
      const edge = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), fill);
      mesh.renderOrder = 4;
      const lines = new THREE.LineSegments(new THREE.BufferGeometry(), edge);
      lines.renderOrder = 5;
      this.group.add(mesh, lines);
      return { fill, mesh, lines };
    };
    this.overlays = { ok: mk(VALID), bad: mk(INVALID), remove: mk(REMOVE) };
    this.ghost = new Roads(grid, true);
    this.ghost.group.name = 'road-ghost';
    this.group.add(this.ghost.group);
    this.group.visible = false;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.tile = null;
    this.stroke = null;
    this.group.visible = false;
    if (active) this.events.emit('placement:feedback', { valid: false, message: 'Drag from a building, the Storage Depot or a road end — the road follows your pointer.' });
  }

  hover(hit: SurfaceHit | null): void {
    if (!this.active || this.stroke) return;
    const g = hit ? this.grid.latLonToGrid(hit.lat, hit.lon) : null;
    if (!g) {
      this.tile = null;
      this.group.visible = false;
      return;
    }
    const t = pointToTile(g.x, g.y);
    if (this.tile && t.tx === this.tile.tx && t.ty === this.tile.ty) return;
    this.tile = t;
    this.refresh();
  }

  /** Re-evaluates the highlighted tile or the dragged line (after state changes). */
  refresh(): void {
    if (!this.active) return;
    if (this.stroke) {
      this.showStroke();
      return;
    }
    if (!this.tile) return;
    const { tx, ty } = this.tile;
    const s = gameStore.getState();
    const roads = roadSet(s.roads);
    let message: string | null = null;
    let valid = true;
    if (roads.has(roadKey(tx, ty))) {
      valid = false;
      message = canRemoveRoad(roadKey(tx, ty), roads) ? 'Click to remove this road piece.' : 'This piece joins other roads to the Storage Depot.';
      this.draw({ remove: [[tx, ty]] });
    } else {
      const problem = checkRoad(tx, ty, roads, s.buildings);
      const affordable = ResourceManager.canAfford(s.resources, ROAD_COST);
      valid = !problem && affordable;
      message = problem ? ROAD_PROBLEM_TEXT[problem] : affordable ? null : ResourceManager.describeMissing(s.resources, ROAD_COST);
      this.draw(valid ? { ok: [[tx, ty]] } : { bad: [[tx, ty]] });
    }
    this.events.emit('placement:feedback', { valid, message });
  }

  /** Pointer pressed (start) or dragged: preview the road from where the drag began to the pointer. */
  paint(hit: SurfaceHit | null, start: boolean): void {
    if (!this.active) return;
    const g = hit ? this.grid.latLonToGrid(hit.lat, hit.lon) : null;
    if (start) {
      this.placedInStroke = false;
      this.stroke = null;
      if (!g) return;
      const t = pointToTile(g.x, g.y);
      this.stroke = { anchor: [t.tx, t.ty], line: [[t.tx, t.ty]] };
    }
    const st = this.stroke;
    if (!st || !g) return;
    const t = pointToTile(g.x, g.y);
    st.line = roadLine(st.anchor, [t.tx, t.ty]);
    this.showStroke();
  }

  /** Pointer released: lay the previewed line (or drop it when the stroke was cancelled). */
  endStroke(commit: boolean): void {
    const st = this.stroke;
    this.stroke = null;
    if (!this.active || !st) return;
    if (commit) {
      const { order, firstProblem } = this.plan(st.line);
      const store = gameStore.getState();
      const hadNew = st.line.some(([x, y]) => !roadSet(store.roads).has(roadKey(x, y)));
      for (const [x, y] of order) if (store.placeRoad(x, y).ok) this.placedInStroke = true;
      if (!this.placedInStroke && hadNew && firstProblem) {
        store.pushAlert({ key: 'road-error', level: 'warning', title: 'Can’t build a road here', message: firstProblem });
      }
    }
    const end = st.line[st.line.length - 1];
    this.tile = { tx: end[0], ty: end[1] };
    this.refresh();
  }

  /** Click without dragging: removes the clicked road piece if the press didn't lay one. */
  click(hit: SurfaceHit | null): void {
    if (!this.active || this.placedInStroke) return;
    const g = hit ? this.grid.latLonToGrid(hit.lat, hit.lon) : null;
    if (!g) return;
    const { tx, ty } = pointToTile(g.x, g.y);
    const store = gameStore.getState();
    if (!roadSet(store.roads).has(roadKey(tx, ty))) return;
    const res = store.removeRoad(tx, ty);
    if (!res.ok) store.pushAlert({ key: 'road-error', level: 'warning', title: 'Can’t remove this road', message: res.reason });
    this.refresh();
  }

  update(time: number): void {
    if (!this.group.visible) return;
    const a = 0.32 + 0.14 * Math.sin(time * 5);
    for (const o of Object.values(this.overlays)) o.fill.opacity = a;
  }

  /**
   * Which new pieces of a line can be laid, and in what order: a piece is laid once it
   * touches the network, so a line drawn toward the depot fills in from that end.
   */
  private plan(line: Tile[]): { order: Tile[]; blocked: Tile[]; firstProblem: string | null } {
    const s = gameStore.getState();
    // A copy: planned pieces are added to it, and the cached set must stay the real network.
    const roads = new Set(roadSet(s.roads));
    let budget = Infinity;
    for (const [id, c] of Object.entries(ROAD_COST)) budget = Math.min(budget, Math.floor(s.resources[id as keyof typeof s.resources] / c));
    let pending = line.filter(([x, y]) => !roads.has(roadKey(x, y)));
    const order: Tile[] = [];
    let progress = true;
    while (progress && pending.length) {
      progress = false;
      const rest: Tile[] = [];
      for (const t of pending) {
        if (budget > 0 && !checkRoad(t[0], t[1], roads, s.buildings)) {
          roads.add(roadKey(t[0], t[1]));
          order.push(t);
          budget--;
          progress = true;
        } else rest.push(t);
      }
      pending = rest;
    }
    let firstProblem: string | null = null;
    if (pending.length) {
      const [x, y] = pending[0];
      const problem = checkRoad(x, y, roads, s.buildings);
      firstProblem = problem ? ROAD_PROBLEM_TEXT[problem] : ResourceManager.describeMissing(s.resources, ROAD_COST);
    }
    return { order, blocked: pending, firstProblem };
  }

  private showStroke(): void {
    const st = this.stroke!;
    const { order, blocked, firstProblem } = this.plan(st.line);
    const roads = roadSet(gameStore.getState().roads);
    const existing = st.line.filter(([x, y]) => roads.has(roadKey(x, y)));
    // A press on an existing piece (no drag yet) shows it amber: letting go there removes it.
    this.draw({ ok: order, bad: blocked, remove: st.line.length === 1 ? existing : [] });
    const n = order.length;
    let message: string | null = null;
    if (blocked.length) message = firstProblem;
    else if (n) message = `${n} piece${n === 1 ? '' : 's'} · ${n * ROAD_COST.regolith} regolith. Let go to build.`;
    else if (existing.length > 1) message = 'Already paved.';
    this.events.emit('placement:feedback', { valid: n > 0 && !blocked.length, message });
  }

  private draw(sets: Partial<Record<OverlayKind, Tile[]>>): void {
    let any = false;
    for (const key of ['ok', 'bad', 'remove'] as const) {
      const tiles = sets[key] ?? [];
      if (tiles.length) any = true;
      this.buildTiles(this.overlays[key], tiles);
    }
    // Ghost road models for the buildable tiles, shaped as they'd join the real network.
    const s = gameStore.getState();
    const planned = (sets.ok ?? []).map(([x, y]) => roadKey(x, y));
    this.ghost.rebuild(planned.length ? [...s.roads, ...planned] : [], s.buildings, planned);
    this.group.visible = any;
  }

  private buildTiles(o: Overlay, tiles: Tile[]): void {
    const h = ROAD_TILE / 2 - 0.04;
    const k = 4;
    const pos: number[] = [];
    const ring: number[] = [];
    const lift = 0.0014;
    const P = (x: number, y: number) => {
      this.grid.surfacePoint(x, y, lift, this.v);
      return [this.v.x, this.v.y, this.v.z];
    };
    for (const [tx, ty] of tiles) {
      const cx = tx * ROAD_TILE;
      const cy = ty * ROAD_TILE;
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
          const x0 = cx - h + (2 * h * i) / k;
          const x1 = cx - h + (2 * h * (i + 1)) / k;
          const y0 = cy - h + (2 * h * j) / k;
          const y1 = cy - h + (2 * h * (j + 1)) / k;
          pos.push(...P(x0, y0), ...P(x1, y0), ...P(x0, y1), ...P(x1, y0), ...P(x1, y1), ...P(x0, y1));
        }
      }
      const c: Tile[] = [
        [cx - h, cy - h],
        [cx + h, cy - h],
        [cx + h, cy + h],
        [cx - h, cy + h],
      ];
      for (let i = 0; i < 4; i++) ring.push(...P(...c[i]), ...P(...c[(i + 1) % 4]));
    }
    o.mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    o.mesh.geometry = g;
    o.lines.geometry.dispose();
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    o.lines.geometry = rg;
  }
}
