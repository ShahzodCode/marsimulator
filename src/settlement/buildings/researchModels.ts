import * as THREE from 'three';
import type { ModelBuilder } from './ModelBuilder';
import { materials } from './materials';

/**
 * Procedural fallbacks for the research buildings (used until their Blender models load).
 * Units: 1 = one grid cell; centred on the footprint; +Z = south.
 */

type Factory = (b: ModelBuilder) => void;

const TAU = Math.PI * 2;

function pad(b: ModelBuilder, w: number, d: number, round = false) {
  const M = materials();
  if (round) b.cyl(M.concrete, Math.max(w, d) / 2, Math.max(w, d) / 2 + 0.1, 0.75, 0, -0.65, 0, 40);
  else b.box(M.concrete, w, 0.75, d, 0, -0.65, 0);
}

export const researchLab: Factory = (b) => {
  const M = materials();
  pad(b, 6.6, 5.6);
  b.box(M.white, 4.2, 1.6, 3.4, -0.6, 0.1, 0.2);
  b.box(M.teal, 4.24, 0.16, 3.44, -0.6, 1.5, 0.2);
  b.hcyl(M.white, 0.9, 2.2, 1.9, 1.0, -0.6, Math.PI / 2, 20);
  b.dome(M.glass, 1.1, 1.9, 0.1, 1.2, 1, 24);
  b.box(M.glowCyan, 3.4, 0.22, 0.05, -0.6, 0.9, 1.92);
  b.cyl(M.metal, 0.06, 0.06, 2.4, -2.2, 1.7, -1.0, 8);
  b.dome(M.white, 0.55, -2.2, 4.0, -1.0, 0.4, 18);
  b.sphere(M.glowGreen, 0.1, -2.2, 4.25, -1.0);
};

export const fissionReactor: Factory = (b) => {
  const M = materials();
  pad(b, 5.8, 5.8);
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    b.cyl(M.darkMetal, 0.75, 0.85, 1.4, x, 0.1, z, 20);
    b.cyl(M.white, 0.62, 0.7, 0.9, x, 1.5, z, 20);
    b.torus(M.yellow, 0.68, 0.06, x, 1.55, z, TAU, { rx: Math.PI / 2 });
    // Radiator fins.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.box(M.panel, 0.05, 1.3, 0.55, x + Math.cos(a) * 0.95, 0.2, z + Math.sin(a) * 0.95, -a);
    }
    b.cyl(M.glowCyan, 0.3, 0.3, 0.05, x, 2.42, z, 16);
  }
  b.box(M.yellow, 0.6, 0.6, 0.6, 0, 0.1, 0);
};

