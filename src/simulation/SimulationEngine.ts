import { BUILDINGS, DEPOT_SUPPLY, storageCapacity } from '../data/buildings';
import { COLONIST_NEEDS_PER_SOL, RESOURCES, RESOURCE_IDS, type ResourceId } from '../data/resources';
import { XP_REWARDS } from '../data/progression';
import { ResourceManager, type ResourceBag } from './ResourceManager';
import { gameStore, regionManager, roadSet } from '../state/gameStore';
import { connectedBuildingIds } from '../settlement/RoadRules';
import type { Alert, BuildingInstance, Mission } from '../state/types';
import type { EventBus } from '../core/EventBus';

/** Fixed simulation step in sols (≈0.4 s of real time at 1×). */
export const SIM_STEP_SOLS = 0.01;

type AlertSpec = Omit<Alert, 'id' | 'sol' | 'persistent'>;

/** A building without a road keeps working and stores up to this many sols of output. */
export const STORAGE_SOLS = 3;
/** How fast stored goods are hauled to the base once a road reaches the building (per resource, per sol). */
export const DELIVERY_PER_SOL = 80;

function listNames(ids: ResourceId[]): string {
  return ids.map((id) => RESOURCES[id].name.toLowerCase()).join(' and ');
}

/**
 * Stage-1 colony simulation: construction, energy balance, production / consumption,
 * colonist needs, survey missions and warnings. Runs on fixed steps.
 *
 * Design rules: shortages reduce output and raise warnings — nothing is ever destroyed
 * and no one is harmed.
 */
export class SimulationEngine {
  private accumulator = 0;
  private connCache: { roads: string[]; sig: string; ids: Set<string> } | null = null;

  constructor(private events: EventBus) {}

  /** Advance by `sols` of game time (already scaled by speed). */
  advance(sols: number): void {
    this.accumulator += sols;
    let steps = 0;
    while (this.accumulator >= SIM_STEP_SOLS && steps < 40) {
      this.step(SIM_STEP_SOLS);
      this.accumulator -= SIM_STEP_SOLS;
      steps++;
    }
    if (steps >= 40) this.accumulator = 0;
  }

  private connectedIds(buildings: BuildingInstance[], roads: string[]): Set<string> {
    const sig = buildings.map((b) => `${b.id}:${b.gridX},${b.gridY},${b.rotation}`).join('|');
    if (this.connCache && this.connCache.roads === roads && this.connCache.sig === sig) return this.connCache.ids;
    const ids = connectedBuildingIds(buildings, roadSet(roads));
    this.connCache = { roads, sig, ids };
    return ids;
  }

  /** Recompute rates without advancing time (used at start / after loading). */
  refresh(): void {
    this.step(0);
  }

