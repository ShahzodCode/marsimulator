import type { BuildingInstance, GameState, Mission } from '../state/types';
import { createInitialState, makeBuilding } from '../state/factory';
import { starterRoads } from '../settlement/RoadRules';
import { checkPlacement } from '../settlement/PlacementRules';
import { storageCapacity } from '../data/buildings';
import { STARTING_BUILDINGS } from '../data/settlement';
import { rankForXp } from '../data/progression';
import { emptyResources } from '../data/resources';
import { PowerManager } from '../simulation/PowerManager';

/**
 * Versioned save format. Only durable game data is stored — transient UI state
 * (open panels, selection, placement mode, toasts) is reset on load.
 *
 * v1 → v2 (Stage 2): recipes, power and batteries, ice deposits, ranks, hydrogen.
 */
export const SAVE_VERSION = 2;

type SavedKeys =
  | 'timeSols'
  | 'speed'
  | 'resources'
  | 'colony'
  | 'buildings'
  | 'roads'
  | 'discoveredRegions'
  | 'progression'
  | 'missions'
  | 'deposits'
  | 'stats';

export interface SaveData {
  version: number;
  savedAt: string;
  state: Pick<GameState, SavedKeys> & { batteryKwh?: number };
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
      buildings: state.buildings.map((b) => ({ ...b, stored: { ...b.stored }, recipes: { ...b.recipes } })),
      roads: [...state.roads],
      discoveredRegions: { ...state.discoveredRegions },
      progression: { ...state.progression, milestones: [...state.progression.milestones] },
      missions: state.missions.map((m) => ({ ...m })),
      deposits: { ...state.deposits },
      stats: { produced: { ...state.stats.produced } },
      batteryKwh: state.power.batteryKwh,
    },
  };
}

export function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<SaveData>;
  return (
    (v.version === 1 || v.version === SAVE_VERSION) &&
    !!v.state &&
    Array.isArray(v.state.buildings) &&
    typeof v.state.timeSols === 'number' &&
    typeof v.state.resources === 'object'
  );
}

export function fromSave(save: SaveData): GameState {
  const base = createInitialState();
  const st = save.state as Partial<SaveData['state']> & Pick<SaveData['state'], 'buildings' | 'timeSols' | 'resources'>;
  const isStarter = (b: { type: string; gridX: number; gridY: number }) =>
    STARTING_BUILDINGS.some((s) => s.type === b.type && s.gridX === b.gridX && s.gridY === b.gridY);
  const buildings: BuildingInstance[] = st.buildings.map((raw) => {
    const b = raw as Partial<BuildingInstance> & BuildingInstance;
    return {
      ...b,
      connected: b.connected ?? false,
      stored: { ...(b.stored ?? {}) },
      starter: b.starter ?? isStarter(b),
      enabled: b.enabled ?? true,
      status: b.status ?? (b.constructionProgress >= 1 ? 'operational' : 'under_construction'),
      recipes: { ...(b.recipes ?? {}) },
      powered: b.powered ?? b.isOperational,
    };
  });
  // Saves from before the storage depot: it takes over the empty central plaza.
  if (!buildings.some((b) => b.type === 'storage_depot')) {
    const depot = base.buildings.find((b) => b.type === 'storage_depot');
    if (depot) buildings.unshift({ ...depot });
  }
  let roads = Array.isArray(st.roads) ? [...st.roads] : starterRoads(buildings);
  // v1 saves: the life-support plant no longer makes water from nothing, so the starter
  // base gains its ice drill — if its spot is still free.
  if (save.version < 2 && !buildings.some((b) => b.type === 'ice_drill')) {
    const spec = STARTING_BUILDINGS.find((b) => b.type === 'ice_drill');
    if (spec && !checkPlacement(spec.type, spec.gridX, spec.gridY, spec.rotation, buildings, new Set(roads))) {
      buildings.push({ ...makeBuilding(spec.type, spec.gridX, spec.gridY, spec.rotation, true, st.timeSols), starter: true });
      roads = starterRoads(buildings, roads);
    }
  }
  const missions: Mission[] = (st.missions ?? []).map((m) => ({ ...m, cost: m.cost ?? {}, energyKwh: m.energyKwh ?? 0 }));
  const xp = st.progression?.xp ?? 0;
  const batteryCapacityKwh = PowerManager.batteryCapacity(buildings);
  return {
    ...base,
    timeSols: st.timeSols,
    speed: st.speed ?? 1,
    colony: st.colony ?? base.colony,
    buildings,
    roads,
    missions,
    resources: { ...emptyResources(), ...st.resources },
    storage: storageCapacity(buildings),
    discoveredRegions: { ...base.discoveredRegions, ...st.discoveredRegions },
    // Ranks replaced the old six levels: work the rank out from XP.
    progression: { xp, level: rankForXp(xp).level, milestones: [...(st.progression?.milestones ?? [])] },
    deposits: st.deposits ? { ...st.deposits } : base.deposits,
    stats: { produced: { ...emptyResources(), ...(st.stats?.produced ?? {}) } },
    power: { ...base.power, batteryCapacityKwh, batteryKwh: Math.min(batteryCapacityKwh, st.batteryKwh ?? batteryCapacityKwh) },
    started: true,
    paused: true,
  };
}
