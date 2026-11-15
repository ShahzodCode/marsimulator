import { describe, expect, it } from 'vitest';
import { BUILDINGS, maxPowerKw, type BuildingType } from '../data/buildings';
import { SOLAR_FARM_PEAK_KW } from '../data/power';
import { RECIPES, SOL_HOURS } from '../data/recipes';
import { emptyResources, RESOURCE_IDS } from '../data/resources';
import { EXPEDITION, GAME_KM_PER_SOL, NASA_ROVER_DATA, rewardFor } from '../data/missions';
import { REGIONS } from '../data/regions';
import { RANKS, rankById, rankForXp } from '../data/progression';
import { TECHS } from '../data/research';
import { RegionManager } from '../planet/RegionManager';
import { createInitialState, makeBuilding } from '../state/factory';
import type { BuildingInstance, Expedition, GameState } from '../state/types';
import { ConstructionManager } from './ConstructionManager';
import { MissionManager } from './MissionManager';
import { PowerManager, PowerPool } from './PowerManager';
import { ResourceManager } from './ResourceManager';
import { SIM_STEP_SOLS, SimulationClock } from './SimulationClock';
import { stepSimulation, type StepOptions } from './SimulationEngine';
import { EVERYWHERE } from './Transport';

const regions = new RegionManager();
const NOON = 0.25; // sols since sunrise
const CYCLE_STEPS = Math.round(RECIPES.iron_smelting.durationSols / SIM_STEP_SOLS);

function run(state: GameState, steps: number, opts: StepOptions = { transport: EVERYWHERE }): GameState {
  let s = state;
  for (let i = 0; i < steps; i++) s = stepSimulation(s, SIM_STEP_SOLS, regions, opts).state;
  return s;
}

/** A tiny colony: depot (storage) + the given finished buildings, no crew, at noon. */
function lab(types: BuildingType[], patch: Partial<GameState> = {}): GameState {
  const base = createInitialState();
  const buildings: BuildingInstance[] = [base.buildings.find((b) => b.type === 'storage_depot')!, ...types.map((t, i) => makeBuilding(t, i * 10, 20, 0, true, 0))];
  const cap = PowerManager.batteryCapacity(buildings);
  return {
    ...base,
    buildings,
    timeSols: NOON,
    colony: { colonists: 0, housing: 0, growth: 0 },
    // A neutral test site: no traits, so recipes run at exactly their listed amounts.
    base: { ...base.base, siteId: 'lab' },
    resources: { ...emptyResources(), regolith: 100 },
    power: { ...base.power, batteryKwh: cap, batteryCapacityKwh: cap },
    ...patch,
  };
}

function find(s: GameState, type: BuildingType): BuildingInstance {
  return s.buildings.find((b) => b.type === type)!;
}

