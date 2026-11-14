import * as THREE from 'three';
import { gameStore } from '../state/gameStore';
import { Logistics } from '../simulation/Logistics';
import type { Pipeline } from '../state/types';
import type { Terrain } from './Terrain';
import { angularDistance, greatCirclePoint, MARS_RADIUS_KM, type LatLon } from './geo';

/** Height of the pipe above the ground: on low stilts near the bases, higher out on the plains so hills don't hide it. */
const NEAR_LIFT = 0.012;
const FAR_LIFT = 0.22;
/** Km from a base over which the pipe rises from NEAR_LIFT to FAR_LIFT. */
const RISE_KM = [12, 45] as const;
const PIPE_RADIUS = 0.0045;
/** The thin map line is only drawn from this far out (the 3D pipe is too thin to see there). */
const LINE_MIN_ALT = 2.5;

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
  tube: THREE.Mesh;
  /** Tube index count for the whole pipe (drawn up to the construction progress). */
  tubeCount: number;
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

  update(altitude: number): void {
    const s = gameStore.getState();
    this.syncPipes(s.pipelines);
    for (const p of s.pipelines) {
      const v = this.pipes.get(p.id);
      if (!v) continue;
      const n = v.line.geometry.getAttribute('position').count;
      const done = Math.max(2, Math.round(p.progress * (n - 1)) + 1);
      v.line.geometry.setDrawRange(0, done);
      v.rest.visible = p.progress < 1 && altitude >= LINE_MIN_ALT;
      v.line.visible = altitude >= LINE_MIN_ALT;
      (v.line.material as THREE.LineBasicMaterial).color.copy(p.progress < 1 ? COLORS.building : p.working ? COLORS.working : COLORS.idle);
      v.tube.geometry.setDrawRange(0, Math.round((v.tubeCount * p.progress) / 6) * 6);
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
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, pts.length * 2, PIPE_RADIUS, 6, false);
    const tube = new THREE.Mesh(tubeGeo, this.tubeMat);
    tube.castShadow = true;
    this.group.add(tube, line, rest);
    return { key, line, rest, tube, tubeCount: tubeGeo.index?.count ?? 0 };
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
    this.group.remove(v.line, v.rest, v.tube);
    for (const o of [v.line, v.rest]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    v.tube.geometry.dispose();
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
