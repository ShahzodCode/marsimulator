import * as THREE from 'three';
import type { ModelBuilder } from './ModelBuilder';
import { materials } from './materials';

/**
 * Procedural models for the logistics buildings (Pump Station, Cargo Hauler Garage).
 * Units: 1 = one grid cell; centred on the footprint; +Z = south.
 */

type Factory = (b: ModelBuilder) => void;

/** A pump house with two pipes running out on stilts (like the Trans-Alaska Pipeline). */
export const pumpStation: Factory = (b) => {
  const M = materials();
  b.box(M.pad, 4, 0.72, 4, 0, -0.62, 0);
  // Pump house.
  b.box(M.white, 1.8, 1.1, 1.6, -0.8, 0.1, -0.6);
  b.box(M.teal, 1.84, 0.12, 1.64, -0.8, 1.2, -0.6);
  b.box(M.glowCyan, 0.8, 0.08, 0.04, -0.8, 0.8, 0.21);
  // Pump drums with valve wheels.
  for (const z of [0.6, 1.3]) {
    b.hcyl(M.metal, 0.3, 1.0, -0.9, 0.42, z, 0, 16);
    b.torus(M.orange, 0.2, 0.035, -0.9, 0.85, z, Math.PI * 2, { rx: Math.PI / 2 });
    b.cyl(M.metal, 0.03, 0.03, 0.18, -0.9, 0.7, z, 6);
  }
  // Two pipes leaving east, on stilts.
  for (const z of [0.6, 1.3]) {
    b.hcyl(M.metal, 0.13, 2.6, 0.8, 0.85, z, 0, 12);
    for (const x of [0.6, 1.6]) b.cyl(M.darkMetal, 0.05, 0.05, 0.75, x, 0.1, z, 6);
  }
  // Flanges ring the pipes where they leave the pad.
  for (const z of [0.6, 1.3]) b.torus(M.yellow, 0.15, 0.04, 2.0, 0.85, z, Math.PI * 2, { rx: 0, ry: Math.PI / 2 });
  // Pressure tank and status light.
  b.cyl(M.oxygenTank, 0.42, 0.42, 1.0, 1.0, 0.1, -1.0, 18);
  b.dome(M.oxygenTank, 0.42, 1.0, 1.1, -1.0, 0.45, 14);
  b.sphere(M.glowGreen, 0.08, -0.2, 1.42, -1.1);
};

/** A hangar with a half-round roof, an open door and a hauler rolling out. */
export const cargoGarage: Factory = (b) => {
  const M = materials();
  b.box(M.pad, 7, 0.72, 6, 0, -0.62, 0);
  // Hangar: low walls plus a half-cylinder roof running north-south.
  const hx = -1.2;
  const hz = -0.6;
  b.box(M.panel, 3.6, 0.9, 4.2, hx, 0.1, hz);
  b.add(new THREE.CylinderGeometry(1.8, 1.8, 4.2, 24, 1, false, Math.PI / 2, Math.PI), M.white, { x: hx, y: 1.0, z: hz, rx: Math.PI / 2 });
  for (const dz of [-1.9, -0.6, 0.7, 2.0]) b.add(new THREE.TorusGeometry(1.82, 0.05, 6, 24, Math.PI), M.orange, { x: hx, y: 1.0, z: hz + dz });
  // Open door on the south end, dark inside.
  b.box(M.darkMetal, 2.4, 1.6, 0.05, hx, 0.1, hz + 2.12);
  b.box(M.glowWhite, 2.4, 0.08, 0.06, hx, 1.75, hz + 2.14);
  // A hauler rolling out: flat cargo bed on six wheels with a crate on top.
  const vz = 2.05;
  b.box(M.yellow, 1.1, 0.25, 1.8, hx, 0.35, vz);
  b.box(M.darkMetal, 0.9, 0.4, 0.45, hx, 0.6, vz + 0.62);
  b.box(M.glowCyan, 0.6, 0.06, 0.04, hx, 0.85, vz + 0.86);
  b.box(M.orange, 0.85, 0.55, 0.9, hx, 0.6, vz - 0.3);
  for (const dz of [-0.65, 0, 0.65]) for (const dx of [-0.6, 0.6]) b.hcyl(M.rubber, 0.2, 0.16, hx + dx, 0.2, vz + dz, 0, 12);
  // Parking bay with charging posts for the other haulers.
  b.box(M.asphalt, 2.6, 0.02, 4.4, 2.0, 0.1, 0.2);
  for (const z of [-1.2, 1.2]) {
    b.box(M.yellow, 1.0, 0.22, 1.6, 2.0, 0.35, z);
    b.box(M.darkMetal, 0.8, 0.35, 0.4, 2.0, 0.57, z + 0.6);
    for (const dz of [-0.55, 0.55]) for (const dx of [-0.55, 0.55]) b.hcyl(M.rubber, 0.18, 0.14, 2.0 + dx, 0.2, z + dz, 0, 12);
    b.box(M.darkMetal, 0.2, 0.9, 0.2, 3.1, 0.1, z);
    b.box(M.glowGreen, 0.05, 0.1, 0.12, 3.0, 0.8, z);
  }
  b.cyl(M.metal, 0.05, 0.05, 1.4, -3.0, 0.1, -2.6, 6);
  b.sphere(M.glowRed, 0.09, -3.0, 1.55, -2.6);
};
