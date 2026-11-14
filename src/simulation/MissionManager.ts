import { SURVEY, rewardFor } from '../data/missions';
import { hasRank, rankById } from '../data/progression';
import { SETTLEMENT } from '../data/settlement';
import type { RegionManager } from '../planet/RegionManager';
import { makeId } from '../state/factory';
import type { GameState, Mission } from '../state/types';
import { ResourceManager, type Cost } from './ResourceManager';

export type MissionCheck = { ok: true } | { ok: false; reason: string };

type MissionState = Pick<GameState, 'discoveredRegions' | 'missions' | 'resources' | 'power' | 'progression' | 'timeSols'>;

/**
 * Exploration missions: requirements, launch (one atomic payment of materials and battery
 * energy), progress over simulation time, and the one-time reward on arrival.
 */
export const MissionManager = {
  durationSols(regions: RegionManager, regionId: string): number {
    const km = regions.distanceKm(SETTLEMENT.lat, SETTLEMENT.lon, regionId);
    return SURVEY.baseSols + km / SURVEY.kmPerSol;
  },

  check(state: MissionState, regions: RegionManager, regionId: string): MissionCheck {
    if (!regions.get(regionId)) return { ok: false, reason: 'Unknown region.' };
    if (state.discoveredRegions[regionId]) return { ok: false, reason: 'Already explored.' };
    if (state.missions.some((m) => m.status === 'active' && m.regionId === regionId)) return { ok: false, reason: 'A rover is already on its way.' };
    if (!regions.isFrontier(regionId, state.discoveredRegions)) return { ok: false, reason: 'Too far — explore a neighbouring region first.' };
    const reward = rewardFor(regionId);
    if (!hasRank(state.progression.level, reward.rank)) return { ok: false, reason: `Long-range mission — unlocks at rank ${rankById(reward.rank!).title}.` };
    if (state.missions.filter((m) => m.status === 'active').length >= SURVEY.maxConcurrent) return { ok: false, reason: `Only ${SURVEY.maxConcurrent} rovers can be out at once.` };
    if (!ResourceManager.canAfford(state.resources, SURVEY.cost)) return { ok: false, reason: ResourceManager.describeMissing(state.resources, SURVEY.cost) };
    if (state.power.batteryKwh + 1e-9 < SURVEY.energyKwh) {
      return { ok: false, reason: `The rover needs ${SURVEY.energyKwh} kWh to charge, but the batteries have ${Math.floor(state.power.batteryKwh)} kWh. Wait for the sun!` };
    }
    return { ok: true };
  },

  /** Pays everything at once and creates the mission — or changes nothing. */
  launch(
    state: MissionState,
    regions: RegionManager,
    regionId: string,
  ): { ok: true; mission: Mission; resources: GameState['resources']; batteryKwh: number } | { ok: false; reason: string } {
    const check = MissionManager.check(state, regions, regionId);
    if (!check.ok) return check;
    const resources = ResourceManager.deduct(state.resources, SURVEY.cost);
    const mission: Mission = {
      id: makeId('mission'),
      type: 'survey',
      regionId,
      startSol: state.timeSols,
      durationSols: MissionManager.durationSols(regions, regionId),
      progress: 0,
      status: 'active',
      cost: { ...SURVEY.cost },
      energyKwh: SURVEY.energyKwh,
    };
    return { ok: true, mission, resources, batteryKwh: state.power.batteryKwh - SURVEY.energyKwh };
  },

  /** Advances active missions. Paused time (dt = 0) changes nothing. */
  advance(missions: Mission[], dt: number): { missions: Mission[]; completed: Mission[] } {
    if (dt <= 0 || !missions.some((m) => m.status === 'active')) return { missions, completed: [] };
    const completed: Mission[] = [];
    const next = missions.map((m) => {
      if (m.status !== 'active') return m;
      const progress = Math.min(1, m.progress + dt / m.durationSols);
      if (progress < 1) return { ...m, progress };
      const r = rewardFor(m.regionId);
      const done: Mission = {
        ...m,
        progress: 1,
        status: 'complete',
        reward: { resources: { ...(r.resources ?? {}) } as Cost, ice: r.ice ?? 0, xp: r.xp, find: r.find },
      };
      completed.push(done);
      return done;
    });
    return { missions: next, completed };
  },

  remainingSols(m: Mission): number {
    return Math.max(0, (1 - m.progress) * m.durationSols);
  },
};
