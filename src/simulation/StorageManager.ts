import { BUILDINGS, storageCapacity } from '../data/buildings';
import { RECIPES } from '../data/recipes';
import type { ResourceId } from '../data/resources';
import type { BuildingInstance } from '../state/types';
import { LocalStore, ResourceManager, type ResourceBag } from './ResourceManager';

/** A building without a road keeps working and stores up to this many sols of output on site. */
export const STORAGE_SOLS = 3;
/** How fast stored goods are hauled to the depot once a road reaches the building (per resource, per sol). */
export const DELIVERY_PER_SOL = 80;

/**
 * Where goods are kept: the colony-wide depot capacity (sum of storage buildings) and
 * each building's small on-site store for goods waiting to be carried away.
 */
export const StorageManager = {
  /** Colony-wide capacity from finished storage buildings. */
  capacity(buildings: readonly BuildingInstance[]): ResourceBag {
    return storageCapacity(buildings);
  },

  /** How much a building can hold on site (a few sols of its own output). */
  localCapacity(b: BuildingInstance): Partial<Record<ResourceId, number>> {
    const cap: Partial<Record<ResourceId, number>> = {};
    for (const rid of BUILDINGS[b.type].recipes) {
      const r = RECIPES[rid];
      for (const [id, v] of Object.entries(r.outputs) as [ResourceId, number][]) cap[id] = (cap[id] ?? 0) + (v / r.durationSols) * STORAGE_SOLS;
    }
    return cap;
  },

  localStore(b: BuildingInstance): LocalStore {
    return new LocalStore({ ...b.stored }, StorageManager.localCapacity(b));
  },

  /** Carries goods waiting at a road-connected building to the depot. Returns the new on-site store. */
  haul(b: BuildingInstance, inventory: ResourceManager, dt: number): Partial<Record<ResourceId, number>> {
    if (!Object.keys(b.stored).length || dt <= 0) return b.stored;
    const local = StorageManager.localStore(b);
    for (const id of Object.keys(local.items) as ResourceId[]) ResourceManager.transfer(local, inventory, id, DELIVERY_PER_SOL * dt);
    return local.items;
  },
};
