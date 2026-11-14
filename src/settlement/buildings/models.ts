import * as THREE from 'three';
import type { BuildingType } from '../../data/buildings';
import type { DecorationKind } from '../../data/settlement';
import { ModelBuilder } from './ModelBuilder';
import { materials } from './materials';
import { ChickenFlock } from './Chickens';

/**
 * Procedural low-poly models for every building and decoration.
 * Units: 1 = one grid cell; models are centred on their footprint; +Z = south.
 */

export interface BuiltModel {
  group: THREE.Group;
  /** Optional per-frame animation (e.g. chickens). */
  update?: (dt: number, time: number) => void;
}

type Factory = (b: ModelBuilder, extras: THREE.Group, ghost: boolean) => BuiltModel['update'] | void;

const TAU = Math.PI * 2;

function foundation(b: ModelBuilder, w: number, d: number, round = false) {
  const M = materials();
  if (round) b.cyl(M.concrete, Math.max(w, d) / 2, Math.max(w, d) / 2 + 0.1, 0.75, 0, -0.65, 0, 40);
  else b.box(M.concrete, w, 0.75, d, 0, -0.65, 0);
}

const habitat: Factory = (b) => {
  const M = materials();
  foundation(b, 7.6, 7.6, true);
  b.ring(M.pad, 3.0, 3.75, 0, 0.11, 0, 48);
  b.dome(M.white, 2.6, 0, 0.1, 0, 0.88, 36);
  b.torus(M.orange, 2.58, 0.13, 0, 0.32, 0);
  b.torus(M.orange, 1.55, 0.09, 0, 1.92, 0);
  b.cyl(M.darkMetal, 0.55, 0.6, 0.28, 0, 2.2, 0, 20);
  b.cyl(M.glowCyan, 0.35, 0.35, 0.06, 0, 2.48, 0, 20);
  // Window ring.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.15;
    b.add(new THREE.BoxGeometry(0.42, 0.22, 0.06), M.glowWhite, {
      x: Math.cos(a) * 2.38,
      y: 1.05,
      z: Math.sin(a) * 2.38,
      ry: -a + Math.PI / 2,
      rx: -0.35,
    });
  }
  // Side modules: east, west, north. Airlock to the south (toward the plaza).
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    b.hcyl(M.white, 0.68, 1.6, cx * 3.0, 0.78, cz * 3.0, -a, 18);
    b.add(new THREE.SphereGeometry(0.68, 16, 10, 0, Math.PI), M.white, { x: cx * 3.8, y: 0.78, z: cz * 3.8, ry: -a + Math.PI / 2, sz: 0.4 });
    b.add(new THREE.TorusGeometry(0.7, 0.07, 6, 24), M.orange, { x: cx * 3.0, y: 0.78, z: cz * 3.0, ry: -a + Math.PI / 2 });
    b.add(new THREE.BoxGeometry(1.2, 0.08, 0.22), M.glowWhite, { x: cx * 3.0, y: 1.46, z: cz * 3.0, ry: -a });
    b.box(M.darkMetal, 0.3, 0.12, 1.1, cx * 3.0, 0.1, cz * 3.0, -a);
  }
  b.box(M.panel, 1.2, 1.15, 1.1, 0, 0.1, 2.75);
  b.box(M.orange, 1.24, 0.14, 1.14, 0, 1.25, 2.75);
  b.box(M.darkMetal, 0.62, 0.8, 0.05, 0, 0.12, 3.31);
  b.box(M.glowGreen, 0.2, 0.08, 0.05, 0.45, 0.95, 3.32);
  // Radiation-shielding regolith bags around the base.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.11;
    if (Math.abs(Math.sin(a) - 1) < 0.15) continue;
    b.add(new THREE.BoxGeometry(0.55, 0.32, 0.36), M.ore, { x: Math.cos(a) * 2.95, y: 0.1, z: Math.sin(a) * 2.95, ry: -a });
  }
  // Beacon antenna.
  b.cyl(M.metal, 0.04, 0.04, 1.0, 0.25, 2.3, -0.2, 6);
  b.sphere(M.glowRed, 0.09, 0.25, 3.32, -0.2);
};

