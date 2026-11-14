import { BUILDINGS, type BuildingType } from '../data/buildings';
import { siteModifiers, visibleTraits, SITE_BY_ID, TRAITS, type TraitId } from '../data/baseSites';
import type { ResourceId } from '../data/resources';
import { hasTech, TECH_BY_ID } from '../data/research';
import { hasRank, rankById } from '../data/progression';
import type { BuildingInstance, GameState } from '../state/types';
import type { Cost } from './ResourceManager';

/**
 * Everything that makes one base different from another: its site (latitude, traits) plus
 * finished research and dusty mega-machines. Game values, built on the site traits in
 * data/baseSites.ts.
 */
export interface BaseEnv {
  /** Solar output multiplier. */
  solar: number;
  /** Heating/air power multiplier for living, food and life-support buildings. */
  heating: number;
  /** Production output multiplier per resource. */
  output: Partial<Record<ResourceId, number>>;
  /** Construction cost multiplier (research), and extra for habitats (radiation shielding). */
  costMult: number;
  shielding: number;
  banned: Partial<Record<BuildingType, string>>;
  traits: TraitId[];
}

export const NEUTRAL_ENV: BaseEnv = { solar: 1, heating: 1, output: {}, costMult: 1, shielding: 1, banned: {}, traits: [] };

export function baseEnv(siteId: string, research: readonly string[], buildings: readonly BuildingInstance[] = []): BaseEnv {
  const m = siteModifiers(siteId);
  let solar = m.solar;
  if (research.includes('dust_cleaning')) solar *= 1.15;
  for (const b of buildings) {
    const d = BUILDINGS[b.type].dustSolar;
    if (d && b.isOperational && b.enabled) solar *= d;
  }
  const output = { ...m.output };
  const mul = (id: ResourceId, f: number) => (output[id] = (output[id] ?? 1) * f);
  if (research.includes('better_drills')) mul('water', 1.25);
  if (research.includes('hydroponics')) mul('food', 1.3);
  return {
    solar,
    heating: m.heating,
    output,
    costMult: research.includes('regolith_bricks') ? 0.85 : 1,
    shielding: m.shielding,
    banned: m.banned,
    traits: m.traits,
  };
}

/** The active base's environment. */
export function envOf(state: Pick<GameState, 'base' | 'research' | 'buildings'>): BaseEnv {
  return baseEnv(state.base.siteId, state.research.completed, state.buildings);
}

/** What a building costs at this base. */
export function buildCost(type: BuildingType, env: BaseEnv): Cost {
  const def = BUILDINGS[type];
  const f = env.costMult * (def.housing > 0 ? env.shielding : 1);
  const out: Cost = {};
  for (const [id, v] of Object.entries(def.constructionCost) as [ResourceId, number][]) out[id] = Math.ceil(v * f);
  return out;
}

/** Why a building can't be built at this base (rank, research, site), or null. */
export function lockReason(type: BuildingType, state: Pick<GameState, 'progression' | 'research' | 'base'>, env: BaseEnv): string | null {
  const def = BUILDINGS[type];
  if (!def.buildable) return 'This building can’t be built.';
  if (!hasRank(state.progression.level, def.unlockRank)) return `Unlocks at rank ${rankById(def.unlockRank!).title}.`;
  if (!hasTech(state.research.completed, def.requiresTech)) return `Needs research: ${TECH_BY_ID[def.requiresTech!].name}.`;
  const banned = env.banned[type];
  if (banned) return banned;
  if (def.requiresTrait) {
    const site = SITE_BY_ID[state.base.siteId];
    const seen = site ? visibleTraits(site, state.research.completed) : [];
    if (!def.requiresTrait.some((t) => seen.includes(t))) return `Only at a base whose site has: ${def.requiresTrait.map((t) => TRAITS[t].name.toLowerCase()).join(' or ')}.`;
  }
  return null;
}
