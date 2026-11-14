import { EXPEDITION, GAME_KM_PER_SOL, ORBITAL_SCAN, OUTPOST, realScanSols, rewardFor } from '../data/missions';
import { sunFactor } from '../data/power';
import { hasRank, rankById } from '../data/progression';
import { COLONIST_NEEDS_PER_SOL, RESOURCE_IDS, type ResourceId } from '../data/resources';
import { SETTLEMENT } from '../data/settlement';
import { greatCirclePoint, type LatLon } from '../planet/geo';
import type { RegionManager } from '../planet/RegionManager';
import { makeId } from '../state/factory';
import type { Expedition, GameState, Mission, OrbitalScan, Outpost } from '../state/types';
import { ResourceManager, type Cost } from './ResourceManager';

export type MissionCheck = { ok: true } | { ok: false; reason: string };

/** Surface height in km at a place (the planet's terrain); routes climb over it. */
export type HeightSampler = (lat: number, lon: number) => number;

type MissionState = Pick<
  GameState,
  'discoveredRegions' | 'exploredRegions' | 'missions' | 'outposts' | 'resources' | 'power' | 'progression' | 'timeSols' | 'colony'
>;

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
  | { kind: 'home'; mission: Expedition; returned: Cost };

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
export const MissionManager = {
  // ---------------------------------------------------------------- orbital scans

  scanSols(regions: RegionManager, regionId: string): number {
    return realScanSols(regions.areaFraction(regionId)) / ORBITAL_SCAN.timeScale;
  },

  checkScan(state: MissionState, regions: RegionManager, regionId: string): MissionCheck {
    if (!regions.get(regionId)) return { ok: false, reason: 'Unknown region.' };
    if (state.discoveredRegions[regionId]) return { ok: false, reason: 'Already mapped.' };
    if (activeOf(state.missions, 'orbital').some((m) => m.regionId === regionId)) return { ok: false, reason: 'The orbiter is mapping it now.' };
    if (activeOf(state.missions, 'orbital').length >= ORBITAL_SCAN.maxConcurrent) return { ok: false, reason: 'The orbiter is busy mapping another region.' };
    return { ok: true };
  },

  launchScan(state: MissionState, regions: RegionManager, regionId: string): { ok: true; mission: OrbitalScan } | { ok: false; reason: string } {
    const check = MissionManager.checkScan(state, regions, regionId);
    if (!check.ok) return check;
    return {
      ok: true,
      mission: {
        id: makeId('scan'),
        type: 'orbital',
        regionId,
        startSol: state.timeSols,
        durationSols: MissionManager.scanSols(regions, regionId),
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

  /** Rover position on its route; `f` is 0 at the base and 1 at the site. */
  pointOnRoute(regions: RegionManager, regionId: string, f: number, out?: LatLon): LatLon {
    const s = MissionManager.site(regions, regionId);
    return greatCirclePoint(SETTLEMENT.lat, SETTLEMENT.lon, s.lat, s.lon, Math.min(1, Math.max(0, f)), out);
  },

  /** How far along the route (0..1 from the base) an expedition is now. */
  routeFraction(m: Expedition): number {
    if (m.legKm <= 0) return 0;
    return m.drivenKm <= m.legKm ? m.drivenKm / m.legKm : 2 - m.drivenKm / m.legKm;
  },

  planRoute(regions: RegionManager, regionId: string, height?: HeightSampler): RoutePlan {
    // The terrain never changes, so each route is worked out once.
    const cache = height ? routeCache.get(height) ?? routeCache.set(height, new Map()).get(height)! : null;
    const hit = cache?.get(regionId);
    if (hit) return hit;
    const s = MissionManager.site(regions, regionId);
    const routeKm = regions.distanceKm(SETTLEMENT.lat, SETTLEMENT.lon, regionId);
    let climbKm = 0;
    if (height) {
      // Up and down along the way: going there you climb the rises, coming back the drops.
      // Half of the total up-and-down counts for each leg.
      const p: LatLon = { lat: 0, lon: 0 };
      let prev = height(SETTLEMENT.lat, SETTLEMENT.lon);
      for (let i = 1; i <= ROUTE_SAMPLES; i++) {
        greatCirclePoint(SETTLEMENT.lat, SETTLEMENT.lon, s.lat, s.lon, i / ROUTE_SAMPLES, p);
        const hNow = height(p.lat, p.lon);
        climbKm += Math.abs(hNow - prev) / 2;
        prev = hNow;
      }
    }
    const legKm = routeKm + climbKm * EXPEDITION.climbKmEquivalent;
    const oneWaySols = legKm / GAME_KM_PER_SOL;
    const plan = { routeKm, climbM: climbKm * 1000, legKm, oneWaySols, totalSols: oneWaySols * 2 + EXPEDITION.siteSols };
    cache?.set(regionId, plan);
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

  crewAway(missions: Mission[]): number {
    return activeOf(missions, 'expedition').length * EXPEDITION.crew;
  },

  checkExpedition(state: MissionState, regions: RegionManager, regionId: string, height?: HeightSampler): MissionCheck {
    if (!regions.get(regionId)) return { ok: false, reason: 'Unknown region.' };
    if (state.exploredRegions[regionId]) return { ok: false, reason: 'Your crew has already explored it.' };
    if (!state.discoveredRegions[regionId]) return { ok: false, reason: 'Map it from orbit first, so the crew knows the way.' };
    const active = activeOf(state.missions, 'expedition');
    if (active.some((m) => m.regionId === regionId)) return { ok: false, reason: 'A crew is already on the way.' };
    if (!regions.isFrontier(regionId, state.exploredRegions)) return { ok: false, reason: 'Too far for one trip. Explore a region next to it first.' };
    const reward = rewardFor(regionId);
    if (!hasRank(state.progression.level, reward.rank)) return { ok: false, reason: `Long-range expedition: unlocks at rank ${rankById(reward.rank!).title}.` };
    if (active.length >= EXPEDITION.maxConcurrent) return { ok: false, reason: `Both crew rovers are out. Wait for one to come home.` };
    const atBase = state.colony.colonists - MissionManager.crewAway(state.missions);
    if (atBase - EXPEDITION.crew < 2) return { ok: false, reason: 'Not enough crew at the base: someone has to stay behind!' };
    const { supplies } = MissionManager.supplies(MissionManager.planRoute(regions, regionId, height));
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
    const plan = MissionManager.planRoute(regions, regionId, height);
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
    };
    return { ok: true, mission, resources: ResourceManager.deduct(state.resources, supplies), batteryKwh: state.power.batteryKwh - EXPEDITION.energyKwh };
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
    const here = MissionManager.pointOnRoute(regions, e.regionId, MissionManager.routeFraction(e));
    const local = timeSols + (here.lon - SETTLEMENT.lon) / 360;
    if (sunFactor(local) <= 0) {
      e.activity = 'night';
      return e;
    }
    e.activity = 'driving';
    // Daylight is half the sol, so drive twice the daily average while the sun is up.
    let driven = e.drivenKm + GAME_KM_PER_SOL * 2 * dt;
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
    e.progress = e.legKm > 0 ? e.drivenKm / (e.legKm * 2) : 1;
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
    const driveLeft = Math.max(0, m.legKm * 2 - m.drivenKm) / GAME_KM_PER_SOL;
    const siteLeft = m.drivenKm <= m.legKm ? m.siteSolsLeft : 0;
    const stormLeft = m.stormSolsLeft + (m.storm && !m.storm.hit ? m.storm.sols : 0);
    return driveLeft + siteLeft + stormLeft;
  },

  // ---------------------------------------------------------------- outposts

  checkOutpost(state: Pick<GameState, 'exploredRegions' | 'outposts' | 'resources'>, regionId: string): MissionCheck {
    const site = rewardFor(regionId).outpost;
    if (!site) return { ok: false, reason: 'Nothing here is worth mining.' };
    if (!state.exploredRegions[regionId]) return { ok: false, reason: 'Send a crew to explore it first.' };
    if (state.outposts.some((o) => o.regionId === regionId)) return { ok: false, reason: 'There is already an outpost here.' };
    if (!ResourceManager.canAfford(state.resources, OUTPOST.cost)) return { ok: false, reason: ResourceManager.describeMissing(state.resources, OUTPOST.cost) };
    return { ok: true };
  },

  buildOutpost(
    state: Pick<GameState, 'exploredRegions' | 'outposts' | 'resources' | 'timeSols'>,
    regions: RegionManager,
    regionId: string,
    height?: HeightSampler,
  ): { ok: true; outpost: Outpost; resources: GameState['resources'] } | { ok: false; reason: string } {
    const check = MissionManager.checkOutpost(state, regionId);
    if (!check.ok) return check;
    const site = rewardFor(regionId).outpost!;
    const plan = MissionManager.planRoute(regions, regionId, height);
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