const solarFarm: Factory = (b) => {
  const M = materials();
  b.box(M.pad, 10, 0.72, 7, 0, -0.62, 0);
  const cols = [-3.45, -1.05, 1.35];
  const rows = [-2.25, 0, 2.25];
  for (const x of cols) {
    for (const z of rows) {
      b.add(new THREE.BoxGeometry(2.15, 0.07, 1.75), M.solar, { x, y: 0.75, z, rx: 0.42 });
      b.cyl(M.metal, 0.05, 0.05, 0.62, x - 0.8, 0.1, z, 6);
      b.cyl(M.metal, 0.05, 0.05, 0.62, x + 0.8, 0.1, z, 6);
      b.box(M.metal, 2.0, 0.06, 0.08, x, 0.68, z);
    }
  }
  // Cable trays.
  for (const z of rows) b.box(M.rubber, 7.0, 0.05, 0.12, 0.05, 0.1, z + 0.95);
  b.box(M.rubber, 0.14, 0.05, 5.6, 3.05, 0.1, 0.5);
  // Battery bank and inverter.
  b.box(M.white, 1.4, 1.05, 1.5, 3.95, 0.1, -1.6);
  b.box(M.white, 1.4, 1.05, 1.5, 3.95, 0.1, 0.4);
  b.box(M.teal, 1.42, 0.14, 1.52, 3.95, 0.85, -1.6);
  b.box(M.teal, 1.42, 0.14, 1.52, 3.95, 0.85, 0.4);
  b.box(M.glowGreen, 0.08, 0.18, 0.5, 3.24, 0.5, -1.6);
  b.box(M.glowGreen, 0.08, 0.18, 0.5, 3.24, 0.5, 0.4);
  b.box(M.darkMetal, 1.0, 0.8, 0.9, 3.95, 0.1, 2.4);
  b.cyl(M.metal, 0.04, 0.04, 1.2, 4.3, 0.9, 2.4, 6);
  b.sphere(M.glowOrange, 0.07, 4.3, 2.12, 2.4);
};

const lifeSupport: Factory = (b) => {
  const M = materials();
  b.box(M.pad, 6, 0.72, 6, 0, -0.62, 0);
  // Main processing hall.
  b.box(M.white, 2.7, 1.35, 2.5, -1.25, 0.1, 0.7);
  b.box(M.teal, 2.74, 0.18, 2.54, -1.25, 1.2, 0.7);
  b.box(M.panel, 2.5, 0.06, 2.3, -1.25, 1.45, 0.7);
  for (const dx of [-0.6, 0.6]) {
    b.cyl(M.darkMetal, 0.42, 0.42, 0.14, -1.25 + dx, 1.5, 0.3, 18);
    b.cyl(M.metal, 0.12, 0.12, 0.05, -1.25 + dx, 1.64, 0.3, 10);
  }
  b.box(M.glowCyan, 0.9, 0.12, 0.06, -1.25, 0.8, 1.96);
  b.box(M.darkMetal, 0.6, 0.85, 0.05, -0.4, 0.1, 1.96);
  // Vent stack.
  b.cyl(M.metal, 0.17, 0.2, 1.15, -2.2, 1.45, 1.4, 12);
  b.cyl(M.teal, 0.2, 0.2, 0.12, -2.2, 2.5, 1.4, 12);
  // Electrolysis unit (splits water into oxygen + hydrogen).
  b.box(M.metal, 1.6, 0.95, 1.3, -1.3, 0.1, -1.75);
  b.box(M.glowCyan, 1.2, 0.08, 0.06, -1.3, 0.75, -1.08);
  b.box(M.glowCyan, 0.06, 0.08, 0.9, -0.48, 0.75, -1.75);
  // Water tanks.
  for (const z of [-1.7, -0.1]) {
    b.cyl(M.waterTank, 0.62, 0.62, 1.45, 1.35, 0.1, z, 22);
    b.dome(M.white, 0.62, 1.35, 1.55, z, 0.5, 18);
    b.torus(M.white, 0.63, 0.05, 1.35, 0.85, z);
  }
  // Oxygen spheres on legs.
  for (const x of [0.75, 2.05]) {
    for (const dx of [-0.3, 0.3]) b.cyl(M.metal, 0.05, 0.05, 0.6, x + dx, 0.1, 1.85, 6);
    b.sphere(M.oxygenTank, 0.55, x, 1.15, 1.85, {}, 18, 12);
    b.torus(M.teal, 0.56, 0.05, x, 1.15, 1.85);
  }
  // Pipes.
  b.hcyl(M.metal, 0.07, 2.5, 0.25, 0.55, -1.0, 0, 8);
  b.hcyl(M.metal, 0.07, 1.9, 1.35, 0.55, 0.9, Math.PI / 2, 8);
  b.hcyl(M.metal, 0.07, 2.2, 0.3, 0.45, 1.85, 0, 8);
  b.sphere(M.glowGreen, 0.1, -0.2, 1.62, 1.6);
};

