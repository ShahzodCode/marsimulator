import * as THREE from 'three';
import { DEG, R, angularDistance, dirToLatLon, latLonToDir, tangentFrame, wrapLon, type LatLon } from './geo';
import type { Terrain } from './Terrain';
import { SETTLEMENT } from '../data/settlement';

export interface SurfaceHit {
  lat: number;
  lon: number;
  point: THREE.Vector3;
}

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromAlt: number;
  toAlt: number;
  bump: number;
  t: number;
  duration: number;
}

/**
 * Top-down orbital camera for a spherical planet.
 *
 * The camera is described by the surface point it hovers over (lat / lon), its altitude
 * above the local terrain and a heading. It ALWAYS looks straight down at the planet
 * centre (nadir), so it can never tilt toward the horizon or become first-person.
 * All motion is smoothed with exponential damping or eased flights.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;

  lat = SETTLEMENT.lat;
  lon = SETTLEMENT.lon;
  alt = 240;
  heading = 0;

  private tLat = this.lat;
  private tLon = this.lon;
  private tAlt = this.alt;
  private tHeading = 0;
  private ground = 0;
  private flight: Flight | null = null;

  readonly minAltitude = 0.1;
  readonly maxAltitude = 300;

  private readonly up = new THREE.Vector3();
  private readonly east = new THREE.Vector3();
  private readonly north = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly ll: LatLon = { lat: 0, lon: 0 };

  constructor(
    private terrain: Terrain,
    private dom: HTMLElement,
  ) {
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 3000);
    this.ground = terrain.heightUnits(this.lat, this.lon);
    this.apply();
  }

  /** Smallest allowed altitude here: close zoom is only allowed around the settlement. */
  minAltitudeAt(lat: number, lon: number): number {
    const d = angularDistance(lat, lon, SETTLEMENT.lat, SETTLEMENT.lon) * R;
    return THREE.MathUtils.lerp(this.minAltitude, 2.2, THREE.MathUtils.smoothstep(d, 1.6, 4.5));
  }

  get targetAltitude(): number {
    return this.tAlt;
  }

  update(dt: number): void {
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      this.tmp.copy(f.from).lerp(f.to, e).normalize();
      if (this.tmp.lengthSq() < 1e-6) this.tmp.copy(f.to);
      dirToLatLon(this.tmp, this.ll);
      this.lat = this.tLat = this.ll.lat;
      this.lon = this.tLon = this.ll.lon;
      const logA = Math.log(f.fromAlt) + (Math.log(f.toAlt) - Math.log(f.fromAlt)) * e;
      this.alt = this.tAlt = Math.exp(logA) + f.bump * Math.sin(Math.PI * e);
      if (f.t >= 1) this.flight = null;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      this.tLat = THREE.MathUtils.clamp(this.tLat, -85, 85);
      this.tAlt = THREE.MathUtils.clamp(this.tAlt, this.minAltitudeAt(this.tLat, this.tLon), this.maxAltitude);
      this.lat += (this.tLat - this.lat) * k;
      this.lon = wrapLon(this.lon + wrapLon(this.tLon - this.lon) * k);
      this.alt = Math.exp(Math.log(this.alt) + (Math.log(this.tAlt) - Math.log(this.alt)) * k);
    }
    const kh = 1 - Math.exp(-dt * 8);
    this.heading += angleDelta(this.heading, this.tHeading) * kh;
    const g = this.terrain.heightUnits(this.lat, this.lon);
    this.ground += (g - this.ground) * (1 - Math.exp(-dt * 5));
    this.apply();
  }

  private apply(): void {
    tangentFrame(this.lat, this.lon, this.up, this.east, this.north);
    const r = R + this.ground + this.alt;
    this.camera.position.copy(this.up).multiplyScalar(r);
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    this.camera.up.copy(this.north).multiplyScalar(c).addScaledVector(this.east, s);
    this.camera.lookAt(0, 0, 0);
    const near = THREE.MathUtils.clamp(this.alt * 0.05, 0.004, 40);
    if (Math.abs(near - this.camera.near) / this.camera.near > 0.02) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Move the view so the ground follows the pointer (pixels, screen space). */
  panPixels(dx: number, dy: number): void {
    this.flight = null;
    const h = this.dom.clientHeight || 1;
    const upp = (2 * this.alt * Math.tan((this.camera.fov * DEG) / 2)) / h;
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const dEast = (-dx * c + dy * s) * upp;
    const dNorth = (dx * s + dy * c) * upp;
    this.tLat = THREE.MathUtils.clamp(this.tLat + (dNorth / R) / DEG, -85, 85);
    const cl = Math.max(0.05, Math.cos(this.tLat * DEG));
    this.tLon = wrapLon(this.tLon + (dEast / (R * cl)) / DEG);
  }

  /** Zoom by a factor, keeping the point under the cursor roughly fixed. */
  zoomAt(factor: number, clientX?: number, clientY?: number): void {
    this.flight = null;
    const minA = this.minAltitudeAt(this.tLat, this.tLon);
    const newAlt = THREE.MathUtils.clamp(this.tAlt * factor, minA, this.maxAltitude);
    if (clientX !== undefined && clientY !== undefined && newAlt < this.tAlt) {
      const hit = this.pickSurface(clientX, clientY);
      if (hit) {
        const frac = 1 - newAlt / this.tAlt;
        latLonToDir(this.tLat, this.tLon, this.tmp);
        latLonToDir(hit.lat, hit.lon, this.tmp2);
        this.tmp.lerp(this.tmp2, frac).normalize();
        dirToLatLon(this.tmp, this.ll);
        this.tLat = this.ll.lat;
        this.tLon = this.ll.lon;
      }
    }
    this.tAlt = newAlt;
  }

  rotate(delta: number): void {
    this.tHeading += delta;
  }

  resetHeading(): void {
    this.tHeading = Math.round(this.tHeading / (Math.PI * 2)) * Math.PI * 2;
  }

  /** Smooth eased flight to a location (arcs outward for long trips). */
  flyTo(lat: number, lon: number, alt = this.tAlt, duration?: number): void {
    const from = latLonToDir(this.lat, this.lon, new THREE.Vector3());
    const to = latLonToDir(lat, lon, new THREE.Vector3());
    const ang = from.angleTo(to);
    const toAlt = THREE.MathUtils.clamp(alt, this.minAltitudeAt(lat, lon), this.maxAltitude);
    const bump = Math.max(0, ang * R * 0.9 - Math.max(this.alt, toAlt) * 0.6);
    this.flight = {
      from,
      to,
      fromAlt: this.alt,
      toAlt,
      bump,
      t: 0,
      duration: duration ?? THREE.MathUtils.clamp(1.0 + ang * 1.2 + Math.abs(Math.log(toAlt / this.alt)) * 0.25, 1.0, 3.2),
    };
    this.tLat = lat;
    this.tLon = lon;
    this.tAlt = toAlt;
  }

  getRay(clientX: number, clientY: number): THREE.Ray {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.ray;
  }

  /** Intersects the pointer ray with the (displaced) planet surface. */
  pickSurface(clientX: number, clientY: number): SurfaceHit | null {
    const ray = this.getRay(clientX, clientY);
    let r = R + this.ground;
    let hit: SurfaceHit | null = null;
    for (let i = 0; i < 4; i++) {
      const b = ray.origin.dot(ray.direction);
      const c = ray.origin.lengthSq() - r * r;
      const disc = b * b - c;
      if (disc < 0) return hit;
      const t = -b - Math.sqrt(disc);
      if (t < 0) return hit;
      const p = ray.at(t, new THREE.Vector3());
      dirToLatLon(p, this.ll);
      hit = { lat: this.ll.lat, lon: this.ll.lon, point: p };
      r = this.terrain.radiusAt(this.ll.lat, this.ll.lon);
    }
    return hit;
  }

  /** Visible ground height in scene units (used for UI scale bars / LOD). */
  get viewHeightUnits(): number {
    return 2 * this.alt * Math.tan((this.camera.fov * DEG) / 2);
  }
}

function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
