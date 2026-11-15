import { BUILDINGS, basePowerKw } from '../data/buildings';
import { RECIPES, type ProductionRecipe, type RecipeId } from '../data/recipes';
import { heatingTimeFactor } from '../data/power';
import { RESOURCES, type ResourceId } from '../data/resources';
import type { BuildingInstance, BuildingStatus, RecipeState } from '../state/types';
import { LocalStore, ResourceManager, type ResourceBag } from './ResourceManager';
import { StorageManager } from './StorageManager';
import type { TransportNetwork } from './Transport';
import { NEUTRAL_ENV, type BaseEnv } from './BaseEnv';

/**
 * Recipe-based production. Each cycle of a recipe:
 *   1. the facility must be finished and switched on,
 *   2. all inputs must be in storage,          → otherwise "waiting for materials"
 *   3. electricity must be available,          → otherwise "not enough power"
 *   4. there must be room for the outputs,     → otherwise "storage full"
 *   5. inputs are taken when the cycle starts,
 *   6. power is drawn while it runs,
 *   7. progress advances with simulation time,
 *   8. outputs are delivered when it finishes.
 * Anything missing simply pauses the cycle — nothing is lost or destroyed.
 */

export interface ProductionContext {
  inventory: ResourceManager;
  deposits: { ice: number };
  transport: TransportNetwork;
  dt: number;
  /** Site and research effects for this base (defaults to none). */
  env?: BaseEnv;
  /** Local time of sol; heaters draw more at night. Without it, the sol average is used. */
  localSols?: number;
}

interface RecipePlan {
  id: RecipeId;
  state: RecipeState;
  /** Wants electricity this step (starting or continuing a cycle). */
  wantsPower: boolean;
  /** A finished cycle is waiting for storage room. */
  waitingToDeliver: boolean;
  blocked: BuildingStatus | null;
  note: string | null;
}

export interface BuildingPlan {
  building: BuildingInstance;
  recipes: RecipePlan[];
  /** Power this building asks for (kW); 0 = needs none this step. */
  kw: number;
  local: LocalStore | null;
  reachable: boolean;
}

export interface ProductionResult {
  building: BuildingInstance;
  /** Delivered this step, per resource (for stats and floating "+5" labels). */
  delivered: Partial<Record<ResourceId, number>>;
  /** Net flow per sol of the recipes that are running (for the rate display). */
  flow: Partial<Record<ResourceId, number>>;
}

const RES_NAME = (id: ResourceId) => RESOURCES[id].name.toLowerCase();

/** Recipe outputs at this base (site traits and research multiply them). */
function outputsAt(r: ProductionRecipe, env: BaseEnv): [ResourceId, number][] {
  return (Object.entries(r.outputs) as [ResourceId, number][]).map(([id, v]) => [id, v * (env.output[id] ?? 1)]);
}

function needsStorageRoom(r: ProductionRecipe, reachable: boolean, inv: ResourceManager, local: LocalStore | null, env: BaseEnv): ResourceId | null {
  for (const [id, v] of outputsAt(r, env)) {
    if (RESOURCES[id].ventWhenFull) continue;
    const room = reachable ? inv.room(id) : (local?.room(id) ?? 0);
    if (room + 1e-9 < v) return id;
  }
  return null;
}

function deliver(r: ProductionRecipe, reachable: boolean, inv: ResourceManager, local: LocalStore | null, delivered: Partial<Record<ResourceId, number>>, env: BaseEnv): boolean {
  if (needsStorageRoom(r, reachable, inv, local, env)) return false;
  for (const [id, v] of outputsAt(r, env)) {
    const stored = reachable ? inv.put(id, v) : (local?.put(id, v) ?? 0);
    delivered[id] = (delivered[id] ?? 0) + stored; // vented hydrogen beyond the tanks is not counted
  }
  return true;
}

/** Ice taken from the deposit per cycle: more water out means more ice dug. */
function depositUse(r: ProductionRecipe, env: BaseEnv): number {
  return r.deposit ? r.deposit.amount * (env.output.water ?? 1) : 0;
}

