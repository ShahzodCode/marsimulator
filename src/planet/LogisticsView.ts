import * as THREE from 'three';
import { gameStore } from '../state/gameStore';
import { Logistics } from '../simulation/Logistics';
import type { Pipeline } from '../state/types';
import { pipeModelParts, type PipePart } from '../settlement/buildings/glbModels';
import type { Terrain } from './Terrain';
import { angularDistance, dirToLatLon, greatCirclePoint, latLonToDir, MARS_RADIUS_KM, R, type LatLon } from './geo';

/** Height of the pipe above the ground: on low stilts near the bases, higher out on the plains so hills don't hide it. */
const NEAR_LIFT = 0.012;
const FAR_LIFT = 0.22;
/** Km from a base over which the pipe rises from NEAR_LIFT to FAR_LIFT. */
const RISE_KM = [12, 45] as const;
const PIPE_RADIUS = 0.0045;
/** The thin map line is only drawn from this far out (the 3D pipe is too thin to see there). */
const LINE_MIN_ALT = 2.5;

/*
 * Detailed pipe: Blender modules from blender/pipeline.py (1 model unit = 1 cell, pipe along
 * +X). Drawn only when zoomed in, and only the stretch near the camera, so even a 2,000 km
 * pipe stays a few hundred instances.
 */
/** Globe units per model unit: 1.5 cells, the same thickness as the old plain tube. */
const MODEL_SCALE = 0.015;
/** Length of one pipe_span module (model units). */
const SPAN_LEN = 4;
/** Zigzag like the Trans-Alaska Pipeline (S37): straight runs that bend sideways every 4 spans. */
const ZIG_AMP = 1.6 * MODEL_SCALE;
const ZIG = [0, 0.5, 1, 0.5, 0, -0.5, -1, -0.5];
/** An anchor + bellows expansion joint in the middle of every straight run. */
const isExpansion = (i: number) => i % 4 === 0;
/** Most spans drawn per pipeline at once. */
const WINDOW_MAX = 360;
/** Most twisted spans drawn per pipeline. */
const BUCKLED_MAX = 8;

const COLORS = {
  building: new THREE.Color('#ffb03d'),
  working: new THREE.Color('#4fd8ff'),
  idle: new THREE.Color('#8c9bb0'),
  ok: new THREE.Color('#58ff9a'),
  bad: new THREE.Color('#ff5a4f'),
  route: new THREE.Color('#f0a443'),
};

interface PipeViz {
  key: string;
  line: THREE.Line;
  rest: THREE.Line;
  /** Plain tube, only when the Blender modules didn't load. */
  tube: THREE.Mesh | null;
  /** Tube index count for the whole pipe (drawn up to the construction progress). */
  tubeCount: number;
  modules: ModuleViz | null;
}

/** All parts of one module type, sharing one instance-matrix buffer. */
interface ModuleSet {
  meshes: THREE.InstancedMesh[];
  matrix: THREE.InstancedBufferAttribute;
}

interface ModuleViz {
  group: THREE.Group;
  /** Spans in the whole pipe. */
  n: number;
  /** World matrices of every span (n × 16) and every support point ((n + 1) × 16). */
  spanM: Float32Array;
  vertM: Float32Array;
  /** Support-point positions, for finding the stretch near the camera. */
  verts: Float32Array;
  span: ModuleSet;
  support: ModuleSet;
  expansion: ModuleSet;
  buckled: ModuleSet;
  /** This pipeline's copies of the glowing materials (recoloured with its state). */
  status: THREE.MeshStandardMaterial[];
  alarm: THREE.MeshStandardMaterial[];
  windowKey: string;
  /** Span indices of the pipe's twists, recomputed only when its fault list changes. */
  faultsFor: Pipeline['faults'] | null;
  faultSpans: Set<number>;
}

/**
 * Pipelines between bases and the drag previews of the logistics tools (pipeline tool,
 * cargo garage arrow), drawn on the globe. Purely visual: reads the store, never writes it.
 */
