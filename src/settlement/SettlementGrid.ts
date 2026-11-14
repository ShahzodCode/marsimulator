import * as THREE from 'three';
import { R, dirToLatLon, latLonToDir, tangentFrame, type LatLon } from '../planet/geo';
import type { Terrain } from '../planet/Terrain';
import { SETTLEMENT } from '../data/settlement';

/**
 * The settlement's local grid, wrapped onto the curved planet surface.
 *
 * Grid cells live on the tangent plane at the settlement centre (x = east, y = north),
 * and every cell is projected radially onto the sphere. Objects placed on the grid get
 * their own local "up" from the planet surface normal at their exact location, so the
 * settlement follows the planet's curvature instead of sitting on a flat plane.
 *
 * Model space convention: 1 unit = 1 grid cell, +X = east, +Y = up, +Z = south.
 */
export class SettlementGrid {
  readonly cell = SETTLEMENT.cellSize;
  readonly up = new THREE.Vector3();
  readonly east = new THREE.Vector3();
  readonly north = new THREE.Vector3();

  private readonly tmp = new THREE.Vector3();
  private readonly e = new THREE.Vector3();
  private readonly n = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly rotQ = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  constructor(
    private terrain: Terrain,
    readonly lat = SETTLEMENT.lat,
    readonly lon = SETTLEMENT.lon,
  ) {
    tangentFrame(lat, lon, this.up, this.east, this.north);
  }

  gridToLatLon(x: number, y: number, out: LatLon = { lat: 0, lon: 0 }): LatLon {
    this.tmp
      .copy(this.up)
      .multiplyScalar(R)
      .addScaledVector(this.east, x * this.cell)
      .addScaledVector(this.north, y * this.cell);
    return dirToLatLon(this.tmp, out);
  }

  latLonToGrid(lat: number, lon: number): { x: number; y: number } | null {
    latLonToDir(lat, lon, this.tmp);
    const d = this.tmp.dot(this.up);
    if (d < 0.9) return null;
    this.tmp.multiplyScalar(R / d);
    return { x: this.tmp.dot(this.east) / this.cell, y: this.tmp.dot(this.north) / this.cell };
  }

  /** Surface point (scene units) above grid coords, optionally lifted along the local normal. */
  surfacePoint(x: number, y: number, lift = 0, out = new THREE.Vector3()): THREE.Vector3 {
    const ll = this.gridToLatLon(x, y);
    return this.terrain.surfacePoint(ll.lat, ll.lon, lift, out);
  }

  /**
   * Positions & orients an object on the curved surface at grid coords (x, y),
   * rotated `angle` radians clockwise (seen from above), scaled so 1 model unit = 1 cell.
   */
  place(obj: THREE.Object3D, x: number, y: number, angle = 0, lift = 0): void {
    const ll = this.gridToLatLon(x, y);
    tangentFrame(ll.lat, ll.lon, this.u, this.e, this.n);
    this.n.negate(); // local +Z = south
    this.basis.makeBasis(this.e, this.u, this.n);
    obj.quaternion.setFromRotationMatrix(this.basis);
    this.rotQ.setFromAxisAngle(this.yAxis, -angle);
    obj.quaternion.multiply(this.rotQ);
    this.terrain.surfacePoint(ll.lat, ll.lon, lift, obj.position);
    obj.scale.setScalar(this.cell);
  }

  /** Distance (cells) of grid coords from the settlement centre. */
  static radius(x: number, y: number): number {
    return Math.hypot(x, y);
  }
}
