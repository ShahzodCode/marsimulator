/**
 * Caches the generated planet maps in IndexedDB so later visits start almost instantly.
 * The key includes a version: bump TERRAIN_VERSION whenever the generator changes.
 * Every operation fails silently — the game simply regenerates the terrain.
 */

export const TERRAIN_VERSION = 4;

export interface CachedTerrain {
  width: number;
  height: number;
  heights: Float32Array;
  color: Uint8Array;
  normal: Uint8Array;
  patchSize: number;
  patchColor: Uint8Array;
  patchNormal: Uint8Array;
}

const DB = 'mars-colony-terrain';
const STORE = 'maps';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function terrainKey(width: number, height: number, patchSize: number): string {
  return `v${TERRAIN_VERSION}-${width}x${height}-p${patchSize}`;
}

export async function readTerrain(key: string): Promise<CachedTerrain | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => {
        const v = req.result as CachedTerrain | undefined;
        resolve(v && v.heights instanceof Float32Array && v.color instanceof Uint8Array ? v : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function writeTerrain(key: string, data: CachedTerrain): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear(); // keep only the current version
    store.put(data, key);
  } catch {
    /* caching is optional */
  }
}
