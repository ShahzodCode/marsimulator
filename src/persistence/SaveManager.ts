import { fromSave, isSaveData, toSave, type SaveData } from './SaveSchema';
import type { GameState } from '../state/types';

const DB_NAME = 'mars-colony';
const STORE = 'saves';
const DEFAULT_SLOT = 'slot-1';

/**
 * IndexedDB persistence (single slot for now). Every call fails gracefully —
 * e.g. in private browsing where IndexedDB may be unavailable.
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

  async save(state: GameState, slot = DEFAULT_SLOT): Promise<SaveData> {
    const data = toSave(state);
    await this.tx('readwrite', (s) => s.put(data, slot));
    return data;
  }

  async load(slot = DEFAULT_SLOT): Promise<GameState | null> {
    const raw = await this.tx<unknown>('readonly', (s) => s.get(slot));
    return isSaveData(raw) ? fromSave(raw) : null;
  }

  async info(slot = DEFAULT_SLOT): Promise<{ savedAt: string; sol: number } | null> {
    try {
      const raw = await this.tx<unknown>('readonly', (s) => s.get(slot));
      if (!isSaveData(raw)) return null;
      return { savedAt: raw.savedAt, sol: Math.floor(raw.state.timeSols) + 1 };
    } catch {
      return null;
    }
  }
}
