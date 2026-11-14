import type { ResourceId } from './resources';
import type { RankId } from './progression';

/**
 * Exploration — pure data. Exploration works the way NASA explores Mars:
 *   1. An orbiter maps a region from space (reveals it on the globe).
 *   2. A crew drives a pressurized rover there to look closely and collect samples.
 *   3. Good finds (ice, iron) can get a small remote outpost that sends cargo home.
 *
 * Real numbers are kept as they are, with their source (IDs match docs/sources.md).
 * Game balance is done only with the separately named *_TIME_SCALE multipliers.
 */

/** Real NASA numbers used by exploration. */
export const NASA_ROVER_DATA = {
  /** S8, NASA "Space Exploration Vehicle Concept" fact sheet (FS-2011-08-045-JSC): "It can travel at about 10 kilometers per hour". */
  sevSpeedKmh: 10,
  /** S8: "The SEV must be able to hold a crew of two". */
  sevCrew: 2,
  /** S8: Payload 2,200 pounds (= 998 kg). */
  sevPayloadKg: 998,
  /** S8: the cabin can "sustain and protect exploring crew members for up to 72 hours" (safe haven). */
  sevSafeHavenHours: 72,
  /** S6, NASA Perseverance rover components: "top speed on flat, hard ground is just under 0.1 mph (152 meters per hour)". */
  perseveranceTopSpeedMh: 152,
  /** S7, JPL PIA26645: record drive of 411.7 m on Sol 1,540 (19 June 2025), "over the course of about 4 hours and 24 minutes". */
  perseveranceRecordMPerSol: 411.7,
  perseveranceRecordDriveHours: 4.4,
  /** S9, JPL PIA21488: the MRO Context Camera passed 99.1 % coverage of Mars in early 2017, after imaging since late 2006. */
  ctxCoverageFraction: 0.991,
  ctxCoverageYears: 10.25,
  /** S10: MRO's science orbit takes 1 hour 52 minutes. */
  mroOrbitMinutes: 112,
  /** S11: Opportunity's 2018 dust storm: tau 10.8 at its peak against about 0.5 on a normal day. */
  stormTau: 10.8,
  normalTau: 0.5,
} as const;

/** Earth days per sol (S1: a sol lasts 24.6597 h). */
const DAYS_PER_SOL = 24.6597 / 24;

export const ORBITAL_SCAN = {
  /**
   * Game multiplier: our orbiter maps 50× faster than MRO's Context Camera did, so a
   * region takes a few sols instead of about four months.
   */
  timeScale: 50,
  xp: 20,
  /** One orbiter, so one region at a time. */
  maxConcurrent: 1,
};

/** Real sols MRO's Context Camera needed per share of the planet (S9). */
export function realScanSols(areaFraction: number): number {
  const realDays = (NASA_ROVER_DATA.ctxCoverageYears * 365.25 * areaFraction) / NASA_ROVER_DATA.ctxCoverageFraction;
  return realDays / DAYS_PER_SOL;
}

export const EXPEDITION = {
  crew: NASA_ROVER_DATA.sevCrew,
  speedKmh: NASA_ROVER_DATA.sevSpeedKmh,
  /** Hours of driving per sol, in daylight with stops (estimate; Perseverance's record day was 4.4 h of driving). */
  driveHoursPerSol: 6,
  /** Game multiplier: the rover drives 8× faster than the real one so a trip takes minutes, not months. */
  timeScale: 8,
  /** Each km climbed takes as long as this many km on flat ground (estimate). */
  climbKmEquivalent: 10,
  /** Sols the crew spends at the site collecting samples. */
  siteSols: 0.5,
  /** Extra supplies packed for emergencies: the SEV cabin is a 72-hour safe haven (S8). */
  reserveSols: NASA_ROVER_DATA.sevSafeHavenHours / 24.6597,
  /** Battery charge taken from the base at launch; the rover's own panels recharge it each day (estimate). */
  energyKwh: 40,
  /** The base has two crew rovers (game value; NASA plans rovers in pairs for safety, S8). */
  maxConcurrent: 2,
  /** Chance a dust storm stops the rover during a trip, and how long it lasts in game sols (game values). */
  stormChance: 0.3,
  stormSols: [1, 2.5] as const,
};

/** Real km a crew rover covers per sol. */
export const REAL_KM_PER_SOL = EXPEDITION.speedKmh * EXPEDITION.driveHoursPerSol;
/** Average game km per sol (night stops included). */
export const GAME_KM_PER_SOL = REAL_KM_PER_SOL * EXPEDITION.timeScale;

/** Remote outposts: a small mine that a cargo rover empties into the base (game values; payload is the SEV's, S8). */
export const OUTPOST = {
  cost: { iron: 60, regolith: 40 } as Partial<Record<ResourceId, number>>,
  setupSols: 1,
  cargoPayloadKg: NASA_ROVER_DATA.sevPayloadKg,
  xp: 40,
};

