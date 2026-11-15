import type { BuildingInstance } from '../state/types';
import { connectedBuildingIds } from '../settlement/RoadRules';

/**
 * Moving goods between buildings and storage.
 *
 * Stage 2 uses one shared (global) inventory: once a building is linked to the depot by
 * road, its inputs and outputs move instantly. Stage 3 can replace this with physical
 * networks without touching recipes:
 *   - water and oxygen  → pipes            (resource transport 'fluid')
 *   - regolith and iron → conveyors / cargo rovers ('solid')
 *   - electricity       → cables — handled by PowerManager, never by this interface
 */
export interface TransportNetwork {
  /** Can goods travel between this building and the colony's storage? */
  canReach(buildingId: string): boolean;
}

/** Global inventory reached over the road network (the Stage 2 implementation). */
export class RoadTransport implements TransportNetwork {
  /** One entry per base (keyed by its roads list), so several bases don't evict each other. */
  private static cache = new WeakMap<string[], { sig: string; ids: Set<string> }>();
  private ids: Set<string>;

  constructor(buildings: BuildingInstance[], roads: string[]) {
    const sig = buildings.map((b) => `${b.id}:${b.gridX},${b.gridY},${b.rotation}`).join('|');
    const c = RoadTransport.cache.get(roads);
    if (c && c.sig === sig) this.ids = c.ids;
    else {
      this.ids = connectedBuildingIds(buildings, new Set(roads));
      RoadTransport.cache.set(roads, { sig, ids: this.ids });
    }
  }

  canReach(buildingId: string): boolean {
    return this.ids.has(buildingId);
  }
}

/** Everything is connected (for tests and future logistics experiments). */
export const EVERYWHERE: TransportNetwork = { canReach: () => true };
