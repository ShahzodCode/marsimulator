import { EXPEDITION, FOUNDING, GAME_KM_PER_SOL, ORBITAL_SCAN, OUTPOST, realScanSols, rewardFor } from '../data/missions';
import { SITE_BY_ID } from '../data/baseSites';
import { orbiterFor } from '../data/research';
import { sunFactor } from '../data/power';
import { hasRank, OUTPOST_UNLOCK_RANK, rankAtLevel, rankById, RANKS } from '../data/progression';
import { COLONIST_NEEDS_PER_SOL, RESOURCE_IDS, type ResourceId } from '../data/resources';
import { SETTLEMENT } from '../data/settlement';
import { angularDistance, greatCirclePoint, MARS_RADIUS_KM, type LatLon } from '../planet/geo';
import type { RegionManager } from '../planet/RegionManager';
import { makeId } from '../state/factory';
import type { Expedition, GameState, Mission, OrbitalScan, Outpost } from '../state/types';
import { ResourceManager, type Cost } from './ResourceManager';

export type MissionCheck = { ok: true } | { ok: false; reason: string };

/** Surface height in km at a place (the planet's terrain); routes climb over it. */
export type HeightSampler = (lat: number, lon: number) => number;

type MissionState = Pick<
  GameState,
  'discoveredRegions' | 'exploredRegions' | 'missions' | 'outposts' | 'resources' | 'power' | 'progression' | 'timeSols' | 'colony' | 'base' | 'research'
>;

type FoundingState = MissionState & Pick<GameState, 'otherBases' | 'sitesSeen'>;

/** Id of the first base (old saves have no base ids on their missions). */
export const HOME_BASE_ID = 'base-jezero';
const HOME: LatLon = { lat: SETTLEMENT.lat, lon: SETTLEMENT.lon };

function angularKm(a: LatLon, b: LatLon): number {
  return angularDistance(a.lat, a.lon, b.lat, b.lon) * MARS_RADIUS_KM;
}

export interface RoutePlan {
  routeKm: number;
  climbM: number;
  legKm: number;
  /** Planned sols: out, site, back. */
  oneWaySols: number;
  totalSols: number;
}

/** Things that happened during a step, for messages. */
export type MissionNews =
  | { kind: 'scanned'; mission: OrbitalScan }
  | { kind: 'arrived'; mission: Expedition }
  | { kind: 'storm'; mission: Expedition }
  | { kind: 'home'; mission: Expedition; returned: Cost }
  | { kind: 'founded'; mission: Expedition };

const ROUTE_SAMPLES = 48;
const routeCache = new WeakMap<HeightSampler, Map<string, RoutePlan>>();

