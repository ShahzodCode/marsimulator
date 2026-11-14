import * as THREE from 'three';
import { SETTLEMENT } from '../data/settlement';
import { HOME_BASE_ID } from '../simulation/MissionManager';
import { OUTPOST } from '../data/missions';
import { MissionManager } from '../simulation/MissionManager';
import { gameStore, regionManager } from '../state/gameStore';
import type { Expedition, OrbitalScan, Outpost, Shipment } from '../state/types';
import { Logistics } from '../simulation/Logistics';
import type { Terrain } from './Terrain';
import { greatCirclePoint, latLonToDir, R, type LatLon } from './geo';
import { instantiateVehicleModel } from '../settlement/buildings/glbModels';

/** Size of a rover on screen: a fraction of the camera's height, so it stays readable at any zoom. */
const SIZE_PER_ALT = 0.022;
const MIN_SIZE = 0.012;
const MAX_SIZE = 6;
const ROUTE_POINTS = 128;
const ROUTE_LIFT = 0.25;
/** Scene units per km on the surface (planet radius R = 3389.5 km). */
const KM_UNITS = R / 3389.5;
/** Visual orbit (not to scale): MRO really flies about 250–320 km up. */
const ORBIT_RADIUS = R + 16;
/** Visual orbits per real second. */
const ORBIT_SPEED = 0.05;

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, ...extra });

const MATERIALS = {
  hull: mat('#e9edf2'),
  cargoHull: mat('#f0a443'),
  chassis: mat('#b8913c', { metalness: 0.5 }),
  window: mat('#1d3550', { roughness: 0.2, metalness: 0.4, emissive: '#0d2236' }),
  panel: mat('#1f3f8a', { roughness: 0.35, metalness: 0.3, emissive: '#081633' }),
  tyre: mat('#2a2a2e', { roughness: 0.9 }),
  gold: mat('#d9a93d', { metalness: 0.7, roughness: 0.35 }),
  dome: mat('#f4f1ea'),
  beacon: new THREE.MeshBasicMaterial({ color: '#ffb03d' }),
};

/** The Blender rover (blender/crew_rover.py) if it loaded, else the simple one. One unit long, +X forward, +Y up. */
function rover(cargo: boolean): THREE.Group {
  return instantiateVehicleModel(cargo ? 'cargo_rover' : 'crew_rover') ?? buildRover(cargo);
}

/**
 * A pressurized crew rover built from simple shapes (after NASA's Space Exploration
 * Vehicle concept: a white cabin with big windows on a six-wheel chassis). One unit long,
 * +X forward, +Y up.
 */
function buildRover(cargo: boolean): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(1, 0.1, 0.56), MATERIALS.chassis, 0, 0.17, 0);
  add(new THREE.BoxGeometry(cargo ? 0.55 : 0.72, 0.36, 0.5), cargo ? MATERIALS.cargoHull : MATERIALS.hull, cargo ? -0.18 : -0.05, 0.4, 0);
  if (cargo) add(new THREE.BoxGeometry(0.32, 0.3, 0.46), MATERIALS.hull, 0.3, 0.37, 0);
  else add(new THREE.BoxGeometry(0.06, 0.2, 0.42), MATERIALS.window, 0.32, 0.45, 0);
  add(new THREE.BoxGeometry(0.8, 0.025, 0.66), MATERIALS.panel, -0.08, 0.61, 0);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.3), MATERIALS.gold, -0.36, 0.76, 0.18);
  add(new THREE.BoxGeometry(0.06, 0.05, 0.08), MATERIALS.gold, -0.36, 0.92, 0.18);
  const wheel = new THREE.CylinderGeometry(0.12, 0.12, 0.09, 14);
  wheel.rotateX(Math.PI / 2);
  for (const x of [-0.36, 0, 0.36]) for (const z of [-0.31, 0.31]) add(wheel, MATERIALS.tyre, x, 0.12, z);
  return g;
}

/** A small orbiter with two solar wings (MRO-like, not to scale). */
function buildOrbiter(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.7), MATERIALS.gold));
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.5), MATERIALS.panel);
    wing.position.x = s * 0.9;
    g.add(wing);
  }
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.1, 0.12, 16), MATERIALS.hull);
  dish.position.y = 0.32;
  g.add(dish);
  return g;
}

