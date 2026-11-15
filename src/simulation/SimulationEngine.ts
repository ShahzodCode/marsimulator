import { BUILDINGS, DEPOT_SUPPLY } from '../data/buildings';
import { XP_REWARDS } from '../data/progression';
import { FOUNDING, ORBITAL_SCAN, rewardFor } from '../data/missions';
import { SITE_BY_ID, sitesIn, TRAITS, visibleTraits } from '../data/baseSites';
import { STAGES, TECH_BY_ID, stageMaterials, stageRp } from '../data/research';
import { COLONIST_NEEDS_PER_SOL, RESOURCES, RESOURCE_IDS, WATER_RECOVERY, emptyResources, type ResourceId } from '../data/resources';
import { SETTLEMENT } from '../data/settlement';
import type { RegionManager } from '../planet/RegionManager';
import { activeBaseData, makeNewBase, withActiveBase } from '../state/factory';
import type { BaseData, BuildingInstance, GameState, OrbitalScan } from '../state/types';
import { baseEnv } from './BaseEnv';
import { ConstructionManager } from './ConstructionManager';
import { HOME_BASE_ID, MissionManager } from './MissionManager';
import { PopulationManager } from './PopulationManager';
import { PowerManager, PowerPool } from './PowerManager';
import { ProductionManager, type ProductionContext } from './ProductionManager';
import { ProgressionManager } from './ProgressionManager';
import { ResourceManager } from './ResourceManager';
import { StorageManager } from './StorageManager';
import { RoadTransport, type TransportNetwork } from './Transport';
import { computeWarnings, type AlertSpec } from './Warnings';
import { describeCost, Logistics } from './Logistics';
import { CARGO, PIPE_FAULTS } from '../data/logistics';

export { SIM_STEP_SOLS } from './SimulationClock';

export type SimEvent =
  | { type: 'building:completed'; id: string }
  | { type: 'region:discovered'; id: string }
  | { type: 'region:explored'; id: string }
  | { type: 'site:spotted'; id: string }
  | { type: 'base:founded'; id: string }
  | { type: 'production'; buildingId: string; delivered: Partial<Record<ResourceId, number>> };

export interface StepResult {
  state: GameState;
  events: SimEvent[];
  /** One-off messages (toasts). */
  notices: AlertSpec[];
  /** Messages that stay while their problem lasts. */
  warnings: AlertSpec[];
}

export interface StepOptions {
  /** Override how goods move (tests use EVERYWHERE). Defaults to the road network. */
  transport?: TransportNetwork;
}

/** The parts of the game state the simulation owns and writes back to the store. */
export const SIM_KEYS = [
  'timeSols',
  'resources',
  'storage',
  'rates',
  'power',
  'deposits',
  'stats',
  'colony',
  'buildings',
  'missions',
  'discoveredRegions',
  'exploredRegions',
  'outposts',
  'progression',
  'otherBases',
  'sitesSeen',
  'research',
  'pipelines',
  'shipments',
] as const satisfies readonly (keyof GameState)[];

interface BaseStep {
  base: BaseData;
  inv: ResourceManager;
  produced: Partial<Record<ResourceId, number>>;
  researchRp: number;
  completed: BuildingInstance[];
  births: number;
}

/**
 * One base for one step: construction → power + production (by priority) → crew needs →
 * families → depot safety net. Its inventory stays open so missions can still deliver to it.
 */