const greenhouse: Factory = (b, extras, ghost) => {
  const M = materials();
  b.box(M.concrete, 10, 0.75, 6, 0, -0.65, 0);
  b.box(M.panel, 9.6, 0.06, 5.4, 0, 0.1, 0);
  // Glass vault + end walls + ribs.
  const vault = new THREE.CylinderGeometry(2.65, 2.65, 9.4, 28, 1, true, 0, Math.PI);
  b.add(vault, M.glass, { y: 0.12, rz: Math.PI / 2, sy: 1, sx: 1 });
  for (const x of [-4.7, 4.7]) {
    b.add(new THREE.CircleGeometry(2.65, 28, 0, Math.PI), M.glass, { x, y: 0.12, ry: Math.PI / 2 });
  }
  for (let i = 0; i <= 6; i++) {
    const x = -4.7 + (i / 6) * 9.4;
    b.add(new THREE.TorusGeometry(2.66, 0.05, 5, 24, Math.PI), M.white, { x, y: 0.12, ry: Math.PI / 2 });
  }
  b.box(M.white, 9.4, 0.08, 0.1, 0, 2.72, 0);
  // Pink LED grow lights (plants love red + blue light).
  for (const z of [-0.95, 0.95]) b.box(M.glowPink, 5.6, 0.06, 0.22, -1.7, 2.18, z);
  b.box(M.glowWhite, 2.8, 0.06, 0.18, 3.0, 2.25, 0);

  // Crop section: planters with lettuce, tomatoes and wheat.
  for (const [ri, z] of [-1.55, 0, 1.55].entries()) {
    b.box(M.wood, 5.4, 0.36, 0.95, -1.75, 0.12, z);
    b.box(M.soil, 5.2, 0.05, 0.8, -1.75, 0.48, z);
    for (let i = 0; i < 9; i++) {
      const x = -4.2 + i * 0.6;
      const kind = (ri + i) % 3;
      if (kind === 0) {
        b.sphere(M.plant, 0.27, x, 0.6, z, { sy: 0.65 }, 8, 6);
      } else if (kind === 1) {
        b.sphere(M.plantDark, 0.3, x, 0.78, z, {}, 8, 6);
        b.sphere(M.tomato, 0.08, x + 0.15, 0.82, z + 0.18, {}, 6, 4);
        b.sphere(M.tomato, 0.08, x - 0.12, 0.92, z - 0.15, {}, 6, 4);
        b.sphere(M.tomato, 0.07, x + 0.05, 1.02, z + 0.05, {}, 6, 4);
      } else {
        b.cone(M.wheat, 0.18, 0.62, x, 0.5, z, 6);
        b.cone(M.plant, 0.1, 0.4, x + 0.12, 0.5, z + 0.12, 5);
      }
    }
  }
  // Watering pipe.
  b.hcyl(M.metal, 0.04, 5.2, -1.75, 1.4, 0, 0, 6);

  // Divider fence between farm and chicken coop.
  b.box(M.wood, 0.08, 0.55, 5.0, 1.25, 0.12, 0);
  for (let i = 0; i < 6; i++) b.box(M.wood, 0.14, 0.75, 0.14, 1.25, 0.12, -2.4 + i * 0.96);

  // Protected chicken coop (inside the pressurised greenhouse).
  b.box(M.straw, 3.2, 0.05, 5.1, 3.0, 0.13, 0);
  b.box(M.wood, 1.35, 0.85, 1.15, 3.85, 0.15, -1.75);
  b.add(new THREE.ConeGeometry(1.1, 0.6, 4), M.roofRed, { x: 3.85, y: 1.28, z: -1.75, ry: Math.PI / 4, sz: 0.85 });
  b.box(M.darkMetal, 0.35, 0.4, 0.05, 3.55, 0.15, -1.16);
  b.add(new THREE.BoxGeometry(0.3, 0.05, 0.6), M.wood, { x: 3.55, y: 0.25, z: -0.85, rx: 0.4 });
  b.box(M.waterTank, 0.9, 0.18, 0.3, 2.2, 0.15, 2.05);
  b.cyl(M.metal, 0.22, 0.28, 0.3, 4.2, 0.15, 1.6, 12);
  b.cyl(M.yellow, 0.18, 0.18, 0.05, 4.2, 0.45, 1.6, 12);

  // Airlock on the west end.
  b.box(M.white, 0.7, 1.25, 1.5, -5.0, 0.1, 0);
  b.box(M.orange, 0.72, 0.12, 1.52, -5.0, 1.25, 0);
  b.box(M.glowGreen, 0.06, 0.1, 0.3, -5.36, 1.0, 0.45);

  if (!ghost) {
    const flock = new ChickenFlock(6, { minX: 1.8, maxX: 4.5, minZ: -0.75, maxZ: 2.2 }, 0.16);
    extras.add(flock.mesh);
    return (dt, time) => flock.update(dt, time);
  }
};

