import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { materials } from './materials';

let sharedGeometry: THREE.BufferGeometry | null = null;

function colored(g: THREE.BufferGeometry, color: string, m: THREE.Matrix4): THREE.BufferGeometry {
  g.applyMatrix4(m);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

/** One low-poly chicken (vertex coloured), facing +X, ~0.36 cells long. */
function chickenGeometry(): THREE.BufferGeometry {
  if (sharedGeometry) return sharedGeometry;
  const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rz = 0) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)),
      new THREE.Vector3(sx, sy, sz),
    );
  const parts = [
    colored(new THREE.SphereGeometry(0.13, 10, 7), '#ffffff', M(0, 0.17, 0, 1.25, 0.95, 0.9)),
    colored(new THREE.ConeGeometry(0.07, 0.14, 6), '#f4f1ea', M(-0.16, 0.25, 0, 1, 1, 1, 0.6)),
    colored(new THREE.SphereGeometry(0.075, 8, 6), '#ffffff', M(0.13, 0.31, 0)),
    colored(new THREE.BoxGeometry(0.06, 0.06, 0.025), '#e8312a', M(0.13, 0.4, 0)),
    colored(new THREE.ConeGeometry(0.025, 0.07, 5), '#f7a51c', M(0.215, 0.3, 0, 1, 1, 1, -Math.PI / 2)),
    colored(new THREE.BoxGeometry(0.02, 0.04, 0.02), '#e8312a', M(0.17, 0.25, 0)),
    colored(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 4), '#f7a51c', M(0.0, 0.05, 0.045)),
    colored(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 4), '#f7a51c', M(0.0, 0.05, -0.045)),
  ];
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  sharedGeometry = merged;
  return merged;
}

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * A few animated chickens in one InstancedMesh: they wander inside their pen,
 * stop to peck, and never leave the protected greenhouse.
 */
export class ChickenFlock {
  readonly mesh: THREE.InstancedMesh;
  private x: Float32Array;
  private z: Float32Array;
  private heading: Float32Array;
  private tx: Float32Array;
  private tz: Float32Array;
  private wait: Float32Array;
  private phase: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly e = new THREE.Euler();

  constructor(
    private count: number,
    private bounds: Bounds,
    private floorY: number,
  ) {
    this.mesh = new THREE.InstancedMesh(chickenGeometry(), materials().chicken, count);
    this.mesh.castShadow = true;
    this.mesh.name = 'chickens';
    this.x = new Float32Array(count);
    this.z = new Float32Array(count);
    this.heading = new Float32Array(count);
    this.tx = new Float32Array(count);
    this.tz = new Float32Array(count);
    this.wait = new Float32Array(count);
    this.phase = new Float32Array(count);
    const brown = new THREE.Color('#c27a3e');
    const white = new THREE.Color('#ffffff');
    for (let i = 0; i < count; i++) {
      this.x[i] = this.tx[i] = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
      this.z[i] = this.tz[i] = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
      this.heading[i] = Math.random() * Math.PI * 2;
      this.wait[i] = Math.random() * 2;
      this.phase[i] = Math.random() * 10;
      this.mesh.setColorAt(i, i % 3 === 1 ? brown : white);
    }
    this.update(0, 0);
  }

  update(dt: number, time: number): void {
    const b = this.bounds;
    for (let i = 0; i < this.count; i++) {
      let pecking = 0;
      if (this.wait[i] > 0) {
        this.wait[i] -= dt;
        pecking = Math.max(0, Math.sin((time + this.phase[i]) * 9));
        if (this.wait[i] <= 0) {
          this.tx[i] = THREE.MathUtils.lerp(b.minX, b.maxX, Math.random());
          this.tz[i] = THREE.MathUtils.lerp(b.minZ, b.maxZ, Math.random());
        }
      } else {
        const dx = this.tx[i] - this.x[i];
        const dz = this.tz[i] - this.z[i];
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          this.wait[i] = 1 + Math.random() * 3;
        } else {
          const target = Math.atan2(-dz, dx);
          let dh = target - this.heading[i];
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          this.heading[i] += dh * Math.min(1, dt * 6);
          const step = Math.min(d, dt * 0.45);
          this.x[i] += (dx / d) * step;
          this.z[i] += (dz / d) * step;
        }
      }
      const hop = this.wait[i] > 0 ? 0 : Math.abs(Math.sin((time + this.phase[i]) * 14)) * 0.025;
      this.p.set(this.x[i], this.floorY + hop, this.z[i]);
      this.e.set(0, this.heading[i], -pecking * 0.45);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
