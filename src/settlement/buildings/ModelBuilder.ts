import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface PartTransform {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

/**
 * Collects primitive parts and merges them into ONE mesh per material.
 * A detailed building therefore costs only a handful of draw calls.
 *
 * Model units: 1 = one settlement grid cell. +Y up, +X east, +Z south.
 */
export class ModelBuilder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(private override: THREE.Material | null = null) {}

  add(geometry: THREE.BufferGeometry, material: THREE.Material, t: PartTransform = {}): this {
    this.e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    this.s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    this.m.compose(this.p, this.q, this.s);
    let g = geometry;
    if (!g.index) g = indexed(g);
    g.applyMatrix4(this.m);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
    }
    const mat = this.override ?? material;
    let list = this.parts.get(mat);
    if (!list) {
      list = [];
      this.parts.set(mat, list);
    }
    list.push(g);
    return this;
  }

  /** Box resting on y (its base sits at `y`). */
  box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.add(g, mat, { x, y, z, ry });
  }

  /** Vertical cylinder resting on y. */
  cyl(mat: THREE.Material, rTop: number, rBottom: number, h: number, x = 0, y = 0, z = 0, segments = 16): this {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
    g.translate(0, h / 2, 0);
    return this.add(g, mat, { x, y, z });
  }

  /** Horizontal cylinder centred at (x, y, z), pointing along heading `ry` (0 = +X). */
  hcyl(mat: THREE.Material, r: number, length: number, x: number, y: number, z: number, ry = 0, segments = 14): this {
    const g = new THREE.CylinderGeometry(r, r, length, segments);
    g.rotateZ(Math.PI / 2);
    return this.add(g, mat, { x, y, z, ry });
  }

  sphere(mat: THREE.Material, r: number, x = 0, y = 0, z = 0, t: PartTransform = {}, wSeg = 12, hSeg = 8): this {
    return this.add(new THREE.SphereGeometry(r, wSeg, hSeg), mat, { ...t, x, y, z });
  }

  dome(mat: THREE.Material, r: number, x = 0, y = 0, z = 0, sy = 1, segments = 28): this {
    const g = new THREE.SphereGeometry(r, segments, Math.max(6, segments / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    return this.add(g, mat, { x, y, z, sy });
  }

  cone(mat: THREE.Material, r: number, h: number, x = 0, y = 0, z = 0, segments = 10, ry = 0): this {
    const g = new THREE.ConeGeometry(r, h, segments);
    g.translate(0, h / 2, 0);
    return this.add(g, mat, { x, y, z, ry });
  }

  /** Flat disc lying on the ground at height y. */
  disc(mat: THREE.Material, r: number, x = 0, y = 0, z = 0, segments = 32): this {
    const g = new THREE.CircleGeometry(r, segments);
    g.rotateX(-Math.PI / 2);
    return this.add(g, mat, { x, y, z });
  }

  ring(mat: THREE.Material, inner: number, outer: number, x = 0, y = 0, z = 0, segments = 40): this {
    const g = new THREE.RingGeometry(inner, outer, segments);
    g.rotateX(-Math.PI / 2);
    return this.add(g, mat, { x, y, z });
  }

  /** Flat ring band (torus) lying horizontally. */
  torus(mat: THREE.Material, r: number, tube: number, x = 0, y = 0, z = 0, arc = Math.PI * 2, t: PartTransform = {}): this {
    const g = new THREE.TorusGeometry(r, tube, 6, 32, arc);
    return this.add(g, mat, { rx: Math.PI / 2, ...t, x, y, z });
  }

  build(castShadow = true): THREE.Group {
    const group = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      const transparent = (mat as THREE.MeshStandardMaterial).transparent;
      const emissive = (mat as THREE.MeshStandardMaterial).emissiveIntensity > 0 && (mat as THREE.MeshStandardMaterial).color?.getHex() === 0;
      mesh.castShadow = castShadow && !transparent && !emissive;
      mesh.receiveShadow = !transparent;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

function indexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = g.attributes.position.count;
  const idx = new Uint32Array(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Disposes geometries of every mesh in a hierarchy (materials are shared and kept). */
export function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // Geometry of Blender models is shared by every instance, so it is never disposed here.
    if (mesh.isMesh && !mesh.userData.sharedGeometry) mesh.geometry.dispose();
  });
}
