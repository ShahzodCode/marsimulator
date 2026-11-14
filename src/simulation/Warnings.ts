import { BUILDINGS, BUILDING_TYPES } from '../data/buildings';
import { RESOURCES, RESOURCE_IDS, type ResourceId } from '../data/resources';
import { SOL_HOURS } from '../data/recipes';
import type { Alert, GameState } from '../state/types';
import { ConstructionManager } from './ConstructionManager';
import { ResourceManager } from './ResourceManager';

export type AlertSpec = Omit<Alert, 'id' | 'sol' | 'persistent'>;

function names(ids: ResourceId[]): string {
  return ids.map((id) => RESOURCES[id].name.toLowerCase()).join(' and ');
}

/**
 * Friendly warnings that stay on screen while the problem lasts. Low resources only ever
 * cause warnings and paused production — never damage, never a game over.
 */
export function computeWarnings(s: GameState): AlertSpec[] {
  const out: AlertSpec[] = [];
  const { power } = s;

  // Electricity.
  if (power.plannedDemandKw > power.avgGenerationKw + 1e-6) {
    out.push({
      key: 'energy',
      level: 'warning',
      title: 'Power demand is higher than solar output',
      message: `Your buildings can use ${power.plannedDemandKw.toFixed(0)} kW, but the solar farms only make about ${power.avgGenerationKw.toFixed(0)} kW over a whole sol. Build another Solar Farm!`,
    });
  }
  if (power.unpowered > 0) {
    out.push({
      key: 'blackout',
      level: 'warning',
      title: power.unpowered === 1 ? 'A building is waiting for electricity' : `${power.unpowered} buildings are waiting for electricity`,
      message:
        power.sun > 0
          ? 'There isn’t enough power right now. More solar panels or batteries will help.'
          : 'It’s night and the batteries are empty. The buildings will start again at sunrise — a Battery Bank stores more power for the night.',
    });
  } else if (power.batteryCapacityKwh > 0 && s.timeSols - Math.floor(s.timeSols) >= 0.5 && power.demandKw > 0) {
    const hoursLeft = power.batteryKwh / power.demandKw;
    const frac = s.timeSols - Math.floor(s.timeSols);
    const hoursToSunrise = (1 - frac) * SOL_HOURS;
    if (hoursLeft < hoursToSunrise) {
      out.push({
        key: 'battery',
        level: 'info',
        title: 'Batteries may run out before sunrise',
        message: `About ${Math.max(1, Math.floor(hoursLeft))} hours of power left, sunrise in ${Math.ceil(hoursToSunrise)} hours. Some machines will pause until morning.`,
      });
    }
  }

  // Roads.
  const roadless = s.buildings.filter((b) => b.isOperational && !b.connected && BUILDINGS[b.type].recipes.length);
  if (roadless.length) {
    const list = [...new Set(roadless.map((b) => BUILDINGS[b.type].shortName))].join(', ');
    out.push({
      key: 'roads',
      level: 'warning',
      title: roadless.length === 1 ? 'A building has no road' : `${roadless.length} buildings have no road`,
      message: `${list}: goods can’t reach the base. Open Build → Road and pave a path from the Storage Depot to it.`,
    });
  }

  // Storage.
  const full = RESOURCE_IDS.filter((id) => !RESOURCES[id].ventWhenFull && s.storage[id] > 0 && s.resources[id] >= s.storage[id] * 0.95);
  if (full.length) {
    out.push({
      key: 'storage',
      level: 'info',
      title: 'Storage is nearly full',
      message: `Almost no room left for ${names(full)}. Use it to build something, or build a Storage Silo.`,
    });
  }

  // Vital supplies.
  for (const id of RESOURCE_IDS) {
    const def = RESOURCES[id];
    if (!def.vital) continue;
    const amount = s.resources[id];
    const left = ResourceManager.solsRemaining(amount, s.rates[id]);
    if (amount <= 0.01 && s.rates[id] < 0) {
      out.push({
        key: `res-${id}`,
        level: 'critical',
        title: `We’re out of ${def.name.toLowerCase()}!`,
        message: `The crew is using emergency supplies. Make more ${def.name.toLowerCase()} to fix it.`,
      });
    } else if (left < def.warnSols) {
      out.push({
        key: `res-${id}`,
        level: 'warning',
        title: `${def.name} is getting low`,
        message: `About ${Math.max(1, Math.floor(left))} sols left at this rate. ${HELP[id] ?? ''}`,
      });
    }
  }

  // Building materials: can nothing be afforded at all?
  const buildable = BUILDING_TYPES.filter((t) => BUILDINGS[t].buildable);
  const blockedByMaterials = buildable.every((t) => {
    const c = ConstructionManager.canBuild(s, t);
    return !c.ok && (c.code === 'materials' || c.code === 'locked');
  });
  if (blockedByMaterials) {
    out.push({
      key: 'materials',
      level: 'info',
      title: 'Not enough materials to build',
      message: 'Save up regolith and iron: Excavators dig regolith and Refineries turn it into iron. The depot robots also collect a little every few sols.',
    });
  }

  if (s.colony.housing < s.colony.colonists) {
    out.push({
      key: 'housing',
      level: 'warning',
      title: 'Not enough beds',
      message: `${s.colony.colonists} colonists but room for only ${s.colony.housing}. Build a Habitat Dome.`,
    });
  }
  return out;
}

const HELP: Partial<Record<ResourceId, string>> = {
  water: 'An Ice Drill makes more water.',
  oxygen: 'The Life-Support Plant needs water and power to make oxygen.',
  food: 'The greenhouse needs water and power to grow food.',
};
