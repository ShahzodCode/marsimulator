import { BUILDINGS, DEPOT_SUPPLY } from '../data/buildings';
import { XP_REWARDS } from '../data/progression';
import { ORBITAL_SCAN, rewardFor } from '../data/missions';
import { COLONIST_NEEDS_PER_SOL, RESOURCES, RESOURCE_IDS, WATER_RECOVERY, emptyResources, type ResourceId } from '../data/resources';
import type { RegionManager } from '../planet/RegionManager';
import type { BuildingInstance, GameState } from '../state/types';
import { ConstructionManager } from './ConstructionManager';
import { MissionManager } from './MissionManager';
import { PowerManager, PowerPool } from './PowerManager';
import { ProductionManager, type ProductionContext } from './ProductionManager';
import { ProgressionManager } from './ProgressionManager';
import { ResourceManager } from './ResourceManager';
import { StorageManager } from './StorageManager';
import { RoadTransport, type TransportNetwork } from './Transport';
import { computeWarnings, type AlertSpec } from './Warnings';

export { SIM_STEP_SOLS } from './SimulationClock';

export type SimEvent =
  | { type: 'building:completed'; id: string }
  | { type: 'region:discovered'; id: string }
  | { type: 'region:explored'; id: string }
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
] as const satisfies readonly (keyof GameState)[];

/**
 * One fixed simulation step — a pure function of the game state, with no store, no
 * rendering and no clock. `dt = 0` recomputes statuses and rates without advancing time.
 *
 * Order: construction → power + production (by priority) → crew needs → missions →
 * progression → warnings.
 */