const excavator: Factory = (b) => {
  const M = materials();
  b.box(M.pad, 6, 0.72, 6, 0, -0.62, 0);
  // Sorting hopper building.
  b.box(M.yellow, 2.3, 1.45, 2.1, -1.55, 0.1, -1.35);
  b.box(M.darkMetal, 2.34, 0.14, 2.14, -1.55, 1.55, -1.35);
  b.cone(M.darkMetal, 0.75, 0.7, -1.55, 1.69, -1.35, 4, Math.PI / 4);
  b.box(M.glowOrange, 0.5, 0.12, 0.05, -1.0, 1.1, -0.29);
  // Conveyor belt rising to the hopper.
  b.add(new THREE.BoxGeometry(3.0, 0.14, 0.55), M.rubber, { x: 0.45, y: 0.95, z: -0.6, rz: 0.38, ry: 0.35 });
  b.add(new THREE.BoxGeometry(3.0, 0.1, 0.1), M.yellow, { x: 0.45, y: 0.83, z: -0.32, rz: 0.38, ry: 0.35 });
  b.cyl(M.metal, 0.05, 0.05, 0.6, 1.2, 0.1, -0.3, 6);
  // Regolith piles.
  b.cone(M.ore, 1.15, 0.95, 1.55, 0.1, 1.45, 14);
  b.cone(M.oreDark, 0.8, 0.6, 0.0, 0.1, 2.0, 12);
  b.cone(M.ore, 0.6, 0.45, -1.4, 0.1, 1.6, 10);
  // Dig pit and digger robot.
  b.disc(M.oreDark, 0.95, 1.7, 0.08, -1.55, 24);
  b.box(M.yellow, 1.0, 0.45, 0.7, 1.0, 0.3, -1.6, 0.3);
  for (const [dx, dz] of [[-0.35, -0.4], [0.35, -0.4], [-0.35, 0.4], [0.35, 0.4]] as const) {
    b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 12), M.rubber, { x: 1.0 + dx, y: 0.27, z: -1.6 + dz, rx: Math.PI / 2, ry: 0.3 });
  }
  b.add(new THREE.BoxGeometry(1.0, 0.12, 0.12), M.yellow, { x: 1.7, y: 0.8, z: -1.85, rz: -0.6, ry: 0.3 });
  b.add(new THREE.BoxGeometry(0.4, 0.3, 0.45), M.darkMetal, { x: 2.1, y: 0.4, z: -2.0, ry: 0.3 });
  b.sphere(M.glowOrange, 0.07, 1.0, 0.8, -1.6);
};

const refinery: Factory = (b) => {
  const M = materials();
  b.box(M.pad, 6, 0.72, 6, 0, -0.62, 0);
  b.box(M.darkMetal, 2.8, 1.6, 2.6, -0.9, 0.1, -0.5);
  b.box(M.orange, 2.84, 0.16, 2.64, -0.9, 1.55, -0.5);
  b.box(M.metal, 2.4, 0.08, 2.2, -0.9, 1.72, -0.5);
  for (let i = 0; i < 3; i++) b.box(M.glowOrange, 0.42, 0.28, 0.05, -1.8 + i * 0.9, 0.6, 0.82);
  b.box(M.glowOrange, 0.05, 0.28, 1.4, 0.52, 0.6, -0.5);
  // Chimney with glowing top.
  b.cyl(M.darkMetal, 0.3, 0.38, 2.3, -1.8, 0.1, -1.4, 14);
  b.cyl(M.glowOrange, 0.24, 0.24, 0.08, -1.8, 2.41, -1.4, 14);
  b.torus(M.orange, 0.33, 0.05, -1.8, 1.9, -1.4);
  // Regolith silo.
  b.cyl(M.white, 0.72, 0.72, 1.7, 1.8, 0.1, -1.55, 20);
  b.dome(M.orange, 0.72, 1.8, 1.8, -1.55, 0.45, 18);
  b.hcyl(M.metal, 0.08, 1.4, 1.0, 1.2, -1.2, -0.3, 8);
  // Stacks of fresh iron ingots.
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) b.box(M.ingot, 0.5, 0.18, 0.24, 1.2 + i * 0.58, 0.1 + k * 0.19, 1.3 + j * 0.3 + (k % 2) * 0.05);
    }
  }
  b.box(M.yellow, 0.9, 0.06, 1.3, -0.5, 0.11, 2.0);
};

