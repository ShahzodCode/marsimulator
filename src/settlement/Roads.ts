import * as THREE from 'three';
import type { BuildingInstance } from '../state/types';
import { DIRS, ROAD_TILE, buildingSideOfTile, isPlazaTile, parseRoadKey, reachableRoads, roadKey } from './RoadRules';
import type { SettlementGrid } from './SettlementGrid';
import { materials } from './buildings/materials';

/**
 * Renders the player-built road tiles. Each tile looks at its four neighbours and picks
 * its shape automatically (auto-tiling): dead-end, straight, curved turn, T-junction,
 * crossroads — so a road bends smoothly when the next piece is to the side.
 *
 * Tile-local coordinates: (u, v) in cells from the tile centre, u = east, v = north;
 * the tile spans -1..1. Everything is projected onto the curved planet surface.
 */

/** A road "centre-line" piece: point + unit tangent at arc-length s. */
interface Path {
  length: number;
  at(s: number, p: THREE.Vector2, t: THREE.Vector2): void;
}

interface Layer {
  /** Offsets across the road (left, right) of the band, in cells. */
  from: number;
  to: number;
  lift: number;
  out: number[];
  /** Optional dash pattern (period, dash length) along the path. */
  dash?: [number, number];
  /** Skip this many cells at the start of a path (keeps lines out of junction boxes). */
  trimStart?: number;
}

const HALF_SHOULDER = 0.98;
const HALF_ROAD = 0.66;
const LINE_IN = 0.54;
const LINE_OUT = 0.6;

function line(ax: number, ay: number, bx: number, by: number): Path {
  const len = Math.hypot(bx - ax, by - ay);
  const tx = (bx - ax) / len;
  const ty = (by - ay) / len;
  return {
    length: len,
    at(s, p, t) {
      p.set(ax + tx * s, ay + ty * s);
      t.set(tx, ty);
    },
  };
}

/** Quarter-circle turn joining the midpoints of edges a and b (DIRS indices). */
function turn(a: number, b: number): Path {
  const [ax, ay] = DIRS[a];
  const [bx, by] = DIRS[b];
  const cx = ax + bx;
  const cy = ay + by;
  const t0 = Math.atan2(-by, -bx);
  let d = Math.atan2(-ay, -ax) - t0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const sign = Math.sign(d);
  return {
    length: Math.abs(d),
    at(s, p, t) {
      const th = t0 + sign * s;
      p.set(cx + Math.cos(th), cy + Math.sin(th));
      t.set(-Math.sin(th) * sign, Math.cos(th) * sign);
    },
  };
}

export class Roads {
  readonly group = new THREE.Group();
  private mats = {
    shoulder: decal('#b48a66', -1),
    asphalt: decal('#4b4440', -2),
    worn: decal('#5a514b', -3),
    edge: decal('#e9e2d6', -4),
    centre: decal('#f2b630', -4),
    dirt: decal('#7c6a5e', -2),
  };
  private lamps: THREE.InstancedMesh;
  private lampHeads: THREE.InstancedMesh;
  private meshes: THREE.Mesh[] = [];
  private signature = '';
  private readonly p = new THREE.Vector2();
  private readonly t = new THREE.Vector2();
  private readonly v = new THREE.Vector3();

  constructor(private grid: SettlementGrid) {
    const post = new THREE.CylinderGeometry(0.035, 0.05, 1.25, 8);
    post.translate(0, 0.62, 0);
    const arm = new THREE.BoxGeometry(0.42, 0.04, 0.05);
    arm.translate(-0.19, 1.24, 0);
    const base = new THREE.CylinderGeometry(0.09, 0.11, 0.12, 8);
    base.translate(0, 0.06, 0);
    const lampGeo = mergeSimple([post, arm, base]);
    const head = new THREE.BoxGeometry(0.2, 0.05, 0.1);
    head.translate(-0.38, 1.21, 0);
    const M = materials();
    this.lamps = new THREE.InstancedMesh(lampGeo, M.darkMetal, 256);
    this.lampHeads = new THREE.InstancedMesh(head, M.glowWhite, 256);
    this.lamps.count = this.lampHeads.count = 0;
    this.lamps.castShadow = true;
    this.group.add(this.lamps, this.lampHeads);
  }

