import { RESOURCE_IDS, RESOURCES, type ResourceId } from '../data/resources';

export type ResourceBag = Record<ResourceId, number>;
export type Cost = Partial<Record<ResourceId, number>>;

/** Pure helpers for the global resource inventory. */
export const ResourceManager = {
  empty(): ResourceBag {
    return { regolith: 0, iron: 0, water: 0, oxygen: 0, food: 0 };
  },

  canAfford(stock: ResourceBag, cost: Cost): boolean {
    return RESOURCE_IDS.every((id) => (cost[id] ?? 0) <= stock[id] + 1e-9);
  },

  /** How much of each resource is still missing for a cost. */
  missing(stock: ResourceBag, cost: Cost): Cost {
    const out: Cost = {};
    for (const id of RESOURCE_IDS) {
      const need = (cost[id] ?? 0) - stock[id];
      if (need > 1e-9) out[id] = need;
    }
    return out;
  },

  deduct(stock: ResourceBag, cost: Cost): ResourceBag {
    const out = { ...stock };
    for (const id of RESOURCE_IDS) out[id] = Math.max(0, out[id] - (cost[id] ?? 0));
    return out;
  },

  describeMissing(stock: ResourceBag, cost: Cost): string {
    const m = ResourceManager.missing(stock, cost);
    const parts = (Object.keys(m) as ResourceId[]).map((id) => `${Math.ceil(m[id] ?? 0)} ${RESOURCES[id].name.toLowerCase()}`);
    return parts.length ? `Need ${parts.join(' and ')} more` : '';
  },

  /** Sols until a resource runs out at the current net rate (Infinity if not decreasing). */
  solsRemaining(amount: number, ratePerSol: number): number {
    return ratePerSol < -1e-6 ? amount / -ratePerSol : Infinity;
  },
};
