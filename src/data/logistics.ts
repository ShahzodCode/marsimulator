import type { ResourceId } from './resources';
import { GAME_KM_PER_SOL, NASA_ROVER_DATA } from './missions';

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
  /** Most of one resource a pipeline up to `flowRefKm` long can move per sol (game value). */
  maxFlowPerSol: 400,
  /**
   * Longer pipes carry less. Darcy–Weisbach (S40): with the same pump pressure and pipe
   * size, flow goes as 1/√length, so a pipe twice as long carries about 29 % less.
   * Pipes up to this length get the full `maxFlowPerSol`.
   */
  flowRefKm: 250,
};

/**
 * How the pipe is built to last centuries on Mars. Real numbers with sources; the model
 * (blender/pipeline.py) shows every part.
 */
export const PIPE_DESIGN = {
  /** Pressure line: Ti-6Al-4V titanium, which grows 8.6 µm per metre per °C (S38). */
  material: 'Ti-6Al-4V titanium',
  expansionPerC: 8.6e-6,
  /** Curiosity's ground temperatures at Gale crater: −91 °C at night, +3 °C by day (S36). */
  groundMinC: -91,
  groundMaxC: 3,
  /**
   * NASA safety factor for pressurized lines (S35): tested to 4.0× the highest working
   * pressure for lines under 1.5 in across, 1.5× for wider ones. Our pipe is wide, but we use
   * the stricter 4.0 everywhere because it has to last for centuries (game choice).
   */
  nasaFactorSmallLines: 4.0,
  nasaFactorLargeLines: 1.5,
  burstFactor: 4.0,
  /** Like the Trans-Alaska Pipeline (S37): zigzag route on sliding PTFE shoes, so heat and quakes move it sideways instead of breaking it. */
  zigzag: true,
  /** InSight's biggest marsquake, 4 May 2022 (S39). */
  biggestMarsquake: 4.7,
};

/** How much one km of pipe grows from the coldest night to the warmest day (metres). */
export function thermalGrowthMPerKm(): number {
  return PIPE_DESIGN.expansionPerC * (PIPE_DESIGN.groundMaxC - PIPE_DESIGN.groundMinC) * 1000;
}

/** Most of one resource a pipeline of this length moves per sol, before any damage. */
export function pipelineFlowCap(km: number): number {
  return PIPELINE.maxFlowPerSol * Math.min(1, Math.sqrt(PIPELINE.flowRefKm / Math.max(km, 1)));
}

export type PipeFaultKind = 'thermal_buckle' | 'quake_twist' | 'slope_creep';

/**
 * Ways a pipe can still get twisted. The design soaks up normal day-night swings, so these
 * are rare. Chances are game values (per 1,000 km of pipe per sol); `pinch` is how much of
 * the bore a twist closes, which cuts the flow by the same share.
 */
export const PIPE_FAULTS: Record<PipeFaultKind, { name: string; chancePer1000KmSol: number; pinch: readonly [number, number]; why: string }> = {
  thermal_buckle: {
    name: 'Thermal buckle',
    chancePer1000KmSol: 0.006,
    pinch: [0.3, 0.55],
    why: `Each km of titanium pipe grows about ${thermalGrowthMPerKm().toFixed(1)} m between the ${PIPE_DESIGN.groundMinC} °C night and the +${PIPE_DESIGN.groundMaxC} °C afternoon. A shoe jammed with dust, so this stretch couldn’t slide and bowed sideways.`,
  },
  quake_twist: {
    name: 'Marsquake twist',
    chancePer1000KmSol: 0.004,
    pinch: [0.5, 0.85],
    why: `A marsquake shook the supports (InSight felt one of magnitude ${PIPE_DESIGN.biggestMarsquake} in 2022) and twisted a section off its saddles.`,
  },
  slope_creep: {
    name: 'Ground creep kink',
    chancePer1000KmSol: 0.004,
    pinch: [0.2, 0.45],
    why: 'Loose regolith on a slope crept downhill, dragged a support with it and kinked the pipe.',
  },
};

export const PIPE_REPAIR = {
  /** Sols the robots need on site once they get there (game value). */
  fixSols: 1.5,
  /** They drive out from the nearer end like a crew rover (game km per sol). */
  driveKmPerSol: GAME_KM_PER_SOL,
  /** No more than this many twists on one pipeline at once. */
  maxFaults: 3,
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