const iceDrill: Factory = (b) => {
  const M = materials();
  b.box(M.pad, 5, 0.72, 5, 0, -0.62, 0);
  // Drill derrick (lattice tower).
  const cx = -0.7;
  const cz = -0.6;
  for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]] as const) {
    b.add(new THREE.BoxGeometry(0.1, 2.8, 0.1), M.orange, { x: cx + dx * 0.7, y: 1.5, z: cz + dz * 0.7, rx: -dz * 0.12, rz: dx * 0.12 });
  }
  for (const y of [0.6, 1.3, 2.0]) {
    const s = 1.0 - y * 0.12;
    b.box(M.orange, s * 1.1, 0.07, 0.07, cx, y, cz - s * 0.5);
    b.box(M.orange, s * 1.1, 0.07, 0.07, cx, y, cz + s * 0.5);
    b.box(M.orange, 0.07, 0.07, s * 1.1, cx - s * 0.5, y, cz);
    b.box(M.orange, 0.07, 0.07, s * 1.1, cx + s * 0.5, y, cz);
  }
  b.cyl(M.darkMetal, 0.16, 0.16, 2.6, cx, 0.1, cz, 10);
  b.cyl(M.metal, 0.45, 0.5, 0.35, cx, 0.1, cz, 16);
  b.sphere(M.glowRed, 0.09, cx, 2.95, cz);
  // Ice chunks freshly pulled from the ground.
  b.add(new THREE.BoxGeometry(0.35, 0.3, 0.3), M.ice, { x: 0.3, y: 0.25, z: 0.2, ry: 0.4 });
  b.add(new THREE.BoxGeometry(0.28, 0.25, 0.32), M.ice, { x: 0.55, y: 0.22, z: -0.25, ry: 1.1 });
  b.add(new THREE.BoxGeometry(0.22, 0.2, 0.22), M.ice, { x: 0.15, y: 0.2, z: 0.6, ry: 0.2 });
  // Melt tank (water) and pump house.
  b.cyl(M.ice, 0.62, 0.62, 1.1, 1.3, 0.1, 1.2, 20);
  b.dome(M.white, 0.62, 1.3, 1.2, 1.2, 0.4, 16);
  b.box(M.white, 1.2, 0.8, 1.0, 1.3, 0.1, -1.3);
  b.box(M.teal, 1.22, 0.12, 1.02, 1.3, 0.85, -1.3);
  b.box(M.glowCyan, 0.4, 0.1, 0.05, 1.3, 0.6, -0.79);
  b.hcyl(M.metal, 0.07, 1.9, 0.35, 0.4, -0.95, 0, 8);
  b.hcyl(M.metal, 0.07, 2.1, 1.3, 0.4, 0.0, Math.PI / 2, 8);
};

const FACTORIES: Record<BuildingType, Factory> = {
  habitat,
  solar_farm: solarFarm,
  life_support: lifeSupport,
  greenhouse,
  regolith_excavator: excavator,
  iron_refinery: refinery,
  ice_drill: iceDrill,
};

