import * as THREE from 'three';
import { BUILDINGS, rotatedFootprint } from '../data/buildings';
import type { BuildingInstance } from '../state/types';
import { footprintRect, rectCenter } from './PlacementRules';
import type { SettlementGrid } from './SettlementGrid';
import { buildBuildingModel, type BuiltModel } from './buildings/models';
import { disposeGeometries } from './buildings/ModelBuilder';
import { materials } from './buildings/materials';

interface Entry {
  data: BuildingInstance;
  root: THREE.Group;
  model: BuiltModel;
  scaffold: THREE.LineSegments | null;
  pop: number;
}

/**
 * Keeps the 3D buildings in sync with the game state (state → view, one direction).
 */
export class BuildingManager {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private selection: THREE.Group | null = null;
  private selectedId: string | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private scaffoldMaterial = new THREE.LineBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9 });

  constructor(private grid: SettlementGrid) {
    this.group.name = 'buildings';
  }

  sync(buildings: BuildingInstance[]): void {
    const seen = new Set<string>();
    for (const b of buildings) {
      seen.add(b.id);
      const e = this.entries.get(b.id);
      if (!e) this.create(b);
      else if (e.data !== b) this.updateEntry(e, b);
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        this.group.remove(e.root);
        disposeGeometries(e.root);
        this.entries.delete(id);
        if (this.selectedId === id) this.setSelected(null);
      }
    }
  }

  private create(b: BuildingInstance): void {
    const model = buildBuildingModel(b.type);
    const root = new THREE.Group();
    root.userData.buildingId = b.id;
    root.add(model.group);
    const c = rectCenter(footprintRect(b.type, b.gridX, b.gridY, b.rotation));
    this.grid.place(root, c.x, c.y, (b.rotation * Math.PI) / 2);
    const entry: Entry = { data: b, root, model, scaffold: null, pop: 0 };
    this.group.add(root);
    this.entries.set(b.id, entry);
    this.updateEntry(entry, b);
  }

  private updateEntry(e: Entry, b: BuildingInstance): void {
    const wasBuilding = e.data.constructionProgress < 1;
    e.data = b;
    if (b.constructionProgress < 1) {
      if (!e.scaffold) {
        const fp = BUILDINGS[b.type].footprint;
        const box = new THREE.BoxGeometry(fp.width + 0.3, 2.8, fp.height + 0.3);
        box.translate(0, 1.4, 0);
        e.scaffold = new THREE.LineSegments(new THREE.EdgesGeometry(box), this.scaffoldMaterial);
        box.dispose();
        e.root.add(e.scaffold);
      }
      const p = b.constructionProgress;
      e.model.group.scale.set(1, Math.max(0.04, 1 - Math.pow(1 - p, 2)), 1);
    } else {
      if (e.scaffold) {
        e.root.remove(e.scaffold);
        e.scaffold.geometry.dispose();
        e.scaffold = null;
      }
      e.model.group.scale.set(1, 1, 1);
      if (wasBuilding) e.pop = 1;
    }
  }

  setSelected(id: string | null): void {
    if (this.selection) {
      this.selection.parent?.remove(this.selection);
      disposeGeometries(this.selection);
      this.selection = null;
    }
    this.selectedId = id;
    const e = id ? this.entries.get(id) : undefined;
    if (!e) return;
    const fp = rotatedFootprint(e.data.type, 0);
    const w = fp.width + 1.0;
    const h = fp.height + 1.0;
    const t = 0.18;
    const g = new THREE.Group();
    const M = materials();
    const mk = (sx: number, sz: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.08, sz), M.glowCyan);
      m.position.set(x, 0.14, z);
      g.add(m);
    };
    mk(w, t, 0, -h / 2);
    mk(w, t, 0, h / 2);
    mk(t, h, -w / 2, 0);
    mk(t, h, w / 2, 0);
    this.selection = g;
    e.root.add(g);
  }

  /** Returns the id of the building under the ray, if any. */
  pick(ray: THREE.Ray): string | null {
    this.raycaster.ray.copy(ray);
    const hits = this.raycaster.intersectObjects(this.group.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.buildingId === undefined) o = o.parent;
      if (o) return o.userData.buildingId as string;
    }
    return null;
  }

  worldPosition(id: string, out = new THREE.Vector3()): THREE.Vector3 | null {
    const e = this.entries.get(id);
    return e ? out.copy(e.root.position) : null;
  }

  update(dt: number, time: number, animate: boolean): void {
    for (const e of this.entries.values()) {
      if (animate && e.model.update) e.model.update(dt, time);
      if (e.pop > 0) {
        e.pop = Math.max(0, e.pop - dt * 2.5);
        const s = 1 + Math.sin(e.pop * Math.PI) * 0.08;
        e.model.group.scale.set(s, s, s);
      }
      if (e.scaffold) {
        (e.scaffold.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(time * 5);
      }
    }
    if (this.selection) {
      const s = 1 + 0.03 * Math.sin(time * 4);
      this.selection.scale.set(s, 1, s);
    }
  }
}