describe('ResourceManager', () => {
  it('1. never lets a resource go negative', () => {
    const inv = new ResourceManager({ ...emptyResources(), water: 5 }, { ...emptyResources(), water: 100 });
    const r = inv.consume('water', 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('insufficient');
    expect(inv.get('water')).toBe(5);
    expect(inv.take('water', 50)).toBe(5);
    expect(inv.get('water')).toBe(0);
    expect(inv.consume('water', -1).ok).toBe(false);
  });

  it('1b. the simulation never drives stock below zero, even with nothing left', () => {
    const s = run({ ...createInitialState(), resources: emptyResources() }, 300);
    for (const id of RESOURCE_IDS) expect(s.resources[id]).toBeGreaterThanOrEqual(0);
  });

  it('2. never exceeds storage capacity', () => {
    const inv = new ResourceManager({ ...emptyResources(), iron: 95 }, { ...emptyResources(), iron: 100 });
    const r = inv.add('iron', 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('no_capacity');
    expect(inv.get('iron')).toBe(95);
    expect(inv.put('iron', 10)).toBe(5);
    expect(inv.get('iron')).toBe(100);
    // Capacity also holds inside the simulation.
    const s = run(lab(['regolith_excavator'], { resources: { ...emptyResources(), regolith: 1495 } }), 100);
    expect(s.resources.regolith).toBeLessThanOrEqual(s.storage.regolith);
  });

  it('pays multi-resource costs atomically', () => {
    const inv = new ResourceManager({ ...emptyResources(), iron: 50, regolith: 5 }, { ...emptyResources(), iron: 100, regolith: 100 });
    const r = inv.consumeAll({ iron: 40, regolith: 10 });
    expect(r.ok).toBe(false);
    expect(inv.get('iron')).toBe(50);
    expect(inv.get('regolith')).toBe(5);
  });
});

describe('Construction', () => {
  const req = { type: 'regolith_excavator' as const, gridX: 20, gridY: 20, rotation: 0 };

  it('3. fails without materials and changes nothing', () => {
    const s = { ...createInitialState(), resources: emptyResources() };
    const r = ConstructionManager.place(s, req);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('materials');
      expect(r.reason).toMatch(/iron/);
    }
  });

  it('4. deducts the cost exactly once', () => {
    const s0 = createInitialState();
    const r = ConstructionManager.place(s0, req);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resources.iron).toBe(s0.resources.iron - BUILDINGS.regolith_excavator.constructionCost.iron!);
    const placed: GameState = { ...s0, resources: r.resources, buildings: [...s0.buildings, r.building] };
    // Construction finishes without any further payment.
    const done = run(placed, 80, { transport: EVERYWHERE });
    expect(find(done, 'regolith_excavator').isOperational).toBe(true);
    const ironProduced = done.stats.produced.iron;
    const depotDrops = Math.floor(done.timeSols / 2) * 5;
    expect(done.resources.iron).toBeCloseTo(r.resources.iron + ironProduced + depotDrops, 5);
  });

  it('refuses a consumer when there is not enough spare power', () => {
    const s = { ...lab(['iron_refinery', 'iron_refinery', 'iron_refinery']), resources: { ...emptyResources(), iron: 999, regolith: 999 } };
    const c = ConstructionManager.canBuild(s, 'iron_refinery');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.code).toBe('power');
    expect(ConstructionManager.canBuild(s, 'solar_farm').ok).toBe(true);
  });

  it('5. progresses with simulation time', () => {
    const b = makeBuilding('habitat', 0, 0, 0, false, 0);
    const steps = 30;
    let list = [b];
    for (let i = 0; i < steps; i++) list = ConstructionManager.advance(list, SIM_STEP_SOLS).buildings;
    expect(list[0].constructionProgress).toBeCloseTo((steps * SIM_STEP_SOLS) / BUILDINGS.habitat.buildTimeSols, 6);
    for (let i = 0; i < 200; i++) list = ConstructionManager.advance(list, SIM_STEP_SOLS).buildings;
    expect(list[0].isOperational).toBe(true);
  });

  it('6. stops while paused', () => {
    const clock = new SimulationClock();
    let steps = 0;
    for (let i = 0; i < 600; i++) steps += clock.tick(1 / 60, { paused: true, started: true, speed: 4 });
    expect(steps).toBe(0);
    const s = { ...createInitialState(), buildings: [makeBuilding('habitat', 0, 0, 0, false, 0)] };
    const after = stepSimulation(s, 0, regions).state;
    expect(after.buildings[0].constructionProgress).toBe(0);
    expect(after.timeSols).toBe(s.timeSols);
  });
});

