import { describe, expect, it } from 'vitest';
import { CARGO, PIPELINE, pipelineCost, pipelineFlowCap, thermalGrowthMPerKm } from '../data/logistics';
import { RegionManager } from '../planet/RegionManager';
import { fromSave, toSave } from '../persistence/SaveSchema';
import { createInitialState, makeBuilding, makeNewBase } from '../state/factory';
import type { GameState } from '../state/types';
import { ConstructionManager } from './ConstructionManager';
import { Logistics } from './Logistics';
import { SIM_STEP_SOLS } from './SimulationClock';
import { stepSimulation } from './SimulationEngine';
import { EVERYWHERE } from './Transport';

const regions = new RegionManager();

function run(state: GameState, sols: number): GameState {
  let s = state;
  const steps = Math.round(sols / SIM_STEP_SOLS);
  for (let i = 0; i < steps; i++) s = stepSimulation(s, SIM_STEP_SOLS, regions, { transport: EVERYWHERE }).state;
  return s;
}

const pump = (sol = 0, origin?: { lat: number; lon: number }) => makeBuilding('pump_station', 22, -3, 0, true, sol, origin);

/** Jezero plus a base at Nili Fossae (about 250 km away), each with a finished Pump Station. */
function twoBases(withPumps = true): GameState {
  const s = createInitialState();
  const nili = makeNewBase('nili_fossae', 0, 4, { iron: 50, regolith: 50, water: 500, food: 300, oxygen: 300 });
  // The new base needs its own power for its pumps: a Solar Farm and a Battery Bank.
  const at = { lat: nili.lat, lon: nili.lon };
  nili.buildings = [...nili.buildings, makeBuilding('solar_farm', -5, -22, 0, true, 0, at), makeBuilding('battery_bank', 10, -20, 0, true, 0, at)];
  nili.power = { ...nili.power, batteryKwh: 900 };
  if (withPumps) nili.buildings = [...nili.buildings, pump(0, at)];
  return { ...s, started: true, paused: false, buildings: withPumps ? [...s.buildings, pump()] : s.buildings, otherBases: [nili] };
}

function lay(s: GameState): GameState {
  const check = Logistics.checkPipeline(s, s.base.id, s.otherBases[0].id);
  if (!check.ok) throw new Error(check.reason);
  return { ...s, resources: { ...s.resources, iron: s.resources.iron - (check.cost.iron ?? 0), regolith: s.resources.regolith - (check.cost.regolith ?? 0) }, pipelines: [Logistics.makePipeline(s.base.id, s.otherBases[0].id, check.km, s.timeSols)] };
}

describe('Pipelines', () => {
  it('cost a bit more than a building and more the longer they are', () => {
    const short = pipelineCost(100);
    const long = pipelineCost(1000);
    expect(short.iron!).toBeGreaterThan(100);
    expect(long.iron!).toBeGreaterThan(short.iron!);
  });

  it('need a Pump Station at the starting base, a different base and a sensible length', () => {
    const s = twoBases(false);
    const r = Logistics.checkPipeline(s, s.base.id, s.otherBases[0].id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Pump Station/);
    const t = twoBases();
    expect(Logistics.checkPipeline(t, t.base.id, t.base.id).ok).toBe(false);
    const ok = Logistics.checkPipeline(t, t.base.id, t.otherBases[0].id);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.km).toBeLessThan(PIPELINE.maxKm);
    const laid = lay(t);
    expect(Logistics.checkPipeline(laid, laid.base.id, laid.otherBases[0].id).ok).toBe(false);
  });

  it('are built over time, then even out the two bases', () => {
    let s = lay(twoBases());
    const water0 = s.resources.water + s.otherBases[0].resources.water;
    s = run(s, s.pipelines[0].buildSols + 0.2);
    expect(s.pipelines[0].progress).toBe(1);
    expect(s.pipelines[0].working).toBe(true);
    s = run(s, 8);
    // Both bases now hold about the same share of their water storage.
    const fa = s.resources.water / s.storage.water;
    const fb = s.otherBases[0].resources.water / s.otherBases[0].storage.water;
    expect(Math.abs(fa - fb)).toBeLessThan(0.08);
    // Pipes move water, they don't make it (crews drink some in the meantime).
    expect(s.resources.water + s.otherBases[0].resources.water).toBeLessThan(water0 + 1);
  });

  it('stop when a Pump Station is switched off', () => {
    let s = lay(twoBases());
    s = run(s, s.pipelines[0].buildSols + 0.2);
    s = { ...s, buildings: s.buildings.map((b) => (b.type === 'pump_station' ? { ...b, enabled: false } : b)) };
    s = run(s, 0.2);
    expect(s.pipelines[0].working).toBe(false);
  });

  it('let a base build with materials pumped over from the other base', () => {
    let s = lay(twoBases());
    s = run(s, s.pipelines[0].buildSols + 0.2);
    // The home base is out of iron; Nili Fossae has some.
    s = { ...s, resources: { ...s.resources, iron: 0 }, otherBases: s.otherBases.map((b) => ({ ...b, resources: { ...b.resources, iron: 200 } })) };
    expect(ConstructionManager.canBuild(s, 'solar_farm').ok).toBe(true);
    const res = ConstructionManager.place(s, { type: 'solar_farm', gridX: -30, gridY: 12, rotation: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.sent[0].goods.iron).toBe(60);
    expect(res.otherBases![0].resources.iron).toBe(140);
    // Without a working pipeline the base has to wait.
    expect(ConstructionManager.canBuild({ ...s, pipelines: [] }, 'solar_farm').ok).toBe(false);
  });

  it('survive a save and load', () => {
    const s = lay(twoBases());
    const back = fromSave(JSON.parse(JSON.stringify(toSave(s))));
    expect(back.pipelines).toHaveLength(1);
    expect(back.pipelines[0].km).toBeCloseTo(s.pipelines[0].km);
  });
});

