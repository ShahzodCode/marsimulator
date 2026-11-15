import type { ActiveProject, BaseData, BaseMeta, BuildingInstance, GameState, Mission, ResearchState } from '../state/types';
import type { TechId } from '../data/research';
import { createInitialState, makeBuilding } from '../state/factory';
import { starterRoads } from '../settlement/RoadRules';
import { checkPlacement } from '../settlement/PlacementRules';
import { storageCapacity } from '../data/buildings';
import { STARTING_BUILDINGS } from '../data/settlement';
import { rankForXp } from '../data/progression';
import { emptyResources } from '../data/resources';
import { PowerManager } from '../simulation/PowerManager';
import { LOG_LIMIT } from '../state/gameStore';

/**
 * Versioned save format. Only durable game data is stored — transient UI state
 * (open panels, selection, placement mode, toasts) is reset on load.
 *
 * v1 → v2 (Stage 2): recipes, power and batteries, ice deposits, ranks, hydrogen.
 * v2 → v3: NASA-style exploration (orbital maps, crew expeditions, outposts).
 * v3 → v4: several bases, base sites, research, families (colony.growth).
 * v4 → v5: pipelines and cargo haulers between bases.
 */
export const SAVE_VERSION = 5;

type SavedKeys =
  | 'timeSols'
  | 'speed'
  | 'resources'
  | 'colony'
  | 'buildings'
  | 'roads'
  | 'discoveredRegions'
  | 'exploredRegions'
  | 'outposts'
  | 'progression'
  | 'missions'
  | 'deposits'
  | 'stats'
  | 'base'
  | 'otherBases'
  | 'sitesSeen'
  | 'research'
  | 'pipelines'
  | 'shipments'
  | 'log';

export interface SaveData {
  version: number;
  savedAt: string;
  state: Pick<GameState, SavedKeys> & { batteryKwh?: number };
}

function copyBase(b: BaseData): BaseData {
  return {
    ...b,
    resources: { ...b.resources },
    storage: { ...b.storage },
    rates: { ...b.rates },
    power: { ...b.power },
    deposits: { ...b.deposits },
    colony: { ...b.colony },
    buildings: b.buildings.map((x) => ({ ...x, stored: { ...x.stored }, recipes: { ...x.recipes } })),
    roads: [...b.roads],
  };
}

/** Older saves ran one project at a time, stored as `active: id` with its stage beside it. */
function loadActiveResearch(r: ResearchState | LegacyResearch): ActiveProject[] {
  if (Array.isArray(r.active)) return r.active.map((p) => ({ ...p }));
  const old = r as LegacyResearch;
  return old.active ? [{ id: old.active, stage: old.stage ?? 0, progress: old.progress ?? 0, awaiting: old.awaiting ?? false }] : [];
}

interface LegacyResearch {
  active: TechId | null;
  stage?: number;
  progress?: number;
  awaiting?: boolean;
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
      exploredRegions: { ...state.exploredRegions },
      outposts: state.outposts.map((o) => ({ ...o })),
      progression: { ...state.progression, milestones: [...state.progression.milestones] },
      missions: state.missions.map((m) => ({ ...m })),
      deposits: { ...state.deposits },
      stats: { produced: { ...state.stats.produced } },
      batteryKwh: state.power.batteryKwh,
      base: { ...state.base },
      otherBases: state.otherBases.map(copyBase),
      sitesSeen: { ...state.sitesSeen },
      research: { completed: [...state.research.completed], active: state.research.active.map((p) => ({ ...p })), shelved: { ...state.research.shelved } },
      pipelines: state.pipelines.map((p) => ({ ...p, flow: { ...p.flow }, faults: p.faults.map((f) => ({ ...f })) })),
      shipments: state.shipments.map((x) => ({ ...x, cargo: { ...x.cargo } })),
      log: state.log.map((x) => ({ ...x })),
    },
  };
}

export function isSaveData(value: unknown): value is SaveData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<SaveData>;
  return (
    typeof v.version === 'number' && v.version >= 1 && v.version <= SAVE_VERSION &&
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
  // Before v3, a "survey rover" both mapped and visited a region. Those regions count as
  // explored; old missions still on the way are finished (their reward was paid at launch).
  const discoveredRegions = { ...base.discoveredRegions, ...st.discoveredRegions };
  const legacy = save.version < 3;
  const oldMissions = (st.missions ?? []) as (Mission | { type: 'survey'; regionId: string; status: string })[];
  if (legacy) for (const m of oldMissions) if (m.type === 'survey') discoveredRegions[m.regionId] = true;
  const missions: Mission[] = legacy ? [] : (oldMissions as Mission[]).map((m) => ({ ...m }));
  const exploredRegions = legacy ? { ...discoveredRegions } : { ...base.exploredRegions, ...(st.exploredRegions ?? {}) };
  const xp = st.progression?.xp ?? 0;
  const batteryCapacityKwh = PowerManager.batteryCapacity(buildings);
  // Before v4 there was one base (Jezero) and no research or base sites.
  const activeBase: BaseMeta = st.base ? { ...st.base } : { ...base.base };
  // Saves from before staged research count old progress towards the concept study.
  const research: ResearchState = st.research
    ? { completed: [...st.research.completed], active: loadActiveResearch(st.research), shelved: { ...(st.research.shelved ?? {}) } }
    : base.research;
  return {
    ...base,
    base: activeBase,
    otherBases: (st.otherBases ?? []).map(copyBase),
    sitesSeen: { ...base.sitesSeen, ...(st.sitesSeen ?? {}) },
    research,
    pipelines: (st.pipelines ?? []).map((p) => ({ ...p, flow: { ...(p.flow ?? {}) }, working: p.working ?? false, faults: (p.faults ?? []).map((f) => ({ ...f })) })),
    shipments: (st.shipments ?? []).map((x) => ({ ...x, cargo: { ...x.cargo } })),
    log: (st.log ?? []).slice(-LOG_LIMIT).map((x) => ({ ...x })),
    timeSols: st.timeSols,
    speed: st.speed ?? 1,
    colony: { ...base.colony, ...(st.colony ?? {}), growth: st.colony?.growth ?? 0 },
    buildings,
    roads,
    missions,
    resources: { ...emptyResources(), ...st.resources },
    storage: storageCapacity(buildings),
    discoveredRegions,
    exploredRegions,
    outposts: (st.outposts ?? []).map((o) => ({ ...o })),
    // Ranks replaced the old six levels: work the rank out from XP.
    progression: { xp, level: rankForXp(xp).level, milestones: [...(st.progression?.milestones ?? [])] },
    deposits: st.deposits ? { ...st.deposits } : base.deposits,
    stats: { produced: { ...emptyResources(), ...(st.stats?.produced ?? {}) } },
    power: { ...base.power, batteryCapacityKwh, batteryKwh: Math.min(batteryCapacityKwh, st.batteryKwh ?? batteryCapacityKwh) },
    started: true,
    paused: true,
  };
}
