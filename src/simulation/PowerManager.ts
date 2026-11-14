import { BUILDINGS, maxPowerKw } from '../data/buildings';
import { AVERAGE_SUN, sunFactor } from '../data/power';
import { SOL_HOURS } from '../data/recipes';
import type { BuildingInstance } from '../state/types';
import { NEUTRAL_ENV, type BaseEnv } from './BaseEnv';

/**
 * Electricity: solar generation, battery storage and who gets power when there is not
 * enough. Power is a flow (kW) and batteries store energy (kWh); it is never treated as a
 * material in the inventory, and it is never created from nothing.
 */

export interface PowerRequest {
  id: string;
  kw: number;
  priority: number;
}

export interface PowerAllocation {
  /** Buildings that got all the power they asked for. */
  granted: Set<string>;
  demandKw: number;
  suppliedKw: number;
  /** Battery charge after this step. */
  batteryKwh: number;
}

const EPS = 1e-9;

export const PowerManager = {
  sunFactor,

  /** Solar output right now (kW). */
  generation(buildings: readonly BuildingInstance[], timeSols: number, env: BaseEnv = NEUTRAL_ENV): number {
    const sun = sunFactor(timeSols) * env.solar;
    let kw = 0;
    for (const b of buildings) if (b.isOperational) kw += BUILDINGS[b.type].solarPeakKw * sun + (BUILDINGS[b.type].steadyKw ?? 0);
    return kw;
  },

  /** Solar output averaged over a whole sol (kW). */
  averageGeneration(buildings: readonly BuildingInstance[], env: BaseEnv = NEUTRAL_ENV): number {
    let kw = 0;
    for (const b of buildings) if (b.isOperational) kw += BUILDINGS[b.type].solarPeakKw * AVERAGE_SUN * env.solar + (BUILDINGS[b.type].steadyKw ?? 0);
    return kw;
  },

  batteryCapacity(buildings: readonly BuildingInstance[]): number {
    let kwh = 0;
    for (const b of buildings) if (b.isOperational) kwh += BUILDINGS[b.type].batteryKwh;
    return kwh;
  },

  /**
   * Most power the settlement could draw if every switched-on building ran flat out —
   * buildings still under construction are counted too, since they will need it soon.
   */
  plannedDemand(buildings: readonly BuildingInstance[], env: BaseEnv = NEUTRAL_ENV): number {
    let kw = 0;
    for (const b of buildings) if (b.enabled) kw += maxPowerKw(b.type, env.heating);
    return kw;
  },

  /**
   * Can the settlement power `extraKw` more, on average over a sol? Used before building
   * or switching on a consumer, so the player never builds into a blackout by accident.
   */
  canSupport(buildings: readonly BuildingInstance[], extraKw: number, env: BaseEnv = NEUTRAL_ENV): { ok: boolean; spareKw: number } {
    const spareKw = PowerManager.averageGeneration(buildings, env) - PowerManager.plannedDemand(buildings, env);
    return { ok: extraKw <= EPS || extraKw <= spareKw + EPS, spareKw };
  },

  /**
   * Shares out a list of requests in priority order (life support first). See PowerPool.
   * With `dtSols = 0` this only reports what *would* happen and keeps the battery as is.
   */
  allocate(requests: PowerRequest[], generationKw: number, batteryKwh: number, batteryCapacityKwh: number, dtSols: number): PowerAllocation {
    const pool = new PowerPool(generationKw, batteryKwh, batteryCapacityKwh, dtSols);
    const granted = new Set<string>();
    const sorted = requests.map((r, i) => ({ r, i })).sort((a, b) => a.r.priority - b.r.priority || a.i - b.i);
    for (const { r } of sorted) if (pool.request(r.kw)) granted.add(r.id);
    return { granted, demandKw: pool.demandKw, suppliedKw: pool.suppliedKw, batteryKwh: pool.finish() };
  },
};

/**
 * One simulation step's worth of electricity: this step's solar energy plus what is in the
 * batteries. Consumers ask in priority order; each gets all the power it asks for or none,
 * so nothing runs at a confusing half speed. Spare solar power charges the batteries;
 * anything beyond full batteries is not collected (panels are turned away). Energy is
 * never created from nothing and the battery never goes below zero.
 */
export class PowerPool {
  demandKw = 0;
  suppliedKw = 0;
  private hours: number;
  private available: number;

  constructor(
    readonly generationKw: number,
    private batteryKwh: number,
    private capacityKwh: number,
    private dtSols: number,
  ) {
    // With dt = 0 (a "what if" refresh), judge against one normal step.
    this.hours = (dtSols > 0 ? dtSols : 0.01) * SOL_HOURS;
    this.available = generationKw * this.hours + batteryKwh;
  }

  /** Asks for `kw` for this step; true when granted. */
  request(kw: number): boolean {
    if (kw <= 0) return true;
    this.demandKw += kw;
    const need = kw * this.hours;
    if (need > this.available + EPS) return false;
    this.available -= need;
    this.suppliedKw += kw;
    return true;
  }

  /** Takes a lump of stored energy (kWh), e.g. to charge a rover. */
  drawEnergy(kwh: number): boolean {
    if (kwh > this.batteryKwh + EPS) return false;
    this.batteryKwh -= kwh;
    this.available -= kwh;
    return true;
  }

  /** Battery charge after the step. */
  finish(): number {
    if (this.dtSols <= 0) return this.batteryKwh;
    return Math.min(this.capacityKwh, Math.max(0, this.batteryKwh + (this.generationKw - this.suppliedKw) * this.hours));
  }
}