  private step(dt: number): void {
    const store = gameStore.getState();
    const completed: BuildingInstance[] = [];

    // 1. Construction progress.
    let buildingsChanged = false;
    const buildings = store.buildings.map((b) => {
      if (b.constructionProgress >= 1 || dt === 0) return b;
      const def = BUILDINGS[b.type];
      const progress = Math.min(1, b.constructionProgress + dt / def.buildTimeSols);
      buildingsChanged = true;
      const nb = { ...b, constructionProgress: progress };
      if (progress >= 1) {
        nb.isOperational = true;
        nb.statusNote = null;
        nb.efficiency = 1;
        completed.push(nb);
      }
      return nb;
    });

    // 2. Energy balance.
    let generation = 0;
    let consumption = 0;
    let housing = 0;
    for (const b of buildings) {
      if (!b.isOperational) continue;
      const def = BUILDINGS[b.type];
      if (def.energy > 0) generation += def.energy;
      else consumption += -def.energy;
      housing += def.housing;
    }
    const satisfaction = consumption > 0 ? Math.min(1, generation / consumption) : 1;

    // 3. Production and consumption. Everything goes into the storage depot, which only
    // holds so much — extra output is lost once a resource is full.
    const capacity = storageCapacity(buildings);
    const resources: ResourceBag = { ...store.resources };
    const rates = ResourceManager.empty();
    const connected = this.connectedIds(buildings, store.roads);
    const effById = new Map<string, { eff: number; note: string | null; stored: BuildingInstance['stored'] }>();
    for (const b of buildings) {
      if (!b.isOperational) continue;
      const def = BUILDINGS[b.type];
      const outputs = Object.keys(def.production) as ResourceId[];
      const inputs = Object.keys(def.consumption) as ResourceId[];
      let stored = b.stored;
      let eff = def.energy < 0 ? satisfaction : 1;
      let note: string | null = eff < 0.999 ? `Low power — running at ${Math.round(eff * 100)}%` : null;

      if (!connected.has(b.id)) {
        // No road: the building keeps working, but nothing can be delivered to it and
        // what it makes piles up on site instead of reaching the colony's stores.
        if (inputs.length) {
          eff = 0;
          note = `No road — can’t receive ${listNames(inputs)}`;
        } else if (outputs.length) {
          const full = outputs.every((id) => (stored[id] ?? 0) >= (def.production[id] ?? 0) * STORAGE_SOLS - 1e-6);
          if (full) {
            eff = 0;
            note = 'Storage full — build a road to carry goods away';
          } else {
            note = eff < 0.999 ? `No road — goods piling up here (low power, ${Math.round(eff * 100)}%)` : 'No road — goods are piling up here';
            if (dt > 0 && eff > 0) {
              stored = { ...stored };
              for (const id of outputs) {
                const cap = (def.production[id] ?? 0) * STORAGE_SOLS;
                stored[id] = Math.min(cap, (stored[id] ?? 0) + (def.production[id] ?? 0) * eff * dt);
              }
            }
          }
        }
        effById.set(b.id, { eff, note, stored });
        continue;
      }

      // Inputs: if a consumed resource is empty, output scales down.
      for (const id of inputs) {
        const need = (def.consumption[id] ?? 0) * eff;
        if (need > 0 && resources[id] < need * Math.max(dt, SIM_STEP_SOLS)) {
          eff = 0;
          note = `Waiting for ${RESOURCES[id].name.toLowerCase()}`;
        }
      }
      // Haul goods that piled up while there was no road.
      const waiting = Object.keys(stored) as ResourceId[];
      if (waiting.length && dt > 0) {
        stored = { ...stored };
        for (const id of waiting) {
          const room = Math.max(0, capacity[id] - resources[id]);
          const amount = Math.min(stored[id] ?? 0, DELIVERY_PER_SOL * dt, room);
          resources[id] += amount;
          const left = (stored[id] ?? 0) - amount;
          if (left > 1e-6) stored[id] = left;
          else delete stored[id];
        }
      }
      if (Object.keys(stored).length) {
        const blocked = (Object.keys(stored) as ResourceId[]).every((id) => resources[id] >= capacity[id] - 1e-6);
        note = note ?? (blocked ? 'Storage depot is full — goods wait here' : 'Delivering stored goods by road');
      }
      effById.set(b.id, { eff, note, stored });
      for (const id of outputs) rates[id] += (def.production[id] ?? 0) * eff;
      for (const id of inputs) rates[id] -= (def.consumption[id] ?? 0) * eff;
    }
    const colonists = store.colony.colonists;
    for (const id of RESOURCE_IDS) rates[id] -= COLONIST_NEEDS_PER_SOL[id] * colonists;
    for (const id of RESOURCE_IDS) resources[id] = Math.min(capacity[id], Math.max(0, resources[id] + rates[id] * dt));
    // Depot safety net: a small drop of material every few sols.
    const depotWorks = buildings.some((b) => b.type === 'storage_depot' && b.isOperational);
    if (depotWorks && dt > 0 && Math.floor((store.timeSols + dt) / DEPOT_SUPPLY.everySols) > Math.floor(store.timeSols / DEPOT_SUPPLY.everySols)) {
      for (const [id, v] of Object.entries(DEPOT_SUPPLY.amounts) as [ResourceId, number][]) resources[id] = Math.min(capacity[id], resources[id] + v);
    }

    const finalBuildings = buildings.map((b) => {
      const e = effById.get(b.id);
      const isConnected = connected.has(b.id);
      if (!e) {
        if (b.connected === isConnected) return b;
        buildingsChanged = true;
        return { ...b, connected: isConnected };
      }
      if (Math.abs(e.eff - b.efficiency) > 0.005 || e.note !== b.statusNote || e.stored !== b.stored || b.connected !== isConnected) {
        buildingsChanged = true;
        return { ...b, efficiency: e.eff, statusNote: e.note, stored: e.stored, connected: isConnected };
      }
      return b;
    });

    // 4. Missions.
    let missionsChanged = false;
    const discovered: string[] = [];
    const missions: Mission[] = store.missions.map((m) => {
      if (m.status !== 'active' || dt === 0) return m;
      missionsChanged = true;
      const progress = Math.min(1, m.progress + dt / m.durationSols);
      if (progress >= 1) {
        discovered.push(m.regionId);
        return { ...m, progress: 1, status: 'complete' };
      }
      return { ...m, progress };
    });

    const discoveredRegions = discovered.length
      ? { ...store.discoveredRegions, ...Object.fromEntries(discovered.map((id) => [id, true])) }
      : store.discoveredRegions;

    gameStore.setState({
      timeSols: store.timeSols + dt,
      resources,
      storage: capacity,
      rates,
      energy: { generation, consumption, satisfaction },
      colony: { colonists, housing },
      ...(buildingsChanged ? { buildings: finalBuildings } : {}),
      ...(missionsChanged ? { missions } : {}),
      ...(discovered.length ? { discoveredRegions } : {}),
    });

    // 5. Events, rewards and alerts.
    for (const b of completed) {
      const def = BUILDINGS[b.type];
      store.pushAlert({ key: `done-${b.id}`, level: 'success', title: `${def.name} is ready!`, message: def.funFact });
      store.addXp(XP_REWARDS.buildingComplete);
      this.events.emit('building:completed', { id: b.id });
    }
    for (const id of discovered) {
      const region = regionManager.get(id);
      store.pushAlert({
        key: `found-${id}`,
        level: 'success',
        title: `New region discovered: ${region?.name ?? id}`,
        message: region ? `${region.description} Highlights: ${region.highlights.join(', ')}.` : '',
      });
      store.addXp(XP_REWARDS.regionDiscovered, `discovered-${id}`);
      this.events.emit('region:discovered', { id });
    }
    store.setPersistentAlerts(this.computeWarnings(resources, rates, capacity, generation, consumption, colonists, housing, finalBuildings));
  }

