import * as THREE from 'three';
import type { EventBus } from '../core/EventBus';
import type { SurfaceHit } from '../planet/CameraController';
import { gameStore, roadSet } from '../state/gameStore';
import { ResourceManager } from '../simulation/ResourceManager';
import { ROAD_COST, ROAD_PROBLEM_TEXT, ROAD_TILE, canRemoveRoad, checkRoad, pointToTile, roadKey } from './RoadRules';
import type { SettlementGrid } from './SettlementGrid';

const VALID = new THREE.Color('#58ff9a');
const INVALID = new THREE.Color('#ff5a4f');
const REMOVE = new THREE.Color('#ffb347');

/**
 * The road tool: highlights the tile under the pointer (green = can build, red = can't,
 * amber = existing road that a click would remove) and lays tiles one piece at a time.
 * Dragging paints a line of pieces; each one must join the Storage Depot or a previous piece.
 */
export class RoadPlacement {
  readonly group = new THREE.Group();
  private material = new THREE.MeshBasicMaterial({ color: VALID, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
  private outline = new THREE.LineBasicMaterial({ color: VALID, transparent: true, opacity: 0.95 });
  private quad: THREE.Mesh;
  private border: THREE.LineLoop;
  private active = false;
  private tile: { tx: number; ty: number } | null = null;
  private lastPaint: { tx: number; ty: number } | null = null;
  private placedInStroke = false;
  private readonly v = new THREE.Vector3();

  constructor(
    private grid: SettlementGrid,
    private events: EventBus,
  ) {
    this.group.name = 'road-preview';
    this.quad = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.quad.renderOrder = 4;
    this.border = new THREE.LineLoop(new THREE.BufferGeometry(), this.outline);
    this.border.renderOrder = 5;
    this.group.add(this.quad, this.border);
    this.group.visible = false;
  }

  setActive(active: boolean): void {
    this.active = active;
    this.tile = null;
    this.group.visible = false;
    if (active) this.events.emit('placement:feedback', { valid: false, message: 'Point at the Storage Depot edge or the end of a road.' });
  }

  hover(hit: SurfaceHit | null): void {
    if (!this.active) return;
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

  /** Re-evaluates the highlighted tile (after state changes). */
  refresh(): void {
    if (!this.active || !this.tile) return;
    const { tx, ty } = this.tile;
    const s = gameStore.getState();
    const roads = roadSet(s.roads);
    let color = VALID;
    let message: string | null = null;
    let valid = true;
    if (roads.has(roadKey(tx, ty))) {
      color = REMOVE;
      valid = false;
      message = canRemoveRoad(roadKey(tx, ty), roads) ? 'Click to remove this road piece.' : 'This piece joins other roads to the Storage Depot.';
    } else {
      const problem = checkRoad(tx, ty, roads, s.buildings);
      const affordable = ResourceManager.canAfford(s.resources, ROAD_COST);
      valid = !problem && affordable;
      color = valid ? VALID : INVALID;
      message = problem ? ROAD_PROBLEM_TEXT[problem] : affordable ? null : ResourceManager.describeMissing(s.resources, ROAD_COST);
    }
    this.material.color.copy(color);
    this.outline.color.copy(color);
    this.buildTileGeometry(tx, ty);
    this.group.visible = true;
    this.events.emit('placement:feedback', { valid, message });
  }

  /** Pointer pressed (start) or dragged: lay road pieces under the pointer. */
  paint(hit: SurfaceHit | null, start: boolean): void {
    if (!this.active) return;
    if (start) {
      this.placedInStroke = false;
      this.lastPaint = null;
    }
    const g = hit ? this.grid.latLonToGrid(hit.lat, hit.lon) : null;
    if (!g) return;
    const target = pointToTile(g.x, g.y);
    const from = this.lastPaint ?? target;
    // Walk one tile at a time (never diagonally) so fast drags still give a joined road.
    let { tx, ty } = from;
    const steps: [number, number][] = [[tx, ty]];
    while (tx !== target.tx || ty !== target.ty) {
      if (Math.abs(target.tx - tx) >= Math.abs(target.ty - ty)) tx += Math.sign(target.tx - tx);
      else ty += Math.sign(target.ty - ty);
      steps.push([tx, ty]);
    }
    const store = gameStore.getState();
    for (const [x, y] of steps) {
      if (roadSet(gameStore.getState().roads).has(roadKey(x, y))) continue;
      const res = store.placeRoad(x, y);
      if (res.ok) this.placedInStroke = true;
      else if (start && !this.placedInStroke) {
        store.pushAlert({ key: 'road-error', level: 'warning', title: 'Can’t build a road here', message: res.reason });
      }
    }
    this.lastPaint = target;
    this.tile = target;
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
    if (this.group.visible) this.material.opacity = 0.32 + 0.14 * Math.sin(time * 5);
  }

  private buildTileGeometry(tx: number, ty: number): void {
    const h = ROAD_TILE / 2 - 0.04;
    const cx = tx * ROAD_TILE;
    const cy = ty * ROAD_TILE;
    const k = 4;
    const pos: number[] = [];
    const lift = 0.0014;
    const P = (x: number, y: number) => {
      this.grid.surfacePoint(x, y, lift, this.v);
      return [this.v.x, this.v.y, this.v.z];
    };
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const x0 = cx - h + (2 * h * i) / k;
        const x1 = cx - h + (2 * h * (i + 1)) / k;
        const y0 = cy - h + (2 * h * j) / k;
        const y1 = cy - h + (2 * h * (j + 1)) / k;
        pos.push(...P(x0, y0), ...P(x1, y0), ...P(x0, y1), ...P(x1, y0), ...P(x1, y1), ...P(x0, y1));
      }
    }
    this.quad.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.quad.geometry = g;
    const ring: number[] = [];
    for (const [x, y] of [
      [cx - h, cy - h],
      [cx + h, cy - h],
      [cx + h, cy + h],
      [cx - h, cy + h],
    ]) ring.push(...P(x, y));
    this.border.geometry.dispose();
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    this.border.geometry = rg;
  }
}
