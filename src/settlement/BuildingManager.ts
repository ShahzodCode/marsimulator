import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  /** Floating "needs a road" sign. */
  marker: THREE.Sprite;
  /** Its still parts are drawn by the base-wide batch (see rebatch). */
  batched: boolean;
}

/** A mesh that can join the batch: a Blender part that never moves on its own. */
function batchable(mesh: THREE.Mesh, top: THREE.Object3D): boolean {
  if (!mesh.isMesh || !mesh.userData.sharedGeometry || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return false;
  for (let n: THREE.Object3D | null = mesh; n && n !== top; n = n.parent) if (typeof n.userData?.spin === 'number' && n.userData.spin !== 0) return false;
  return true;
}

let markerTexture: THREE.CanvasTexture | null = null;

/** A round amber road sign (drawn once, shared by every marker). */
function roadSignTexture(): THREE.CanvasTexture {
  if (markerTexture) return markerTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(64, 68, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffb020';
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(64, 62, 52, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Road in perspective with a dashed centre line.
  g.fillStyle = '#3a3532';
  g.beginPath();
  g.moveTo(52, 24);
  g.lineTo(76, 24);
  g.lineTo(98, 100);
  g.lineTo(30, 100);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffe27a';
  for (const [y, h, w] of [[30, 10, 4], [50, 14, 5], [74, 18, 6]]) g.fillRect(64 - w / 2, y, w, h);
  markerTexture = new THREE.CanvasTexture(c);
  markerTexture.colorSpace = THREE.SRGBColorSpace;
  return markerTexture;
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
  private markerMaterial = new THREE.SpriteMaterial({ map: roadSignTexture(), depthTest: false, transparent: true });
  private roadHints = false;
  /**
   * Every finished building's still parts merged into one mesh per material: a base of
   * 40 buildings is ~40 draw calls instead of ~900. The original meshes stay in place,
   * hidden, so clicking a building still finds it (raycasts ignore visibility).
   */
  private batch = new THREE.Group();
  private batchDirty = false;

  constructor(private grid: SettlementGrid) {
    this.group.name = 'buildings';
    this.batch.name = 'building-batch';
    this.group.add(this.batch);
  }

  /** Returns true when buildings were added or removed. */
  sync(buildings: BuildingInstance[]): boolean {
    const seen = new Set<string>();
    let changed = false;
    for (const b of buildings) {
      seen.add(b.id);
      const e = this.entries.get(b.id);
      if (!e) {
        this.create(b);
        changed = true;
      } else if (e.data !== b) this.updateEntry(e, b);
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        this.group.remove(e.root);
        disposeGeometries(e.root);
        if (e.batched) this.batchDirty = true;
        this.entries.delete(id);
        changed = true;
        if (this.selectedId === id) this.setSelected(null);
      }
    }
    return changed;
  }

  /** While the road tool is active, the "needs a road" signs are drawn bigger. */
  setRoadHints(on: boolean): void {
    this.roadHints = on;
  }

  private create(b: BuildingInstance): void {
    const model = buildBuildingModel(b.type);
    // Height measured in model space (before the model is parented and placed).
    const top = new THREE.Box3().setFromObject(model.group).max.y;
    const root = new THREE.Group();
    root.userData.buildingId = b.id;
    root.add(model.group);
    const c = rectCenter(footprintRect(b.type, b.gridX, b.gridY, b.rotation));
    this.grid.place(root, c.x, c.y, (b.rotation * Math.PI) / 2);
    const marker = new THREE.Sprite(this.markerMaterial);
    marker.renderOrder = 10;
    marker.position.y = (Number.isFinite(top) ? top : 2) + 1.4;
    marker.visible = false;
    // Signs are not clickable (sprites also need a camera to raycast, which pick() lacks).
    marker.raycast = () => {};
    root.add(marker);
    const entry: Entry = { data: b, root, model, scaffold: null, pop: 0, marker, batched: false };
    this.group.add(root);
    this.entries.set(b.id, entry);
    this.updateEntry(entry, b);
  }

  private updateEntry(e: Entry, b: BuildingInstance): void {
    const wasBuilding = e.data.constructionProgress < 1;
    e.data = b;
    e.marker.visible = !b.connected;
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
    // (The batch meshes don't raycast; the hidden originals answer for them.)
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
      // Finished and done popping: its parts can join the batch (and must leave it otherwise).
      if ((e.data.constructionProgress >= 1 && e.pop === 0) !== e.batched) this.batchDirty = true;
      if (animate && e.model.update) e.model.update(dt, time);
      if (e.pop > 0) {
        e.pop = Math.max(0, e.pop - dt * 2.5);
        const s = 1 + Math.sin(e.pop * Math.PI) * 0.08;
        e.model.group.scale.set(s, s, s);
      }
      if (e.scaffold) {
        (e.scaffold.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(time * 5);
      }
      if (e.marker.visible) {
        const s = (this.roadHints ? 2.6 : 1.7) * (1 + 0.08 * Math.sin(time * 4));
        e.marker.scale.set(s, s, 1);
      }
    }
    if (this.selection) {
      const s = 1 + 0.03 * Math.sin(time * 4);
      this.selection.scale.set(s, 1, s);
    }
    if (this.batchDirty) this.rebatch();
  }

  private rebatch(): void {
    this.batchDirty = false;
    for (const m of this.batch.children as THREE.Mesh[]) m.geometry.dispose();
    this.batch.clear();
    this.group.updateMatrixWorld(true);
    const toGroup = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const parts = new Map<string, { source: THREE.Mesh; geometries: THREE.BufferGeometry[] }>();
    const m = new THREE.Matrix4();
    for (const e of this.entries.values()) {
      const on = e.data.constructionProgress >= 1 && e.pop === 0;
      e.batched = on;
      e.model.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!batchable(mesh, e.model.group)) return;
        mesh.visible = !on;
        if (!on) return;
        const g = mesh.geometry;
        const attrs = Object.keys(g.attributes).sort().join(',');
        const key = `${(mesh.material as THREE.Material).uuid}|${attrs}|${!!g.index}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
        let p = parts.get(key);
        if (!p) parts.set(key, (p = { source: mesh, geometries: [] }));
        m.multiplyMatrices(toGroup, mesh.matrixWorld);
        const copy = g.clone().applyMatrix4(m);
        // A mirrored placement turns triangles inside out: flip their winding back.
        if (m.determinant() < 0 && copy.index) {
          const ix = copy.index;
          for (let i = 0; i < ix.count; i += 3) {
            const b = ix.getX(i + 1);
            ix.setX(i + 1, ix.getX(i + 2));
            ix.setX(i + 2, b);
          }
        }
        p.geometries.push(copy);
      });
    }
    for (const { source, geometries } of parts.values()) {
      const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (geometries.length > 1) for (const g of geometries) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, source.material);
      mesh.castShadow = source.castShadow;
      mesh.receiveShadow = source.receiveShadow;
      mesh.renderOrder = source.renderOrder;
      mesh.raycast = () => {};
      mesh.matrixAutoUpdate = false;
      this.batch.add(mesh);
    }
  }
}
