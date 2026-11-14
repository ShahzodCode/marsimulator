import * as THREE from 'three';

/**
 * Planet geometry conventions (shared by every system):
 *   - Mars radius in scene units: R = 100
 *   - Direction for (lat, lon): lat → +Y, lon 0° → +Z, lon 90° E → +X
 *   - Texture UV: u = (lon + 180) / 360, v = (90 − lat) / 180  (row 0 = north)
 */

import { DEG, ELEVATION_EXAGGERATION, KM_TO_UNITS, RAD } from './constants';
export * from './constants';

export interface LatLon {
  lat: number;
  lon: number;
}

export function latLonToDir(lat: number, lon: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = lat * DEG;
  const lam = lon * DEG;
  const c = Math.cos(phi);
  return out.set(c * Math.sin(lam), Math.sin(phi), c * Math.cos(lam));
}

export function dirToLatLon(dir: THREE.Vector3, out: LatLon = { lat: 0, lon: 0 }): LatLon {
  const len = dir.length() || 1;
  out.lat = Math.asin(THREE.MathUtils.clamp(dir.y / len, -1, 1)) * RAD;
  out.lon = Math.atan2(dir.x, dir.z) * RAD;
  return out;
}

/** Normalise longitude into [-180, 180). */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Normalise longitude into [0, 360). */
export function lon360(lon: number): number {
  return ((lon % 360) + 360) % 360;
}

/** East / north unit vectors of the local tangent frame at (lat, lon). */
export function tangentFrame(
  lat: number,
  lon: number,
  up: THREE.Vector3,
  east: THREE.Vector3,
  north: THREE.Vector3,
): void {
  latLonToDir(lat, lon, up);
  const lam = lon * DEG;
  east.set(Math.cos(lam), 0, -Math.sin(lam));
  north.crossVectors(up, east).normalize();
}

/** Great-circle angular distance in radians. */
export function angularDistance(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const p1 = aLat * DEG;
  const p2 = bLat * DEG;
  const dp = p2 - p1;
  const dl = (bLon - aLon) * DEG;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function kmToUnitsHeight(km: number): number {
  return km * KM_TO_UNITS * ELEVATION_EXAGGERATION;
}

/** Point a fraction `f` (0..1) of the way along the great circle from A to B. */
export function greatCirclePoint(aLat: number, aLon: number, bLat: number, bLon: number, f: number, out: LatLon = { lat: 0, lon: 0 }): LatLon {
  const d = angularDistance(aLat, aLon, bLat, bLon);
  if (d < 1e-9) {
    out.lat = aLat;
    out.lon = aLon;
    return out;
  }
  const p1 = aLat * DEG;
  const l1 = aLon * DEG;
  const p2 = bLat * DEG;
  const l2 = bLon * DEG;
  const a = Math.sin((1 - f) * d) / Math.sin(d);
  const b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
  const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
  const z = a * Math.sin(p1) + b * Math.sin(p2);
  out.lat = Math.atan2(z, Math.hypot(x, y)) * RAD;
  out.lon = Math.atan2(y, x) * RAD;
  return out;
}
