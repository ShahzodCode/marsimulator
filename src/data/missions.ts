import type { ResourceId } from './resources';
import type { RankId } from './progression';

/**
 * Exploration missions — pure data. A survey rover drives to a region next to explored
 * land; when it arrives the region is revealed and its reward is collected once.
 */

export const SURVEY = {
  /** An uncrewed survey rover is built from these materials… */
  cost: { iron: 30, regolith: 10 } as Partial<Record<ResourceId, number>>,
  /** …and leaves with a fully charged battery, taken from the settlement's batteries (kWh). */
  energyKwh: 40,
  maxConcurrent: 2,
  /** Base duration + distance / speed. */
  baseSols: 0.8,
  kmPerSol: 3200,
};

export interface RegionReward {
  /** Materials the rover brings back (samples, salvage, a supply cache). */
  resources?: Partial<Record<ResourceId, number>>;
  /** Water ice (kg) added to what the Ice Drills can mine. */
  ice?: number;
  xp: number;
  /** What the rover found, for the completion message. */
  find: string;
  /** Rank needed to send a rover here (long-range missions). */
  rank?: RankId;
}

/** Most regions: a small cache of useful rocks. */
export const DEFAULT_REWARD: RegionReward = {
  resources: { regolith: 40, iron: 15 },
  xp: 40,
  find: 'The rover mapped the land and brought back useful rock samples.',
};

/**
 * Hand-picked rewards based on what orbiters and rovers have really found there.
 * Ice: SHARAD radar and fresh impact craters show buried ice in the mid-latitude plains
 * (Utopia, Arcadia, Deuteronilus); the poles hold huge ice caps.
 */
export const REGION_REWARDS: Record<string, RegionReward> = {
  'MC-01': { ice: 60000, xp: 90, rank: 'settlement_commander', find: 'The north polar cap is a giant layered block of water ice!' },
  'MC-30': { ice: 40000, xp: 90, rank: 'settlement_commander', find: 'Under the frozen carbon dioxide of the south pole lies thick water ice.' },
  'MC-05': { ice: 12000, xp: 55, find: 'Radar found glaciers of buried ice under the mesas of Deuteronilus Mensae.' },
  'MC-06': { ice: 12000, xp: 55, find: 'Utopia Planitia hides a layer of buried ice as big as a lake.' },
  'MC-07': { ice: 8000, xp: 50, find: 'More buried ice was found under the plains of Utopia.' },
  'MC-03': { ice: 10000, xp: 55, find: 'Arcadia Planitia has ice just under the surface — a great spot for drilling.' },
  'MC-04': { ice: 6000, xp: 50, find: 'Signs of ground ice were found across Acidalia Planitia.' },
  'MC-11': { resources: { iron: 60, regolith: 20 }, xp: 50, find: 'Ares Vallis is full of iron-rich rocks washed down by ancient floods.' },
  'MC-19': { resources: { iron: 80 }, xp: 55, find: 'Tiny round iron “blueberries” (hematite), like the ones Opportunity found!' },
  'MC-09': { resources: { regolith: 80, iron: 30 }, xp: 55, find: 'Volcanic rock from the giant Tharsis volcanoes makes good building material.' },
  'MC-12': { resources: { regolith: 70 }, xp: 45, find: 'Arabia Terra is covered in fine dust — easy regolith to collect.' },
  'MC-14': { ice: 4000, resources: { regolith: 30 }, xp: 45, find: 'Hydrated clay minerals hold water locked inside the rock.' },
};

export function rewardFor(regionId: string): RegionReward {
  return REGION_REWARDS[regionId] ?? DEFAULT_REWARD;
}

/** Ice the Ice Drills can mine at the start (buried ice and hydrated minerals near Jezero — game value). */
export const STARTING_ICE_RESERVE = 30000;