function stepBase(b: BaseData, state: GameState, dt: number, transportOverride: TransportNetwork | undefined, events: SimEvent[]): BaseStep {
  const built = ConstructionManager.advance(b.buildings, dt);
  let buildings = built.buildings;
  const env = baseEnv(b.siteId, state.research.completed, buildings);

  // The Sun rises later the farther west a base is: local time follows its longitude.
  const localSols = state.timeSols + (b.lon - SETTLEMENT.lon) / 360;
  const capacity = StorageManager.capacity(buildings);
  const inv = new ResourceManager(b.resources, capacity);
  const transport = transportOverride ?? new RoadTransport(buildings, b.roads);
  const batteryCapacityKwh = PowerManager.batteryCapacity(buildings);
  const generationKw = PowerManager.generation(buildings, localSols, env);
  const pool = new PowerPool(generationKw, Math.min(b.power.batteryKwh, batteryCapacityKwh), batteryCapacityKwh, dt);
  const ctx: ProductionContext = { inventory: inv, deposits: { ...b.deposits }, transport, dt, env };
  const rates = emptyResources();
  const produced: Partial<Record<ResourceId, number>> = {};

  const order = buildings.map((x, i) => ({ x, i })).sort((p, q) => BUILDINGS[p.x.type].powerPriority - BUILDINGS[q.x.type].powerPriority || p.i - q.i);
  const updated = new Map<string, BuildingInstance>();
  let unpowered = 0;
  let housing = 0;
  let researchRp = 0;
  let lifeSupportWorking = false;
  for (const { x } of order) {
    if (!x.isOperational) {
      updated.set(x.id, { ...x, status: 'under_construction', statusNote: null, connected: transport.canReach(x.id) });
      continue;
    }
    if (!x.enabled) {
      updated.set(x.id, { ...x, status: 'disabled', statusNote: 'Switched off', powered: false, efficiency: 0, connected: transport.canReach(x.id) });
      continue;
    }
    const plan = ProductionManager.plan(x, ctx);
    const powered = pool.request(plan.kw);
    const res = ProductionManager.run(plan, powered, ctx);
    ProductionManager.addFlow(rates, res.flow);
    const delivered = Object.entries(res.delivered) as [ResourceId, number][];
    if (delivered.length) {
      for (const [id, v] of delivered) produced[id] = (produced[id] ?? 0) + v;
      events.push({ type: 'production', buildingId: x.id, delivered: res.delivered });
    }
    if (res.building.status === 'insufficient_power') unpowered++;
    if (powered) {
      housing += BUILDINGS[x.type].housing;
      researchRp += BUILDINGS[x.type].researchPerSol ?? 0;
    }
    if (x.type === 'life_support' && powered) lifeSupportWorking = true;
    updated.set(x.id, sameBuilding(x, res.building) ? x : res.building);
  }
  buildings = buildings.map((x) => updated.get(x.id) ?? x);

  // Crew needs. Rationing can't take more than what is stored, never below zero.
  // Crew out on a round trip live on the supplies they packed.
  const atBase = Math.max(0, b.colony.colonists - MissionManager.crewAway(state.missions, b.id));
  for (const id of RESOURCE_IDS) {
    let perSol = COLONIST_NEEDS_PER_SOL[id] * atBase;
    if (id === 'water' && lifeSupportWorking) perSol *= 1 - WATER_RECOVERY;
    rates[id] -= perSol;
    if (dt > 0) inv.take(id, perSol * dt);
  }

  // Families grow into free beds; they wait while the base is short of food, water or oxygen.
  const shortage = (['food', 'water', 'oxygen'] as ResourceId[]).some((id) => COLONIST_NEEDS_PER_SOL[id] > 0 && inv.get(id) < 1);
  const pop = PopulationManager.step(b.colony.colonists, housing, b.colony.growth ?? 0, dt, shortage);

  // Depot safety net: a small drop of material every few sols, so there is never a dead end.
  const depotWorks = buildings.some((x) => x.type === 'storage_depot' && x.isOperational);
  if (depotWorks && dt > 0 && Math.floor((state.timeSols + dt) / DEPOT_SUPPLY.everySols) > Math.floor(state.timeSols / DEPOT_SUPPLY.everySols)) {
    for (const [id, v] of Object.entries(DEPOT_SUPPLY.amounts) as [ResourceId, number][]) inv.put(id, v);
  }

  const envAfter = baseEnv(b.siteId, state.research.completed, buildings);
  return {
    base: {
      ...b,
      storage: capacity,
      rates,
      power: {
        generationKw,
        demandKw: pool.demandKw,
        suppliedKw: pool.suppliedKw,
        avgGenerationKw: PowerManager.averageGeneration(buildings, envAfter),
        plannedDemandKw: PowerManager.plannedDemand(buildings, envAfter),
        batteryKwh: pool.finish(),
        batteryCapacityKwh,
        sun: PowerManager.sunFactor(localSols),
        unpowered,
      },
      deposits: ctx.deposits,
      colony: { colonists: pop.colonists, housing, growth: pop.growth },
      buildings,
    },
    inv,
    produced,
    researchRp,
    completed: built.completed,
    births: pop.births,
  };
}

/**
 * One fixed simulation step: a pure function of the game state, with no store, no
 * rendering and no clock. `dt = 0` recomputes statuses and rates without advancing time.
 *
 * Every base runs its own step (stepBase); then the shared parts: missions and outposts,
 * research, sites spotted by the orbiter, progression and warnings.
 */