describe('Production', () => {
  it('7 & 8. consumes the right inputs and makes the right outputs', () => {
    const s0 = lab(['solar_farm', 'iron_refinery']);
    const s1 = run(s0, CYCLE_STEPS);
    const r = RECIPES.iron_smelting;
    expect(s1.resources.regolith).toBeCloseTo(s0.resources.regolith - r.inputs.regolith!, 6);
    expect(s1.resources.iron).toBeCloseTo(r.outputs.iron!, 6);
    expect(s1.stats.produced.iron).toBeCloseTo(r.outputs.iron!, 6);
  });

  it('electrolysis turns water into oxygen and hydrogen (9 : 8 : 1 by mass)', () => {
    const s0 = lab(['solar_farm', 'life_support'], { resources: { ...emptyResources(), water: 100 } });
    const s1 = run(s0, CYCLE_STEPS);
    expect(s1.resources.water).toBeCloseTo(100 - 2.25, 6);
    expect(s1.resources.oxygen).toBeCloseTo(2, 6);
    expect(s1.resources.hydrogen).toBeCloseTo(0.25, 6);
  });

  it('9. pauses when inputs are missing', () => {
    const s1 = run(lab(['solar_farm', 'iron_refinery'], { resources: emptyResources() }), CYCLE_STEPS * 2);
    const ref = find(s1, 'iron_refinery');
    expect(ref.status).toBe('waiting_materials');
    expect(ref.statusNote).toMatch(/regolith/);
    expect(s1.resources.iron).toBe(0);
  });

  it('10. pauses when power is insufficient', () => {
    const s0 = lab(['iron_refinery'], { timeSols: 0.75 }); // night, no solar, no battery
    const s1 = run(s0, CYCLE_STEPS * 2);
    const ref = find(s1, 'iron_refinery');
    expect(ref.status).toBe('insufficient_power');
    expect(ref.recipes.iron_smelting?.progress ?? 0).toBe(0);
    expect(s1.resources.iron).toBe(0);
    expect(s1.power.batteryKwh).toBe(0);
  });

  it('11. pauses when storage is full, without wasting inputs', () => {
    const s0 = lab(['solar_farm', 'iron_refinery']);
    const full = { ...s0, resources: { ...s0.resources, iron: 800 } };
    const s1 = run(full, CYCLE_STEPS * 2);
    expect(find(s1, 'iron_refinery').status).toBe('storage_full');
    expect(s1.resources.regolith).toBe(100);
    expect(s1.resources.iron).toBe(800);
  });

  it('chickens only run while the crops run', () => {
    const s1 = run(lab(['solar_farm', 'greenhouse'], { resources: emptyResources() }), 5);
    const gh = find(s1, 'greenhouse');
    expect(gh.status).toBe('waiting_materials');
    expect(gh.recipes.chickens?.loaded ?? false).toBe(false);
  });

  it('a switched-off building does nothing and uses no power', () => {
    const s0 = lab(['solar_farm', 'iron_refinery']);
    const off = { ...s0, buildings: s0.buildings.map((b) => (b.type === 'iron_refinery' ? { ...b, enabled: false } : b)) };
    const s1 = run(off, CYCLE_STEPS);
    expect(find(s1, 'iron_refinery').status).toBe('disabled');
    expect(s1.resources.regolith).toBe(100);
    expect(s1.power.suppliedKw).toBe(0);
  });
});

describe('Power', () => {
  it('12. calculates generation, consumption and battery energy correctly', () => {
    const farm = makeBuilding('solar_farm', 0, 0, 0, true, 0);
    expect(PowerManager.generation([farm], NOON)).toBeCloseTo(SOLAR_FARM_PEAK_KW, 6);
    expect(PowerManager.generation([farm], 0.75)).toBe(0);
    expect(PowerManager.averageGeneration([farm])).toBeCloseTo(SOLAR_FARM_PEAK_KW / Math.PI, 6);

    const refinery = makeBuilding('iron_refinery', 0, 0, 0, true, 0);
    expect(PowerManager.plannedDemand([farm, refinery])).toBe(maxPowerKw('iron_refinery'));

    // Battery: 10 kW over one step with no sun drains exactly 10 kW × step hours.
    const hours = SIM_STEP_SOLS * SOL_HOURS;
    const pool = new PowerPool(0, 100, 300, SIM_STEP_SOLS);
    expect(pool.request(10)).toBe(true);
    expect(pool.finish()).toBeCloseTo(100 - 10 * hours, 9);
    // Spare sun charges it, but never above capacity.
    const sunny = new PowerPool(80, 299, 300, SIM_STEP_SOLS);
    sunny.request(10);
    expect(sunny.finish()).toBe(300);
    // Life support is served first when there isn't enough for everyone.
    const a = PowerManager.allocate(
      [
        { id: 'refinery', kw: 10, priority: 3 },
        { id: 'life', kw: 3, priority: 0 },
      ],
      0,
      3 * hours,
      300,
      SIM_STEP_SOLS,
    );
    expect([...a.granted]).toEqual(['life']);
  });
});

