/**
 * Procedural, geography-driven Mars terrain.
 *
 * Builds an equirectangular elevation grid (km relative to the Mars datum) from:
 *   - the north/south crustal dichotomy (low northern plains, high cratered south)
 *   - the Tharsis and Elysium volcanic rises
 *   - real volcanoes, basins, named craters and Valles Marineris (see data/marsFeatures.ts)
 *   - many smaller random craters (more in the old southern highlands)
 *   - polar ice caps
 * Then derives a stylised colour map and an object-space normal map.
 *
 * Also contains the high-detail local terrain around the settlement (Jezero crater with
 * its river delta), which is shared by the worker (textures) and the main thread (heights).
 *
 * This module has no Three.js dependency so it can run inside a Web Worker.
 */

import { DEG, ELEVATION_EXAGGERATION, KM_TO_UNITS, MARS_RADIUS_KM, R } from './constants';
import {
  BASINS,
  BRIGHT_ALBEDO,
  DARK_ALBEDO,
  NAMED_CRATERS,
  POLAR_CAPS,
  VALLES_MARINERIS,
  VALLES_NORTH_BRANCH,
  VOLCANOES,
} from '../data/marsFeatures';
import { SETTLEMENT } from '../data/settlement';
import { SimplexNoise, clamp01, mulberry32, smoothstep } from './noise';

/** Extra lighting relief on top of the vertical exaggeration. */
export const NORMAL_STRENGTH = 1.7;

/** High-detail ground patch around the settlement (scene units). */
export const PATCH = {
  radius: 1.5,
  /** The globe is cut away inside this radius; the ring between hole and radius overlaps. */
  hole: 1.3,
};

const noise = new SimplexNoise(1971);
const detailNoise = new SimplexNoise(2021);

export interface HeightGrid {
  width: number;
  height: number;
  heights: Float32Array;
}

// ---------------------------------------------------------------------------
// Small vector helpers (plain arrays — no Three.js)
// ---------------------------------------------------------------------------

type V3 = [number, number, number];

function dirOf(lat: number, lon: number): V3 {
  const p = lat * DEG;
  const l = lon * DEG;
  const c = Math.cos(p);
  return [c * Math.sin(l), Math.sin(p), c * Math.cos(l)];
}

export interface Frame {
  c: V3;
  e: V3;
  n: V3;
}

export function makeFrame(lat: number, lon: number): Frame {
  const c = dirOf(lat, lon);
  const l = lon * DEG;
  const e: V3 = [Math.cos(l), 0, -Math.sin(l)];
  const n: V3 = [c[1] * e[2] - c[2] * e[1], c[2] * e[0] - c[0] * e[2], c[0] * e[1] - c[1] * e[0]];
  const len = Math.hypot(n[0], n[1], n[2]);
  n[0] /= len;
  n[1] /= len;
  n[2] /= len;
  return { c, e, n };
}

export const SETTLEMENT_FRAME = makeFrame(SETTLEMENT.lat, SETTLEMENT.lon);

// ---------------------------------------------------------------------------
// Grid sampling
// ---------------------------------------------------------------------------

export function sampleGrid(g: HeightGrid, lat: number, lon: number): number {
  const W = g.width;
  const H = g.height;
  let fx = ((lon + 180) / 360) * W - 0.5;
  fx = ((fx % W) + W) % W;
  let fy = ((90 - lat) / 180) * H - 0.5;
  if (fy < 0) fy = 0;
  if (fy > H - 1) fy = H - 1;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const i1 = (i0 + 1) % W;
  const j1 = Math.min(H - 1, j0 + 1);
  const h = g.heights;
  const a = h[j0 * W + i0] * (1 - tx) + h[j0 * W + i1] * tx;
  const b = h[j1 * W + i0] * (1 - tx) + h[j1 * W + i1] * tx;
  return a * (1 - ty) + b * ty;
}

// ---------------------------------------------------------------------------
// Local (settlement) terrain: Jezero crater, delta, Neretva Vallis, small craters
// ---------------------------------------------------------------------------

const JEZERO_RADIUS_KM = 22.5; // ~45 km diameter
const HOLE_KM = PATCH.hole / KM_TO_UNITS;
const CELL_KM = SETTLEMENT.cellSize / KM_TO_UNITS;
const FLAT_INNER_KM = SETTLEMENT.flattenRadius * CELL_KM * 0.9;
const FLAT_OUTER_KM = SETTLEMENT.flattenRadius * CELL_KM * 1.25;

interface SmallCrater {
  x: number;
  y: number;
  r: number;
  depth: number;
}

const LOCAL_CRATERS: SmallCrater[] = (() => {
  const rand = mulberry32(7);
  const out: SmallCrater[] = [];
  let guard = 0;
  while (out.length < 90 && guard++ < 2000) {
    const a = rand() * Math.PI * 2;
    const d = 17 + rand() * 26;
    const r = 0.35 + Math.pow(rand(), 2.5) * 2.6;
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r, depth: r * (0.12 + rand() * 0.1) });
  }
  return out;
})();

