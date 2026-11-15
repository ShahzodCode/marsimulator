import * as THREE from 'three';
import type { Terrain } from '../planet/Terrain';
import type { EventBus } from '../core/EventBus';
import { SETTLEMENT } from '../data/settlement';
import { gameStore, watch } from '../state/gameStore';
import type { BuildingInstance } from '../state/types';
import { mulberry32 } from '../planet/noise';
import { SettlementGrid } from './SettlementGrid';
import { SettlementGround } from './SettlementGround';
import { BuildingManager } from './BuildingManager';
import { BuildingPlacement } from './BuildingPlacement';
import { Roads } from './Roads';
import { RoadPlacement } from './RoadPlacement';
import { materials } from './buildings/materials';
import { R } from '../planet/geo';

export interface BaseSiteRef {
  id: string;
  lat: number;
  lon: number;
  /** Jezero: uses the baked high-detail crater patch. */
  home: boolean;
}

/**
 * Owns everything in one base's area: detailed ground, roads, decorations, scattered rocks,
 * the buildings themselves and the construction preview. The base on screen (active) follows
 * the store live; other bases are drawn from their saved snapshot.
 */
export class SettlementManager {
  readonly group = new THREE.Group();
  readonly grid: SettlementGrid;
  readonly ground: SettlementGround;
  readonly buildings: BuildingManager;
  readonly placement: BuildingPlacement;
  readonly roads: Roads;
  readonly roadPlacement: RoadPlacement;
  readonly center = new THREE.Vector3();
  private details = new THREE.Group();
  private unsubscribers: (() => void)[] = [];
  private active = false;
  private snapshot: { buildings: BuildingInstance[]; roads: string[]; layout: string; look: string } | null = null;

  constructor(
    terrain: Terrain,
    events: EventBus,
    readonly site: BaseSiteRef = { id: 'base-jezero', lat: SETTLEMENT.lat, lon: SETTLEMENT.lon, home: true },
  ) {
    this.group.name = `settlement-${site.id}`;
    if (!site.home) terrain.addPad(site.lat, site.lon);
    this.grid = new SettlementGrid(terrain, site.lat, site.lon);
    this.grid.surfacePoint(0, 0, 0, this.center);

    this.ground = new SettlementGround(terrain, this.grid, site.home);
    this.group.add(this.ground.mesh);

    this.roads = new Roads(this.grid);
    this.buildings = new BuildingManager(this.grid);
    this.placement = new BuildingPlacement(this.grid, events);
    this.roadPlacement = new RoadPlacement(this.grid, events);
    this.details.add(this.roads.group);
    this.buildRocks(site.id);
    this.group.add(this.details, this.buildings.group, this.placement.group, this.roadPlacement.group);

    const live = <T>(sel: (s: ReturnType<typeof gameStore.getState>) => T, cb: (v: T) => void) =>
      watch(sel, (v) => {
        if (this.active) cb(v);
      });
    this.unsubscribers.push(
      live(
        (s) => s.buildings,
        (buildings) => {
          const sel = this.buildings.sync(buildings);
          this.roads.rebuild(gameStore.getState().roads, buildings);
          if (sel) this.buildings.setSelected(gameStore.getState().selectedBuildingId);
        },
      ),
      live(
        (s) => s.roads,
        (roads) => {
          this.roads.rebuild(roads, gameStore.getState().buildings);
          this.roadPlacement.refresh();
        },
      ),
      live(
        (s) => s.roadMode,
        (on) => {
          this.roadPlacement.setActive(on);
          this.ground.setGridVisible(on || gameStore.getState().construction.active);
          this.buildings.setRoadHints(on);
        },
      ),
      live(
        (s) => s.selectedBuildingId,
        (id) => this.buildings.setSelected(id),
      ),
      live(
        (s) => (s.construction.active ? `${s.construction.buildingType}:${s.construction.rotation}` : ''),
        () => {
          const c = gameStore.getState().construction;
          this.placement.setMode(c.active ? c.buildingType : null, c.rotation);
          this.ground.setGridVisible(c.active || gameStore.getState().roadMode);
        },
      ),
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Puts this base on screen (follows the store) or takes it off (static snapshot). */
  setActive(on: boolean): void {
    if (on === this.active) return;
    this.active = on;
    const s = gameStore.getState();
    if (on) {
      this.snapshot = null;
      this.buildings.sync(s.buildings);
      this.roads.rebuild(s.roads, s.buildings);
      this.roadPlacement.refresh();
      this.buildings.setSelected(s.selectedBuildingId);
    } else {
      this.placement.setMode(null, 0);
      this.roadPlacement.setActive(false);
      this.ground.setGridVisible(false);
      this.buildings.setRoadHints(false);
      this.buildings.setSelected(null);
    }
  }

  /** Draws a base that is not on screen (cheap: only when its buildings or roads change). */
  showSnapshot(buildings: BuildingInstance[], roads: string[]): void {
    if (this.active) return;
    const prev = this.snapshot;
    if (prev && prev.buildings === buildings && prev.roads === roads) return;
    // A background base's buildings change every step (recipe progress, power), but only
    // what can be seen from afar matters: layout, construction stage and the road sign.
    const layout = buildings.map((b) => `${b.id}:${b.type}:${b.gridX},${b.gridY},${b.rotation}`).join('|');
    const look = buildings.map((b) => `${Math.round(b.constructionProgress * 20)}${b.connected ? 1 : 0}`).join('');
    const roadsChanged = !prev || prev.roads !== roads || prev.layout !== layout;
    if (prev && !roadsChanged && prev.look === look) {
      this.snapshot = { ...prev, buildings };
      return;
    }
    this.snapshot = { buildings, roads, layout, look };
    this.buildings.sync(buildings);
    if (roadsChanged) this.roads.rebuild(roads, buildings);
  }

  private buildRocks(seedKey: string): void {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const count = 420;
    const mesh = new THREE.InstancedMesh(geo, materials().rock, count);
    let seed = 42;
    for (let i = 0; i < seedKey.length; i++) seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
    const rand = mulberry32(seed);
    const dummy = new THREE.Object3D();
    const s = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = SETTLEMENT.flattenRadius * 0.92 + Math.pow(rand(), 0.8) * 90;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      this.grid.place(dummy, x, y, rand() * Math.PI * 2, 0);
      const size = 0.12 + Math.pow(rand(), 3) * 0.75;
      s.set(size * (0.8 + rand() * 0.5), size * (0.45 + rand() * 0.4), size * (0.8 + rand() * 0.5)).multiplyScalar(SETTLEMENT.cellSize);
      dummy.scale.copy(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.details.add(mesh);
  }

  /** Angular distance (scene units) from a direction to the settlement centre. */
  distanceFrom(point: THREE.Vector3): number {
    return point.angleTo(this.center) * R;
  }

  update(dt: number, time: number, cameraAltitude: number, cameraPos: THREE.Vector3): void {
    const dist = this.distanceFrom(cameraPos);
    const near = cameraAltitude < 2.5 && dist < 4;
    this.details.visible = cameraAltitude < 30 && dist < 40;
    this.buildings.group.visible = cameraAltitude < 60 && dist < 60;
    this.ground.update(dt, time);
    this.buildings.update(dt, time, near);
    if (this.active) {
      this.placement.update(time);
      this.roadPlacement.update(time);
    }
  }

  dispose(): void {
    for (const u of this.unsubscribers) u();
  }
}