/** A remote outpost: a habitat dome on a landing pad, with a beacon light. */
function buildOutpost(): THREE.Group {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.06, 24), MATERIALS.chassis);
  pad.position.y = 0.03;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MATERIALS.dome);
  dome.position.y = 0.06;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), MATERIALS.gold);
  mast.position.set(0.6, 0.5, 0);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), MATERIALS.beacon);
  beacon.position.set(0.6, 0.98, 0);
  g.add(pad, dome, mast, beacon);
  return g;
}

interface RouteViz {
  route: THREE.Line;
  trail: THREE.Line;
  rover: THREE.Group;
  /** Cargo rovers following a founding convoy. */
  convoy: THREE.Group[];
}

/** Rovers a founding convoy needs for its kit (SEV payload each, see MissionManager.foundingKit). */
function convoySize(m: Expedition): number {
  const kg = Object.values(m.supplies).reduce((a, b) => a + (b ?? 0), 0);
  return Math.min(4, Math.max(1, Math.ceil(kg / OUTPOST.cargoPayloadKg)));
}

/**
 * Everything that moves on (and around) the globe during exploration, drawn in 3D:
 * crew rovers driving their routes, the orbiter mapping a region, outposts and their
 * cargo rovers. Purely visual: it reads the store and never changes it.
 */
export class RoverFleet {
  readonly group = new THREE.Group();
  private expeditions = new Map<string, RouteViz>();
  private outposts = new Map<string, { site: THREE.Group; cargo: THREE.Group; route: THREE.Line }>();
  private shipments = new Map<string, { haulers: THREE.Group[]; route: THREE.Line }>();
  private orbiter = buildOrbiter();
  private orbitRing: THREE.LineLoop;
  private beam: THREE.Line;
  private scanRegion: string | null = null;
  private readonly ll: LatLon = { lat: 0, lon: 0 };
  private readonly ll2: LatLon = { lat: 0, lon: 0 };
  private readonly up = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly m4 = new THREE.Matrix4();
  private size = 1;
  private orbitAngle = 0;