export class LogisticsView {
  readonly group = new THREE.Group();
  private pipes = new Map<string, PipeViz>();
  private tubeMat = new THREE.MeshStandardMaterial({ color: '#b9c3cf', roughness: 0.35, metalness: 0.7 });
  private preview: THREE.Line;
  private target: THREE.Line;
  private targetKey = '';
  private readonly ll: LatLon = { lat: 0, lon: 0 };
  /** State the pipe geometry was last synced against (skip the sync while none of it changed). */
  private synced: { pipelines: unknown; buildings: unknown; base: unknown; otherBases: unknown } | null = null;

  constructor(private terrain: Terrain) {
    this.group.name = 'logistics';
    this.preview = this.makeLine([], COLORS.ok, true, 0.95);
    this.preview.visible = false;
    this.preview.renderOrder = 6;
    this.target = this.makeLine([], COLORS.route, true, 0.8);
    this.target.visible = false;
    this.group.add(this.preview, this.target);
  }

  /** Shows the dragged line from `from` to `to` (green when it can be built, red when not). */
  showPreview(from: LatLon, to: LatLon, valid: boolean): void {
    this.setLine(this.preview, this.arc(from, to, 0.3));
    (this.preview.material as THREE.LineDashedMaterial).color.copy(valid ? COLORS.ok : COLORS.bad);
    this.preview.visible = true;
  }

  hidePreview(): void {
    this.preview.visible = false;
  }

  update(altitude: number, camera: THREE.Vector3): void {
    const s = gameStore.getState();
    const t = performance.now() / 1000;
    this.syncPipes(s.pipelines);
    for (const p of s.pipelines) {
      const v = this.pipes.get(p.id);
      if (!v) continue;
      const n = v.line.geometry.getAttribute('position').count;
      const done = Math.max(2, Math.round(p.progress * (n - 1)) + 1);
      v.line.geometry.setDrawRange(0, done);
      v.rest.visible = p.progress < 1 && altitude >= LINE_MIN_ALT;
      v.line.visible = altitude >= LINE_MIN_ALT;
      (v.line.material as THREE.LineBasicMaterial).color.copy(p.progress < 1 ? COLORS.building : p.faults.length ? COLORS.bad : p.working ? COLORS.working : COLORS.idle);
      v.tube?.geometry.setDrawRange(0, Math.round((v.tubeCount * p.progress) / 6) * 6);
      if (v.modules) this.updateModules(v.modules, p, altitude, camera, t);
    }

    // The selected garage's route, while its panel is open.
    const g = s.selectedBuildingId ? s.buildings.find((x) => x.id === s.selectedBuildingId) : undefined;
    const to = g?.type === 'cargo_garage' && g.target ? s.otherBases.find((b) => b.id === g.target) : undefined;
    const key = g && to ? `${g.id}>${to.id}` : '';
    if (key !== this.targetKey) {
      this.targetKey = key;
      if (g && to) this.setLine(this.target, this.arc(Logistics.spotOf(s.base, g), to, 0.3));
    }
    this.target.visible = !!key && !this.preview.visible;
  }

  // ---------------------------------------------------------------- pipelines

  private syncPipes(list: Pipeline[]): void {
    const s = gameStore.getState();
    const last = this.synced;
    if (last && last.pipelines === list && last.buildings === s.buildings && last.base === s.base && last.otherBases === s.otherBases) return;
    this.synced = { pipelines: list, buildings: s.buildings, base: s.base, otherBases: s.otherBases };
    const bases = Logistics.allBases(s);
    const seen = new Set<string>();
    for (const p of list) {
      const a = bases.find((b) => b.id === p.fromBaseId);
      const b = bases.find((x) => x.id === p.toBaseId);
      if (!a || !b) continue;
      seen.add(p.id);
      const from = Logistics.pumpSpot(a);
      const to = Logistics.pumpSpot(b);
      const key = `${from.lat.toFixed(4)},${from.lon.toFixed(4)}>${to.lat.toFixed(4)},${to.lon.toFixed(4)}`;
      const old = this.pipes.get(p.id);
      if (old?.key === key) continue;
      if (old) this.disposePipe(old);
      this.pipes.set(p.id, this.buildPipe(from, to, key));
    }
    for (const [id, v] of this.pipes) {
      if (seen.has(id)) continue;
      this.disposePipe(v);
      this.pipes.delete(id);
    }
  }

