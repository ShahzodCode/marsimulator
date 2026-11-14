import type { PanelId } from '../state/types';

/**
 * Small, non-critical player data kept in localStorage (camera view, last panel,
 * last-save summary, autosave toggle). Every access is guarded: storage can be
 * blocked or empty, and the game must work without it.
 */
export interface Prefs {
  camera?: { lat: number; lon: number; alt: number };
  lastPanel?: PanelId | null;
  /** `owner` is the account id the save belongs to (null for a guest). */
  lastSave?: { savedAt: string; sol: number; cloud: boolean; owner?: string | null };
  autosave?: boolean;
}

const KEY = 'mars-colony:prefs:v1';

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return v && typeof v === 'object' ? (v as Prefs) : {};
  } catch {
    return {};
  }
}

export const LocalPrefs = {
  get<K extends keyof Prefs>(key: K): Prefs[K] {
    return read()[key];
  },
  set<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [key]: value }));
    } catch {
      /* storage is optional */
    }
  },
};
