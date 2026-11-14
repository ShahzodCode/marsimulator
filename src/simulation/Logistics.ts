import { CARGO, PIPELINE, pipelineBuildSols, pipelineCost } from '../data/logistics';
import { EXPEDITION } from '../data/missions';
import { sunFactor } from '../data/power';
import { RESOURCES, RESOURCE_IDS, type ResourceId } from '../data/resources';
import { SETTLEMENT } from '../data/settlement';
import { angularDistance, MARS_RADIUS_KM, type LatLon } from '../planet/geo';
import { activeBaseData, makeId } from '../state/factory';
import type { BaseData, BuildingInstance, GameState, Pipeline, Shipment } from '../state/types';
import { MissionManager, type HeightSampler } from './MissionManager';
import { ResourceManager, type Cost, type ResourceBag } from './ResourceManager';

/**
 * Moving goods between bases: pipelines (between Pump Stations) and cargo haulers (from a
 * Garage). Pure functions of the game state; the store and the simulation call them.
 */

type Check<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

/** Game km a hauler covers per sol on average (daylight driving, time-lapsed like the crew rovers). */
const HAULER_KM_PER_SOL = CARGO.speedKmh * EXPEDITION.driveHoursPerSol * EXPEDITION.timeScale;

type LogisticsState = Pick<GameState, 'base' | 'otherBases' | 'pipelines' | 'resources' | 'buildings' | 'roads' | 'storage' | 'rates' | 'power' | 'deposits' | 'colony'>;

function km(a: LatLon, b: LatLon): number {
  return angularDistance(a.lat, a.lon, b.lat, b.lon) * MARS_RADIUS_KM;
}

function sumCost(c: Cost): number {
  return Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
}

export function describeCost(c: Cost): string {
  return (Object.entries(c) as [ResourceId, number][])
    .filter(([, v]) => v > 0)
    .map(([id, v]) => `${Math.round(v)} ${RESOURCES[id].unit} ${RESOURCES[id].name.toLowerCase()}`)
    .join(', ');
}