describe('Exploration: orbit, crew rover, outposts', () => {
  const target = regions.neighboursOf('MC-13').find((id) => !rewardFor(id).rank)!;
  const mapped = (s: GameState): GameState => ({ ...s, discoveredRegions: { ...s.discoveredRegions, [target]: true } });
  const steps = (sols: number) => Math.ceil(sols / SIM_STEP_SOLS);

  function sent(s0 = mapped(createInitialState())): GameState {
    const r = MissionManager.launchExpedition(s0, regions, target);
    if (!r.ok) throw new Error(r.reason);
    return { ...s0, resources: r.resources, power: { ...s0.power, batteryKwh: r.batteryKwh }, missions: [r.mission] };
  }

  it('uses the real NASA crew-rover speed, time-lapsed by a named multiplier', () => {
    expect(NASA_ROVER_DATA.sevSpeedKmh).toBe(10);
    expect(GAME_KM_PER_SOL).toBe(NASA_ROVER_DATA.sevSpeedKmh * EXPEDITION.driveHoursPerSol * EXPEDITION.timeScale);
  });

  it('an orbital scan maps exactly one region, once', () => {
    const s0 = createInitialState();
    const r = MissionManager.launchScan(s0, regions, target);
    if (!r.ok) throw new Error(r.reason);
    const s1 = run({ ...s0, missions: [r.mission] }, steps(r.mission.durationSols) + 2, {});
    expect(s1.discoveredRegions[target]).toBe(true);
    expect(s1.exploredRegions[target]).toBeFalsy();
    const newly = Object.keys(s1.discoveredRegions).filter((id) => s1.discoveredRegions[id] && !s0.discoveredRegions[id]);
    expect(newly).toEqual([target]);
    expect(s1.progression.milestones.filter((m) => m === `scan-${target}`)).toHaveLength(1);
  });

  it('a crew can only go to a mapped region', () => {
    expect(MissionManager.checkExpedition(createInitialState(), regions, target).ok).toBe(false);
    expect(MissionManager.checkExpedition(mapped(createInitialState()), regions, target).ok).toBe(true);
  });

  it('launching packs crew supplies and battery energy once', () => {
    const s0 = mapped(createInitialState());
    const s = sent(s0);
    const m = s.missions[0] as Expedition;
    expect(s.resources.food).toBe(s0.resources.food - m.supplies.food!);
    expect(m.supplies.oxygen).toBeGreaterThan(0);
    expect(s.power.batteryKwh).toBe(s0.power.batteryKwh - EXPEDITION.energyKwh);
    expect(MissionManager.checkExpedition(s, regions, target).ok).toBe(false);
  });

  it('the solar rover drives by day and parks at night', () => {
    const base = sent();
    const m = { ...(base.missions[0] as Expedition), storm: null };
    // The rover is still at the base, so its local time is the base's (sunrise at .0, sunset at .5).
    const day = Math.ceil(base.timeSols) + 0.1;
    const night = Math.ceil(base.timeSols) + 0.75;
    const atDay = MissionManager.advance([m], 0.05, day, regions).missions[0] as Expedition;
    const atNight = MissionManager.advance([m], 0.05, night, regions).missions[0] as Expedition;
    expect(atDay.drivenKm).toBeGreaterThan(0);
    expect(atNight.drivenKm).toBe(0);
    expect(atNight.activity).toBe('night');
  });

  it('a dust storm parks the rover for its length', () => {
    const base = sent();
    const m: Expedition = { ...(base.missions[0] as Expedition), storm: { atKm: 0, sols: 1, hit: false } };
    const hit = MissionManager.advance([m], 0.01, 0.1, regions).missions[0] as Expedition;
    expect(hit.activity).toBe('storm');
    const still = MissionManager.advance([hit], 0.5, 0.2, regions).missions[0] as Expedition;
    expect(still.drivenKm).toBe(hit.drivenKm);
  });

  it('stops while paused', () => {
    const s = sent();
    expect(stepSimulation(s, 0, regions).state.missions[0].progress).toBe(0);
  });

  it('crew away eat from their packed supplies, not the base', () => {
    const s0 = mapped(createInitialState());
    const home = stepSimulation(s0, 0, regions).state;
    const away = stepSimulation(sent(s0), 0, regions).state;
    expect(away.rates.food).toBeGreaterThan(home.rates.food);
  });

  it('the crew explores the region, comes home and is rewarded once', () => {
    const s0 = sent();
    const m0 = s0.missions[0] as Expedition;
    const s1 = run({ ...s0, missions: [{ ...m0, storm: null }] }, steps(m0.durationSols * 2.2) + 50, {});
    const m1 = s1.missions[0] as Expedition;
    expect(m1.status).toBe('complete');
    expect(s1.exploredRegions[target]).toBe(true);
    expect(s1.progression.milestones.filter((x) => x === `mission-${m0.id}`)).toHaveLength(1);
    expect(MissionManager.checkExpedition(s1, regions, target).ok).toBe(false);
  });

  it('an outpost sends cargo home until its site runs out', () => {
    const site = REGIONS.find((r) => rewardFor(r.id).outpost)!.id;
    const fresh: GameState = { ...createInitialState(), exploredRegions: { ...createInitialState().exploredRegions, [site]: true } };
    // Outposts unlock at Astronaut Candidate.
    expect(MissionManager.checkOutpost(fresh, site).ok).toBe(false);
    const s0: GameState = { ...fresh, progression: { ...fresh.progression, level: rankById('astronaut_candidate').level } };
    const r = MissionManager.buildOutpost(s0, regions, site);
    if (!r.ok) throw new Error(r.reason);
    const o = r.outpost;
    const before = MissionManager.advanceOutposts([o], o.readySol, 0.01);
    expect(before.deliveries).toHaveLength(0);
    const first = MissionManager.advanceOutposts([o], o.lastTripSol + o.tripSols, 0.01);
    expect(first.deliveries).toHaveLength(1);
    expect(first.deliveries[0].amount).toBeLessThanOrEqual(NASA_ROVER_DATA.sevPayloadKg);
    expect(first.outposts[0].reserveLeft).toBe(o.reserveLeft - first.deliveries[0].amount);
  });
});

