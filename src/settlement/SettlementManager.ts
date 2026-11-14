import * as THREE from 'three';
import type { Terrain } from '../planet/Terrain';
import type { EventBus } from '../core/EventBus';
import { DECORATIONS, SETTLEMENT } from '../data/settlement';
import { gameStore, watch } from '../state/gameStore';
import { mulberry32 } from '../planet/noise';
import { SettlementGrid } from './SettlementGrid';
import { SettlementGround } from './SettlementGround';
import { BuildingManager } from './BuildingManager';
import { BuildingPlacement } from './BuildingPlacement';
import { Roads } from './Roads';
import { buildDecorationModel } from './buildings/models';
import { materials } from './buildings/materials';
import { R } from '../planet/geo';

/**
 * Owns everything in the settlement area: detailed ground, roads, decorations,
 * scattered rocks, the buildings themselves and the construction preview.
 */
export class SettlementManager {
  readonly group = new THREE.Group();
  readonly grid: SettlementGrid;
  readonly ground: SettlementGround;
  readonly buildings: BuildingManager;
  readonly placement: BuildingPlacement;
  readonly roads: Roads;
  readonly center = new THREE.Vector3();
  private details = new THREE.Group();
  private unsubscribers: (() => void)[] = [];

  constructor(terrain: Terrain, events: EventBus) {
    this.group.name = 'settlement';
    this.grid = new SettlementGrid(terrain);
    this.grid.surfacePoint(0, 0, 0, this.center);

    this.ground = new SettlementGround(terrain, this.grid);
    this.group.add(this.ground.mesh);

    this.roads = new Roads(this.grid);
    this.buildings = new BuildingManager(this.grid);
    this.placement = new BuildingPlacement(this.grid, events);
    this.details.add(this.roads.group);
    this.buildDecorations();
    this.buildRocks();
    this.group.add(this.details, this.buildings.group, this.placement.group);

    this.unsubscribers.push(
      watch(
        (s) => s.buildings,
        (buildings) => {
          this.buildings.sync(buildings);
          this.roads.rebuild(buildings);
          this.buildings.setSelected(gameStore.getState().selectedBuildingId);
        },
      ),
      watch(
        (s) => s.selectedBuildingId,
        (id) => this.buildings.setSelected(id),
      ),
      watch(
        (s) => (s.construction.active ? `${s.construction.buildingType}:${s.construction.rotation}` : ''),
        () => {
          const c = gameStore.getState().construction;
          this.placement.setMode(c.active ? c.buildingType : null, c.rotation);
          this.ground.setGridVisible(c.active);
        },
      ),
    );
  }

  private buildDecorations(): void {
    for (const d of DECORATIONS) {
      const model = buildDecorationModel(d.kind);
      this.grid.place(model, d.x, d.y, d.rotation);
      this.details.add(model);
    }
  }

  private buildRocks(): void {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const count = 420;
    const mesh = new THREE.InstancedMesh(geo, materials().rock, count);
    const rand = mulberry32(42);
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
    const near = cameraAltitude < 2.5 && this.distanceFrom(cameraPos) < 4;
    this.details.visible = cameraAltitude < 30;
    this.buildings.group.visible = cameraAltitude < 60;
    this.ground.update(dt, time);
    this.buildings.update(dt, time, near);
    this.placement.update(time);
  }

  dispose(): void {
    for (const u of this.unsubscribers) u();
  }
}