const BUCKET_KM = 6;
const BUCKET_EXTENT = 54;
const BUCKET_N = Math.ceil((BUCKET_EXTENT * 2) / BUCKET_KM);
const EMPTY: SmallCrater[] = [];
const CRATER_BUCKETS: SmallCrater[][] = (() => {
  const grid: SmallCrater[][] = Array.from({ length: BUCKET_N * BUCKET_N }, () => []);
  for (const c of LOCAL_CRATERS) {
    const r = c.r * 2.2;
    const i0 = Math.max(0, Math.floor((c.x - r + BUCKET_EXTENT) / BUCKET_KM));
    const i1 = Math.min(BUCKET_N - 1, Math.floor((c.x + r + BUCKET_EXTENT) / BUCKET_KM));
    const j0 = Math.max(0, Math.floor((c.y - r + BUCKET_EXTENT) / BUCKET_KM));
    const j1 = Math.min(BUCKET_N - 1, Math.floor((c.y + r + BUCKET_EXTENT) / BUCKET_KM));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * BUCKET_N + i].push(c);
  }
  return grid;
})();

/** Local tangent coordinates (km east / north of the settlement) and cos(angle) to its centre. */
export function localCoordsKm(lat: number, lon: number, out: number[]): number[] {
  const d = dirOf(lat, lon);
  const f = SETTLEMENT_FRAME;
  out[0] = (d[0] * f.e[0] + d[1] * f.e[1] + d[2] * f.e[2]) * MARS_RADIUS_KM;
  out[1] = (d[0] * f.n[0] + d[1] * f.n[1] + d[2] * f.n[2]) * MARS_RADIUS_KM;
  out[2] = d[0] * f.c[0] + d[1] * f.c[1] + d[2] * f.c[2];
  return out;
}

/** Neretva Vallis centre-line (local km), flattened x/y pairs. */
const NERETVA = new Float64Array([-48, 12, -38, 9, -29, 5.5, -21.5, 3.5]);

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const t = clamp01(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const vx = bx - ax;
  const vy = by - ay;
  const t = clamp01(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy));
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return [Math.hypot(dx, dy), t];
}

/** Height change (km) of local features at local coords (km). */
export function localDetailKm(x: number, y: number): number {
  const d = Math.hypot(x, y);
  let h = 0;

  // Jezero crater: flat floor, steep wall, raised rim with irregular height.
  const ang = Math.atan2(y, x);
  const rimVar = noise.noise3(Math.cos(ang) * 1.6, Math.sin(ang) * 1.6, 3.3);
  const rr = JEZERO_RADIUS_KM * (1 + 0.04 * rimVar);
  const t = d / rr;
  const rim = 0.28 + 0.1 * rimVar;
  if (t < 1) {
    h += -0.85 + (0.85 + rim) * Math.pow(smoothstep(0.72, 1.0, t), 1.25);
  } else {
    h += rim * Math.exp(-(((t - 1) / 0.32) ** 2));
  }

  // River delta fanning into the crater from the western rim.
  const ax = -21.5;
  const ay = 3.5;
  const dx = x - ax;
  const dy = y - ay;
  const fr = Math.hypot(dx, dy);
  if (dx > -1 && fr < 10) {
    const fa = Math.atan2(dy, dx);
    const lobe = 7.5 + 1.4 * Math.sin(fa * 5 + 1.0) + 0.8 * noise.noise3(dx * 0.3, dy * 0.3, 1.7);
    const spread = 1 - smoothstep(0.75, 1.15, Math.abs(fa) / 1.1);
    h += 0.16 * (1 - smoothstep(lobe * 0.6, lobe, fr)) * spread;
  }

  // Neretva Vallis — the old river channel that fed the lake.
  if (x < -18 && y > 0 && y < 15) {
    const ch = NERETVA;
    let best = 1e9;
    for (let i = 0; i < ch.length - 2; i += 2) {
      const dist = segmentDistance(x, y, ch[i], ch[i + 1], ch[i + 2], ch[i + 3]);
      if (dist < best) best = dist;
    }
    h -= 0.14 * (1 - smoothstep(0.6, 1.6, best));
  }

  // Small impact craters (looked up through a coarse spatial grid).
  const bi = Math.floor((x + BUCKET_EXTENT) / BUCKET_KM);
  const bj = Math.floor((y + BUCKET_EXTENT) / BUCKET_KM);
  const bucket = bi >= 0 && bj >= 0 && bi < BUCKET_N && bj < BUCKET_N ? CRATER_BUCKETS[bj * BUCKET_N + bi] : EMPTY;
  for (let i = 0; i < bucket.length; i++) {
    const c = bucket[i];
    const cx = x - c.x;
    if (cx > c.r * 2.2 || cx < -c.r * 2.2) continue;
    const cy = y - c.y;
    if (cy > c.r * 2.2 || cy < -c.r * 2.2) continue;
    const ct = Math.hypot(cx, cy) / c.r;
    if (ct < 1) h += -c.depth + (c.depth + c.depth * 0.25) * ct * ct;
    else if (ct < 2.2) h += c.depth * 0.25 * Math.exp(-(((ct - 1) / 0.4) ** 2));
  }

  // Fine surface roughness.
  h += 0.035 * detailNoise.fbm(x * 0.35, y * 0.35, 0.5, 3);
  return h;
}

const _lc = [0, 0, 0];
const COS_PATCH = Math.cos((PATCH.radius * 1.05) / R);

/**
 * Final height (km) at a location: global grid + local settlement detail + graded building pad.
 * `padKm` is the flat settlement elevation (see computePadKm).
 */