export function stepSimulation(state: GameState, dt: number, regions: RegionManager, opts: StepOptions = {}): StepResult {
  const events: SimEvent[] = [];
  const notices: AlertSpec[] = [];

  // 1. Construction.
  const built = ConstructionManager.advance(state.buildings, dt);
  let buildings = built.buildings;

  // 2. Storage, transport and power for this step.
  const capacity = StorageManager.capacity(buildings);
  const inv = new ResourceManager(state.resources, capacity);
  const transport = opts.transport ?? new RoadTransport(buildings, state.roads);
  const batteryCapacityKwh = PowerManager.batteryCapacity(buildings);
  const generationKw = PowerManager.generation(buildings, state.timeSols);
  const pool = new PowerPool(generationKw, Math.min(state.power.batteryKwh, batteryCapacityKwh), batteryCapacityKwh, dt);
  const ctx: ProductionContext = { inventory: inv, deposits: { ...state.deposits }, transport, dt };
  const rates = emptyResources();
  const produced = { ...state.stats.produced };

  // 3. Production, in power-priority order (life support gets electricity first).
  const order = buildings.map((b, i) => ({ b, i })).sort((x, y) => BUILDINGS[x.b.type].powerPriority - BUILDINGS[y.b.type].powerPriority || x.i - y.i);
  const updated = new Map<string, BuildingInstance>();
  let unpowered = 0;
  let housing = 0;
  let lifeSupportWorking = false;
  for (const { b } of order) {
    if (!b.isOperational) {
      updated.set(b.id, { ...b, status: 'under_construction', statusNote: null, connected: transport.canReach(b.id) });
      continue;
    }
    if (!b.enabled) {
      updated.set(b.id, { ...b, status: 'disabled', statusNote: 'Switched off', powered: false, efficiency: 0, connected: transport.canReach(b.id) });
      continue;
    }
    const plan = ProductionManager.plan(b, ctx);
    const powered = pool.request(plan.kw);
    const res = ProductionManager.run(plan, powered, ctx);
    ProductionManager.addFlow(rates, res.flow);
    const delivered = Object.entries(res.delivered) as [ResourceId, number][];
    if (delivered.length) {
      for (const [id, v] of delivered) produced[id] += v;
      events.push({ type: 'production', buildingId: b.id, delivered: res.delivered });
    }
    if (res.building.status === 'insufficient_power') unpowered++;
    if (powered) housing += BUILDINGS[b.type].housing;
    if (b.type === 'life_support' && powered) lifeSupportWorking = true;
    updated.set(b.id, sameBuilding(b, res.building) ? b : res.building);
  }
  buildings = buildings.map((b) => updated.get(b.id) ?? b);

  // 4. Crew needs. Rationing can't take more than what is stored — never below zero.
  // Crew out on an expedition live on the supplies they packed.
  const colonists = state.colony.colonists;
  const atBase = Math.max(0, colonists - MissionManager.crewAway(state.missions));
  for (const id of RESOURCE_IDS) {
    let perSol = COLONIST_NEEDS_PER_SOL[id] * atBase;
    if (id === 'water' && lifeSupportWorking) perSol *= 1 - WATER_RECOVERY;
    rates[id] -= perSol;
    if (dt > 0) inv.take(id, perSol * dt);
  }

  // 5. Depot safety net: a small drop of material every few sols, so there is never a dead end.
  const depotWorks = buildings.some((b) => b.type === 'storage_depot' && b.isOperational);
  if (depotWorks && dt > 0 && Math.floor((state.timeSols + dt) / DEPOT_SUPPLY.everySols) > Math.floor(state.timeSols / DEPOT_SUPPLY.everySols)) {
    for (const [id, v] of Object.entries(DEPOT_SUPPLY.amounts) as [ResourceId, number][]) inv.put(id, v);
  }

  // 6. Missions and outposts.
  const mis = MissionManager.advance(state.missions, dt, state.timeSols, regions);
  let discoveredRegions = state.discoveredRegions;
  let exploredRegions = state.exploredRegions;
  let progression = state.progression;
  const deposits = ctx.deposits;
  const grant = (xp: number, milestone: string) => {
    const g = ProgressionManager.grant(progression, xp, milestone);
    progression = g.progression;
    if (g.rankUp) {
      notices.push({
        key: `rank-${g.rankUp.id}`,
        level: 'success',
        title: `${g.rankUp.icon} Promoted to ${g.rankUp.title}!`,
        message: `Unlocked: ${g.rankUp.perks.join(' · ')}.`,
      });
    }
  };
  const putAll = (items: Partial<Record<ResourceId, number>>): string[] => {
    const got: string[] = [];
    for (const [id, v] of Object.entries(items) as [ResourceId, number][]) {
      const added = inv.put(id, v);
      if (added > 0) got.push(`${Math.round(added)} ${RESOURCES[id].unit} ${RESOURCES[id].name.toLowerCase()}`);
    }
    return got;
  };
  for (const n of mis.news) {
    const m = n.mission;
    const name = regions.get(m.regionId)?.name ?? m.regionId;
    switch (n.kind) {
      case 'scanned': {
        discoveredRegions = { ...discoveredRegions, [m.regionId]: true };
        notices.push({ key: `scanned-${m.regionId}`, level: 'success', title: `📡 ${name} mapped from orbit`, message: `${rewardFor(m.regionId).hint} (+${ORBITAL_SCAN.xp} XP)` });
        events.push({ type: 'region:discovered', id: m.regionId });
        grant(ORBITAL_SCAN.xp, `scan-${m.regionId}`);
        break;
      }
      case 'arrived': {
        exploredRegions = { ...exploredRegions, [m.regionId]: true };
        const outpost = rewardFor(m.regionId).outpost;
        notices.push({
          key: `arrived-${m.id}`,
          level: 'success',
          title: `🧑‍🚀 Crew reached ${name}!`,
          message: `${n.mission.reward?.find ?? ''}${outpost ? ' You can build an outpost here.' : ''} Now collecting samples, then driving home.`,
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
        const r = n.mission.reward;
        const samples = r ? putAll(r.resources) : [];
        const back = putAll(n.returned);
        notices.push({
          key: `home-${m.id}`,
          level: 'success',
          title: `🏠 Expedition to ${name} is home`,
          message: `${samples.length ? `Samples: ${samples.join(', ')}. ` : ''}${back.length ? `Unused supplies back in storage: ${back.join(', ')}.` : ''} (+${r?.xp ?? 0} XP)`,
        });
        if (r) grant(r.xp, `mission-${m.id}`);
        break;
      }
    }
  }
  const out = MissionManager.advanceOutposts(state.outposts, state.timeSols, dt);
  for (const d of out.deliveries) {
    const got = putAll({ [d.outpost.resource]: d.amount });
    const name = regions.get(d.outpost.regionId)?.name ?? d.outpost.regionId;
    notices.push({ key: `cargo-${d.outpost.id}`, level: 'info', title: `🚚 Cargo from ${name}`, message: got.length ? `The cargo rover delivered ${got.join(', ')}.` : 'Storage is full, so the cargo was left behind. Build more storage!' });
  }

  // 7. Construction rewards.
  for (const b of built.completed) {
    const def = BUILDINGS[b.type];
    notices.push({ key: `done-${b.id}`, level: 'success', title: `${def.name} is ready!`, message: `${def.funFact} (+${XP_REWARDS.buildingComplete} XP)` });
    events.push({ type: 'building:completed', id: b.id });
    grant(XP_REWARDS.buildingComplete, `built-${b.id}`);
  }

  const next: GameState = {
    ...state,
    timeSols: state.timeSols + dt,
    resources: inv.snapshot(),
    storage: capacity,
    rates,
    power: {
      generationKw,
      demandKw: pool.demandKw,
      suppliedKw: pool.suppliedKw,
      avgGenerationKw: PowerManager.averageGeneration(buildings),
      plannedDemandKw: PowerManager.plannedDemand(buildings),
      batteryKwh: pool.finish(),
      batteryCapacityKwh,
      sun: PowerManager.sunFactor(state.timeSols),
      unpowered,
    },
    deposits,
    stats: dt > 0 ? { produced } : state.stats,
    colony: { colonists, housing },
    buildings,
    missions: mis.missions,
    outposts: out.outposts,
    discoveredRegions,
    exploredRegions,
    progression,
  };

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