  private computeWarnings(
    resources: ResourceBag,
    rates: ResourceBag,
    capacity: ResourceBag,
    generation: number,
    consumption: number,
    colonists: number,
    housing: number,
    buildings: BuildingInstance[],
  ): AlertSpec[] {
    const out: AlertSpec[] = [];
    const roadless = buildings.filter((b) => {
      const def = BUILDINGS[b.type];
      return b.isOperational && !b.connected && (Object.keys(def.production).length || Object.keys(def.consumption).length);
    });
    if (roadless.length) {
      const names = [...new Set(roadless.map((b) => BUILDINGS[b.type].shortName))].join(', ');
      out.push({
        key: 'roads',
        level: 'warning',
        title: roadless.length === 1 ? 'A building has no road' : `${roadless.length} buildings have no road`,
        message: `${names}: goods can’t reach the base. Open Build → Road and pave a path from the Storage Depot to it.`,
      });
    }
    const full = RESOURCE_IDS.filter((id) => rates[id] > 0.05 && resources[id] >= capacity[id] - 0.5);
    if (full.length) {
      out.push({
        key: 'storage',
        level: 'warning',
        title: 'Storage depot is full',
        message: `No room for more ${listNames(full)} — anything extra is lost.`,
      });
    }
    if (consumption > generation + 1e-6) {
      out.push({
        key: 'energy',
        level: 'warning',
        title: 'Not enough electricity',
        message: `Buildings need ${consumption.toFixed(0)} kW but solar panels make ${generation.toFixed(0)} kW. Build another Solar Farm!`,
      });
    }
    for (const id of RESOURCE_IDS) {
      const def = RESOURCES[id];
      if (!def.vital) continue;
      const amount = resources[id];
      const left = ResourceManager.solsRemaining(amount, rates[id]);
      if (amount <= 0.01 && rates[id] < 0) {
        out.push({
          key: `res-${id}`,
          level: 'critical',
          title: `${def.name} has run out!`,
          message: `Colonists are rationing ${def.name.toLowerCase()}. Build more production to help them.`,
        });
      } else if (left < def.warnSols) {
        out.push({
          key: `res-${id}`,
          level: 'warning',
          title: `${def.name} running low`,
          message: `About ${Math.max(1, Math.floor(left))} sols left at the current rate.`,
        });
      }
    }
    if (housing < colonists) {
      out.push({
        key: 'housing',
        level: 'warning',
        title: 'Not enough beds',
        message: `${colonists} colonists but room for only ${housing}. Build a Habitat Dome.`,
      });
    }
    return out;
  }
}