export function buildBuildingModel(type: BuildingType, ghostMaterial: THREE.Material | null = null): BuiltModel {
  const b = new ModelBuilder(ghostMaterial);
  const extras = new THREE.Group();
  const update = FACTORIES[type](b, extras, ghostMaterial !== null) ?? undefined;
  const group = b.build(ghostMaterial === null);
  group.add(extras);
  return { group, update };
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

export function buildDecorationModel(kind: DecorationKind): THREE.Group {
  const M = materials();
  const b = new ModelBuilder();
  switch (kind) {
    case 'plaza': {
      b.cyl(M.pad, 3.0, 3.1, 0.7, 0, -0.62, 0, 40);
      b.ring(M.orange, 2.5, 2.75, 0, 0.09, 0, 48);
      b.ring(M.asphalt, 0.0, 1.1, 0, 0.085, 0, 32);
      b.cyl(M.metal, 0.05, 0.05, 2.4, 0, 0.08, 0, 8);
      b.add(new THREE.BoxGeometry(0.9, 0.55, 0.03), M.orange, { x: 0.47, y: 2.15 });
      b.sphere(M.glowWhite, 0.07, 0, 2.52, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        b.box(M.panel, 0.9, 0.25, 0.3, Math.cos(a) * 1.9, 0.08, Math.sin(a) * 1.9, -a + Math.PI / 2);
      }
      break;
    }
    case 'landing_pad': {
      b.cyl(M.asphalt, 4.6, 4.8, 0.72, 0, -0.62, 0, 48);
      b.ring(M.orange, 3.7, 4.0, 0, 0.11, 0, 56);
      b.ring(M.white, 2.2, 2.35, 0, 0.11, 0, 48);
      b.box(M.white, 0.35, 0.02, 2.2, -0.75, 0.1, 0);
      b.box(M.white, 0.35, 0.02, 2.2, 0.75, 0.1, 0);
      b.box(M.white, 1.2, 0.02, 0.35, 0, 0.1, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        b.sphere(M.glowOrange, 0.12, Math.cos(a) * 4.3, 0.16, Math.sin(a) * 4.3, {}, 6, 4);
      }
      // Parked cargo lander.
      b.cyl(M.white, 0.85, 0.95, 1.6, 2.1, 0.55, -2.1, 18);
      b.cone(M.white, 0.85, 1.0, 2.1, 2.15, -2.1, 18);
      b.torus(M.orange, 0.88, 0.07, 2.1, 1.2, -2.1);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        b.add(new THREE.BoxGeometry(0.1, 0.9, 0.1), M.metal, { x: 2.1 + Math.cos(a) * 0.95, y: 0.5, z: -2.1 + Math.sin(a) * 0.95, rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 });
      }
      b.sphere(M.glowRed, 0.08, 2.1, 3.18, -2.1);
      break;
    }
    case 'comm_tower': {
      b.box(M.pad, 3, 0.7, 3, 0, -0.62, 0);
      b.box(M.metal, 0.16, 3.6, 0.16, 0, 0.08, 0);
      for (const y of [0.9, 1.8, 2.7]) b.box(M.metal, 0.6, 0.06, 0.06, 0, y, 0);
      b.add(new THREE.SphereGeometry(0.9, 18, 8, 0, TAU, 0, Math.PI / 3.2), M.white, { x: 0.4, y: 2.0, z: 0.5, rx: Math.PI - 0.8, ry: 0.6 });
      b.cyl(M.darkMetal, 0.05, 0.05, 0.6, 0.25, 1.75, 0.3, 6);
      b.sphere(M.glowRed, 0.1, 0, 3.75, 0);
      b.box(M.white, 0.9, 0.6, 0.7, -0.7, 0.08, 0.7);
      break;
    }
    case 'rover': {
      b.box(M.white, 1.7, 0.45, 1.05, 0, 0.42, 0);
      b.box(M.solar, 1.5, 0.05, 0.95, 0, 0.88, 0);
      b.box(M.orange, 1.72, 0.1, 1.07, 0, 0.42, 0);
      for (const x of [-0.6, 0, 0.6]) {
        for (const z of [-0.6, 0.6]) b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), M.rubber, { x, y: 0.22, z, rx: Math.PI / 2 });
      }
      b.cyl(M.metal, 0.04, 0.04, 0.6, 0.55, 0.9, 0.2, 6);
      b.box(M.darkMetal, 0.25, 0.14, 0.18, 0.55, 1.5, 0.2);
      b.sphere(M.glowCyan, 0.05, 0.68, 1.57, 0.2);
      break;
    }
    case 'crates': {
      b.box(M.orange, 0.9, 0.7, 0.8, -0.6, 0.06, 0.2);
      b.box(M.white, 0.9, 0.7, 0.8, 0.45, 0.06, 0.1, 0.2);
      b.box(M.teal, 0.8, 0.55, 0.7, -0.5, 0.76, 0.2, -0.15);
      b.box(M.panel, 0.6, 0.45, 0.6, 1.1, 0.06, -0.5, 0.4);
      break;
    }
  }
  return b.build(true);
}