export function composeHeightKm(g: HeightGrid, lat: number, lon: number, padKm: number): number {
  localCoordsKm(lat, lon, _lc);
  if (_lc[2] < COS_PATCH) return sampleGrid(g, lat, lon);
  return composeLocal(g, lat, lon, _lc[0], _lc[1], padKm);
}

/** Same as composeHeightKm when the local coordinates (km) are already known. */
function composeLocal(g: HeightGrid, lat: number, lon: number, x: number, y: number, padKm: number): number {
  const base = sampleGrid(g, lat, lon);
  const d = Math.hypot(x, y);
  const w = 1 - smoothstep(0.72 * HOLE_KM, 0.95 * HOLE_KM, d);
  let h = base + (w > 0 ? w * localDetailKm(x, y) : 0);
  const f = 1 - smoothstep(FLAT_INNER_KM, FLAT_OUTER_KM, d);
  h += (padKm - h) * f;
  return h;
}

export function computePadKm(g: HeightGrid): number {
  return sampleGrid(g, SETTLEMENT.lat, SETTLEMENT.lon) + localDetailKm(0, 0);
}

// ---------------------------------------------------------------------------
// Global elevation grid
// ---------------------------------------------------------------------------

export interface GlobalMaps extends HeightGrid {
  color: Uint8Array;
  normal: Uint8Array;
}

type Progress = (fraction: number, label: string) => void;

interface GridCtx {
  W: number;
  H: number;
  heights: Float32Array;
  latOf: Float32Array;
  cosLat: Float32Array;
  sinLat: Float32Array;
  lonOf: Float32Array;
  cosLon: Float32Array;
  sinLon: Float32Array;
  progress: Progress;
}

// The generator is split into small passes: V8 optimises small hot functions far better
// than one giant function (measured ~5x faster).
export function generateGlobal(W: number, H: number, progress: Progress = () => {}): GlobalMaps {
  const heights = new Float32Array(W * H);
  const latOf = new Float32Array(H);
  const cosLat = new Float32Array(H);
  const sinLat = new Float32Array(H);
  const lonOf = new Float32Array(W);
  const cosLon = new Float32Array(W);
  const sinLon = new Float32Array(W);
  for (let j = 0; j < H; j++) {
    latOf[j] = 90 - ((j + 0.5) * 180) / H;
    cosLat[j] = Math.cos(latOf[j] * DEG);
    sinLat[j] = Math.sin(latOf[j] * DEG);
  }
  for (let i = 0; i < W; i++) {
    lonOf[i] = -180 + ((i + 0.5) * 360) / W;
    cosLon[i] = Math.cos(lonOf[i] * DEG);
    sinLon[i] = Math.sin(lonOf[i] * DEG);
  }

  const c: GridCtx = { W, H, heights, latOf, cosLat, sinLat, lonOf, cosLon, sinLon, progress };
  basePass(c);
  stampPass(c);
  const color = colorPass(c);
  const normal = normalPass(c);
  return { width: W, height: H, heights, color, normal };
}

function basePass(c: GridCtx): void {
  const { W, H, heights, latOf, cosLat, sinLat, lonOf, cosLon, sinLon, progress } = c;
  // --- 1. Base shape: dichotomy, rises, noise -------------------------------------------
  // Large-scale shape is computed at half resolution and upsampled; fine detail at full res.
  const tharsis = dirOf(2, 252);
  const elysium = dirOf(24, 147);
  const W2 = W >> 1;
  const H2 = H >> 1;
  const low = new Float32Array(W2 * H2);
  const lowNorth = new Float32Array(W2 * H2);
  for (let j = 0; j < H2; j++) {
    const lat = 90 - ((j + 0.5) * 180) / H2;
    const cl = Math.cos(lat * DEG);
    const y = Math.sin(lat * DEG);
    for (let i = 0; i < W2; i++) {
      const lon = -180 + ((i + 0.5) * 360) / W2;
      const x = cl * Math.sin(lon * DEG);
      const z = cl * Math.cos(lon * DEG);
      const warp = noise.fbm(x * 1.5 + 7, y * 1.5, z * 1.5, 2);
      const boundary = 12 + 25 * Math.cos((lon - 20) * DEG) + warp * 9;
      const north = smoothstep(-7, 7, lat - boundary);
      let h = 1.6 * (1 - north) - 4.1 * north;
      const dt = Math.acos(Math.min(1, x * tharsis[0] + y * tharsis[1] + z * tharsis[2]));
      h += 5.5 * Math.exp(-((dt / 0.46) ** 2));
      const de = Math.acos(Math.min(1, x * elysium[0] + y * elysium[1] + z * elysium[2]));
      h += 1.8 * Math.exp(-((de / 0.17) ** 2));
      const rough = 0.55 + 0.9 * (1 - north);
      h += rough * 1.1 * noise.fbm(x * 2.4, y * 2.4, z * 2.4, 4);
      low[j * W2 + i] = h;
      lowNorth[j * W2 + i] = north;
    }
    if ((j & 31) === 0) progress((j / H2) * 0.2, 'Shaping highlands and lowlands');
  }
  const lowGrid: HeightGrid = { width: W2, height: H2, heights: low };
  const northGrid: HeightGrid = { width: W2, height: H2, heights: lowNorth };
  for (let j = 0; j < H; j++) {
    const lat = latOf[j];
    for (let i = 0; i < W; i++) {
      const lon = lonOf[i];
      const x = cosLat[j] * sinLon[i];
      const y = sinLat[j];
      const z = cosLat[j] * cosLon[i];
      const highland = 1 - sampleGrid(northGrid, lat, lon);
      let h = sampleGrid(lowGrid, lat, lon);
      h += (0.25 + 0.4 * highland) * noise.fbm(x * 38 + 1, y * 38, z * 38, 2);
      h += 0.35 * highland * Math.abs(noise.noise3(x * 9 + 3, y * 9, z * 9));
      heights[j * W + i] = h;
    }
    if ((j & 63) === 0) progress(0.2 + (j / H) * 0.25, 'Shaping highlands and lowlands');
  }

}

