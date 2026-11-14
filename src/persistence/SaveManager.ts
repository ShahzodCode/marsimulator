import { fromSave, isSaveData, toSave, type SaveData } from './SaveSchema';
import type { GameState } from '../state/types';
import { CloudSaves } from './CloudSaves';
import { LocalPrefs } from './LocalPrefs';
import { Auth } from './Auth';

export interface SaveResult {
  data: SaveData;
  /** The save also reached Supabase. */
  cloud: boolean;
  /** Why the cloud copy failed (the local copy is still saved). */
  cloudError?: string;
}

const DB_NAME = 'mars-colony';
const STORE = 'saves';
const DEFAULT_SLOT = 'slot-1';

/**
 * Saves go to IndexedDB on this device first, then to Supabase (cloud) for the
 * signed-in account (guests save on this device only). Each account gets its
 * own local copy, so logging in on a shared device never mixes up two players' colonies. Loading picks whichever copy is newer, so progress
 * survives cleared browser data and an offline session still syncs on the next save.
 * Every call fails gracefully — e.g. offline, or in private browsing.
 */
export class SaveManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is not available in this browser.'));
          return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Could not open save database.'));
      });
      this.dbPromise.catch(() => (this.dbPromise = null));
    }
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Save database error.'));
    });
  }

  /** IndexedDB key: guests use the bare slot (as before accounts existed), accounts are prefixed by user id. */
  private async localKey(slot: string, owner?: string | null): Promise<string> {
    await Auth.ready;
    const id = owner === undefined ? (Auth.current?.id ?? null) : owner;
    return id ? `${id}:${slot}` : slot;
  }

  private async putLocal(data: SaveData, slot: string, owner?: string | null): Promise<void> {
    const key = await this.localKey(slot, owner);
    await this.tx('readwrite', (s) => s.put(data, key));
  }

  private async getLocal(slot: string, owner?: string | null): Promise<SaveData | null> {
    try {
      const key = await this.localKey(slot, owner);
      const raw = await this.tx<unknown>('readonly', (s) => s.get(key));
      return isSaveData(raw) ? raw : null;
    } catch {
      return null;
    }
  }

  private async getCloud(slot: string): Promise<SaveData | null> {
    try {
      return await CloudSaves.get(slot);
    } catch (e) {
      console.warn('Cloud load failed', e);
      return null;
    }
  }

  /** Newest of the local and cloud copies. */
  private async newest(slot: string): Promise<SaveData | null> {
    const [local, cloud] = await Promise.all([this.getLocal(slot), this.getCloud(slot)]);
    if (!local) return cloud;
    if (!cloud) return local;
    return Date.parse(cloud.savedAt) > Date.parse(local.savedAt) ? cloud : local;
  }

  async save(state: GameState, slot = DEFAULT_SLOT): Promise<SaveResult> {
    const data = toSave(state);
    let localError: Error | null = null;
    try {
      await this.putLocal(data, slot);
    } catch (e) {
      localError = e as Error;
    }
    let cloud = false;
    let cloudError: string | undefined;
    try {
      cloud = await CloudSaves.put(data, slot);
      if (!cloud) cloudError = 'offline';
    } catch (e) {
      cloudError = (e as Error).message;
      console.warn('Cloud save failed', e);
    }
    if (localError && !cloud) throw localError;
    LocalPrefs.set('lastSave', { savedAt: data.savedAt, sol: Math.floor(data.state.timeSols) + 1, cloud, owner: Auth.current?.id ?? null });
    return { data, cloud, cloudError };
  }

  async load(slot = DEFAULT_SLOT): Promise<GameState | null> {
    const save = await this.newest(slot);
    if (!save) return null;
    // Keep the local copy in step with the cloud one (e.g. on a new device).
    this.putLocal(save, slot).catch(() => {});
    return fromSave(save);
  }

  async info(slot = DEFAULT_SLOT): Promise<{ savedAt: string; sol: number } | null> {
    const save = await this.newest(slot);
    return save ? { savedAt: save.savedAt, sol: Math.floor(save.state.timeSols) + 1 } : null;
  }

  /**
   * Local-only copy for a given owner (account id, or null for the guest). Used to
   * keep the previous player's colony on this device when someone logs in or out.
   */
  async saveLocalFor(state: GameState, owner: string | null, slot = DEFAULT_SLOT): Promise<void> {
    await this.putLocal(toSave(state), slot, owner);
  }

  /** Quick summary from localStorage — no network or database needed. */
  cachedInfo(): { savedAt: string; sol: number; cloud: boolean } | null {
    const last = LocalPrefs.get('lastSave');
    if (!last || (last.owner ?? null) !== (Auth.current?.id ?? null)) return null;
    return last;
  }
}