  private buildPipe(from: LatLon, to: LatLon, key: string): PipeViz {
    const pts = this.pipePoints(from, to);
    const line = this.makeLine(pts, COLORS.working, false, 0.95);
    const rest = this.makeLine(pts, COLORS.building, true, 0.45);
    this.group.add(line, rest);
    const modules = this.buildModules(from, to);
    if (modules) {
      this.group.add(modules.group);
      return { key, line, rest, tube: null, tubeCount: 0, modules };
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, pts.length * 2, PIPE_RADIUS, 6, false);
    const tube = new THREE.Mesh(tubeGeo, this.tubeMat);
    tube.castShadow = true;
    this.group.add(tube);
    return { key, line, rest, tube, tubeCount: tubeGeo.index?.count ?? 0, modules: null };
  }

  /** Points along the great circle, low near both bases and higher in between. */
  private pipePoints(from: LatLon, to: LatLon): THREE.Vector3[] {
    const total = angularDistance(from.lat, from.lon, to.lat, to.lon) * MARS_RADIUS_KM;
    const n = THREE.MathUtils.clamp(Math.round(total / 3), 96, 700);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      greatCirclePoint(from.lat, from.lon, to.lat, to.lon, f, this.ll);
      const fromEnd = Math.min(f, 1 - f) * total;
      const lift = THREE.MathUtils.lerp(NEAR_LIFT, FAR_LIFT, THREE.MathUtils.smoothstep(fromEnd, RISE_KM[0], RISE_KM[1]));
      pts.push(this.terrain.surfacePoint(this.ll.lat, this.ll.lon, lift));
    }
    return pts;
  }

  private disposePipe(v: PipeViz): void {
    this.group.remove(v.line, v.rest);
    for (const o of [v.line, v.rest]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    if (v.tube) {
      this.group.remove(v.tube);
      v.tube.geometry.dispose();
    }
    if (v.modules) {
      this.group.remove(v.modules.group);
      // Geometry is shared by every pipeline; only the instance buffers and glow copies are ours.
      for (const set of [v.modules.span, v.modules.support, v.modules.expansion, v.modules.buckled]) set.meshes[0]?.dispose();
      for (const m of [...v.modules.status, ...v.modules.alarm]) m.dispose();
    }
  }

  // ---------------------------------------------------------------- detailed modules

  /** Lays the zigzag route on the ground and works out every module's matrix (null if the models are missing). */
  private buildModules(from: LatLon, to: LatLon): ModuleViz | null {
    const span = pipeModelParts('pipe_span');
    const support = pipeModelParts('pipe_support');
    const expansion = pipeModelParts('pipe_expansion');
    const buckled = pipeModelParts('pipe_buckled');
    if (!span || !support || !expansion || !buckled) return null;

    const totalUnits = angularDistance(from.lat, from.lon, to.lat, to.lon) * R;
    const n = THREE.MathUtils.clamp(Math.round(totalUnits / (SPAN_LEN * MODEL_SCALE)), 4, 4000);
    // Straight great-circle points first, then pushed sideways into the zigzag.
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      greatCirclePoint(from.lat, from.lon, to.lat, to.lon, i / n, this.ll);
      dirs.push(latLonToDir(this.ll.lat, this.ll.lon));
    }
    const ground: THREE.Vector3[] = [];
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    const moved = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const d = dirs[i];
      tangent.subVectors(dirs[Math.min(n, i + 1)], dirs[Math.max(0, i - 1)]);
      side.crossVectors(tangent, d).normalize();
      // Straight out of the pump stations, zigzag once clear of them.
      const ends = THREE.MathUtils.smoothstep(Math.min(i, n - i), 1, 4);
      moved.copy(d).multiplyScalar(R).addScaledVector(side, ZIG[i % ZIG.length] * ZIG_AMP * ends);
      dirToLatLon(moved, this.ll);
      ground.push(this.terrain.surfacePoint(this.ll.lat, this.ll.lon, 0));
    }

    const spanM = new Float32Array(n * 16);
    const vertM = new Float32Array((n + 1) * 16);
    const verts = new Float32Array((n + 1) * 3);
    const m = new THREE.Matrix4();
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    const z = new THREE.Vector3();
    const up = new THREE.Vector3();
    const along = new THREE.Vector3();
    /** Model +X along `dir`, +Y towards `upDir`, X stretched by `sx`. */
    const place = (dir: THREE.Vector3, upDir: THREE.Vector3, sx: number, at: THREE.Vector3) => {
      x.copy(dir).normalize();
      y.copy(upDir).addScaledVector(x, -upDir.dot(x)).normalize();
      z.crossVectors(x, y);
      m.makeBasis(x.multiplyScalar(sx), y.multiplyScalar(MODEL_SCALE), z.multiplyScalar(MODEL_SCALE)).setPosition(at);
    };
    for (let i = 0; i < n; i++) {
      along.subVectors(ground[i + 1], ground[i]);
      up.addVectors(ground[i], ground[i + 1]).normalize();
      place(along, up, along.length() / SPAN_LEN, ground[i]);
      m.toArray(spanM, i * 16);
    }
    for (let i = 0; i <= n; i++) {
      along.subVectors(ground[Math.min(n, i + 1)], ground[Math.max(0, i - 1)]);
      up.copy(ground[i]).normalize();
      place(along, up, MODEL_SCALE, ground[i]);
      m.toArray(vertM, i * 16);
      ground[i].toArray(verts, i * 3);
    }

    const group = new THREE.Group();
    group.name = 'pipeline-modules';
    const status: THREE.MeshStandardMaterial[] = [];
    const alarm: THREE.MeshStandardMaterial[] = [];
    const makeSet = (parts: PipePart[], cap: number): ModuleSet => {
      let matrix: THREE.InstancedBufferAttribute | null = null;
      const meshes = parts.map((part) => {
        let mat = part.material;
        if (mat.name === 'pipe_status' || mat.name === 'pipe_alarm') {
          mat = mat.clone();
          (mat.name === 'pipe_status' ? status : alarm).push(mat);
        }
        const mesh = new THREE.InstancedMesh(part.geometry, mat, cap);
        if (matrix) mesh.instanceMatrix = matrix;
        else matrix = mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      });
      return { meshes, matrix: matrix! };
    };
    const cap = Math.min(n + 1, WINDOW_MAX + 2);
    return {
      group,
      n,
      spanM,
      vertM,
      verts,
      span: makeSet(span, cap),
      support: makeSet(support, cap),
      expansion: makeSet(expansion, cap),
      buckled: makeSet(buckled, BUCKLED_MAX),
      status,
      alarm,
      windowKey: '',
      faultsFor: null,
      faultSpans: new Set(),
    };
  }

  /** Shows the built stretch near the camera, the twisted spans, and the flow glow. */
  private updateModules(v: ModuleViz, p: Pipeline, altitude: number, camera: THREE.Vector3, t: number): void {
    v.group.visible = altitude < LINE_MIN_ALT;
    if (!v.group.visible) return;
    const built = Math.floor(p.progress * v.n + 1e-6);
    // The stretch near the camera (a great circle meets a ball in one piece).
    const r = THREE.MathUtils.clamp(altitude * 5 + 0.6, 0.8, 12);
    const r2 = r * r;
    let i0 = -1;
    let i1 = -1;
    let best = Infinity;
    let bi = 0;
    for (let i = 0; i <= v.n; i++) {
      const dx = v.verts[i * 3] - camera.x;
      const dy = v.verts[i * 3 + 1] - camera.y;
      const dz = v.verts[i * 3 + 2] - camera.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) {
        best = d;
        bi = i;
      }
      if (d > r2) continue;
      if (i0 < 0) i0 = i;
      i1 = i;
    }
    if (i0 < 0) i0 = i1 = bi;
    if (i1 - i0 > WINDOW_MAX) {
      i0 = Math.max(i0, bi - WINDOW_MAX / 2);
      i1 = Math.min(i1, i0 + WINDOW_MAX);
    }
    i1 = Math.min(i1, built);
    if (v.faultsFor !== p.faults) {
      v.faultsFor = p.faults;
      const spans = new Set(p.faults.map((f) => THREE.MathUtils.clamp(Math.floor(f.at * v.n), 1, v.n - 2)));
      if (spans.size !== v.faultSpans.size || [...spans].some((i) => !v.faultSpans.has(i))) {
        v.faultSpans = spans;
        v.windowKey = ''; // force a refill
      }
    }
    const key = `${i0}|${i1}`;
    if (key !== v.windowKey) {
      v.windowKey = key;
      this.fillModules(v, i0, i1, built, v.faultSpans);
    }

    // Flow glow: amber while being laid, a cyan pulse while pumping, dim grey when stopped.
    const col = p.progress < 1 ? COLORS.building : p.working ? COLORS.working : COLORS.idle;
    const glow = p.working ? 1.6 + Math.sin(t * 3) * 0.9 : p.progress < 1 ? 1.4 : 0.25;
    for (const mat of v.status) {
      mat.emissive.copy(col);
      mat.emissiveIntensity = glow;
    }
    for (const mat of v.alarm) mat.emissiveIntensity = 1.2 + Math.max(0, Math.sin(t * 6)) * 2.2;
  }

  private fillModules(v: ModuleViz, i0: number, i1: number, built: number, faults: Set<number>): void {
    const counts = { span: 0, support: 0, expansion: 0, buckled: 0 };
    const put = (set: ModuleSet, k: keyof typeof counts, src: Float32Array, i: number) => {
      (set.matrix.array as Float32Array).set(src.subarray(i * 16, i * 16 + 16), counts[k]++ * 16);
    };
    for (let i = i0; i < i1; i++) if (!faults.has(i)) put(v.span, 'span', v.spanM, i);
    for (let i = Math.max(1, i0); i <= Math.min(i1, v.n - 1); i++) {
      if (isExpansion(i)) put(v.expansion, 'expansion', v.vertM, i);
      else put(v.support, 'support', v.vertM, i);
    }
    // Twisted spans show wherever they are on the built pipe (there are only a few).
    for (const i of faults) if (i < built && counts.buckled < BUCKLED_MAX) put(v.buckled, 'buckled', v.spanM, i);
    for (const k of Object.keys(counts) as (keyof typeof counts)[]) {
      const set = v[k];
      for (const mesh of set.meshes) mesh.count = counts[k];
      set.matrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- lines

  private arc(from: LatLon, to: LatLon, lift: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const n = 96;
    for (let i = 0; i < n; i++) {
      greatCirclePoint(from.lat, from.lon, to.lat, to.lon, i / (n - 1), this.ll);
      pts.push(this.terrain.surfacePoint(this.ll.lat, this.ll.lon, lift));
    }
    return pts;
  }

  private makeLine(pts: THREE.Vector3[], color: THREE.Color, dashed: boolean, opacity: number): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.9, gapSize: 0.6, transparent: true, opacity, depthWrite: false })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, material);
    if (dashed) line.computeLineDistances();
    return line;
  }

  private setLine(line: THREE.Line, pts: THREE.Vector3[]): void {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    if (line.material instanceof THREE.LineDashedMaterial) line.computeLineDistances();
  }
}