function stampPass(c: GridCtx): void {
  const { W, H, heights, latOf, cosLat, sinLat, lonOf, cosLon, sinLon, progress } = c;
  // --- 2. Feature stamping ---------------------------------------------------------------
  const stamp = (lat0: number, lon0: number, influenceKm: number, fn: (dKm: number) => number) => {
    const angR = influenceKm / MARS_RADIUS_KM;
    const angD = angR / DEG;
    const c = dirOf(lat0, lon0);
    const cosMax = Math.cos(angR);
    const jMin = Math.max(0, Math.floor(((90 - (lat0 + angD)) / 180) * H) - 1);
    const jMax = Math.min(H - 1, Math.ceil(((90 - (lat0 - angD)) / 180) * H) + 1);
    const dLon = 360 / W;
    for (let j = jMin; j <= jMax; j++) {
      const cl = cosLat[j];
      const span = cl > 0.01 ? Math.min(180, angD / cl + dLon * 2) : 180;
      const iStart = Math.floor(((lon0 - span + 180) / 360) * W);
      const count = Math.min(W, Math.ceil((2 * span) / dLon) + 2);
      for (let k = 0; k < count; k++) {
        const i = (((iStart + k) % W) + W) % W;
        const dot = cl * sinLon[i] * c[0] + sinLat[j] * c[1] + cl * cosLon[i] * c[2];
        if (dot < cosMax) continue;
        const d = Math.acos(Math.min(1, dot)) * MARS_RADIUS_KM;
        heights[j * W + i] += fn(d);
      }
    }
  };

  for (const b of BASINS) {
    stamp(b.lat, b.lon, b.radius * 1.5, (d) => {
      const t = d / b.radius;
      const inner = -b.depth * (1 - smoothstep(0.3, 1.0, t));
      return inner + b.rim * Math.exp(-(((t - 1) / 0.13) ** 2));
    });
  }
  progress(0.5, 'Carving impact basins');

  for (const v of VOLCANOES) {
    stamp(v.lat, v.lon, v.radius * 1.05, (d) => {
      const t = d / v.radius;
      if (t >= 1) return 0;
      let h = v.height * Math.pow(1 - Math.pow(t, 0.9), 1.6);
      // Olympus Mons is ringed by a steep escarpment several km high.
      if (v.height > 15) h = v.height * (0.75 * Math.pow(1 - Math.pow(t, 0.9), 1.6) + 0.25 * smoothstep(1.0, 0.93, t));
      if (d < v.calderaRadius) h -= Math.min(3, v.height * 0.15) * (1 - (d / v.calderaRadius) ** 2);
      return h;
    });
  }
  progress(0.55, 'Raising volcanoes');

  const craterFn = (diameter: number, degrade: number, peak = 0) => {
    const r = diameter / 2;
    const depth = (diameter < 12 ? 0.2 * diameter : Math.pow(diameter, 0.3)) * degrade * (diameter > 300 ? 0.55 : 1);
    const rim = Math.min(depth * 0.3, 1.3);
    const complex = diameter > 25;
    return (d: number) => {
      const t = d / r;
      if (t < 1) {
        const s = complex ? Math.pow(smoothstep(0.3, 1.0, t), 1.3) : t * t;
        let h = -depth + (depth + rim) * s;
        if (peak > 0) h += peak * Math.exp(-((t / 0.28) ** 2));
        return h;
      }
      return rim * Math.exp(-(((t - 1) / 0.38) ** 2));
    };
  };

  for (const c of NAMED_CRATERS) stamp(c.lat, c.lon, c.diameter * 1.15, craterFn(c.diameter, 1, c.centralPeak ?? 0));

  // Random craters: denser in the southern highlands, none near the settlement.
  const rand = mulberry32(1965); // Mariner 4 — first close-up images of Martian craters
  const home = dirOf(SETTLEMENT.lat, SETTLEMENT.lon);
  let placed = 0;
  for (let n = 0; n < 9000 && placed < 2600; n++) {
    const lat = Math.asin(2 * rand() - 1) / DEG;
    const lon = rand() * 360 - 180;
    const diameter = 14 * Math.pow(1 - rand() * (1 - Math.pow(14 / 180, 1.5)), -1 / 1.5);
    const degrade = 0.35 + 0.65 * rand();
    const base = sampleGrid({ width: W, height: H, heights }, lat, lon);
    const keep = base > 0 ? 0.95 : 0.3;
    if (rand() > keep) continue;
    const d = dirOf(lat, lon);
    if (d[0] * home[0] + d[1] * home[1] + d[2] * home[2] > Math.cos(4 * DEG)) continue;
    stamp(lat, lon, diameter * 1.15, craterFn(diameter, degrade));
    placed++;
  }
  progress(0.62, 'Scattering craters');

  const canyon = (pts: [number, number, number, number][]) => {
    let latMin = 90;
    let latMax = -90;
    let lonMin = 360;
    let lonMax = -360;
    for (const p of pts) {
      latMin = Math.min(latMin, p[0]);
      latMax = Math.max(latMax, p[0]);
      lonMin = Math.min(lonMin, p[1]);
      lonMax = Math.max(lonMax, p[1]);
    }
    const pad = 5;
    const j0 = Math.max(0, Math.floor(((90 - (latMax + pad)) / 180) * H));
    const j1 = Math.min(H - 1, Math.ceil(((90 - (latMin - pad)) / 180) * H));
    for (let j = j0; j <= j1; j++) {
      const lat = latOf[j];
      const kmLon = cosLat[j] * DEG * MARS_RADIUS_KM;
      const kmLat = DEG * MARS_RADIUS_KM;
      const iFirst = Math.floor(((lonMin - pad + 180) / 360) * W);
      const iCount = Math.ceil(((lonMax - lonMin + 2 * pad) / 360) * W) + 1;
      for (let k = 0; k < iCount; k++) {
        const i = (((iFirst + k) % W) + W) % W;
        let lonE = lonOf[i];
        while (lonE < lonMin - pad - 1) lonE += 360;
        let best = 1e9;
        let hw = 0;
        let dep = 0;
        for (let s = 0; s < pts.length - 1; s++) {
          const a = pts[s];
          const b = pts[s + 1];
          const [dist, t] = distToSegment(lonE * kmLon, lat * kmLat, a[1] * kmLon, a[0] * kmLat, b[1] * kmLon, b[0] * kmLat);
          if (dist < best) {
            best = dist;
            hw = a[2] + (b[2] - a[2]) * t;
            dep = a[3] + (b[3] - a[3]) * t;
          }
        }
        if (best > hw * 1.3) continue;
        const wobble = 1 + 0.25 * noise.noise3(lonE * 0.4, lat * 0.4, 9.1);
        const q = best / (hw * wobble);
        heights[j * W + i] -= dep * (1 - smoothstep(0.5, 1.0, q));
      }
    }
  };
  canyon(VALLES_MARINERIS);
  canyon(VALLES_NORTH_BRANCH);
  progress(0.66, 'Cutting Valles Marineris');

  // Polar layered deposits (domes of ice).
  stamp(POLAR_CAPS.north.lat, POLAR_CAPS.north.lon, POLAR_CAPS.north.radiusDeg * DEG * MARS_RADIUS_KM * 1.3, (d) => {
    const a = d / MARS_RADIUS_KM / DEG;
    return POLAR_CAPS.north.height * (1 - smoothstep(POLAR_CAPS.north.radiusDeg * 0.25, POLAR_CAPS.north.radiusDeg * 1.15, a));
  });
  stamp(POLAR_CAPS.south.lat, POLAR_CAPS.south.lon, POLAR_CAPS.south.radiusDeg * DEG * MARS_RADIUS_KM * 2.2, (d) => {
    const a = d / MARS_RADIUS_KM / DEG;
    return POLAR_CAPS.south.height * (1 - smoothstep(POLAR_CAPS.south.radiusDeg * 0.3, POLAR_CAPS.south.radiusDeg * 2.0, a));
  });

}