export const Logistics = {
  allBases(state: LogisticsState): BaseData[] {
    return [activeBaseData(state as GameState), ...state.otherBases];
  },

  baseById(state: LogisticsState, id: string): BaseData | undefined {
    return Logistics.allBases(state).find((b) => b.id === id);
  },

  /** A Pump Station stands at the base (`working`: finished, switched on and powered). */
  hasPump(buildings: readonly BuildingInstance[], working = false): boolean {
    return buildings.some((x) => x.type === 'pump_station' && (!working || (x.isOperational && x.enabled && x.powered)));
  },

  pipelineBetween(pipelines: readonly Pipeline[], a: string, b: string): Pipeline | undefined {
    return pipelines.find((p) => (p.fromBaseId === a && p.toBaseId === b) || (p.fromBaseId === b && p.toBaseId === a));
  },

  /**
   * Where a building stands on the globe. Buildings placed at other bases before their
   * coordinates were fixed may carry the home base's; those fall back to the base centre.
   */
  spotOf(base: LatLon, b: BuildingInstance | undefined): LatLon {
    if (!b || km(base, { lat: b.latitude, lon: b.longitude }) > 30) return { lat: base.lat, lon: base.lon };
    return { lat: b.latitude, lon: b.longitude };
  },

  /** Where a base's pipelines start: its first Pump Station, or the base centre. */
  pumpSpot(base: BaseData): LatLon {
    return Logistics.spotOf(base, base.buildings.find((x) => x.type === 'pump_station'));
  },

  // ---------------------------------------------------------------- pipelines

  /** Can a pipeline be laid from one base to another (paid by `fromId`)? */
  checkPipeline(state: LogisticsState, fromId: string, toId: string): Check<{ km: number; cost: Cost; buildSols: number }> {
    const from = Logistics.baseById(state, fromId);
    const to = Logistics.baseById(state, toId);
    if (!from || !to) return { ok: false, reason: 'Drag onto another base.' };
    if (from.id === to.id) return { ok: false, reason: 'Drag onto a different base.' };
    if (!Logistics.hasPump(from.buildings)) return { ok: false, reason: `Build a Pipeline Pump Station at ${from.name} first.` };
    if (Logistics.pipelineBetween(state.pipelines, from.id, to.id)) return { ok: false, reason: `${from.name} and ${to.name} are already joined by a pipeline.` };
    const d = km(from, to);
    if (d > PIPELINE.maxKm) return { ok: false, reason: `${Math.round(d).toLocaleString()} km is too long (limit ${PIPELINE.maxKm.toLocaleString()} km). Join bases that are closer together.` };
    const cost = pipelineCost(d);
    if (!ResourceManager.canAfford(from.resources, cost)) return { ok: false, reason: `${from.name}: ${ResourceManager.describeMissing(from.resources, cost)}.` };
    return { ok: true, km: d, cost, buildSols: pipelineBuildSols(d) };
  },

  makePipeline(fromId: string, toId: string, d: number, sol: number): Pipeline {
    return { id: makeId('pipe'), fromBaseId: fromId, toBaseId: toId, km: d, progress: 0, buildSols: pipelineBuildSols(d), placedAtSol: sol, flow: {}, working: false };
  },

  /** Other bases joined to `baseId` through working pipelines (directly or via other bases). */
  network(pipelines: readonly Pipeline[], baseId: string): string[] {
    const seen = new Set([baseId]);
    const queue = [baseId];
    while (queue.length) {
      const id = queue.pop()!;
      for (const p of pipelines) {
        if (!p.working) continue;
        const other = p.fromBaseId === id ? p.toBaseId : p.toBaseId === id ? p.fromBaseId : null;
        if (other && !seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    seen.delete(baseId);
    return [...seen];
  },

  /** What the active base can spend on building: its own stock plus everything its pipeline network holds. */
  pooledResources(state: Pick<GameState, 'base' | 'resources'> & Partial<Pick<GameState, 'otherBases' | 'pipelines'>>): ResourceBag {
    const out = { ...state.resources };
    if (!state.pipelines?.length || !state.otherBases) return out;
    for (const id of Logistics.network(state.pipelines, state.base.id)) {
      const b = state.otherBases.find((x) => x.id === id);
      if (b) for (const r of RESOURCE_IDS) out[r] += b.resources[r];
    }
    return out;
  },

  /**
   * Pays a cost from the active base first; whatever it lacks is pumped over from the
   * bases on its pipeline network. Returns the new stocks and who sent what.
   */
  payFromNetwork(
    state: Pick<GameState, 'base' | 'resources' | 'otherBases' | 'pipelines'>,
    cost: Cost,
  ): { resources: ResourceBag; otherBases: BaseData[]; sent: { baseId: string; name: string; goods: Cost }[] } | null {
    if (!ResourceManager.canAfford(Logistics.pooledResources(state), cost)) return null;
    const resources = { ...state.resources };
    const need: Cost = {};
    for (const id of RESOURCE_IDS) {
      const c = cost[id] ?? 0;
      const own = Math.min(c, resources[id]);
      resources[id] -= own;
      if (c - own > 1e-9) need[id] = c - own;
    }
    const sent: { baseId: string; name: string; goods: Cost }[] = [];
    if (!sumCost(need)) return { resources, otherBases: state.otherBases, sent };
    const net = new Set(Logistics.network(state.pipelines, state.base.id));
    const otherBases = state.otherBases.map((b) => {
      if (!net.has(b.id) || !sumCost(need)) return b;
      const r = { ...b.resources };
      const goods: Cost = {};
      for (const id of RESOURCE_IDS) {
        const n = Math.min(need[id] ?? 0, r[id]);
        if (n <= 0) continue;
        r[id] -= n;
        need[id] = (need[id] ?? 0) - n;
        goods[id] = n;
      }
      if (!sumCost(goods)) return b;
      sent.push({ baseId: b.id, name: b.name, goods });
      return { ...b, resources: r };
    });
    return { resources, otherBases, sent };
  },

  /**
   * One step of pipeline flow: every working pipeline evens out each resource between its
   * two bases, so both end up equally full (as a share of their storage).
   */
  balance(pipelines: Pipeline[], invs: Map<string, { inv: ResourceManager; rates: Record<ResourceId, number> }>, dt: number): Pipeline[] {
    const k = 1 - Math.exp(-PIPELINE.balancePerSol * dt);
    return pipelines.map((p) => {
      const a = invs.get(p.fromBaseId);
      const b = invs.get(p.toBaseId);
      if (!p.working || !a || !b || dt <= 0) return p.working || !Object.keys(p.flow).length ? p : { ...p, flow: {} };
      const flow: Partial<Record<ResourceId, number>> = {};
      for (const id of RESOURCE_IDS) {
        const ca = a.inv.capacityOf(id);
        const cb = b.inv.capacityOf(id);
        if (ca <= 0 || cb <= 0) continue;
        const total = a.inv.get(id) + b.inv.get(id);
        // Positive: A is fuller than B and sends.
        const diff = a.inv.get(id) - (total * ca) / (ca + cb);
        const want = Math.sign(diff) * Math.min(Math.abs(diff) * k, PIPELINE.maxFlowPerSol * dt);
        if (Math.abs(want) < 1e-6) continue;
        const [src, dst] = want > 0 ? [a, b] : [b, a];
        const moved = ResourceManager.transfer(src.inv, dst.inv, id, Math.abs(want));
        if (moved <= 0) continue;
        src.rates[id] -= moved / dt;
        dst.rates[id] += moved / dt;
        flow[id] = (want > 0 ? moved : -moved) / dt;
      }
      return { ...p, flow };
    });
  },

  // ---------------------------------------------------------------- cargo haulers

  /** Haulers of a Garage that are parked at home right now. */
  haulersFree(shipments: readonly Shipment[], garageId: string): number {
    return CARGO.haulersPerGarage - shipments.filter((x) => x.garageId === garageId).reduce((n, x) => n + x.haulers, 0);
  },

  checkCargo(
    state: Pick<GameState, 'base' | 'otherBases' | 'buildings' | 'resources' | 'shipments'>,
    garageId: string,
    cargo: Cost,
  ): Check<{ haulers: number }> {
    const g = state.buildings.find((x) => x.id === garageId);
    if (!g || g.type !== 'cargo_garage') return { ok: false, reason: 'That garage is gone.' };
    if (!g.isOperational) return { ok: false, reason: 'The garage is still being built.' };
    if (!g.target) return { ok: false, reason: 'Drag the garage’s arrow onto another base first.' };
    const to = state.otherBases.find((b) => b.id === g.target);
    if (!to) return { ok: false, reason: 'That base is not there any more. Drag the arrow onto another base.' };
    const total = sumCost(cargo);
    if (total <= 0) return { ok: false, reason: 'Load something first: move a slider.' };
    const free = Logistics.haulersFree(state.shipments, garageId);
    if (free <= 0) return { ok: false, reason: 'All haulers are out on the road. Wait for one to come back.' };
    const haulers = Math.ceil(total / CARGO.payload);
    if (haulers > free) return { ok: false, reason: `That needs ${haulers} haulers, but only ${free} ${free === 1 ? 'is' : 'are'} parked here (${(free * CARGO.payload).toLocaleString()} max).` };
    if (!ResourceManager.canAfford(state.resources, cargo)) return { ok: false, reason: ResourceManager.describeMissing(state.resources, cargo) };
    return { ok: true, haulers };
  },

  launchCargo(
    state: Pick<GameState, 'base' | 'otherBases' | 'buildings' | 'resources' | 'shipments' | 'timeSols'>,
    garageId: string,
    cargo: Cost,
    height?: HeightSampler,
  ): { ok: true; shipment: Shipment; resources: ResourceBag; to: BaseData } | { ok: false; reason: string } {
    const check = Logistics.checkCargo(state, garageId, cargo);
    if (!check.ok) return check;
    const g = state.buildings.find((x) => x.id === garageId)!;
    const to = state.otherBases.find((b) => b.id === g.target)!;
    const clean: Cost = {};
    for (const [id, v] of Object.entries(cargo) as [ResourceId, number][]) if (v > 0) clean[id] = v;
    const from = Logistics.spotOf(state.base, g);
    const dest = { lat: to.lat, lon: to.lon };
    const plan = MissionManager.planBetween(from, dest, height);
    const shipment: Shipment = {
      id: makeId('cargo'),
      garageId,
      fromBaseId: state.base.id,
      toBaseId: to.id,
      from,
      to: dest,
      routeKm: plan.routeKm,
      legKm: plan.legKm,
      drivenKm: 0,
      haulers: check.haulers,
      cargo: clean,
      delivered: false,
      unloadSolsLeft: 0,
      startSol: state.timeSols,
      activity: 'driving',
    };
    return { ok: true, shipment, resources: ResourceManager.deduct(state.resources, clean), to };
  },

  /** Rough sols for a one-way trip (night stops included). */
  tripSols(legKm: number): number {
    return legKm / HAULER_KM_PER_SOL;
  },

  /** 0 at the garage, 1 at the other base. */
  routeFraction(s: Shipment): number {
    if (s.legKm <= 0) return 1;
    return s.drivenKm <= s.legKm ? s.drivenKm / s.legKm : Math.max(0, 2 - s.drivenKm / s.legKm);
  },

  remainingSols(s: Shipment): number {
    return Math.max(0, 2 * s.legKm - s.drivenKm) / HAULER_KM_PER_SOL + s.unloadSolsLeft + (s.delivered ? 0 : CARGO.unloadSols);
  },

  /**
   * Drives every hauler convoy. Haulers run on solar power: they park at night (local time
   * where they are). `arrive` unloads at the other base and returns what didn't fit;
   * `home` puts the leftovers back.
   */
  advanceShipments(
    shipments: Shipment[],
    dt: number,
    timeSols: number,
    arrive: (s: Shipment) => Cost,
    home: (s: Shipment) => void,
  ): Shipment[] {
    if (dt <= 0 || !shipments.length) return shipments;
    const out: Shipment[] = [];
    for (const s0 of shipments) {
      const s: Shipment = { ...s0 };
      if (s.unloadSolsLeft > 0) {
        s.unloadSolsLeft = Math.max(0, s.unloadSolsLeft - dt);
        s.activity = 'unloading';
        out.push(s);
        continue;
      }
      const here = MissionManager.pointBetween(s.from, s.to, Logistics.routeFraction(s));
      if (sunFactor(timeSols + (here.lon - SETTLEMENT.lon) / 360) <= 0) {
        s.activity = 'night';
        out.push(s);
        continue;
      }
      s.activity = 'driving';
      // Daylight is half the sol, so drive twice the daily average while the sun is up.
      let driven = s.drivenKm + HAULER_KM_PER_SOL * 2 * dt;
      if (!s.delivered && driven >= s.legKm) {
        driven = s.legKm;
        s.delivered = true;
        s.unloadSolsLeft = CARGO.unloadSols;
        s.activity = 'unloading';
        s.cargo = arrive(s);
      }
      s.drivenKm = Math.min(2 * s.legKm, driven);
      if (s.delivered && s.drivenKm >= 2 * s.legKm - 1e-9) {
        home(s);
        continue;
      }
      out.push(s);
    }
    return out;
  },
};

export type { LogisticsState };
