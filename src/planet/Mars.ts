import * as THREE from 'three';
import { R, latLonToDir, type LatLon } from './geo';
import { PATCH, SETTLEMENT_FRAME } from './terrainGen';
import type { Terrain } from './Terrain';
import { GLSL_NOISE, GLSL_REGIONS } from './shaders';
import { REGIONS } from '../data/regions';

/** Most bases that get a detailed ground patch (and a hole in the globe). */
export const MAX_HOLES = 12;

export interface GlobeUniforms {
  uDiscovered: { value: number[] };
  uHover: { value: number };
  uSelected: { value: number };
  uHoleDirs: { value: THREE.Vector3[] };
  uHoleCount: { value: number };
  uHoleCos: { value: number };
  uDetail: { value: number };
  uAtmo: { value: number };
  uBorders: { value: number };
  /** X-ray (radar) view: 0 = normal surface, 1 = full subsurface view. */
  uXray: { value: number };
  /** Depth being looked at (km) and how deep the orbiter's radar reaches (km). */
  uDepthKm: { value: number };
  uMaxDepthKm: { value: number };
  /** Scene units the surface is lowered by in X-ray view. */
  uSink: { value: number };
  /** Known deposits: xyz = direction, w = kind (see DEPOSIT_KIND). */
  uDeposits: { value: THREE.Vector4[] };
  uDepositCount: { value: number };
}

/** Deposit kinds shown in the X-ray view. */
export const DEPOSIT_KIND = { glacier: 1, hematite: 2, clays: 3, lavaTube: 4, deepWater: 5, groundIce: 6 } as const;
const MAX_DEPOSITS = 64;

export interface XrayView {
  on: boolean;
  depthKm: number;
  maxDepthKm: number;
}

/**
 * The Mars globe: displaced sphere + stylised colour / normal maps, fog of war,
 * region borders, atmosphere glow and a star field.
 */
export class Mars {
  readonly group = new THREE.Group();
  readonly globe: THREE.Mesh;
  readonly uniforms: GlobeUniforms;
  private atmosphere: THREE.Mesh;
  private atmoMaterial: THREE.ShaderMaterial;
  private stars: THREE.Points;