describe('Pipe physics and twists', () => {
  const finished = (km: number) => ({ ...Logistics.makePipeline('a', 'b', km, 0), progress: 1 });

  it('carry less over longer distances (flow ∝ 1/√length)', () => {
    expect(pipelineFlowCap(100)).toBe(PIPELINE.maxFlowPerSol);
    expect(pipelineFlowCap(PIPELINE.flowRefKm * 4)).toBeCloseTo(PIPELINE.maxFlowPerSol / 2);
  });

  it('a 1 km stretch grows under a metre between night and day', () => {
    expect(thermalGrowthMPerKm()).toBeGreaterThan(0.7);
    expect(thermalGrowthMPerKm()).toBeLessThan(0.9);
  });

  it('get twisted now and then, pinch the flow, and get repaired', () => {
    let p = finished(PIPELINE.maxKm);
    let sol = 0;
    while (!p.faults.length && sol < 2000) p = Logistics.advanceFaults(p, sol, 1).pipe, sol++;
    expect(p.faults.length).toBeGreaterThan(0);
    const f = p.faults[0];
    expect(Logistics.flowCap(p)).toBeLessThan(pipelineFlowCap(p.km));
    // Same pipe, same sol → same twist (loading a save doesn't reroll it).
    expect(Logistics.advanceFaults({ ...p, faults: [] }, f.sinceSol - 1, 1).added.map((x) => x.id)).toContain(f.id);
    const fixedAt = Math.ceil(f.repairSols) + 1;
    let fixed = false;
    for (let i = 0; i < fixedAt * 10 && !fixed; i++) {
      const r = Logistics.advanceFaults(p, 0.05 + i * 0.1, 0.1);
      p = r.pipe;
      fixed = r.fixed.some((x) => x.id === f.id);
    }
    expect(fixed).toBe(true);
  });

  it('are never twisted while still being laid', () => {
    const p = { ...Logistics.makePipeline('a', 'b', PIPELINE.maxKm, 0), progress: 0.5 };
    expect(Logistics.advanceFaults(p, 0, 500).pipe.faults).toHaveLength(0);
  });
});

describe('Cargo haulers', () => {
  function withGarage(): GameState {
    const s = twoBases(false);
    const garage = { ...makeBuilding('cargo_garage', 22, 10, 0, true, 0), target: s.otherBases[0].id };
    return { ...s, buildings: [...s.buildings, garage] };
  }
  const garageId = (s: GameState) => s.buildings.find((b) => b.type === 'cargo_garage')!.id;

  it('carry far more than a crew rover, limited by the haulers parked', () => {
    expect(CARGO.payload).toBeGreaterThan(998);
    const s = withGarage();
    const id = garageId(s);
    expect(Logistics.checkCargo(s, id, { iron: 100 }).ok).toBe(true);
    expect(Logistics.checkCargo(s, id, {}).ok).toBe(false);
    expect(Logistics.checkCargo(s, id, { water: 1e6 }).ok).toBe(false);
    const noTarget = { ...s, buildings: s.buildings.map((b) => (b.id === id ? { ...b, target: undefined } : b)) };
    expect(Logistics.checkCargo(noTarget, id, { iron: 100 }).ok).toBe(false);
  });

  it('drive the load to the other base and come home', () => {
    let s = withGarage();
    const id = garageId(s);
    const res = Logistics.launchCargo(s, id, { iron: 150 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    s = { ...s, resources: res.resources, shipments: [res.shipment] };
    expect(Logistics.haulersFree(s.shipments, id)).toBe(CARGO.haulersPerGarage - 1);
    const ironThere = s.otherBases[0].resources.iron;
    const trip = Logistics.tripSols(res.shipment.legKm);
    s = run(s, trip * 3 + CARGO.unloadSols + 1);
    // The depot's robots add a little iron every few sols, so check "at least".
    expect(s.otherBases[0].resources.iron).toBeGreaterThanOrEqual(ironThere + 150);
    expect(s.shipments).toHaveLength(0);
    expect(Logistics.haulersFree(s.shipments, id)).toBe(CARGO.haulersPerGarage);
  });
});