function colorPass(c: GridCtx): Uint8Array {
  const { W, H, heights, latOf, cosLat, sinLat, cosLon, sinLon, progress } = c;
  // --- 3. Colour ------------------------------------------------------------------------
  const color = new Uint8Array(W * H * 4);
  const dark = DARK_ALBEDO.map(([la, lo, r, s]) => ({ c: dirOf(la, lo), r, s, cosMax: Math.cos(r * 1.5 * DEG) }));
  const bright = BRIGHT_ALBEDO.map(([la, lo, r, s]) => ({ c: dirOf(la, lo), r, s, cosMax: Math.cos(r * 1.5 * DEG) }));
  const southCap = dirOf(POLAR_CAPS.south.lat, POLAR_CAPS.south.lon);
  const rgb: V3 = [0, 0, 0];
  for (let j = 0; j < H; j++) {
    const lat = latOf[j];
    for (let i = 0; i < W; i++) {
      const x = cosLat[j] * sinLon[i];
      const y = sinLat[j];
      const z = cosLat[j] * cosLon[i];
      const h = heights[j * W + i];
      heightColor(h, rgb);
      const n1 = noise.fbm(x * 6 + 11, y * 6, z * 6, 2);
      const v = 1 + 0.09 * n1;
      rgb[0] *= v;
      rgb[1] *= v * (1 + 0.03 * n1);
      rgb[2] *= v;

      let edgeNoise = NaN;
      for (const b of bright) {
        const dot = x * b.c[0] + y * b.c[1] + z * b.c[2];
        if (dot < b.cosMax) continue;
        if (edgeNoise !== edgeNoise) edgeNoise = noise.fbm(x * 4 + 2, y * 4 + 9, z * 4, 2);
        const a = Math.acos(Math.min(1, dot)) / DEG;
        const m = (1 - smoothstep(b.r * 0.35, b.r * 1.3, a + edgeNoise * b.r * 0.4)) * b.s;
        rgb[0] += (0.9 - rgb[0]) * m * 0.45;
        rgb[1] += (0.63 - rgb[1]) * m * 0.45;
        rgb[2] += (0.43 - rgb[2]) * m * 0.45;
      }
      for (const b of dark) {
        const dot = x * b.c[0] + y * b.c[1] + z * b.c[2];
        if (dot < b.cosMax) continue;
        if (edgeNoise !== edgeNoise) edgeNoise = noise.fbm(x * 4 + 2, y * 4 + 9, z * 4, 2);
        const a = Math.acos(Math.min(1, dot)) / DEG;
        const m = (1 - smoothstep(b.r * 0.3, b.r * 1.25, a + edgeNoise * b.r * 0.5)) * b.s;
        rgb[0] += (rgb[0] * 0.52 - rgb[0]) * m;
        rgb[1] += (rgb[1] * 0.5 - rgb[1]) * m;
        rgb[2] += (rgb[2] * 0.56 - rgb[2]) * m;
      }

      // Polar ice.
      const capNoise = lat > 68 || lat < -70 ? noise.fbm(x * 8, y * 8, z * 8 + 4, 3) : 0;
      let ice = 0;
      let spiral = 0;
      if (lat > 70) {
        const a = 90 - lat;
        const r = POLAR_CAPS.north.radiusDeg + capNoise * 2.2;
        ice = 1 - smoothstep(r - 1.2, r + 0.6, a);
        const lonR = Math.atan2(x, z);
        spiral = smoothstep(0.82, 0.98, Math.sin(lonR * 1 + a * 0.85 + capNoise * 2));
        const frost = (1 - smoothstep(r, r + 4.5, a)) * 0.35;
        ice = Math.max(ice, frost);
      } else if (lat < -72) {
        const a = Math.acos(Math.min(1, x * southCap[0] + y * southCap[1] + z * southCap[2])) / DEG;
        const r = POLAR_CAPS.south.radiusDeg + capNoise * 1.6;
        ice = 1 - smoothstep(r - 1.0, r + 0.5, a);
        const frost = (1 - smoothstep(r, r + 9, a)) * 0.4;
        ice = Math.max(ice, frost);
      }
      if (ice > 0) {
        const ir = 0.95 - spiral * 0.2;
        const ig = 0.93 - spiral * 0.28;
        const ib = 0.92 - spiral * 0.33;
        rgb[0] += (ir - rgb[0]) * ice;
        rgb[1] += (ig - rgb[1]) * ice;
        rgb[2] += (ib - rgb[2]) * ice;
      }

      // Gentle stylisation: a touch more saturation.
      const lum = rgb[0] * 0.3 + rgb[1] * 0.59 + rgb[2] * 0.11;
      const o = (j * W + i) * 4;
      color[o] = toByte(lum + (rgb[0] - lum) * 1.12);
      color[o + 1] = toByte(lum + (rgb[1] - lum) * 1.12);
      color[o + 2] = toByte(lum + (rgb[2] - lum) * 1.12);
      color[o + 3] = 255;
    }
    if ((j & 63) === 0) progress(0.66 + (j / H) * 0.22, 'Painting the red planet');
  }

  return color;
}