  constructor(terrain: Terrain) {
    this.uniforms = {
      uDiscovered: { value: REGIONS.map(() => 0) },
      uHover: { value: -1 },
      uSelected: { value: -1 },
      uHoleDirs: { value: Array.from({ length: MAX_HOLES }, (_, i) => (i === 0 ? new THREE.Vector3(...SETTLEMENT_FRAME.c) : new THREE.Vector3())) },
      uHoleCount: { value: 1 },
      uHoleCos: { value: Math.cos(PATCH.hole / R) },
      uDetail: { value: 0 },
      uAtmo: { value: 1 },
      uBorders: { value: 1 },
      uXray: { value: 0 },
      uDepthKm: { value: 0 },
      uMaxDepthKm: { value: 1 },
      uSink: { value: 0 },
      uDeposits: { value: Array.from({ length: MAX_DEPOSITS }, () => new THREE.Vector4()) },
      uDepositCount: { value: 0 },
    };

    const geometry = buildGlobeGeometry(terrain, 512, 256);
    const material = new THREE.MeshStandardMaterial({
      map: terrain.textures.color,
      normalMap: terrain.textures.normal,
      normalMapType: THREE.ObjectSpaceNormalMap,
      roughness: 0.93,
      metalness: 0,
    });
    this.patchGlobeShader(material);
    this.globe = new THREE.Mesh(geometry, material);
    this.globe.name = 'mars-globe';
    this.group.add(this.globe);

    // Atmosphere halo (back-face shell, additive).
    this.atmoMaterial = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 1 }, uColor: { value: new THREE.Color(1.0, 0.58, 0.38) } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          float d = dot(normalize(vNormal), normalize(-vPos));
          float i = pow(clamp(-d / 0.24, 0.0, 1.0), 3.0);
          gl_FragColor = vec4(uColor * i * 0.75 * uOpacity, 1.0);
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 96, 48), this.atmoMaterial);
    this.atmosphere.renderOrder = 2;
    this.group.add(this.atmosphere);

    this.stars = buildStars(5000);
    this.group.add(this.stars);
  }

  /** Cuts the globe away under every base's detailed ground (Jezero first). */
  setHoles(sites: LatLon[]): void {
    const n = Math.min(MAX_HOLES, sites.length);
    for (let i = 0; i < n; i++) latLonToDir(sites[i].lat, sites[i].lon, this.uniforms.uHoleDirs.value[i]);
    this.uniforms.uHoleCount.value = n;
  }

  private xrayTarget = 0;

  /** Turns the radar view on/off and sets the depth being looked at. */
  setXray(v: XrayView): void {
    this.xrayTarget = v.on ? 1 : 0;
    this.uniforms.uDepthKm.value = v.depthKm;
    this.uniforms.uMaxDepthKm.value = Math.max(0.001, v.maxDepthKm);
  }

  get xrayAmount(): number {
    return this.uniforms.uXray.value;
  }

  /** Deposits the radar can show (only where the orbiter has mapped). */
  setDeposits(list: { lat: number; lon: number; kind: number }[]): void {
    const n = Math.min(MAX_DEPOSITS, list.length);
    const d = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      latLonToDir(list[i].lat, list[i].lon, d);
      this.uniforms.uDeposits.value[i].set(d.x, d.y, d.z, list[i].kind);
    }
    this.uniforms.uDepositCount.value = n;
  }

  /** Per-frame visual updates driven by the camera altitude. */
  update(cameraPosition: THREE.Vector3, altitude: number, dt = 0.016): void {
    const u = this.uniforms;
    u.uXray.value += (this.xrayTarget - u.uXray.value) * Math.min(1, dt * 5);
    if (Math.abs(this.xrayTarget - u.uXray.value) < 1e-3) u.uXray.value = this.xrayTarget;
    // The surface is lowered as you look deeper (exaggerated so it shows from orbit).
    const frac = Math.min(1, u.uDepthKm.value / u.uMaxDepthKm.value);
    u.uSink.value = u.uXray.value * (0.25 + 1.75 * frac);
    this.stars.position.copy(cameraPosition);
    this.uniforms.uDetail.value = 1 - THREE.MathUtils.smoothstep(altitude, 3, 25);
    this.uniforms.uAtmo.value = THREE.MathUtils.smoothstep(altitude, 4, 40);
    this.atmoMaterial.uniforms.uOpacity.value = THREE.MathUtils.smoothstep(altitude, 6, 60) * (1 - u.uXray.value);
    this.uniforms.uBorders.value = THREE.MathUtils.smoothstep(altitude, 2.5, 12);
  }

  private patchGlobeShader(material: THREE.MeshStandardMaterial): void {
    const u = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec2 vGeoUv;')
        .replace('#include <common>', '#include <common>\nuniform float uSink;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvGeoUv = uv;\ntransformed -= normalize(position) * uSink;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vObjPos;
          varying vec2 vGeoUv;
          uniform float uDiscovered[${REGIONS.length}];
          uniform float uHover;
          uniform float uSelected;
          uniform vec3 uHoleDirs[${MAX_HOLES}];
          uniform int uHoleCount;
          uniform float uHoleCos;
          uniform float uDetail;
          uniform float uAtmo;
          uniform float uBorders;
          uniform float uXray;
          uniform float uDepthKm;
          uniform float uMaxDepthKm;
          uniform vec4 uDeposits[${MAX_DEPOSITS}];
          uniform int uDepositCount;
          ${GLSL_NOISE}
          // Radar signal (0..1) of each deposit kind at depth dk, for a direction.
          // Depth ranges follow published measurements (docs/sources.md): ground ice in the top
          // metres (SWIM, Phoenix), buried glaciers 80-170 m thick (Utopia, SHARAD), polar caps
          // about 3 km thick, lava-tube roofs tens of metres down, InSight's water 11.5-20 km down.
          float band(float dk, float top, float bottom) {
            float soft = max(0.004, (bottom - top) * 0.15);
            return smoothstep(top - soft, top, dk) * (1.0 - smoothstep(bottom, bottom + soft, dk));
          }
          vec4 depositAt(vec3 dir, float dk) {
            vec3 col = vec3(0.0);
            float a = 0.0;
            for (int i = 0; i < ${MAX_DEPOSITS}; i++) {
              if (i >= uDepositCount) break;
              vec4 d = uDeposits[i];
              float ang = acos(clamp(dot(dir, d.xyz), -1.0, 1.0)) * 3389.5;
              int k = int(d.w + 0.5);
              float r = k == 5 ? 1400.0 : (k == 1 ? 380.0 : (k == 4 ? 160.0 : 260.0));
              float near = 1.0 - smoothstep(r * 0.55, r, ang);
              if (near <= 0.0) continue;
              float s = 0.0;
              vec3 c = vec3(0.0);
              if (k == 1) { s = band(dk, 0.01, 0.17); c = vec3(0.55, 0.9, 1.0); }
              else if (k == 2) { s = band(dk, 0.0, 0.06); c = vec3(1.0, 0.35, 0.2); }
              else if (k == 3) { s = band(dk, 0.0, 0.35); c = vec3(0.45, 1.0, 0.55); }
              else if (k == 4) { s = band(dk, 0.02, 0.2); c = vec3(1.0, 0.5, 1.0); }
              else if (k == 5) { s = band(dk, 11.5, 20.0); c = vec3(0.2, 0.55, 1.0); }
              else if (k == 6) { s = band(dk, 0.0, 0.03); c = vec3(0.7, 0.95, 1.0); }
              float v = s * near;
              if (v > a) { a = v; col = c; }
            }
            return vec4(col, a);
          }
          ${GLSL_REGIONS}
          float fogAt(float lat, float lonE) {
            return uDiscovered[int(regionIndex(lat, mod(lonE + 360.0, 360.0)))];
          }`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec3 gDir = normalize(vObjPos);
          for (int hi = 0; hi < ${MAX_HOLES}; hi++) {
            if (hi >= uHoleCount) break;
            if (dot(gDir, uHoleDirs[hi]) > uHoleCos) discard;
          }
          float gLat = 90.0 - vGeoUv.y * 180.0;
          float gLon = vGeoUv.x * 360.0 - 180.0;
          float lonE = mod(gLon + 360.0, 360.0);
          // Close-up micro detail so the surface stays crisp when zoomed in.
          float dn = gNoise(gDir * 900.0) * 0.55 + gNoise(gDir * 3100.0) * 0.45;
          diffuseColor.rgb *= mix(1.0, 0.84 + 0.32 * dn, uDetail);
          // Fog of war: undiscovered regions are dark, desaturated and hatched.
          float cosl = max(cos(radians(gLat)), 0.1);
          float o = 0.5;
          float disc = (fogAt(gLat, lonE) * 2.0 + fogAt(gLat + o, lonE) + fogAt(gLat - o, lonE)
                      + fogAt(gLat, lonE + o / cosl) + fogAt(gLat, lonE - o / cosl)) / 6.0;
          float lumi = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          float hatch = step(0.82, fract((gLat + gLon * cosl) * 0.9)) * 0.03;
          vec3 hidden = mix(vec3(lumi), diffuseColor.rgb, 0.22) * vec3(0.56, 0.54, 0.62) + vec3(0.01, 0.015, 0.03) + hatch;
          diffuseColor.rgb = mix(hidden, diffuseColor.rgb, disc);
          float rIdx = regionIndex(gLat, lonE);
          float hov = 1.0 - step(0.5, abs(rIdx - uHover));
          float sel = 1.0 - step(0.5, abs(rIdx - uSelected));
          diffuseColor.rgb += vec3(0.04, 0.07, 0.09) * hov * uBorders + vec3(0.05, 0.09, 0.12) * sel * uBorders;
          vec3 xrayGlow = vec3(0.0);
          if (uXray > 0.001) {
            // Deeper = blurrier: the radar's picture gets coarser (like MARSIS vs SHARAD).
            float frac = clamp(uDepthKm / uMaxDepthKm, 0.0, 1.0);
            float cell = mix(0.12, 3.5, pow(frac, 0.7));
            float qLat = (floor(gLat / cell) + 0.5) * cell;
            float qLon = (floor(gLon * cosl / cell) + 0.5) * cell / cosl;
            vec2 quv = vec2((qLon + 180.0) / 360.0, (90.0 - qLat) / 180.0);
            vec3 qDir = vec3(cos(radians(qLat)) * sin(radians(qLon)), sin(radians(qLat)), cos(radians(qLat)) * cos(radians(qLon)));
            vec3 ghost = texture2D(map, quv).rgb;
            float lum = dot(ghost, vec3(0.3, 0.59, 0.11));
            // Rock strata: bands that drift with depth.
            float strata = 0.5 + 0.5 * sin((qLat * 0.35 + qLon * 0.11) + uDepthKm * 6.0 + gNoise(qDir * 6.0 + uDepthKm) * 4.0);
            vec3 rock = mix(vec3(0.16, 0.1, 0.09), vec3(0.32, 0.2, 0.15), strata) * (0.6 + 0.8 * lum);
            vec3 xr = mix(mix(ghost, vec3(lum), 0.6) * 0.8, rock, smoothstep(0.0, 0.25, frac + 0.05));
            // Dimmer the deeper you look.
            xr *= mix(1.0, 0.28, frac);
            vec4 dep = depositAt(qDir, uDepthKm);
            float mapped = step(0.5, disc);
            xr = mix(xr, dep.rgb * 0.5, dep.a * 0.6 * mapped);
            xrayGlow = dep.rgb * dep.a * mapped * mix(1.1, 0.6, frac);
            // No radar data outside mapped regions: static.
            float noiseS = fract(sin(dot(floor(vec2(qLat, qLon) * 4.0), vec2(12.9898, 78.233))) * 43758.5453);
            xr = mix(vec3(0.05 + 0.08 * noiseS), xr, mapped);
            // Polar caps are ice down to about 3 km.
            float cap = smoothstep(78.0, 82.0, abs(qLat)) * band(uDepthKm, 0.0, 3.0) * mapped;
            xr = mix(xr, vec3(0.6, 0.85, 1.0) * mix(0.9, 0.4, frac), cap * 0.8);
            xrayGlow += vec3(0.3, 0.5, 0.7) * cap * 0.4;
            diffuseColor.rgb = mix(diffuseColor.rgb, xr, uXray);
            xrayGlow *= uXray;
          }
          `,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // Region borders (anti-aliased lines in degree space).
            float fw = max(fwidth(gLat), 1e-4);
            float dLat = min(min(abs(gLat - 65.0), abs(gLat - 30.0)), min(abs(gLat), min(abs(gLat + 30.0), abs(gLat + 65.0))));
            float w = gLat >= 30.0 && gLat < 65.0 ? 60.0 : (gLat > -65.0 && gLat <= -30.0 ? 60.0 : 45.0);
            float dLon = abs(fract(lonE / w + 0.5) - 0.5) * w * cosl;
            if (gLat >= 65.0 || gLat <= -65.0) dLon = 1e3;
            float dist = min(dLat, dLon);
            float line = 1.0 - smoothstep(fw * 0.4, fw * 1.3, dist);
            vec3 lineCol = mix(vec3(0.45, 0.62, 0.78), vec3(0.4, 0.95, 1.0), max(hov, sel));
            totalEmissiveRadiance += lineCol * line * (0.14 + 0.45 * max(hov, sel)) * uBorders;
            // Atmospheric limb haze.
            vec3 vN = normalize((viewMatrix * vec4(gDir, 0.0)).xyz);
            float rim = pow(1.0 - clamp(dot(vN, normalize(vViewPosition)), 0.0, 1.0), 3.0);
            totalEmissiveRadiance += vec3(0.9, 0.5, 0.32) * rim * 0.32 * uAtmo * (1.0 - uXray);
            totalEmissiveRadiance += xrayGlow;
          }
          `,
        );
    };
    material.customProgramCacheKey = () => 'mars-globe-v2';
  }
}

function buildGlobeGeometry(terrain: Terrain, lonSegs: number, latSegs: number): THREE.BufferGeometry {
  const count = (lonSegs + 1) * (latSegs + 1);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let p = 0;
  let t = 0;
  for (let j = 0; j <= latSegs; j++) {
    const lat = 90 - (j / latSegs) * 180;
    const phi = THREE.MathUtils.degToRad(lat);
    for (let i = 0; i <= lonSegs; i++) {
      const lon = -180 + (i / lonSegs) * 360;
      const lam = THREE.MathUtils.degToRad(lon);
      const x = Math.cos(phi) * Math.sin(lam);
      const y = Math.sin(phi);
      const z = Math.cos(phi) * Math.cos(lam);
      const r = terrain.radiusAt(lat, lon);
      pos[p] = x * r;
      pos[p + 1] = y * r;
      pos[p + 2] = z * r;
      nor[p] = x;
      nor[p + 1] = y;
      nor[p + 2] = z;
      p += 3;
      uv[t++] = i / lonSegs;
      uv[t++] = j / latSegs;
    }
  }
  const idx = new Uint32Array(lonSegs * latSegs * 6);
  let k = 0;
  const row = lonSegs + 1;
  for (let j = 0; j < latSegs; j++) {
    for (let i = 0; i < lonSegs; i++) {
      const a = j * row + i;
      const b = (j + 1) * row + i;
      const c = (j + 1) * row + i + 1;
      const d = j * row + i + 1;
      idx[k++] = a;
      idx[k++] = b;
      idx[k++] = c;
      idx[k++] = a;
      idx[k++] = c;
      idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// Real-sky star counts: the Yale Bright Star Catalogue holds ~9,110 stars down to magnitude 6.5 (the
// naked-eye limit), and the count grows ~3x per magnitude (log10 slope 0.475 ≈ 22 stars brighter than mag 1
// up to 9,110 at 6.5). See docs/sources.md.
const BSC_COUNT = 9110;
const BSC_LIMIT_MAG = 6.5;
const COUNT_SLOPE = 0.475;
const BRIGHTEST_MAG = -1.46; // Sirius

// Rough share of naked-eye stars per spectral class, with a muted eye-perceived tint (game estimate).
const STAR_TINTS: [share: number, r: number, g: number, b: number][] = [
  [0.2, 0.68, 0.78, 1.0], // B — blue-white
  [0.22, 0.85, 0.9, 1.0], // A — white
  [0.13, 1.0, 0.98, 0.95], // F — yellow-white
  [0.15, 1.0, 0.93, 0.82], // G — pale yellow
  [0.25, 1.0, 0.82, 0.62], // K — orange
  [0.05, 1.0, 0.68, 0.48], // M — red-orange
];

function pickTint(): [number, number, number] {
  let u = Math.random();
  for (const [share, r, g, b] of STAR_TINTS) {
    if ((u -= share) <= 0) return [r, g, b];
  }
  const last = STAR_TINTS[STAR_TINTS.length - 1];
  return [last[1], last[2], last[3]];
}

/**
 * Star field with a realistic brightness spread: magnitudes are drawn from the real cumulative star-count
 * curve, so most stars are faint pinpricks and only a handful are bright. One draw call, no textures.
 */
function buildStars(count: number): THREE.Points {
  // Faintest magnitude such that `count` stars fill the sky at real density.
  const limitMag = BSC_LIMIT_MAG + Math.log10(count / BSC_COUNT) / COUNT_SLOPE;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(1400);
    pos.set([v.x, v.y, v.z], i * 3);
    // Inverse of N(<m) ∝ 10^(slope·m).
    const mag = Math.max(BRIGHTEST_MAG, limitMag + Math.log10(1 - Math.random()) / COUNT_SLOPE);
    // Pogson scale: 5 magnitudes = 100x flux. Faintest star sits at 0.28 intensity; flux past full
    // intensity is shown as a larger (still soft) disc instead.
    const flux = 0.28 * Math.pow(10, -0.4 * (mag - limitMag));
    const b = Math.min(flux, 1);
    size[i] = Math.min(1.6 * Math.pow(Math.max(flux, 1), 0.33), 6.5);
    const [r, g, bl] = pickTint();
    col.set([r * b, g * b, bl * b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec3 color;
      uniform float uPixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        // Soft round disc: bright core, gentle falloff.
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.35, 1.0, d);
        gl_FragColor = vec4(vColor * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.renderOrder = -10;
  pts.frustumCulled = false;
  return pts;
}
