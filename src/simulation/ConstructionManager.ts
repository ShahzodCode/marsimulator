import { BUILDINGS, maxPowerKw, type BuildingType } from '../data/buildings';
import { checkPlacement, PROBLEM_TEXT } from '../settlement/PlacementRules';
import { makeBuilding } from '../state/factory';
import type { BuildingInstance, GameState } from '../state/types';
import { PowerManager } from './PowerManager';
import { ResourceManager, type Cost } from './ResourceManager';
import { buildCost, envOf, lockReason } from './BaseEnv';
import { Logistics } from './Logistics';
import { HOME_SITE_ID } from '../data/baseSites';

/** Bases joined by working pipelines share their stock for building (see Logistics.payFromNetwork). */
type Network = Partial<Pick<GameState, 'otherBases' | 'pipelines'>>;

export interface PlaceRequest {
  type: BuildingType;
  gridX: number;
  gridY: number;
  rotation: number;
}

export type ConstructionProblem = 'locked' | 'materials' | 'power' | 'placement';

export type ConstructionCheck = { ok: true } | { ok: false; code: ConstructionProblem; reason: string; missing?: Cost };

/**
 * Building construction: the checks before a building is placed, the single atomic
 * payment, and construction progress over simulation time.
 */
export const ConstructionManager = {
  /** Rank, materials and power — everything except where it goes. */
  canBuild(state: Pick<GameState, 'resources' | 'buildings' | 'progression' | 'research' | 'base'> & Network, type: BuildingType): ConstructionCheck {
    const env = envOf(state);
    const locked = lockReason(type, state, env);
    if (locked) return { ok: false, code: 'locked', reason: locked };
    const cost = buildCost(type, env);
    const stock = Logistics.pooledResources(state);
    if (!ResourceManager.canAfford(stock, cost)) {
      return {
        ok: false,
        code: 'materials',
        reason: ResourceManager.describeMissing(stock, cost),
        missing: ResourceManager.missing(stock, cost),
      };
    }
    const kw = maxPowerKw(type, env.heating);
    const power = PowerManager.canSupport(state.buildings, kw, env);
    if (!power.ok) {
      return {
        ok: false,
        code: 'power',
        reason: `Needs ${kw.toFixed(1)} kW but only ${Math.max(0, power.spareKw).toFixed(1)} kW is spare. Build a Solar Farm first!`,
      };
    }
    return { ok: true };
  },

  /**
   * Places a building: either every check passes, the full cost is paid once and
   * construction begins — or nothing changes at all.
   */
  place(
    state: Pick<GameState, 'resources' | 'buildings' | 'progression' | 'roads' | 'timeSols' | 'research' | 'base'> & Network,
    req: PlaceRequest,
  ):
    | { ok: true; resources: GameState['resources']; building: BuildingInstance; otherBases?: GameState['otherBases']; sent: { name: string; goods: Cost }[] }
    | { ok: false; code: ConstructionProblem; reason: string; missing?: Cost } {
    const check = ConstructionManager.canBuild(state, req.type);
    if (!check.ok) return check;
    const problem = checkPlacement(req.type, req.gridX, req.gridY, req.rotation, state.buildings, new Set(state.roads));
    if (problem) return { ok: false, code: 'placement', reason: PROBLEM_TEXT[problem] };
    const cost = buildCost(req.type, envOf(state));
    // The home base uses the crater patch's own projection; other bases the plain one.
    const origin = state.base.siteId === HOME_SITE_ID ? undefined : { lat: state.base.lat, lon: state.base.lon };
    const building = makeBuilding(req.type, req.gridX, req.gridY, req.rotation, false, state.timeSols, origin);
    if (state.otherBases && state.pipelines) {
      const paid = Logistics.payFromNetwork({ base: state.base, resources: state.resources, otherBases: state.otherBases, pipelines: state.pipelines }, cost);
      if (!paid) return { ok: false, code: 'materials', reason: ResourceManager.describeMissing(Logistics.pooledResources(state), cost) };
      return { ok: true, resources: paid.resources, otherBases: paid.sent.length ? paid.otherBases : undefined, building, sent: paid.sent };
    }
    const inv = new ResourceManager(state.resources, capacityFor(state.resources));
    const paid = inv.consumeAll(cost);
    if (!paid.ok) return { ok: false, code: 'materials', reason: paid.message, missing: paid.missing };
    return { ok: true, resources: inv.snapshot(), building, sent: [] };
  },

  /** Advances construction with simulation time. Returns the buildings that just finished. */
  advance(buildings: BuildingInstance[], dt: number): { buildings: BuildingInstance[]; completed: BuildingInstance[] } {
    const completed: BuildingInstance[] = [];
    if (dt <= 0) return { buildings, completed };
    let changed = false;
    const next = buildings.map((b) => {
      if (b.constructionProgress >= 1) return b;
      changed = true;
      const buildTime = BUILDINGS[b.type].buildTimeSols;
      const progress = buildTime > 0 ? Math.min(1, b.constructionProgress + dt / buildTime) : 1;
      if (progress < 1) return { ...b, constructionProgress: progress, status: 'under_construction' as const };
      const done: BuildingInstance = { ...b, constructionProgress: 1, isOperational: true, status: 'operational', statusNote: null, efficiency: 1 };
      completed.push(done);
      return done;
    });
    return { buildings: changed ? next : buildings, completed };
  },
};

/** The payment check doesn't depend on storage limits — use "unlimited" capacity. */
function capacityFor(r: GameState['resources']): GameState['resources'] {
  const out = { ...r };
  for (const k of Object.keys(out) as (keyof typeof out)[]) out[k] = Number.MAX_SAFE_INTEGER;
  return out;
}