  rebuild(roads: string[], buildings: BuildingInstance[]): void {
    const sig = roads.join(';') + '#' + buildings.map((b) => `${b.id}:${b.gridX},${b.gridY},${b.rotation}`).join('|');
    if (sig === this.signature) return;
    this.signature = sig;
    for (const m of this.meshes) {
      m.geometry.dispose();
      this.group.remove(m);
    }
    this.meshes = [];

    const set = new Set(roads);
    const live = reachableRoads(set);
    const L = {
      shoulder: { from: -HALF_SHOULDER, to: HALF_SHOULDER, lift: 0.0006, out: [] as number[] },
      asphalt: { from: -HALF_ROAD, to: HALF_ROAD, lift: 0.0008, out: [] as number[] },
      worn: { from: -0.36, to: -0.18, lift: 0.00085, out: [] as number[] },
      worn2: { from: 0.18, to: 0.36, lift: 0.00085, out: [] as number[] },
      edgeL: { from: -LINE_OUT, to: -LINE_IN, lift: 0.0009, out: [] as number[], trimStart: 0 },
      edgeR: { from: LINE_IN, to: LINE_OUT, lift: 0.0009, out: [] as number[], trimStart: 0 },
      centre: { from: -0.035, to: 0.035, lift: 0.0009, out: [] as number[], dash: [1, 0.5] as [number, number] },
    };
    const dirt: number[] = [];
    const lampSpots: [number, number, number][] = [];

    for (const key of roads) {
      const [tx, ty] = parseRoadKey(key);
      const cx = tx * ROAD_TILE;
      const cy = ty * ROAD_TILE;
      // Arms: direction index -> reach (cells from the tile centre).
      const arms = new Map<number, number>();
      DIRS.forEach(([dx, dy], i) => {
        if (set.has(roadKey(tx + dx, ty + dy)) || isPlazaTile(tx + dx, ty + dy)) arms.set(i, 1);
      });
      // A road that ends at a building turns into its door.
      if (arms.size <= 1) {
        for (const b of buildings) {
          const side = buildingSideOfTile(tx, ty, b);
          if (side && !arms.has(side.dir)) {
            arms.set(side.dir, side.reach);
            if (arms.size >= 2) break;
          }
        }
      }
      const tile = (layer: Layer, path: Path) => this.band(layer, path, cx, cy, 0);
      const dirs = [...arms.keys()].sort();
      const markings = live.has(key);
      if (dirs.length === 2 && (dirs[1] - dirs[0]) % 2 === 0) {
        // Straight.
        const [a, b] = dirs;
        const path = line(DIRS[a][0] * arms.get(a)!, DIRS[a][1] * arms.get(a)!, DIRS[b][0] * arms.get(b)!, DIRS[b][1] * arms.get(b)!);
        for (const l of Object.values(L)) if (markings || l === L.shoulder || l === L.asphalt) tile(l, path);
        if (hash(tx, ty) % 3 === 0) {
          const side = hash(ty, tx) % 2 ? 1 : -1;
          const nx = -DIRS[b][1] * side;
          const ny = DIRS[b][0] * side;
          lampSpots.push([cx + nx * 1.05, cy + ny * 1.05, Math.atan2(ny, nx)]);
        }
      } else if (dirs.length === 2) {
        // Curved turn — plus straight extensions when a building door is further away.
        const [a, b] = dirs;
        const path = turn(a, b);
        for (const l of Object.values(L)) if (markings || l === L.shoulder || l === L.asphalt) tile(l, path);
        for (const d of dirs) if (arms.get(d)! > 1) this.armBand(L, d, 1, arms.get(d)!, cx, cy, markings);
      } else if (dirs.length === 1) {
        // Dead end: rounded turning pad + one arm.
        this.disc(L.shoulder.out, cx, cy, HALF_SHOULDER, L.shoulder.lift);
        this.disc(L.asphalt.out, cx, cy, HALF_ROAD, L.asphalt.lift);
        this.armBand(L, dirs[0], 0, arms.get(dirs[0])!, cx, cy, markings);
      } else if (dirs.length === 0) {
        this.square(L.shoulder.out, cx, cy, HALF_SHOULDER, L.shoulder.lift);
        this.square(L.asphalt.out, cx, cy, HALF_ROAD, L.asphalt.lift);
      } else {
        // Junction box + arms.
        this.square(L.shoulder.out, cx, cy, HALF_SHOULDER, L.shoulder.lift);
        this.square(L.asphalt.out, cx, cy, HALF_ROAD, L.asphalt.lift);
        for (const d of dirs) this.armBand(L, d, HALF_ROAD, arms.get(d)!, cx, cy, markings, true);
      }
      // Dusty patch under unfinished (not yet joined) roads.
      if (!markings) this.square(dirt, cx, cy, 0.5, 0.00085);
    }

    const add = (arr: number[], m: THREE.Material) => {
      if (!arr.length) return;
      const mesh = this.mesh(arr, m);
      this.meshes.push(mesh);
      this.group.add(mesh);
    };
    add(L.shoulder.out, this.mats.shoulder);
    add(L.asphalt.out, this.mats.asphalt);
    add([...L.worn.out, ...L.worn2.out], this.mats.worn);
    add([...L.edgeL.out, ...L.edgeR.out], this.mats.edge);
    add(L.centre.out, this.mats.centre);
    add(dirt, this.mats.dirt);

    const dummy = new THREE.Object3D();
    const n = Math.min(256, lampSpots.length);
    for (let i = 0; i < n; i++) {
      const [x, y, a] = lampSpots[i];
      this.grid.place(dummy, x, y, -a);
      dummy.updateMatrix();
      this.lamps.setMatrixAt(i, dummy.matrix);
      this.lampHeads.setMatrixAt(i, dummy.matrix);
    }
    this.lamps.count = this.lampHeads.count = n;
    this.lamps.instanceMatrix.needsUpdate = true;
    this.lampHeads.instanceMatrix.needsUpdate = true;
    this.lamps.computeBoundingSphere();
    this.lampHeads.computeBoundingSphere();
  }