export function stepSimulation(state: GameState, dt: number, regions: RegionManager, opts: StepOptions = {}): StepResult {
  const events: SimEvent[] = [];
  const notices: AlertSpec[] = [];

  // 1. Every base.
  const all: BaseData[] = [activeBaseData(state), ...state.otherBases];
  const steps = all.map((b) => stepBase(b, state, dt, b.id === state.base.id ? opts.transport : undefined, events));
  const stepOf = (id: string | undefined): BaseStep => steps.find((x) => x.base.id === (id ?? HOME_BASE_ID)) ?? steps[0];
  const produced = { ...state.stats.produced };
  let researchRp = 0;
  for (const st of steps) {
    for (const [id, v] of Object.entries(st.produced) as [ResourceId, number][]) produced[id] += v;
    researchRp += st.researchRp;
  }

  let progression = state.progression;
  const grant = (xp: number, milestone: string) => {
    const g = ProgressionManager.grant(progression, xp, milestone);
    progression = g.progression;
    if (g.rankUp) {
      notices.push({ key: `rank-${g.rankUp.id}`, level: 'success', title: `${g.rankUp.icon} Promoted to ${g.rankUp.title}!`, message: `Unlocked: ${g.rankUp.perks.join(' · ')}.` });
    }
  };
  const putAll = (inv: ResourceManager, items: Partial<Record<ResourceId, number>>): string[] => {
    const got: string[] = [];
    for (const [id, v] of Object.entries(items) as [ResourceId, number][]) {
      const added = inv.put(id, v);
      if (added > 0) got.push(`${Math.round(added)} ${RESOURCES[id].unit} ${RESOURCES[id].name.toLowerCase()}`);
    }
    return got;
  };
  const at = (st: BaseStep) => (st.base.id === state.base.id ? '' : ` at ${st.base.name}`);

  // 2. Construction rewards and births at every base.
  for (const st of steps) {
    for (const b of st.completed) {
      const def = BUILDINGS[b.type];
      notices.push({ key: `done-${b.id}`, level: 'success', title: `${def.name} is ready${at(st)}!`, message: `${def.funFact} (+${XP_REWARDS.buildingComplete} XP)` });
      events.push({ type: 'building:completed', id: b.id });
      grant(XP_REWARDS.buildingComplete, `built-${b.id}`);
    }
    if (st.births > 0) {
      notices.push({
        key: `born-${st.base.id}-${Math.floor(state.timeSols)}`,
        level: 'success',
        title: `👶 ${st.births === 1 ? 'A baby was' : `${st.births} babies were`} born${at(st)}!`,
        message: `${st.base.name} now has ${st.base.colony.colonists} colonists. Families grow faster while there are empty beds.`,
      });
    }
  }

  // 3. Pipelines (built over time, then evening out their two bases) and cargo haulers.
  const pumpsOn = new Set(steps.filter((st) => Logistics.hasPump(st.base.buildings, true)).map((st) => st.base.id));
  const nameOf = (id: string) => steps.find((x) => x.base.id === id)?.base.name ?? 'the other base';
  let pipelines = state.pipelines.map((p) => {
    let q = p;
    if (p.progress < 1 && dt > 0) {
      q = { ...p, progress: Math.min(1, p.progress + dt / p.buildSols) };
      if (q.progress >= 1) {
        const pumps = pumpsOn.has(p.fromBaseId) && pumpsOn.has(p.toBaseId);
        notices.push({
          key: `pipe-done-${p.id}`,
          level: 'success',
          title: `🛢️ Pipeline ${nameOf(p.fromBaseId)} ⇄ ${nameOf(p.toBaseId)} is ready!`,
          message: pumps
            ? 'The two bases now even out everything they store, and send each other building materials when one runs short.'
            : `It starts pumping as soon as both bases have a working Pipeline Pump Station. (+${XP_REWARDS.buildingComplete} XP)`,
        });
        grant(XP_REWARDS.buildingComplete, `pipe-${p.id}`);
      }
    }
    const working = q.progress >= 1 && pumpsOn.has(q.fromBaseId) && pumpsOn.has(q.toBaseId);
    if (working !== q.working) q = { ...q, working };
    // Twisted sections: new ones appear now and then, robots drive out and fix them.
    const tw = Logistics.advanceFaults(q, state.timeSols, dt);
    const route = `${nameOf(q.fromBaseId)} ⇄ ${nameOf(q.toBaseId)}`;
    for (const f of tw.added) {
      const def = PIPE_FAULTS[f.kind];
      const km = Math.round(f.at * q.km);
      notices.push({
        key: `pipe-fault-${f.id}`,
        level: 'warning',
        title: `⚠️ ${def.name} on the ${route} pipeline`,
        message: `${def.why} About ${km.toLocaleString()} km from ${nameOf(q.fromBaseId)}, ${Math.round(f.pinch * 100)}% of the pipe is pinched shut, so less can flow. Repair robots are on their way (about ${f.repairSols.toFixed(1)} sols).`,
      });
    }
    for (const f of tw.fixed) {
      notices.push({
        key: `pipe-fixed-${f.id}`,
        level: 'success',
        title: `🔧 ${route} pipeline repaired`,
        message: `The robots straightened the ${PIPE_FAULTS[f.kind].name.toLowerCase()}, cleaned the sliding shoes and fitted a new section. Full flow again.`,
      });
    }
    return tw.pipe;
  });
  pipelines = Logistics.balance(pipelines, new Map(steps.map((st) => [st.base.id, { inv: st.inv, rates: st.base.rates }])), dt);

  const shipments = Logistics.advanceShipments(
    state.shipments,
    dt,
    state.timeSols,
    (sh) => {
      const dest = steps.find((x) => x.base.id === sh.toBaseId);
      if (!dest) return sh.cargo;
      const left: Partial<Record<ResourceId, number>> = {};
      for (const [id, v] of Object.entries(sh.cargo) as [ResourceId, number][]) {
        const added = dest.inv.put(id, v);
        if (v - added > 0.5) left[id] = v - added;
      }
      const got = describeCost(Object.fromEntries((Object.entries(sh.cargo) as [ResourceId, number][]).map(([id, v]) => [id, v - (left[id] ?? 0)])));
      notices.push({
        key: `cargo-in-${sh.id}`,
        level: 'success',
        title: `🚚 Cargo haulers reached ${dest.base.name}`,
        message: `${got ? `Unloaded ${got}.` : 'Storage there is full, so nothing could be unloaded.'}${Object.keys(left).length ? ` No room for ${describeCost(left)}: it rides back home.` : ''}`,
      });
      return left;
    },
    (sh) => {
      const home = stepOf(sh.fromBaseId);
      const back = putAll(home.inv, sh.cargo);
      notices.push({
        key: `cargo-home-${sh.id}`,
        level: 'info',
        title: `🚚 Haulers are back at ${home.base.name}`,
        message: `${back.length ? `They brought back ${back.join(', ')}. ` : ''}Ready for the next trip. (+${CARGO.xp} XP)`,
      });
      grant(CARGO.xp, `cargo-${sh.id}`);
    },
  );

  // 4. Missions and outposts.
  const mis = MissionManager.advance(state.missions, dt, state.timeSols, regions);
  let discoveredRegions = state.discoveredRegions;
  let exploredRegions = state.exploredRegions;
  let sitesSeen = state.sitesSeen;
  const founded: BaseData[] = [];
  const confirmRegion = (regionId: string) => {
    for (const site of sitesIn(regionId)) if (sitesSeen[site.id] !== 2) sitesSeen = { ...sitesSeen, [site.id]: 2 };
  };
  for (const n of mis.news) {
    const m = n.mission;
    const name = regions.get(m.regionId)?.name ?? m.regionId;
    switch (n.kind) {
      case 'scanned': {
        discoveredRegions = { ...discoveredRegions, [m.regionId]: true };
        const count = sitesIn(m.regionId).length;
        notices.push({
          key: `scanned-${m.regionId}`,
          level: 'success',
          title: `📡 ${name} mapped from orbit`,
          message: `${rewardFor(m.regionId).hint} ${count ? `${count} possible base site${count > 1 ? 's' : ''} found.` : 'No good base sites here.'} (+${ORBITAL_SCAN.xp} XP)`,
        });
        events.push({ type: 'region:discovered', id: m.regionId });
        grant(ORBITAL_SCAN.xp, `scan-${m.regionId}`);
        break;
      }
      case 'arrived': {
        exploredRegions = { ...exploredRegions, [m.regionId]: true };
        confirmRegion(m.regionId);
        const outpost = rewardFor(m.regionId).outpost;
        notices.push({
          key: `arrived-${m.id}`,
          level: 'success',
          title: `🧑‍🚀 Crew reached ${name}!`,
          message: `${n.mission.reward?.find ?? ''}${outpost ? ' You can build an outpost here.' : ''} The crew checked every base site in the region. Now collecting samples, then driving home.`,
        });
        events.push({ type: 'region:explored', id: m.regionId });
        break;
      }
      case 'storm':
        notices.push({
          key: `storm-${m.id}`,
          level: 'warning',
          title: `🌪️ Dust storm near ${name}`,
          message: 'Dust is blocking the sunlight, so the rover parks and waits. In 2018 a storm like this ended NASA’s solar-powered Opportunity rover.',
        });
        break;
      case 'home': {
        const inv = stepOf(n.mission.fromBaseId).inv;
        const r = n.mission.reward;
        const samples = r ? putAll(inv, r.resources) : [];
        const back = putAll(inv, n.returned);
        notices.push({
          key: `home-${m.id}`,
          level: 'success',
          title: `🏠 Expedition to ${name} is home`,
          message: `${samples.length ? `Samples: ${samples.join(', ')}. ` : ''}${back.length ? `Unused supplies back in storage: ${back.join(', ')}.` : ''} (+${r?.xp ?? 0} XP)`,
        });
        if (r) grant(r.xp, `mission-${m.id}`);
        break;
      }
      case 'founded': {
        const e = n.mission;
        const f = e.found!;
        const site = SITE_BY_ID[f.siteId];
        // Whatever the crew didn't eat on the way is unpacked at the new base.
        const used = Math.min(e.packedSols, state.timeSols + dt - e.startSol);
        const cargo: Partial<Record<ResourceId, number>> = { ...f.kit };
        for (const id of RESOURCE_IDS) {
          const packed = (e.supplies[id] ?? 0) - (f.kit[id] ?? 0);
          if (packed > 0) cargo[id] = (cargo[id] ?? 0) + Math.floor(packed * Math.max(0, 1 - used / e.packedSols));
        }
        const nb = makeNewBase(f.siteId, state.timeSols + dt, f.crew, cargo);
        founded.push(nb);
        exploredRegions = { ...exploredRegions, [site.regionId]: true };
        confirmRegion(site.regionId);
        sitesSeen = { ...sitesSeen, [f.siteId]: 2 };
        const traits = visibleTraits(site, state.research.completed).map((t) => `${TRAITS[t].icon} ${TRAITS[t].name}`);
        notices.push({
          key: `founded-${nb.id}`,
          level: 'success',
          title: `🏗️ ${nb.name} is founded!`,
          message: `The convoy unpacked its Central Storage Depot at ${site.name}. ${traits.length ? `Site: ${traits.join(', ')}.` : ''} Switch to the new base to build homes, power and drills. (+${FOUNDING.xp} XP)`,
        });
        events.push({ type: 'base:founded', id: nb.id });
        grant(FOUNDING.xp, `founded-${nb.id}`);
        break;
      }
    }
  }
  const out = MissionManager.advanceOutposts(state.outposts, state.timeSols, dt);
  for (const d of out.deliveries) {
    const got = putAll(stepOf(d.outpost.baseId).inv, { [d.outpost.resource]: d.amount });
    const name = regions.get(d.outpost.regionId)?.name ?? d.outpost.regionId;
    notices.push({ key: `cargo-${d.outpost.id}`, level: 'info', title: `🚚 Cargo from ${name}`, message: got.length ? `The cargo rover delivered ${got.join(', ')}.` : 'Storage is full, so the cargo was left behind. Build more storage!' });
  }

  // 5. Base sites appear one by one while the orbiter maps a region.
  for (const m of state.missions) {
    if (m.type !== 'orbital' || m.status !== 'active') continue;
    const now = mis.missions.find((x) => x.id === m.id) as OrbitalScan | undefined;
    const progress = now?.progress ?? 1;
    const sites = sitesIn(m.regionId);
    sites.forEach((site, i) => {
      if (sitesSeen[site.id] || progress + 1e-9 < (i + 1) / sites.length) return;
      sitesSeen = { ...sitesSeen, [site.id]: state.research.completed.includes('orbiter_mk2') ? 2 : 1 };
      const traits = visibleTraits(site, state.research.completed);
      const best = traits.filter((t) => TRAITS[t].tone !== 'bad').map((t) => `${TRAITS[t].icon} ${TRAITS[t].name.toLowerCase()}`);
      notices.push({
        key: `site-${site.id}`,
        level: 'info',
        title: `📡 Base site spotted: ${site.name}`,
        message: best.length ? `The orbiter sees ${best.join(', ')}. Open Exploration to see the site report.` : 'A flat, safe place for a base. Open Exploration to see the site report.',
      });
      events.push({ type: 'site:spotted', id: site.id });
    });
  }

  // 6. Research.
  // Every running project gets an equal share of the labs' points; one waiting for test
  // materials hands its share to the others.
  let research = state.research;
  const working = research.active.filter((p) => !p.awaiting);
  if (working.length && dt > 0 && researchRp > 0) {
    const share = (researchRp * dt) / working.length;
    const active: typeof research.active = [];
    const completed = [...research.completed];
    for (const p of research.active) {
      if (p.awaiting) {
        active.push(p);
        continue;
      }
      const tech = TECH_BY_ID[p.id];
      const progress = p.progress + share;
      const need = stageRp(tech, p.stage);
      const last = p.stage >= STAGES.length - 1;
      if (progress < need) {
        active.push({ ...p, progress });
      } else if (!last) {
        // Stages that need test hardware wait for the player to pay for it.
        const done = STAGES[p.stage];
        const next = STAGES[p.stage + 1];
        const paid = Object.keys(stageMaterials(tech, p.stage + 1)).length > 0;
        active.push(paid ? { ...p, progress: need, awaiting: true } : { ...p, stage: p.stage + 1, progress: 0 });
        notices.push({
          key: `tech-stage-${tech.id}`,
          level: 'info',
          title: `${done.name} done: ${tech.name}`,
          message: paid ? `Ready for the ${next.name.toLowerCase()}. Open Research to send the materials.` : `Now: ${next.name.toLowerCase()}.`,
        });
      } else {
        completed.push(tech.id);
        notices.push({ key: `tech-${tech.id}`, level: 'success', title: `${tech.icon} Research complete: ${tech.name}`, message: `${tech.effect}. ${tech.fact}` });
        grant(Math.round(tech.cost / 4), `tech-${tech.id}`);
        if (tech.id === 'orbiter_mk2') for (const id of Object.keys(sitesSeen)) sitesSeen = { ...sitesSeen, [id]: 2 };
      }
    }
    research = { ...research, active, completed };
  }

  // 7. Write every base back: the active one to the top level, the rest (and new ones) to otherBases.
  const finished = steps.map((st) => ({ ...st.base, resources: st.inv.snapshot() }));
  const active = finished.find((b) => b.id === state.base.id)!;
  const others = [...finished.filter((b) => b.id !== state.base.id), ...founded];
  const next: GameState = withActiveBase(
    {
      ...state,
      timeSols: state.timeSols + dt,
      stats: dt > 0 ? { produced } : state.stats,
      missions: mis.missions,
      outposts: out.outposts,
      pipelines,
      shipments,
      discoveredRegions,
      exploredRegions,
      sitesSeen,
      research,
      progression,
    },
    active,
    others,
  );

  // 8. Goals.
  for (const goal of ProgressionManager.newlyReached(next)) {
    notices.push({ key: goal.id, level: 'success', title: `${goal.icon} Goal reached: ${goal.title}`, message: `Great work, commander! +${goal.xp} XP` });
    grant(goal.xp, goal.id);
  }
  next.progression = progression;

  return { state: next, events, notices, warnings: computeWarnings(next) };
}

/** Avoids replacing building objects (and re-rendering) when nothing visible changed. */
function sameBuilding(a: BuildingInstance, b: BuildingInstance): boolean {
  if (a.status !== b.status || a.statusNote !== b.statusNote || a.powered !== b.powered || a.connected !== b.connected) return false;
  if (Math.abs(a.efficiency - b.efficiency) > 1e-6 || a.stored !== b.stored) return false;
  for (const k of Object.keys(b.recipes) as (keyof typeof b.recipes)[]) {
    const x = a.recipes[k];
    const y = b.recipes[k]!;
    if (!x || x.progress !== y.progress || x.loaded !== y.loaded) return false;
  }
  return true;
}
