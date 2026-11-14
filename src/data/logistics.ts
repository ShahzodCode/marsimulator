import type { ResourceId } from './resources';
import { NASA_ROVER_DATA } from './missions';

/**
 * Moving goods between bases — pure data. Game values unless a source ID is given
 * (IDs match docs/sources.md).
 *
 * Pipelines: pumped lines between two Pump Stations. Long pipelines are ordinary on Earth
 * (S33: the Trans-Alaska Pipeline is 800 miles ≈ 1,287 km long). Fluids flow as they are;
 * solids (regolith, iron, food) travel as a slurry or in capsules pushed by air. That is a
 * real technique on Earth, but nobody has built one on Mars, so the rates are game values.
 */
export const PIPELINE = {
  /** Fixed part of the cost (the pumps, valves and the two pipe ends). */
  baseCost: { iron: 100, regolith: 60 } as Partial<Record<ResourceId, number>>,
  /** Extra cost per 100 km of pipe. */
  costPer100Km: { iron: 15, regolith: 10 } as Partial<Record<ResourceId, number>>,
  /** Construction robots lay the first stretch in this many sols… */
  baseBuildSols: 1.5,
  /** …plus this much per 100 km. */
  buildSolsPer100Km: 0.3,
  /** Longest pipeline allowed (km). */
  maxKm: 2000,
  /** Share of the difference between two bases that flows over each sol (evens out smoothly). */
  balancePerSol: 0.6,
  /** Most of one resource a pipeline can move per sol. */
  maxFlowPerSol: 400,
};

/**
 * Cargo haulers: big robotic cargo rovers that live in a Garage. They are modelled on
 * NASA/JPL's ATHLETE (S34), "a heavy-lift utility vehicle" meant for "transporting [bulky
 * cargo] long distances". ATHLETE's half-scale prototype carries 450 kg on Earth; NASA
 * never published a full-scale Mars payload, so ours is a game value. They drive at the
 * pressurized rover's speed (S8) and, like it, only in daylight.
 */
export const CARGO = {
  /** Haulers parked in each Garage. */
  haulersPerGarage: 3,
  /** What one hauler carries (game value, see above). */
  payload: 2000,
  speedKmh: NASA_ROVER_DATA.sevSpeedKmh,
  /** Sols spent unloading at the other base. */
  unloadSols: 0.3,
  xp: 25,
};

const per100 = (km: number) => km / 100;

export function pipelineCost(km: number): Partial<Record<ResourceId, number>> {
  const out: Partial<Record<ResourceId, number>> = {};
  for (const id of Object.keys({ ...PIPELINE.baseCost, ...PIPELINE.costPer100Km }) as ResourceId[]) {
    out[id] = Math.ceil((PIPELINE.baseCost[id] ?? 0) + (PIPELINE.costPer100Km[id] ?? 0) * per100(km));
  }
  return out;
}

export function pipelineBuildSols(km: number): number {
  return PIPELINE.baseBuildSols + PIPELINE.buildSolsPer100Km * per100(km);
}