  constructor(private terrain: Terrain) {
    this.orbiter.visible = false;
    this.orbitRing = new THREE.LineLoop(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(128 * 3), 3)),
      new THREE.LineBasicMaterial({ color: '#5fe3ff', transparent: true, opacity: 0.35 }),
    );
    this.orbitRing.visible = false;
    this.beam = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3)),
      new THREE.LineBasicMaterial({ color: '#5fe3ff', transparent: true, opacity: 0.7 }),
    );
    this.beam.visible = false;
    this.group.add(this.orbiter, this.orbitRing, this.beam);
  }

  update(dt: number, altitude: number): void {
    const s = gameStore.getState();
    this.size = THREE.MathUtils.clamp(altitude * SIZE_PER_ALT, MIN_SIZE, MAX_SIZE);
    this.updateExpeditions(s.missions.filter((m): m is Expedition => m.type === 'expedition' && m.status === 'active'));
    this.updateOrbiter(s.missions.find((m): m is OrbitalScan => m.type === 'orbital' && m.status === 'active'), dt, s.paused ? 0 : s.speed);
    this.updateOutposts(s.outposts, s.timeSols);
    this.updateShipments(s.shipments);
  }

  // ---------------------------------------------------------------- cargo haulers

  /** Hauler convoys between bases, one behind the other, facing the way they drive. */
  private updateShipments(list: Shipment[]): void {
    const seen = new Set<string>();
    for (const sh of list) {
      seen.add(sh.id);
      let v = this.shipments.get(sh.id);
      if (!v) {
        v = { haulers: Array.from({ length: sh.haulers }, () => rover(true)), route: this.routeLine(sh.from, sh.to, '#f0a443', true) };
        (v.route.material as THREE.LineDashedMaterial).opacity = 0.5;
        this.group.add(v.route, ...v.haulers);
        this.shipments.set(sh.id, v);
      }
      const f = Logistics.routeFraction(sh);
      const dir = sh.delivered ? -1 : 1;
      const gap = (this.size * 1.6) / Math.max(1, sh.routeKm * KM_UNITS);
      v.haulers.forEach((h, i) => this.place(h, sh.from, sh.to, THREE.MathUtils.clamp(f - dir * gap * i, 0, 1), dir));
    }
    for (const [id, v] of this.shipments) {
      if (seen.has(id)) continue;
      this.dispose(v.route, ...v.haulers);
      this.shipments.delete(id);
    }
  }

  // ---------------------------------------------------------------- crew rovers

  private updateExpeditions(active: Expedition[]): void {
    const seen = new Set<string>();
    for (const m of active) {
      seen.add(m.id);
      let v = this.expeditions.get(m.id);
      if (!v) {
        const e = MissionManager.ends(m, regionManager);
        const color = m.found ? '#6dff8a' : '#5fe3ff';
        v = {
          route: this.routeLine(e.from, e.to, color, true),
          trail: this.routeLine(e.from, e.to, '#ffb03d', false),
          rover: rover(false),
          convoy: m.found ? Array.from({ length: convoySize(m) }, () => rover(true)) : [],
        };
        this.group.add(v.route, v.trail, v.rover, ...v.convoy);
        this.expeditions.set(m.id, v);
      }
      const e = MissionManager.ends(m, regionManager);
      const f = MissionManager.routeFraction(m);
      const reached = m.arrived ? 1 : f;
      v.trail.geometry.setDrawRange(0, Math.max(0, Math.round(reached * (ROUTE_POINTS - 1)) + 1));
      // Facing the way it drives: towards the site, then back home.
      this.place(v.rover, e.from, e.to, f, m.arrived ? -1 : 1);
      // Cargo rovers follow the crew rover, a few rover-lengths apart.
      const gap = (this.size * 1.6) / Math.max(1, m.routeKm * KM_UNITS);
      v.convoy.forEach((c, i) => this.place(c, e.from, e.to, Math.max(0, f - gap * (i + 1)), 1));
    }
    for (const [id, v] of this.expeditions) {
      if (seen.has(id)) continue;
      this.dispose(v.route, v.trail, v.rover, ...v.convoy);
      this.expeditions.delete(id);
    }
  }

  /** A line from a base to a site, draped over the terrain. */
  private routeLine(from: LatLon, site: LatLon, color: string, dashed: boolean): THREE.Line {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < ROUTE_POINTS; i++) {
      greatCirclePoint(from.lat, from.lon, site.lat, site.lon, i / (ROUTE_POINTS - 1), this.ll);
      pts.push(this.terrain.surfacePoint(this.ll.lat, this.ll.lon, ROUTE_LIFT));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.75 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geo, material);
    if (dashed) line.computeLineDistances();
    return line;
  }

  /** Puts a model on the surface at route fraction `f`, facing along the route (`dir` = +1 out, −1 back). */
  private place(obj: THREE.Object3D, from: LatLon, to: LatLon, f: number, dir: number): void {
    const p = MissionManager.pointBetween(from, to, f, this.ll);
    this.terrain.surfacePoint(p.lat, p.lon, 0, this.pos);
    latLonToDir(p.lat, p.lon, this.up);
    // Look a little ahead; at the end of the route, look behind instead and flip.
    const step = THREE.MathUtils.clamp(f + dir * 0.01, 0, 1) === f ? -dir * 0.01 : dir * 0.01;
    const q = MissionManager.pointBetween(from, to, f + step, this.ll2);
    this.terrain.surfacePoint(q.lat, q.lon, 0, this.ahead);
    this.fwd.subVectors(this.ahead, this.pos);
    if (Math.sign(step) !== Math.sign(dir)) this.fwd.negate();
    this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up)).normalize();
    this.side.crossVectors(this.fwd, this.up).normalize();
    this.m4.makeBasis(this.fwd, this.up, this.side);
    obj.quaternion.setFromRotationMatrix(this.m4);
    obj.position.copy(this.pos);
    obj.scale.setScalar(this.size);
  }

  // ---------------------------------------------------------------- orbiter

  private updateOrbiter(scan: OrbitalScan | undefined, dt: number, speed: number): void {
    const on = !!scan;
    this.orbiter.visible = this.orbitRing.visible = this.beam.visible = on;
    if (!scan) {
      this.scanRegion = null;
      return;
    }
    const c = regionManager.center(scan.regionId);
    const east = latLonToDir(0, c.lon, new THREE.Vector3());
    const north = new THREE.Vector3(0, 1, 0);
    if (this.scanRegion !== scan.regionId) {
      // A polar orbit whose ground track crosses the region's centre.
      this.scanRegion = scan.regionId;
      this.orbitAngle = c.lat * (Math.PI / 180) - 0.6;
      const arr = this.orbitRing.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < arr.count; i++) {
        const a = (i / arr.count) * Math.PI * 2;
        this.pos.copy(east).multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a)).multiplyScalar(ORBIT_RADIUS);
        arr.setXYZ(i, this.pos.x, this.pos.y, this.pos.z);
      }
      arr.needsUpdate = true;
    }
    this.orbitAngle += dt * ORBIT_SPEED * Math.PI * 2 * Math.max(1, speed);
    this.up.copy(east).multiplyScalar(Math.cos(this.orbitAngle)).addScaledVector(north, Math.sin(this.orbitAngle));
    this.orbiter.position.copy(this.up).multiplyScalar(ORBIT_RADIUS);
    // Velocity direction (along the orbit) and the camera pointing down at Mars.
    this.fwd.copy(east).multiplyScalar(-Math.sin(this.orbitAngle)).addScaledVector(north, Math.cos(this.orbitAngle));
    this.side.crossVectors(this.fwd, this.up).normalize();
    this.m4.makeBasis(this.side, this.up, this.fwd);
    this.orbiter.quaternion.setFromRotationMatrix(this.m4);
    this.orbiter.scale.setScalar(Math.max(0.4, this.size * 0.8));
    const beam = this.beam.geometry.getAttribute('position') as THREE.BufferAttribute;
    const ground = this.pos.copy(this.up).multiplyScalar(R);
    beam.setXYZ(0, this.orbiter.position.x, this.orbiter.position.y, this.orbiter.position.z);
    beam.setXYZ(1, ground.x, ground.y, ground.z);
    beam.needsUpdate = true;
  }

  // ---------------------------------------------------------------- outposts

  private updateOutposts(list: Outpost[], timeSols: number): void {
    const seen = new Set<string>();
    const st = gameStore.getState();
    for (const o of list) {
      seen.add(o.id);
      const id = o.baseId ?? HOME_BASE_ID;
      const b = st.base.id === id ? st.base : (st.otherBases.find((x) => x.id === id) ?? { lat: SETTLEMENT.lat, lon: SETTLEMENT.lon });
      const from: LatLon = { lat: b.lat, lon: b.lon };
      const to = MissionManager.site(regionManager, o.regionId);
      let v = this.outposts.get(o.id);
      if (!v) {
        v = { site: buildOutpost(), cargo: rover(true), route: this.routeLine(from, to, '#f0a443', true) };
        (v.route.material as THREE.LineDashedMaterial).opacity = 0.4;
        this.group.add(v.site, v.cargo, v.route);
        this.outposts.set(o.id, v);
      }
      this.place(v.site, from, to, 1, 1);
      v.site.visible = timeSols >= o.readySol - OUTPOST.setupSols;
      const oneWay = o.tripSols / 2;
      let f: number;
      let dir = 1;
      if (timeSols < o.readySol - OUTPOST.setupSols) {
        // Driving the kit out.
        f = 1 - (o.readySol - OUTPOST.setupSols - timeSols) / oneWay;
      } else if (timeSols < o.readySol) {
        f = 1;
      } else {
        const p = (((timeSols - o.lastTripSol) / o.tripSols) % 1 + 1) % 1;
        f = p < 0.5 ? p * 2 : 2 - p * 2;
        dir = p < 0.5 ? 1 : -1;
      }
      v.cargo.visible = o.reserveLeft > 0 || timeSols < o.readySol;
      this.place(v.cargo, from, to, THREE.MathUtils.clamp(f, 0, 1), dir);
    }
    for (const [id, v] of this.outposts) {
      if (seen.has(id)) continue;
      this.dispose(v.site, v.cargo, v.route);
      this.outposts.delete(id);
    }
  }

  private dispose(...objs: THREE.Object3D[]): void {
    for (const o of objs) {
      this.group.remove(o);
      // Rover and outpost meshes share their materials; route lines own theirs.
      // Blender models share their geometry with the cached original, so it stays.
      o.traverse((c) => {
        if ((c instanceof THREE.Mesh || c instanceof THREE.Line) && !c.userData.sharedGeometry) c.geometry.dispose();
      });
      if (o instanceof THREE.Line) (o.material as THREE.Material).dispose();
    }
  }
}