  /** Straight arm from `start` to `end` cells along direction d. */
  private armBand(L: Record<string, Layer>, d: number, start: number, end: number, cx: number, cy: number, markings: boolean, junction = false) {
    const [dx, dy] = DIRS[d];
    const path = line(dx * start, dy * start, dx * end, dy * end);
    for (const [name, l] of Object.entries(L)) {
      if (!markings && name !== 'shoulder' && name !== 'asphalt') continue;
      // In a junction, the arm's shoulder/asphalt must reach into the box; the lines stop at it.
      if (junction && name === 'centre') this.band(l, path, cx, cy, 0.25);
      else this.band(l, path, cx, cy, 0);
    }
  }

  private band(layer: Layer, path: Path, cx: number, cy: number, trim: number) {
    const step = 0.2;
    const len = path.length;
    const s0 = trim + (layer.trimStart ?? 0);
    if (len - s0 <= 1e-4) return;
    const p = this.p;
    const t = this.t;
    const pts: number[][] = [];
    const n = Math.max(1, Math.ceil((len - s0) / step));
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((len - s0) * i) / n;
      path.at(s, p, t);
      pts.push([s, cx + p.x, cy + p.y, -t.y, t.x]);
    }
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (layer.dash) {
        // Dashes are aligned to the tile edge so they continue across neighbouring tiles.
        const mid = (a[0] + b[0]) / 2;
        const ph = ((mid % layer.dash[0]) + layer.dash[0]) % layer.dash[0];
        if (Math.abs(ph - layer.dash[0] / 2) > layer.dash[1] / 2) continue;
      }
      this.quad(
        layer.out,
        a[1] + a[3] * layer.from, a[2] + a[4] * layer.from,
        a[1] + a[3] * layer.to, a[2] + a[4] * layer.to,
        b[1] + b[3] * layer.from, b[2] + b[4] * layer.from,
        b[1] + b[3] * layer.to, b[2] + b[4] * layer.to,
        layer.lift,
      );
    }
  }

  private quad(out: number[], ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, lift: number) {
    const v = this.v;
    const push = (x: number, y: number) => {
      this.grid.surfacePoint(x, y, lift, v);
      out.push(v.x, v.y, v.z);
    };
    push(ax, ay);
    push(bx, by);
    push(cx, cy);
    push(bx, by);
    push(dx, dy);
    push(cx, cy);
  }

  private square(out: number[], cx: number, cy: number, h: number, lift: number) {
    const k = 4;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        const x0 = cx - h + (2 * h * i) / k;
        const x1 = cx - h + (2 * h * (i + 1)) / k;
        const y0 = cy - h + (2 * h * j) / k;
        const y1 = cy - h + (2 * h * (j + 1)) / k;
        this.quad(out, x0, y0, x1, y0, x0, y1, x1, y1, lift);
      }
    }
  }

  private disc(out: number[], cx: number, cy: number, r: number, lift: number) {
    const seg = 20;
    const v = this.v;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      for (const [x, y] of [
        [cx, cy],
        [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r],
        [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r],
      ]) {
        this.grid.surfacePoint(x, y, lift, v);
        out.push(v.x, v.y, v.z);
      }
    }
  }

  private mesh(positions: number[], material: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Normals point straight up from the planet (winding isn't consistent for every shape).
    const n = new Float32Array(positions.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      v.set(positions[i], positions[i + 1], positions[i + 2]).normalize();
      n[i] = v.x;
      n[i + 1] = v.y;
      n[i + 2] = v.z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    return mesh;
  }
}

function decal(color: string, order: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: order - 1,
    polygonOffsetUnits: order * 4 - 4,
  });
}

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.attributes.position.array as Float32Array));
    nor.push(...(g.attributes.normal.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