export const ProductionManager = {
  /** Works out what a finished, switched-on building wants to do this step (changes nothing). */
  plan(b: BuildingInstance, ctx: ProductionContext): BuildingPlan {
    const def = BUILDINGS[b.type];
    const reachable = ctx.transport.canReach(b.id);
    const local = def.recipes.length && !reachable ? StorageManager.localStore(b) : null;
    const recipes: RecipePlan[] = [];
    const env = ctx.env ?? NEUTRAL_ENV;
    const night = ctx.localSols === undefined ? 1 : heatingTimeFactor(ctx.localSols);
    let kw = basePowerKw(b.type, env.heating * night);
    for (const id of def.recipes) {
      const r = RECIPES[id];
      const state = b.recipes[id] ?? { progress: 0, loaded: false };
      const p: RecipePlan = { id, state, wantsPower: false, waitingToDeliver: false, blocked: null, note: null };
      const need = r.requires ? recipes.find((x) => x.id === r.requires) : undefined;
      if (need && !need.wantsPower) {
        p.blocked = need.blocked ?? 'waiting_materials';
        p.note = need.note;
      } else if (state.loaded && state.progress >= 1) {
        // Finished, waiting to unload.
        const full = needsStorageRoom(r, reachable, ctx.inventory, local, env);
        p.waitingToDeliver = true;
        if (full) {
          p.blocked = 'storage_full';
          p.note = reachable ? `${RESOURCES[full].name} storage is full` : 'Storage full — build a road to carry goods away';
        }
      } else if (state.loaded) {
        p.wantsPower = true;
      } else {
        const inputs = Object.keys(r.inputs) as ResourceId[];
        const full = needsStorageRoom(r, reachable, ctx.inventory, local, env);
        if (inputs.length && !reachable) {
          p.blocked = 'no_road';
          p.note = `No road — can’t receive ${inputs.map(RES_NAME).join(' and ')}`;
        } else if (r.deposit && ctx.deposits[r.deposit.id] + 1e-9 < depositUse(r, env)) {
          p.blocked = 'waiting_materials';
          p.note = 'The ice here is used up — explore icy regions to find more';
        } else if (!ctx.inventory.has(r.inputs)) {
          const missing = inputs.filter((id) => ctx.inventory.get(id) + 1e-9 < (r.inputs[id] ?? 0));
          p.blocked = 'waiting_materials';
          p.note = `Waiting for ${missing.map(RES_NAME).join(' and ')}`;
        } else if (full) {
          p.blocked = 'storage_full';
          p.note = reachable ? `${RESOURCES[full].name} storage is full` : 'Storage full — build a road to carry goods away';
        } else {
          p.wantsPower = true;
        }
      }
      if (p.wantsPower) kw += r.energyKw;
      recipes.push(p);
    }
    return { building: b, recipes, kw, local, reachable };
  },

  /** Runs one step for a planned building. `powered` comes from PowerManager.allocate. */
  run(plan: BuildingPlan, powered: boolean, ctx: ProductionContext): ProductionResult {
    const b = plan.building;
    const def = BUILDINGS[b.type];
    const env = ctx.env ?? NEUTRAL_ENV;
    const inv = ctx.inventory;
    const delivered: Partial<Record<ResourceId, number>> = {};
    const flow: Partial<Record<ResourceId, number>> = {};
    const recipes: Partial<Record<RecipeId, RecipeState>> = { ...b.recipes };
    let running = 0;
    let status: BuildingStatus | null = null;
    let note: string | null = null;
    const setStatus = (s: BuildingStatus, n: string | null) => {
      if (!status) {
        status = s;
        note = n;
      }
    };

    for (const p of plan.recipes) {
      const r = RECIPES[p.id];
      let st = { ...p.state };
      if (p.waitingToDeliver) {
        if (ctx.dt > 0 && deliver(r, plan.reachable, inv, plan.local, delivered, env)) st = { progress: 0, loaded: false };
        else if (p.blocked) setStatus(p.blocked, p.note);
      } else if (p.wantsPower && powered) {
        running++;
        for (const [id, v] of outputsAt(r, env)) flow[id] = (flow[id] ?? 0) + v / r.durationSols;
        for (const [id, v] of Object.entries(r.inputs) as [ResourceId, number][]) flow[id] = (flow[id] ?? 0) - v / r.durationSols;
        if (ctx.dt > 0) {
          if (!st.loaded) {
            const paid = inv.consumeAll(r.inputs);
            if (!paid.ok) {
              setStatus('waiting_materials', paid.message);
              recipes[p.id] = st;
              continue;
            }
            if (r.deposit) ctx.deposits[r.deposit.id] = Math.max(0, ctx.deposits[r.deposit.id] - depositUse(r, env));
            st.loaded = true;
          }
          st.progress = Math.min(1, st.progress + ctx.dt / r.durationSols);
          if (st.progress >= 1 - 1e-9) {
            st.progress = 1;
            if (deliver(r, plan.reachable, inv, plan.local, delivered, env)) st = { progress: 0, loaded: false };
          }
        }
      } else if (p.wantsPower) {
        setStatus('insufficient_power', 'Not enough electricity — build another Solar Farm or a Battery Bank');
      } else if (p.blocked) {
        setStatus(p.blocked, p.note);
      }
      recipes[p.id] = st;
    }

    // Buildings with no recipes (habitats, silos) only need their base power.
    if (!def.recipes.length && basePowerKw(b.type, env.heating) > 0 && !powered) setStatus('insufficient_power', 'Not enough electricity for heating and air');

    let stored = plan.local ? plan.local.items : b.stored;
    if (plan.reachable && ctx.dt > 0) stored = StorageManager.haul({ ...b, stored }, inv, ctx.dt);
    if (!plan.reachable && def.recipes.length && running > 0 && !status) note = 'No road — goods are piling up here';
    if (plan.reachable && Object.keys(stored).length && !note) note = 'Delivering stored goods by road';

    const finalStatus: BuildingStatus = running > 0 ? 'operational' : (status ?? 'operational');
    const efficiency = def.recipes.length ? running / def.recipes.length : finalStatus === 'operational' ? 1 : 0;
    return {
      building: {
        ...b,
        recipes,
        stored,
        powered,
        status: finalStatus,
        statusNote: note,
        efficiency,
        connected: plan.reachable,
      },
      delivered,
      flow,
    };
  },

  /** Adds per-sol flows into a rates record. */
  addFlow(rates: ResourceBag, flow: Partial<Record<ResourceId, number>>): void {
    for (const [id, v] of Object.entries(flow) as [ResourceId, number][]) rates[id] += v;
  },
};
