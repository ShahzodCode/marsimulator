import type { GameState } from '../state/types';
import { createInitialState } from '../state/gameStore';
import { starterRoads } from '../settlement/RoadRules';

/**
 * Versioned save format. Only durable game data is stored — transient UI state
 * (open panels, selection, placement mode, toasts) is reset on load.
 * Stage 3 will extend this with migrations, multiple slots and autosave.
 */
export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  savedAt: string;
  state: Pick<
    GameState,
    | 'timeSols'
    | 'speed'
    | 'resources'
    | 'colony'
    | 'buildings'
    | 'roads'
    | 'discoveredRegions'
    | 'progression'
    | 'missions'
  >;
}

export function toSave(state: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state: {
      timeSols: state.timeSols,
      speed: state.speed,
      resources: { ...state.resources },
      colony: { ...state.colony },
      buildings: state.buildings.map((b) => ({ ...b, stored: { ...b.stored } })),
      roads: [...state.roads],
      discoveredRegions: { ...state.discoveredRegions },
      progression: { ...state.progression, milestones: [...state.progression.milestones] },
      missions: state.missions.map((m) => ({ ...m })),
    },
  };
}

export function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<SaveData>;
  return (
    v.version === SAVE_VERSION &&
    !!v.state &&
    Array.isArray(v.state.buildings) &&
    typeof v.state.timeSols === 'number' &&
    typeof v.state.resources === 'object'
  );
}

export function fromSave(save: SaveData): GameState {
  const base = createInitialState();
  const buildings = save.state.buildings.map((b) => ({ ...b, connected: b.connected ?? false, stored: { ...(b.stored ?? {}) } }));
  // Saves from before player-built roads: pave access roads for the existing buildings.
  const roads = Array.isArray(save.state.roads) ? [...save.state.roads] : starterRoads(buildings);
  return {
    ...base,
    ...save.state,
    buildings,
    roads,
    resources: { ...base.resources, ...save.state.resources },
    discoveredRegions: { ...base.discoveredRegions, ...save.state.discoveredRegions },
    started: true,
    paused: true,
  };
}