export const megadigger: Factory = (b) => {
  const M = materials();
  pad(b, 7.6, 7.6);
  b.box(M.rubber, 5.0, 0.6, 1.0, 0, 0.1, -1.8);
  b.box(M.rubber, 5.0, 0.6, 1.0, 0, 0.1, 1.8);
  b.box(M.yellow, 4.2, 1.6, 3.0, 0.4, 0.7, 0);
  b.box(M.darkMetal, 1.4, 1.0, 1.4, 1.6, 2.3, 0.6);
  b.box(M.glass, 1.0, 0.6, 0.05, 1.6, 2.6, 1.32);
  b.hcyl(M.metal, 0.18, 4.5, -2.4, 2.6, 0, 0.35, 10);
  // Bucket wheel.
  b.torus(M.yellow, 1.7, 0.18, -4.0, 3.4, 0, TAU, { ry: Math.PI / 2 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    b.box(M.darkMetal, 0.4, 0.4, 0.5, -4.0, 3.4 + Math.sin(a) * 1.7 - 0.2, Math.cos(a) * 1.7);
  }
  b.cone(M.ore, 1.2, 1.0, 2.6, 0.1, 2.6, 16);
};

export const stripMine: Factory = (b) => {
  const M = materials();
  b.cyl(M.oreDark, 4.3, 4.0, 0.2, 0, -0.1, 0, 40);
  for (let i = 0; i < 3; i++) b.ring(M.ore, 1.2 + i * 1.0, 1.9 + i * 1.0, 0, 0.12 + i * 0.12, 0, 40);
  b.box(M.yellow, 2.0, 1.2, 1.6, 2.6, 0.5, -2.6);
  b.box(M.darkMetal, 0.9, 0.6, 0.9, 2.9, 1.7, -2.6);
  b.hcyl(M.metal, 0.12, 3.5, 1.0, 1.2, -1.4, -0.7, 8);
  b.cyl(M.darkMetal, 0.9, 1.1, 2.2, -2.6, 0.1, 2.6, 18);
  b.cyl(M.glowOrange, 0.7, 0.7, 0.08, -2.6, 2.3, 2.6, 18);
  for (let i = 0; i < 4; i++) b.box(M.ingot, 0.5, 0.2, 0.25, -1.0 + i * 0.6, 0.1, 3.5);
};

export const glacierMine: Factory = (b) => {
  const M = materials();
  pad(b, 6.6, 6.6, true);
  b.cyl(M.ice, 2.4, 2.8, 0.3, 0, 0.0, 0, 32);
  b.cyl(M.white, 1.3, 1.5, 2.0, 0, 0.2, 0, 24);
  b.torus(M.teal, 1.4, 0.1, 0, 1.2, 0, TAU, { rx: Math.PI / 2 });
  b.cyl(M.metal, 0.12, 0.12, 4.0, 0, 2.2, 0, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    b.cyl(M.waterTank, 0.45, 0.45, 1.6, Math.cos(a) * 2.6, 0.1, Math.sin(a) * 2.6, 16);
  }
  b.sphere(M.glowCyan, 0.18, 0, 6.3, 0);
};

export const deepAquiferDrill: Factory = (b) => {
  const M = materials();
  pad(b, 7.6, 7.6);
  // Derrick.
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) b.add(new THREE.CylinderGeometry(0.08, 0.12, 8, 6), M.metal, { x: x * 0.7, y: 4.1, z: z * 0.7, rx: z * 0.08, rz: -x * 0.08 });
  for (let h = 1; h < 8; h += 1.4) b.box(M.orange, 2.2 - h * 0.15, 0.1, 0.1, 0, h, 0);
  b.box(M.darkMetal, 3.0, 0.6, 3.0, 0, 0.1, 0);
  b.cyl(M.waterTank, 0.9, 0.9, 1.8, 2.6, 0.1, 2.4, 20);
  b.cyl(M.waterTank, 0.9, 0.9, 1.8, -2.6, 0.1, 2.4, 20);
  b.box(M.white, 2.2, 1.4, 1.6, 2.4, 0.1, -2.4);
  b.sphere(M.glowRed, 0.15, 0, 8.3, 0);
};

export const bigDome: Factory = (b) => {
  const M = materials();
  pad(b, 11.6, 11.6, true);
  b.ring(M.pad, 4.6, 5.6, 0, 0.11, 0, 56);
  b.cyl(M.white, 4.8, 4.9, 0.6, 0, 0.1, 0, 48);
  b.dome(M.glass, 4.6, 0, 0.7, 0, 0.7, 48);
  b.dome(M.plant, 3.6, 0, 0.7, 0, 0.25, 32);
  b.torus(M.orange, 4.75, 0.14, 0, 0.72, 0, TAU, { rx: Math.PI / 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    b.add(new THREE.TorusGeometry(4.55, 0.05, 6, 48, Math.PI), M.metal, { y: 0.7, ry: a, sy: 0.7 });
  }
  b.box(M.panel, 1.4, 1.2, 1.4, 0, 0.1, 5.2);
};

export const lavaHabitat: Factory = (b) => {
  const M = materials();
  b.cyl(M.rock, 4.8, 5.0, 1.6, 0, -0.2, 0, 32);
  b.ring(M.oreDark, 1.6, 2.6, 0, 1.42, 0, 32);
  b.disc(M.asphalt, 1.6, 0, 1.4, 0, 32);
  b.box(M.white, 2.2, 1.2, 1.2, 0, 0.1, 4.6);
  b.box(M.orange, 2.24, 0.12, 1.24, 0, 1.2, 4.6);
  b.box(M.glowWhite, 1.4, 0.4, 0.05, 0, 0.5, 5.22);
  b.hcyl(M.metal, 0.4, 3.0, 0, 0.6, 2.8, 0, 14);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    b.sphere(M.glowWhite, 0.08, Math.cos(a) * 2.1, 1.5, Math.sin(a) * 2.1);
  }
};