function normalPass(c: GridCtx): Uint8Array {
  const { W, H, heights, cosLat, sinLat, cosLon, sinLon, progress } = c;
  // --- 4. Normals -----------------------------------------------------------------------
  const normal = new Uint8Array(W * H * 4);
  const k = ELEVATION_EXAGGERATION * NORMAL_STRENGTH;
  const dyKm = (180 / H) * DEG * MARS_RADIUS_KM;
  for (let j = 0; j < H; j++) {
    const jn = Math.max(0, j - 1);
    const js = Math.min(H - 1, j + 1);
    const cl = cosLat[j];
    const sl = sinLat[j];
    const dxKm = (360 / W) * DEG * MARS_RADIUS_KM * Math.max(cl, 0.05);
    for (let i = 0; i < W; i++) {
      const ie = (i + 1) % W;
      const iw = (i - 1 + W) % W;
      const sx = (heights[j * W + ie] - heights[j * W + iw]) / (2 * dxKm);
      const sy = (heights[jn * W + i] - heights[js * W + i]) / ((js - jn) * dyKm || dyKm);
      writeNormal(normal, (j * W + i) * 4, cl, sl, cosLon[i], sinLon[i], sx * k, sy * k);
    }
  }
  progress(0.9, 'Calculating sunlight on slopes');

  return normal;
}

function writeNormal(out: Uint8Array, o: number, cl: number, sl: number, cLon: number, sLon: number, sx: number, sy: number) {
  // up, east, north basis at (lat, lon)
  const ux = cl * sLon;
  const uy = sl;
  const uz = cl * cLon;
  const ex = cLon;
  const ez = -sLon;
  const nx = -sl * sLon;
  const ny = cl;
  const nz = -sl * cLon;
  let x = ux - ex * sx - nx * sy;
  let y = uy - ny * sy;
  let z = uz - ez * sx - nz * sy;
  const len = Math.hypot(x, y, z) || 1;
  x /= len;
  y /= len;
  z /= len;
  out[o] = toByte(x * 0.5 + 0.5);
  out[o + 1] = toByte(y * 0.5 + 0.5);
  out[o + 2] = toByte(z * 0.5 + 0.5);
  out[o + 3] = 255;
}

