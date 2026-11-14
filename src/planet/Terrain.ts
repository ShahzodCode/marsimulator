import * as THREE from 'three';
import type { TerrainRequest, TerrainResponse } from './terrain.worker';
import { composeHeightKm, computePadKm, type HeightGrid } from './terrainGen';
import { R, kmToUnitsHeight, latLonToDir } from './geo';
import { readTerrain, terrainKey, writeTerrain, type CachedTerrain } from '../persistence/TerrainCache';

const GLOBAL_W = 2048;
const GLOBAL_H = 1024;
const PATCH_SIZE = 1024;

export interface TerrainTextures {
  color: THREE.DataTexture;
  normal: THREE.DataTexture;
  patchColor: THREE.DataTexture;
  patchNormal: THREE.DataTexture;
}

/**
 * Main-thread terrain: generates maps in a worker, then answers height queries
 * (used by the globe mesh, settlement ground, building placement and the camera).
 */
export class Terrain {
  readonly grid: HeightGrid;
  readonly padKm: number;
  readonly textures: TerrainTextures;

  private constructor(data: CachedTerrain) {
    this.grid = { width: data.width, height: data.height, heights: data.heights };
    this.padKm = computePadKm(this.grid);
    this.textures = {
      color: makeTexture(data.color, data.width, data.height, true, true),
      normal: makeTexture(data.normal, data.width, data.height, false, true),
      patchColor: makeTexture(data.patchColor, data.patchSize, data.patchSize, true, false),
      patchNormal: makeTexture(data.patchNormal, data.patchSize, data.patchSize, false, false),
    };
  }

  /** Loads the planet from the IndexedDB cache, or generates it in a Web Worker. */
  static async load(onProgress: (fraction: number, label: string) => void): Promise<Terrain> {
    const key = terrainKey(GLOBAL_W, GLOBAL_H, PATCH_SIZE);
    const t0 = performance.now();
    onProgress(0.02, 'Checking mission archives');
    const cached = await readTerrain(key);
    if (cached) {
      console.info(`[terrain] loaded from cache in ${(performance.now() - t0).toFixed(0)} ms`);
      return new Terrain(cached);
    }
    const data = await Terrain.generate(onProgress);
    // Cache in the background (IndexedDB stores a structured-clone copy).
    void writeTerrain(key, data);
    return new Terrain(data);
  }

  private static generate(onProgress: (fraction: number, label: string) => void): Promise<CachedTerrain> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<TerrainResponse>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          onProgress(msg.fraction, msg.label);
          return;
        }
        worker.terminate();
        console.info(`[terrain] generated in ${msg.ms.toFixed(0)} ms`);
        resolve(msg);
      };
      worker.onerror = (err) => {
        worker.terminate();
        reject(err);
      };
      const req: TerrainRequest = { width: GLOBAL_W, height: GLOBAL_H, patchSize: PATCH_SIZE };
      worker.postMessage(req);
    });
  }

  heightKm(lat: number, lon: number): number {
    return composeHeightKm(this.grid, lat, lon, this.padKm);
  }

  /** Surface height above the reference sphere, in scene units (exaggerated). */
  heightUnits(lat: number, lon: number): number {
    return kmToUnitsHeight(this.heightKm(lat, lon));
  }

  radiusAt(lat: number, lon: number): number {
    return R + this.heightUnits(lat, lon);
  }

  surfacePoint(lat: number, lon: number, lift = 0, out = new THREE.Vector3()): THREE.Vector3 {
    return latLonToDir(lat, lon, out).multiplyScalar(this.radiusAt(lat, lon) + lift);
  }
}

function makeTexture(data: Uint8Array, w: number, h: number, srgb: boolean, wrapX: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = wrapX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