describe('Starting settlement', () => {
  it('16. runs with the initial inventory: every vital resource grows and nothing stalls', () => {
    const s0 = createInitialState();
    let s = stepSimulation(s0, 0, regions).state;
    for (const b of s.buildings) expect(b.connected || b.type === 'storage_depot').toBe(true);
    let lowestBattery = Infinity;
    let blackouts = 0;
    for (let i = 0; i < 1000; i++) {
      // 10 sols
      const r = stepSimulation(s, SIM_STEP_SOLS, regions);
      s = r.state;
      lowestBattery = Math.min(lowestBattery, s.power.batteryKwh);
      blackouts += s.power.unpowered;
      for (const id of RESOURCE_IDS) expect(s.resources[id]).toBeGreaterThanOrEqual(0);
    }
    expect(blackouts).toBe(0);
    expect(lowestBattery).toBeGreaterThan(0);
    expect(s.resources.water).toBeGreaterThan(s0.resources.water);
    expect(s.resources.oxygen).toBeGreaterThan(s0.resources.oxygen);
    expect(s.resources.food).toBeGreaterThan(s0.resources.food);
    for (const type of ['life_support', 'greenhouse', 'ice_drill'] as BuildingType[]) expect(find(s, type).status).toBe('operational');
    expect(s.colony.housing).toBeGreaterThanOrEqual(s.colony.colonists);
  });

  it('gives the same results at any frame rate', () => {
    const play = (fps: number) => {
      const clock = new SimulationClock();
      let s: GameState = { ...createInitialState(), started: true, paused: false, speed: 4 };
      for (let i = 0; i < fps * 20; i++) {
        const n = clock.tick(1 / fps, s);
        for (let k = 0; k < n; k++) s = { ...s, ...stepSimulation(s, SIM_STEP_SOLS, regions).state };
      }
      return s;
    };
    const a = play(30);
    const b = play(144);
    expect(a.timeSols).toBeCloseTo(b.timeSols, 6);
    for (const id of RESOURCE_IDS) expect(a.resources[id]).toBeCloseTo(b.resources[id], 6);
  });
});

describe('Rank ladder', () => {
  it('climbs in XP order and only ever raises what the player may do', () => {
    RANKS.forEach((r, i) => {
      expect(r.level).toBe(i + 1);
      if (i === 0) return;
      const prev = RANKS[i - 1];
      expect(r.xp).toBeGreaterThan(prev.xp);
      expect(r.maxBases).toBeGreaterThanOrEqual(prev.maxBases);
      expect(r.crewRovers).toBeGreaterThanOrEqual(prev.crewRovers);
      expect(r.orbiters).toBeGreaterThanOrEqual(prev.orbiters);
      expect(r.convoyRange).toBeGreaterThanOrEqual(prev.convoyRange);
      expect(r.perks.length).toBeGreaterThan(0);
    });
  });

  it('keeps the XP of the original three ranks, so old saves lose nothing', () => {
    expect(rankForXp(120).id).toBe('mars_engineer');
    expect(rankForXp(400).id).toBe('settlement_commander');
    expect(MissionManager.maxBases(rankForXp(400).level)).toBeGreaterThanOrEqual(4);
  });

  it('every rank-gated building and research project names a real rank', () => {
    for (const def of Object.values(BUILDINGS)) if (def.unlockRank) expect(rankById(def.unlockRank)).toBeDefined();
    for (const t of TECHS) if (t.rank) expect(rankById(t.rank)).toBeDefined();
  });

  it('gives more crew rovers at higher ranks', () => {
    expect(MissionManager.crewRovers(1)).toBe(1);
    expect(MissionManager.crewRovers(rankById('expedition_leader').level)).toBe(3);
    expect(MissionManager.orbiters(rankById('flight_engineer').level)).toBe(2);
  });
});