/** Small seeded random numbers, so a mission's storm is fixed at launch (and the same after loading). */
function seeded(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function activeOf<T extends Mission['type']>(missions: Mission[], type: T): Extract<Mission, { type: T }>[] {
  return missions.filter((m): m is Extract<Mission, { type: T }> => m.type === type && m.status === 'active');
}

/**
 * Exploration, the NASA way: orbital mapping, crewed rover expeditions with real speeds
 * (time-lapsed by a named multiplier), and remote outposts. Pure functions of the state.
 */
/** Names the next rank that raises this limit (" Reach X for more."), or '' at the top. */
function upgradeHint(level: number, key: 'orbiters' | 'crewRovers' | 'maxBases'): string {
  const now = rankAtLevel(level)[key];
  const r = RANKS.find((x) => x.level > level && x[key] > now);
  return r ? ` Reach ${r.title} for more.` : '';
}

export const MissionManager = {
  // ---------------------------------------------------------------- orbital scans

  scanSols(regions: RegionManager, regionId: string, research: readonly string[] = []): number {
    return realScanSols(regions.areaFraction(regionId)) / ORBITAL_SCAN.timeScale / orbiterFor(research).scanSpeed;
  },

  checkScan(state: Pick<GameState, 'discoveredRegions' | 'missions' | 'progression'>, regions: RegionManager, regionId: string): MissionCheck {
    if (!regions.get(regionId)) return { ok: false, reason: 'Unknown region.' };
    if (state.discoveredRegions[regionId]) return { ok: false, reason: 'Already mapped.' };
    if (activeOf(state.missions, 'orbital').some((m) => m.regionId === regionId)) return { ok: false, reason: 'The orbiter is mapping it now.' };
    const orbiters = MissionManager.orbiters(state.progression.level);
    if (activeOf(state.missions, 'orbital').length >= orbiters) {
      return { ok: false, reason: orbiters === 1 ? `The orbiter is busy mapping another region.${upgradeHint(state.progression.level, 'orbiters')}` : `All ${orbiters} orbiters are busy mapping.${upgradeHint(state.progression.level, 'orbiters')}` };
    }
    return { ok: true };
  },

  launchScan(state: Pick<GameState, 'discoveredRegions' | 'missions' | 'timeSols' | 'research' | 'progression'>, regions: RegionManager, regionId: string): { ok: true; mission: OrbitalScan } | { ok: false; reason: string } {
    const check = MissionManager.checkScan(state, regions, regionId);
    if (!check.ok) return check;
    return {
      ok: true,
      mission: {
        id: makeId('scan'),
        type: 'orbital',
        regionId,
        startSol: state.timeSols,
        durationSols: MissionManager.scanSols(regions, regionId, state.research.completed),
        progress: 0,
        status: 'active',
        activity: 'scanning',
      },
    };
  },

  // ---------------------------------------------------------------- expeditions

  site(regions: RegionManager, regionId: string): LatLon {
    return regions.center(regionId);
  },

  /** Rover position on a route from `from` (default: home); `f` is 0 at the base and 1 at the site. */
  pointOnRoute(regions: RegionManager, regionId: string, f: number, out?: LatLon, from: LatLon = HOME): LatLon {
    return MissionManager.pointBetween(from, MissionManager.site(regions, regionId), f, out);
  },

  pointBetween(from: LatLon, to: LatLon, f: number, out?: LatLon): LatLon {
    return greatCirclePoint(from.lat, from.lon, to.lat, to.lon, Math.min(1, Math.max(0, f)), out);
  },

  /** Where a trip starts and ends (old saves: home base to region centre). */
  ends(m: Expedition, regions: RegionManager): { from: LatLon; to: LatLon } {
    return { from: m.from ?? HOME, to: m.to ?? MissionManager.site(regions, m.regionId) };
  },

  /** Rover position on this mission's route. */
  pointOnMission(m: Expedition, regions: RegionManager, f: number, out?: LatLon): LatLon {
    const e = MissionManager.ends(m, regions);
    return MissionManager.pointBetween(e.from, e.to, f, out);
  },

  /** How far along the route (0..1 from the base) an expedition is now. */
  routeFraction(m: Expedition): number {
    if (m.legKm <= 0) return 0;
    return m.drivenKm <= m.legKm ? m.drivenKm / m.legKm : 2 - m.drivenKm / m.legKm;
  },

  /** Route from a base (default: home) to a region's centre. */
  planRoute(regions: RegionManager, regionId: string, height?: HeightSampler, from: LatLon = HOME): RoutePlan {
    return MissionManager.planBetween(from, MissionManager.site(regions, regionId), height);
  },

  planBetween(from: LatLon, s: LatLon, height?: HeightSampler): RoutePlan {
    // The terrain never changes, so each route is worked out once.
    const key = `${from.lat.toFixed(3)},${from.lon.toFixed(3)}>${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
    const cache = height ? routeCache.get(height) ?? routeCache.set(height, new Map()).get(height)! : null;
    const hit = cache?.get(key);
    if (hit) return hit;
    const routeKm = angularKm(from, s);
    let climbKm = 0;
    if (height) {
      // Up and down along the way: going there you climb the rises, coming back the drops.
      // Half of the total up-and-down counts for each leg.
      const p: LatLon = { lat: 0, lon: 0 };
      let prev = height(from.lat, from.lon);
      for (let i = 1; i <= ROUTE_SAMPLES; i++) {
        greatCirclePoint(from.lat, from.lon, s.lat, s.lon, i / ROUTE_SAMPLES, p);
        const hNow = height(p.lat, p.lon);
        climbKm += Math.abs(hNow - prev) / 2;
        prev = hNow;
      }
    }
    const legKm = routeKm + climbKm * EXPEDITION.climbKmEquivalent;
    const oneWaySols = legKm / GAME_KM_PER_SOL;
    const plan = { routeKm, climbM: climbKm * 1000, legKm, oneWaySols, totalSols: oneWaySols * 2 + EXPEDITION.siteSols };
    cache?.set(key, plan);
    return plan;
  },

  /** Food, water and oxygen for the crew, for the trip plus the safe-haven reserve. */
  supplies(plan: RoutePlan): { supplies: Cost; packedSols: number } {
    const packedSols = plan.totalSols + EXPEDITION.reserveSols;
    const supplies: Cost = {};
    for (const id of RESOURCE_IDS) {
      const v = COLONIST_NEEDS_PER_SOL[id] * EXPEDITION.crew * packedSols;
      if (v > 0) supplies[id] = Math.ceil(v);
    }
    return { supplies, packedSols };
  },

  /** Crew out on round trips that left from this base (founding crews leave for good). */
  crewAway(missions: Mission[], baseId: string = HOME_BASE_ID): number {
    return activeOf(missions, 'expedition').filter((m) => (m.fromBaseId ?? HOME_BASE_ID) === baseId && !m.found).length * EXPEDITION.crew;
  },

  checkExpedition(state: MissionState, regions: RegionManager, regionId: string, height?: HeightSampler): MissionCheck {
    if (!regions.get(regionId)) return { ok: false, reason: 'Unknown region.' };
    if (state.exploredRegions[regionId]) return { ok: false, reason: 'Your crew has already explored it.' };
    if (state.base.id !== HOME_BASE_ID) return { ok: false, reason: 'Science expeditions leave from Jezero Base. From this base you can found new bases instead.' };
    if (!state.discoveredRegions[regionId]) return { ok: false, reason: 'Map it from orbit first, so the crew knows the way.' };
    const active = activeOf(state.missions, 'expedition').filter((m) => !m.found);
    if (active.some((m) => m.regionId === regionId)) return { ok: false, reason: 'A crew is already on the way.' };
    if (!regions.isFrontier(regionId, state.exploredRegions)) return { ok: false, reason: 'Too far for one trip. Explore a region next to it first.' };
    const reward = rewardFor(regionId);
    if (!hasRank(state.progression.level, reward.rank)) return { ok: false, reason: `Long-range expedition: unlocks at rank ${rankById(reward.rank!).title}.` };
    const rovers = MissionManager.crewRovers(state.progression.level);
    if (active.length >= rovers) {
      return { ok: false, reason: `${rovers === 1 ? 'The crew rover is' : rovers === 2 ? 'Both crew rovers are' : `All ${rovers} crew rovers are`} out. Wait for one to come home.${upgradeHint(state.progression.level, 'crewRovers')}` };
    }
    const atBase = state.colony.colonists - MissionManager.crewAway(state.missions, state.base.id);
    if (atBase - EXPEDITION.crew < 2) return { ok: false, reason: 'Not enough crew at the base: someone has to stay behind!' };
    const { supplies } = MissionManager.supplies(MissionManager.planRoute(regions, regionId, height, state.base));
    if (!ResourceManager.canAfford(state.resources, supplies)) return { ok: false, reason: `Not enough supplies for the crew. ${ResourceManager.describeMissing(state.resources, supplies)}` };
    if (state.power.batteryKwh + 1e-9 < EXPEDITION.energyKwh) {
      return { ok: false, reason: `The rover needs ${EXPEDITION.energyKwh} kWh to charge, but the batteries have ${Math.floor(state.power.batteryKwh)} kWh. Wait for the sun!` };
    }
    return { ok: true };
  },

  /** Packs supplies, charges the rover and sends the crew, or changes nothing. */
  launchExpedition(
    state: MissionState,
    regions: RegionManager,
    regionId: string,
    height?: HeightSampler,
  ): { ok: true; mission: Expedition; resources: GameState['resources']; batteryKwh: number } | { ok: false; reason: string } {
    const check = MissionManager.checkExpedition(state, regions, regionId, height);
    if (!check.ok) return check;
    const plan = MissionManager.planRoute(regions, regionId, height, state.base);
    const { supplies, packedSols } = MissionManager.supplies(plan);
    const id = makeId('expedition');
    const rnd = seeded(id);
    const [s0, s1] = EXPEDITION.stormSols;
    const storm = rnd() < EXPEDITION.stormChance ? { atKm: rnd() * plan.legKm * 2, sols: s0 + rnd() * (s1 - s0), hit: false } : null;
    const mission: Expedition = {
      id,
      type: 'expedition',
      regionId,
      startSol: state.timeSols,
      durationSols: plan.totalSols,
      progress: 0,
      status: 'active',
      activity: 'driving',
      routeKm: plan.routeKm,
      climbM: plan.climbM,
      legKm: plan.legKm,
      drivenKm: 0,
      arrived: false,
      siteSolsLeft: EXPEDITION.siteSols,
      storm,
      stormSolsLeft: 0,
      supplies,
      packedSols,
      energyKwh: EXPEDITION.energyKwh,
      fromBaseId: state.base.id,
      from: { lat: state.base.lat, lon: state.base.lon },
      to: MissionManager.site(regions, regionId),
    };
    return { ok: true, mission, resources: ResourceManager.deduct(state.resources, supplies), batteryKwh: state.power.batteryKwh - EXPEDITION.energyKwh };
  },

  // ---------------------------------------------------------------- founding convoys

  /** How far a founding convoy may drive (km). */
  foundingRangeKm(research: readonly string[], level = 1): number {
    return FOUNDING.rangeKm * (research.includes('long_range') ? 1.5 : 1) * rankAtLevel(level).convoyRange;
  },

  /** Most bases allowed at this rank (data/progression.ts). */
  maxBases(level: number): number {
    return rankAtLevel(level).maxBases;
  },

  /** Crew rovers that can be out at once at this rank. */
  crewRovers(level: number): number {
    return rankAtLevel(level).crewRovers;
  },

  /** Orbiters that can map at once at this rank. */
  orbiters(level: number): number {
    return rankAtLevel(level).orbiters;
  },

  /** What a founding convoy packs: the depot kit plus food, water and oxygen for the trip and the first sols. */
  foundingKit(plan: RoutePlan): { kit: Cost; total: Cost; rovers: number; kg: number } {
    const kit: Cost = { ...FOUNDING.kit };
    const sols = plan.oneWaySols + EXPEDITION.reserveSols + FOUNDING.settleSols;
    const total: Cost = { ...kit };
    for (const id of RESOURCE_IDS) {
      const v = Math.ceil(COLONIST_NEEDS_PER_SOL[id] * FOUNDING.crew * sols);
      if (v > 0) total[id] = (total[id] ?? 0) + v;
    }
    const kg = Object.values(total).reduce((a, b) => a + (b ?? 0), 0);
    return { kit, total, rovers: Math.max(1, Math.ceil(kg / OUTPOST.cargoPayloadKg)), kg };
  },

  checkFounding(state: FoundingState, siteId: string, height?: HeightSampler): MissionCheck {
    const site = SITE_BY_ID[siteId];
    if (!site) return { ok: false, reason: 'Unknown site.' };
    if (!state.sitesSeen[siteId]) return { ok: false, reason: 'Map this region from orbit first to find the site.' };
    const taken = state.base.siteId === siteId || state.otherBases.some((b) => b.siteId === siteId);
    if (taken) return { ok: false, reason: 'There is already a base here.' };
    const convoys = activeOf(state.missions, 'expedition').filter((m) => m.found);
    if (convoys.some((m) => m.found!.siteId === siteId)) return { ok: false, reason: 'A convoy is already driving there.' };
    const bases = 1 + state.otherBases.length + convoys.length;
    if (bases >= MissionManager.maxBases(state.progression.level)) {
      return { ok: false, reason: `Your rank allows ${MissionManager.maxBases(state.progression.level)} bases.${upgradeHint(state.progression.level, 'maxBases') || ' Earn XP to be promoted!'}` };
    }
    const plan = MissionManager.planBetween(state.base, site, height);
    const range = MissionManager.foundingRangeKm(state.research.completed, state.progression.level);
    if (plan.routeKm > range) {
      return { ok: false, reason: `${Math.round(plan.routeKm).toLocaleString()} km is too far from ${state.base.name} (limit ${Math.round(range).toLocaleString()} km). Found a base closer to it first, then hop on from there.` };
    }
    const atBase = state.colony.colonists - MissionManager.crewAway(state.missions, state.base.id);
    if (atBase - FOUNDING.crew < 2) return { ok: false, reason: `The convoy takes ${FOUNDING.crew} colonists (a woman and a man) for good, and at least 2 must stay. Grow the base first!` };
    const { total } = MissionManager.foundingKit(plan);
    if (!ResourceManager.canAfford(state.resources, total)) return { ok: false, reason: `Not enough for the depot kit and supplies. ${ResourceManager.describeMissing(state.resources, total)}` };
    if (state.power.batteryKwh + 1e-9 < EXPEDITION.energyKwh) {
      return { ok: false, reason: `The rovers need ${EXPEDITION.energyKwh} kWh to charge, but the batteries have ${Math.floor(state.power.batteryKwh)} kWh. Wait for the sun!` };
    }
    return { ok: true };
  },

  launchFounding(
    state: FoundingState,
    siteId: string,
    height?: HeightSampler,
  ): { ok: true; mission: Expedition; resources: GameState['resources']; batteryKwh: number; colonists: number } | { ok: false; reason: string } {
    const check = MissionManager.checkFounding(state, siteId, height);
    if (!check.ok) return check;
    const site = SITE_BY_ID[siteId];
    const plan = MissionManager.planBetween(state.base, site, height);
    const { kit, total } = MissionManager.foundingKit(plan);
    const id = makeId('convoy');
    const rnd = seeded(id);
    const [s0, s1] = EXPEDITION.stormSols;
    const storm = rnd() < EXPEDITION.stormChance ? { atKm: rnd() * plan.legKm, sols: s0 + rnd() * (s1 - s0), hit: false } : null;
    const mission: Expedition = {
      id,
      type: 'expedition',
      regionId: site.regionId,
      startSol: state.timeSols,
      durationSols: plan.oneWaySols,
      progress: 0,
      status: 'active',
      activity: 'driving',
      routeKm: plan.routeKm,
      climbM: plan.climbM,
      legKm: plan.legKm,
      drivenKm: 0,
      arrived: false,
      siteSolsLeft: 0,
      storm,
      stormSolsLeft: 0,
      supplies: total,
      packedSols: plan.oneWaySols + EXPEDITION.reserveSols + FOUNDING.settleSols,
      energyKwh: EXPEDITION.energyKwh,
      fromBaseId: state.base.id,
      from: { lat: state.base.lat, lon: state.base.lon },
      to: { lat: site.lat, lon: site.lon },
      found: { siteId, crew: FOUNDING.crew, kit },
    };
    return {
      ok: true,
      mission,
      resources: ResourceManager.deduct(state.resources, total),
      batteryKwh: state.power.batteryKwh - EXPEDITION.energyKwh,
      colonists: state.colony.colonists - FOUNDING.crew,
    };
  },

  /** Advances every mission. Paused time (dt = 0) changes nothing. */
  advance(missions: Mission[], dt: number, timeSols: number, regions: RegionManager): { missions: Mission[]; news: MissionNews[] } {
    const news: MissionNews[] = [];
    if (dt <= 0 || !missions.some((m) => m.status === 'active')) return { missions, news };
    const next = missions.map((m): Mission => {
      if (m.status !== 'active') return m;
      if (m.type === 'orbital') {
        const progress = Math.min(1, m.progress + dt / m.durationSols);
        if (progress < 1) return { ...m, progress };
        const done: OrbitalScan = { ...m, progress: 1, status: 'complete', activity: 'done' };
        news.push({ kind: 'scanned', mission: done });
        return done;
      }
      return MissionManager.advanceExpedition(m, dt, timeSols, regions, news);
    });
    return { missions: next, news };
  },

  advanceExpedition(m: Expedition, dt: number, timeSols: number, regions: RegionManager, news: MissionNews[]): Expedition {
    const e: Expedition = { ...m };
    if (e.stormSolsLeft > 0) {
      e.stormSolsLeft = Math.max(0, e.stormSolsLeft - dt);
      e.activity = 'storm';
      return e;
    }
    if (e.arrived && e.siteSolsLeft > 0 && e.drivenKm <= e.legKm) {
      e.siteSolsLeft = Math.max(0, e.siteSolsLeft - dt);
      e.activity = 'sampling';
      return e;
    }
    // The rover runs on solar power: it drives in daylight and parks at night (local time at the rover).
    const here = MissionManager.pointOnMission(e, regions, MissionManager.routeFraction(e));
    const local = timeSols + (here.lon - SETTLEMENT.lon) / 360;
    if (sunFactor(local) <= 0) {
      e.activity = 'night';
      return e;
    }
    e.activity = 'driving';
    // Daylight is half the sol, so drive twice the daily average while the sun is up.
    let driven = e.drivenKm + GAME_KM_PER_SOL * 2 * dt;
    if (e.found && driven >= e.legKm) {
      // A founding convoy stays: the crew unpacks the depot kit and the new base begins.
      e.drivenKm = e.legKm;
      e.arrived = true;
      e.status = 'complete';
      e.activity = 'done';
      e.progress = 1;
      news.push({ kind: 'founded', mission: e });
      return e;
    }
    if (!e.arrived && driven >= e.legKm) {
      driven = e.legKm;
      e.arrived = true;
      const r = rewardFor(e.regionId);
      e.reward = { resources: { ...(r.resources ?? {}) }, xp: r.xp, find: r.find };
      news.push({ kind: 'arrived', mission: e });
    }
    if (e.storm && !e.storm.hit && driven >= e.storm.atKm) {
      driven = Math.max(e.drivenKm, Math.min(driven, e.storm.atKm));
      e.storm = { ...e.storm, hit: true };
      e.stormSolsLeft = e.storm.sols;
      e.activity = 'storm';
      news.push({ kind: 'storm', mission: e });
    }
    e.drivenKm = Math.min(e.legKm * 2, driven);
    e.progress = e.legKm > 0 ? e.drivenKm / (e.legKm * (e.found ? 1 : 2)) : 1;
    if (e.drivenKm >= e.legKm * 2 - 1e-9) {
      e.status = 'complete';
      e.activity = 'done';
      e.progress = 1;
      // Whatever the crew didn't eat or drink comes back to the base.
      const used = Math.min(e.packedSols, timeSols + dt - e.startSol);
      const returned: Cost = {};
      for (const [id, v] of Object.entries(e.supplies) as [ResourceId, number][]) {
        const left = v * Math.max(0, 1 - used / e.packedSols);
        if (left > 0.5) returned[id] = Math.floor(left);
      }
      news.push({ kind: 'home', mission: e, returned });
    }
    return e;
  },

  /** Sols still to go (a rough estimate for expeditions: storms and nights vary). */
  remainingSols(m: Mission): number {
    if (m.type === 'orbital') return Math.max(0, (1 - m.progress) * m.durationSols);
    const driveLeft = Math.max(0, m.legKm * (m.found ? 1 : 2) - m.drivenKm) / GAME_KM_PER_SOL;
    const siteLeft = m.drivenKm <= m.legKm ? m.siteSolsLeft : 0;
    const stormLeft = m.stormSolsLeft + (m.storm && !m.storm.hit ? m.storm.sols : 0);
    return driveLeft + siteLeft + stormLeft;
  },

  // ---------------------------------------------------------------- outposts

  checkOutpost(state: Pick<GameState, 'exploredRegions' | 'outposts' | 'resources' | 'progression'>, regionId: string): MissionCheck {
    const site = rewardFor(regionId).outpost;
    if (!site) return { ok: false, reason: 'Nothing here is worth mining.' };
    if (!state.exploredRegions[regionId]) return { ok: false, reason: 'Send a crew to explore it first.' };
    if (!hasRank(state.progression.level, OUTPOST_UNLOCK_RANK)) return { ok: false, reason: `Remote outposts unlock at rank ${rankById(OUTPOST_UNLOCK_RANK).title}.` };
    if (state.outposts.some((o) => o.regionId === regionId)) return { ok: false, reason: 'There is already an outpost here.' };
    if (!ResourceManager.canAfford(state.resources, OUTPOST.cost)) return { ok: false, reason: ResourceManager.describeMissing(state.resources, OUTPOST.cost) };
    return { ok: true };
  },

  buildOutpost(
    state: Pick<GameState, 'exploredRegions' | 'outposts' | 'resources' | 'timeSols' | 'base' | 'progression'>,
    regions: RegionManager,
    regionId: string,
    height?: HeightSampler,
  ): { ok: true; outpost: Outpost; resources: GameState['resources'] } | { ok: false; reason: string } {
    const check = MissionManager.checkOutpost(state, regionId);
    if (!check.ok) return check;
    const site = rewardFor(regionId).outpost!;
    const plan = MissionManager.planRoute(regions, regionId, height, state.base);
    const readySol = state.timeSols + plan.oneWaySols + OUTPOST.setupSols;
    const outpost: Outpost = {
      id: makeId('outpost'),
      regionId,
      resource: site.resource,
      perSol: site.perSol,
      reserveLeft: site.reserve,
      readySol,
      tripSols: plan.oneWaySols * 2,
      lastTripSol: readySol - plan.oneWaySols,
      baseId: state.base.id,
    };
    return { ok: true, outpost, resources: ResourceManager.deduct(state.resources, OUTPOST.cost) };
  },

  /** How much the next cargo run carries. */
  cargoLoad(o: Outpost): number {
    return Math.min(OUTPOST.cargoPayloadKg, o.perSol * o.tripSols, o.reserveLeft);
  },

  /** Cargo rovers that reach the base during this step. */
  advanceOutposts(outposts: Outpost[], timeSols: number, dt: number): { outposts: Outpost[]; deliveries: { outpost: Outpost; amount: number }[] } {
    const deliveries: { outpost: Outpost; amount: number }[] = [];
    if (dt <= 0 || !outposts.length) return { outposts, deliveries };
    const now = timeSols + dt;
    const next = outposts.map((o) => {
      if (now < o.readySol || o.reserveLeft <= 0 || now - o.lastTripSol < o.tripSols) return o;
      const amount = MissionManager.cargoLoad(o);
      deliveries.push({ outpost: o, amount });
      return { ...o, reserveLeft: o.reserveLeft - amount, lastTripSol: o.lastTripSol + o.tripSols };
    });
    return { outposts: next, deliveries };
  },
};
