import * as THREE from 'three';
import type { Terrain } from '../planet/Terrain';
import { PATCH } from '../planet/terrainGen';
import { GLSL_NOISE } from '../planet/shaders';
import { SETTLEMENT } from '../data/settlement';
import type { SettlementGrid } from './SettlementGrid';

/**
 * High-detail curved ground around the settlement (Jezero crater floor, rim and delta).
 * The globe is cut away underneath it; the outer ring overlaps the globe seamlessly.
 * Also draws the construction grid + buildable boundary while placing buildings.
 */
export class SettlementGround {
  readonly mesh: THREE.Mesh;
  private uniforms = {
    uGrid: { value: 0 },
    uBuildRadius: { value: SETTLEMENT.buildRadius },
    uTime: { value: 0 },
  };
  private gridTarget = 0;

  constructor(terrain: Terrain, grid: SettlementGrid) {
    const geometry = buildGeometry(grid, 120, 220);
    const material = new THREE.MeshStandardMaterial({
      map: terrain.textures.patchColor,
      normalMap: terrain.textures.patchNormal,
      normalMapType: THREE.ObjectSpaceNormalMap,
      roughness: 0.96,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    const u = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aLocal;\nvarying vec2 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = aLocal;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vLocal;
          uniform float uGrid;
          uniform float uBuildRadius;
          uniform float uTime;
          ${GLSL_NOISE}`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float dn = gNoise(vec3(vLocal * 1.7, 1.0)) * 0.45 + gNoise(vec3(vLocal * 6.5, 3.0)) * 0.35 + gNoise(vec3(vLocal * 21.0, 5.0)) * 0.2;
          diffuseColor.rgb *= 0.86 + 0.28 * dn;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float rr = length(vLocal);
            vec2 fw2 = fwidth(vLocal);
            float fw = max(fw2.x, fw2.y);
            vec2 gc = abs(fract(vLocal) - 0.5);
            float gl = 1.0 - smoothstep(0.0, 1.4, min((0.5 - gc.x) / fw2.x, (0.5 - gc.y) / fw2.y));
            gl *= 1.0 - smoothstep(0.12, 0.35, fw);
            float inside = 1.0 - smoothstep(uBuildRadius - 0.4, uBuildRadius + 0.4, rr);
            float ring = 1.0 - smoothstep(0.0, 1.6 * fw + 0.12, abs(rr - uBuildRadius));
            float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
            totalEmissiveRadiance += uGrid * (vec3(0.25, 0.7, 1.0) * gl * inside * 0.28 + vec3(0.35, 0.9, 1.0) * ring * 0.9 * pulse);
            totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * ring * 0.1 * (1.0 - uGrid);
          }`,
        );
    };
    material.customProgramCacheKey = () => 'settlement-ground-v1';
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'settlement-ground';
  }

  setGridVisible(visible: boolean): void {
    this.gridTarget = visible ? 1 : 0;
  }

  update(dt: number, time: number): void {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uGrid.value += (this.gridTarget - u.uGrid.value) * Math.min(1, dt * 8);
  }
}

function buildGeometry(grid: SettlementGrid, rings: number, segs: number): THREE.BufferGeometry {
  const R1 = PATCH.radius;
  const cell = SETTLEMENT.cellSize;
  const count = 1 + rings * segs;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const local = new Float32Array(count * 2);
  const nor = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  const write = (i: number, xu: number, yu: number) => {
    grid.surfacePoint(xu / cell, yu / cell, 0, v);
    pos.set([v.x, v.y, v.z], i * 3);
    v.normalize();
    nor.set([v.x, v.y, v.z], i * 3);
    uv.set([(xu + R1) / (2 * R1), (yu + R1) / (2 * R1)], i * 2);
    local.set([xu / cell, yu / cell], i * 2);
  };
  write(0, 0, 0);
  for (let r = 1; r <= rings; r++) {
    const rad = R1 * Math.pow(r / rings, 1.45);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      write(1 + (r - 1) * segs + s, Math.cos(a) * rad, Math.sin(a) * rad);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segs;
    const b0 = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, b0 + s, b0 + s1, a0 + s, b0 + s1, a0 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aLocal', new THREE.BufferAttribute(local, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