export interface OutpostSite {
  /** What the cargo rover brings home. */
  resource: ResourceId;
  perSol: number;
  /** Total the site can give before it runs out (kg). */
  reserve: number;
  label: string;
}

export interface RegionReward {
  /** Samples the crew brings back. */
  resources?: Partial<Record<ResourceId, number>>;
  xp: number;
  /** What the crew found, for the arrival message. */
  find: string;
  /** What the orbiter's map hints at, before anyone has been there. */
  hint: string;
  /** Rank needed to send a crew here (long-range missions). */
  rank?: RankId;
  /** A site worth a remote outpost. */
  outpost?: OutpostSite;
}

/** Most regions: a few useful rocks. */
export const DEFAULT_REWARD: RegionReward = {
  resources: { regolith: 30, iron: 10 },
  xp: 50,
  find: 'The crew mapped the land up close and brought back rock samples.',
  hint: 'Rocky plains and craters. No special signals.',
};

const ice = (reserve: number, perSol = 60): OutpostSite => ({ resource: 'water', perSol, reserve, label: 'Ice mine (melts ice into water)' });
const iron = (reserve: number, perSol = 15): OutpostSite => ({ resource: 'iron', perSol, reserve, label: 'Iron mine' });
const soil = (reserve: number, perSol = 30): OutpostSite => ({ resource: 'regolith', perSol, reserve, label: 'Regolith quarry' });

/**
 * Hand-picked rewards based on what orbiters and rovers have really found there.
 * Ice: SHARAD radar and fresh impact craters show buried ice in the mid-latitude plains
 * (Utopia, Arcadia, Deuteronilus); the poles hold huge ice caps. Amounts are game values.
 */
export const REGION_REWARDS: Record<string, RegionReward> = {
  'MC-01': { xp: 120, rank: 'settlement_commander', hint: 'A bright white cap: the orbiter sees water ice!', find: 'The north polar cap is a giant layered block of water ice!', outpost: ice(60000, 90) },
  'MC-30': { xp: 120, rank: 'settlement_commander', hint: 'Frozen carbon dioxide on top. Radar shows something under it…', find: 'Under the frozen carbon dioxide of the south pole lies thick water ice.', outpost: ice(40000, 90) },
  'MC-05': { xp: 70, hint: 'Radar echoes under the mesas look like buried glaciers.', find: 'The crew drilled into a buried glacier under the mesas of Deuteronilus Mensae.', outpost: ice(12000) },
  'MC-06': { xp: 70, hint: 'Radar shows a layer of buried ice as big as a lake.', find: 'Utopia Planitia hides a layer of buried ice as big as a lake.', outpost: ice(12000) },
  'MC-07': { xp: 60, hint: 'Ice signals under the plains.', find: 'More buried ice was found under the plains of Utopia.', outpost: ice(8000) },
  'MC-03': { xp: 70, hint: 'Fresh craters have dug up bright ice.', find: 'Arcadia Planitia has ice just under the surface: a great spot for drilling.', outpost: ice(10000) },
  'MC-04': { xp: 60, hint: 'Patterned ground, like frozen soil on Earth.', find: 'Signs of ground ice were found across Acidalia Planitia.', outpost: ice(6000) },
  'MC-11': { resources: { iron: 30, regolith: 10 }, xp: 60, hint: 'Huge flood channels carved long ago.', find: 'Ares Vallis is full of iron-rich rocks washed down by ancient floods.', outpost: iron(4000) },
  'MC-19': { resources: { iron: 40 }, xp: 65, hint: 'The spectrometer sees hematite, an iron mineral.', find: 'Tiny round iron “blueberries” (hematite), like the ones Opportunity found!', outpost: iron(5000, 20) },
  'MC-09': { resources: { regolith: 40, iron: 15 }, xp: 65, hint: 'Giant volcanoes and lava plains.', find: 'Volcanic rock from the giant Tharsis volcanoes makes good building material.', outpost: soil(8000) },
  'MC-12': { resources: { regolith: 40 }, xp: 55, hint: 'Bright, dusty ground.', find: 'Arabia Terra is covered in fine dust: easy regolith to collect.', outpost: soil(6000) },
  'MC-14': { resources: { regolith: 20 }, xp: 55, hint: 'The spectrometer sees clay minerals that hold water.', find: 'Hydrated clay minerals hold water locked inside the rock.', outpost: ice(4000, 30) },
};

export function rewardFor(regionId: string): RegionReward {
  return REGION_REWARDS[regionId] ?? DEFAULT_REWARD;
}

/** Ice the Ice Drills can mine at the start (buried ice and hydrated minerals near Jezero; game value). */
export const STARTING_ICE_RESERVE = 30000;