const HEIGHT_STOPS: [number, number, number, number][] = [
  [-8, 0.36, 0.17, 0.11],
  [-4.5, 0.5, 0.24, 0.14],
  [-1.5, 0.63, 0.31, 0.17],
  [1.0, 0.73, 0.4, 0.22],
  [4.5, 0.79, 0.49, 0.29],
  [11, 0.84, 0.59, 0.41],
  [20, 0.88, 0.7, 0.54],
];

function heightColor(h: number, out: V3): V3 {
  const s = HEIGHT_STOPS;
  if (h <= s[0][0]) {
    out[0] = s[0][1];
    out[1] = s[0][2];
    out[2] = s[0][3];
    return out;
  }
  for (let i = 1; i < s.length; i++) {
    if (h <= s[i][0]) {
      const t = (h - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
      out[0] = s[i - 1][1] + (s[i][1] - s[i - 1][1]) * t;
      out[1] = s[i - 1][2] + (s[i][2] - s[i - 1][2]) * t;
      out[2] = s[i - 1][3] + (s[i][3] - s[i - 1][3]) * t;
      return out;
    }
  }
  const l = s[s.length - 1];
  out[0] = l[1];
  out[1] = l[2];
  out[2] = l[3];
  return out;
}

function toByte(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
}

// ---------------------------------------------------------------------------
// Settlement patch textures (high-detail local area)
// ---------------------------------------------------------------------------

export interface PatchMaps {
  size: number;
  color: Uint8Array;
  normal: Uint8Array;
}

/** Converts a patch texel's local offset (scene units) to lat / lon. */
export function patchOffsetToLatLon(xu: number, yu: number, out: number[]): number[] {
  const f = SETTLEMENT_FRAME;
  const px = f.c[0] * R + f.e[0] * xu + f.n[0] * yu;
  const py = f.c[1] * R + f.e[1] * xu + f.n[1] * yu;
  const pz = f.c[2] * R + f.e[2] * xu + f.n[2] * yu;
  const len = Math.hypot(px, py, pz);
  out[0] = Math.asin(py / len) / DEG;
  out[1] = Math.atan2(px, pz) / DEG;
  return out;
}

function sampleColor(g: GlobalMaps, lat: number, lon: number, out: V3): V3 {
  const W = g.width;
  const H = g.height;
  let fx = ((lon + 180) / 360) * W - 0.5;
  fx = ((fx % W) + W) % W;
  const fy = Math.min(H - 1, Math.max(0, ((90 - lat) / 180) * H - 0.5));
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const i1 = (i0 + 1) % W;
  const j1 = Math.min(H - 1, j0 + 1);
  const c = g.color;
  for (let k = 0; k < 3; k++) {
    const a = c[(j0 * W + i0) * 4 + k] * (1 - tx) + c[(j0 * W + i1) * 4 + k] * tx;
    const b = c[(j1 * W + i0) * 4 + k] * (1 - tx) + c[(j1 * W + i1) * 4 + k] * tx;
    out[k] = (a * (1 - ty) + b * ty) / 255;
  }
  return out;
}

export function generatePatch(g: GlobalMaps, size: number, progress: Progress = () => {}): PatchMaps {
  const pad = computePadKm(g);
  const heights = new Float32Array(size * size);
  const color = new Uint8Array(size * size * 4);
  const ll = [0, 0];
  const rgb: V3 = [0, 0, 0];
  const span = PATCH.radius * 2;
  const holeKm = HOLE_KM;
  const flatKm = SETTLEMENT.flattenRadius * CELL_KM;
  const buildKm = SETTLEMENT.buildRadius * CELL_KM;

  for (let py = 0; py < size; py++) {
    const yu = ((py + 0.5) / size - 0.5) * span;
    for (let px = 0; px < size; px++) {
      const xu = ((px + 0.5) / size - 0.5) * span;
      patchOffsetToLatLon(xu, yu, ll);
      // The frame is orthonormal, so local km coords follow directly from the offsets.
      const len = Math.sqrt(R * R + xu * xu + yu * yu);
      const x = (xu / len) * MARS_RADIUS_KM;
      const y = (yu / len) * MARS_RADIUS_KM;
      heights[py * size + px] = composeLocal(g, ll[0], ll[1], x, y, pad);
      sampleColor(g, ll[0], ll[1], rgb);
      const d = Math.hypot(x, y);
      const w = 1 - smoothstep(0.72 * holeKm, 0.95 * holeKm, d);
      if (w > 0) applyLocalColor(x, y, d, w, rgb, buildKm, flatKm);
      const o = (py * size + px) * 4;
      color[o] = toByte(rgb[0]);
      color[o + 1] = toByte(rgb[1]);
      color[o + 2] = toByte(rgb[2]);
      color[o + 3] = 255;
    }
    if ((py & 31) === 0) progress(0.9 + (py / size) * 0.08, 'Mapping Jezero crater');
  }

  const normal = patchNormals(heights, size, span);
  progress(1, 'Ready');
  return { size, color, normal };
}

function applyLocalColor(x: number, y: number, d: number, w: number, rgb: V3, buildKm: number, flatKm: number): void {
    let r = rgb[0];
    let gg = rgb[1];
    let b = rgb[2];
    const t = d / JEZERO_RADIUS_KM;
    // Crater floor: darker, slightly brown-grey lake sediments.
    const floor = 1 - smoothstep(0.7, 0.95, t);
    r *= 1 - 0.1 * floor;
    gg *= 1 - 0.1 * floor;
    b *= 1 - 0.02 * floor;
    // Bright crater rim.
    const rimBand = Math.exp(-(((t - 1.0) / 0.08) ** 2));
    r += (0.86 - r) * 0.25 * rimBand;
    gg += (0.6 - gg) * 0.25 * rimBand;
    b += (0.45 - b) * 0.25 * rimBand;
    // Delta: pale, layered sediments.
    const dx = x + 21.5;
    const dy = y - 3.5;
    const fr = Math.hypot(dx, dy);
    if (dx > -1 && fr < 10.5) {
      const fa = Math.atan2(dy, dx);
      const lobe = 7.5 + 1.4 * Math.sin(fa * 5 + 1.0) + 0.8 * noise.noise3(dx * 0.3, dy * 0.3, 1.7);
      const m = (1 - smoothstep(lobe * 0.8, lobe * 1.02, fr)) * (1 - smoothstep(0.8, 1.15, Math.abs(fa) / 1.1));
      const bands = 0.5 + 0.5 * Math.sin(fr * 4.2 + noise.noise3(dx, dy, 0) * 1.5);
      r += (0.86 + 0.05 * bands - r) * m * 0.7;
      gg += (0.66 + 0.05 * bands - gg) * m * 0.7;
      b += (0.5 + 0.04 * bands - b) * m * 0.7;
    }
    // Wind streaks and dust.
    const streak = detailNoise.fbm(x * 0.08 + y * 0.03, y * 0.6 - x * 0.2, 2.2, 2);
    const s = 1 + 0.08 * streak;
    r *= s;
    gg *= s;
    b *= s;
    // Scattered rocks.
    const rock = detailNoise.noise3(x * 4.5, y * 4.5, 7.7);
    if (rock > 0.55) {
      const k = (rock - 0.55) * 1.6;
      r *= 1 - k * 0.5;
      gg *= 1 - k * 0.5;
      b *= 1 - k * 0.45;
    }
    // Graded settlement pad: compacted, lighter regolith with a soft edge.
    const padM = 1 - smoothstep(buildKm * 0.97, flatKm * 1.02, d);
    const padTex = 1 + 0.04 * detailNoise.noise3(x * 1.5, y * 1.5, 3);
    r += (0.8 * padTex - r) * padM * 0.35;
    gg += (0.55 * padTex - gg) * padM * 0.35;
    b += (0.4 * padTex - b) * padM * 0.35;
    const edge = Math.exp(-(((d - buildKm) / 0.15) ** 2));
    r += (0.95 - r) * edge * 0.25;
    gg += (0.75 - gg) * edge * 0.25;
    b += (0.55 - b) * edge * 0.25;

    rgb[0] += (r - rgb[0]) * w;
    rgb[1] += (gg - rgb[1]) * w;
    rgb[2] += (b - rgb[2]) * w;
}

function patchNormals(heights: Float32Array, size: number, span: number): Uint8Array {
  // Object-space normals from the patch heights.
  const normal = new Uint8Array(size * size * 4);
  const k = ELEVATION_EXAGGERATION * NORMAL_STRENGTH;
  const stepKm = span / size / KM_TO_UNITS;
  const f = SETTLEMENT_FRAME;
  for (let py = 0; py < size; py++) {
    const yu = ((py + 0.5) / size - 0.5) * span;
    const pn = Math.min(size - 1, py + 1);
    const ps = Math.max(0, py - 1);
    for (let px = 0; px < size; px++) {
      const xu = ((px + 0.5) / size - 0.5) * span;
      const pe = Math.min(size - 1, px + 1);
      const pw = Math.max(0, px - 1);
      const sx = ((heights[py * size + pe] - heights[py * size + pw]) / ((pe - pw) * stepKm)) * k;
      const sy = ((heights[pn * size + px] - heights[ps * size + px]) / ((pn - ps) * stepKm)) * k;
      let ux = f.c[0] * R + f.e[0] * xu + f.n[0] * yu;
      let uy = f.c[1] * R + f.e[1] * xu + f.n[1] * yu;
      let uz = f.c[2] * R + f.e[2] * xu + f.n[2] * yu;
      const ul = Math.hypot(ux, uy, uz);
      ux /= ul;
      uy /= ul;
      uz /= ul;
      let nx = ux - f.e[0] * sx - f.n[0] * sy;
      let ny = uy - f.e[1] * sx - f.n[1] * sy;
      let nz = uz - f.e[2] * sx - f.n[2] * sy;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const o = (py * size + px) * 4;
      normal[o] = toByte(nx * 0.5 + 0.5);
      normal[o + 1] = toByte(ny * 0.5 + 0.5);
      normal[o + 2] = toByte(nz * 0.5 + 0.5);
      normal[o + 3] = 255;
    }
  }
  return normal;
}
