import { describe, expect, it } from 'vitest';
import { BASE_SITES, SITE_BY_ID, sitesIn, TRAITS } from '../data/baseSites';
import { FOUNDING } from '../data/missions';
import { REGIONS } from '../data/regions';
import { labSlots, STAGES, TECHS, TECH_BY_ID, stageMaterials, stageRp } from '../data/research';
import { RegionManager } from '../planet/RegionManager';
import { fromSave, toSave, SAVE_VERSION } from '../persistence/SaveSchema';
import { createInitialState, makeBuilding, switchBase } from '../state/factory';
import type { GameState } from '../state/types';
import { baseEnv, lockReason } from './BaseEnv';
import { ConstructionManager } from './ConstructionManager';
import { MissionManager } from './MissionManager';
import { PopulationManager } from './PopulationManager';
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

describe('Base sites (real data)', () => {
  it('every site sits inside the region it is listed under, with valid coordinates', () => {
    for (const s of BASE_SITES) {
      const r = REGIONS.find((x) => x.id === s.regionId)!;
      expect(s.lat).toBeGreaterThanOrEqual(r.latMin);
      expect(s.lat).toBeLessThanOrEqual(r.latMax);
      expect(s.lon).toBeGreaterThanOrEqual(0);
      expect(s.lon).toBeLessThan(360);
      expect(s.sources.length).toBeGreaterThan(0);
    }
  });

  it('every site has at least one resource worth a factory', () => {
    const resourceTraits = ['ice_cap', 'buried_glacier', 'ground_ice', 'hematite', 'clays', 'flood_rocks', 'dusty', 'deep_water'];
    for (const s of BASE_SITES) expect(s.traits.some((t) => resourceTraits.includes(t)), s.id).toBe(true);
  });

  it('covers 29 of the 30 USGS tiles; ids are unique', () => {
    const covered = new Set(BASE_SITES.map((s) => s.regionId));
    expect(covered.size).toBe(29);
    expect(new Set(BASE_SITES.map((s) => s.id)).size).toBe(BASE_SITES.length);
    for (const s of BASE_SITES) for (const t of s.traits) expect(TRAITS[t]).toBeDefined();
  });
});

describe('Site effects', () => {
  it('polar caps are icy and cold, and ban greenhouse domes', () => {
    const env = baseEnv('planum_boreum', []);
    expect(env.output.water).toBeGreaterThan(1.5);
    expect(env.heating).toBeGreaterThanOrEqual(2.5);
    expect(env.solar).toBeLessThan(0.3);
    const s = createInitialState();
    expect(lockReason('greenhouse', { ...s, base: { ...s.base, siteId: 'planum_boreum' } }, env)).toMatch(/cold/);
  });

  it('hematite doubles iron and unlocks the strip mine only there (after research)', () => {
    expect(baseEnv('opportunity', []).output.iron).toBeCloseTo(2);
    const s = createInitialState();
    const done = { ...s, research: { ...s.research, completed: ['regolith_bricks', 'megadigger', 'strip_mine'] as GameState['research']['completed'] } };
    expect(lockReason('strip_mine', { ...done, base: { ...s.base, siteId: 'opportunity' } }, baseEnv('opportunity', done.research.completed))).toBeNull();
    expect(lockReason('strip_mine', done, baseEnv('jezero', done.research.completed))).toMatch(/hematite/);
    expect(lockReason('strip_mine', { ...s, base: { ...s.base, siteId: 'opportunity' } }, baseEnv('opportunity', []))).toMatch(/research/);
  });

  it('deep groundwater stays hidden until the Mk III orbiter', () => {
    const s = createInitialState();
    const at = { ...s, base: { ...s.base, siteId: 'insight' } };
    const all = TECHS.map((t) => t.id);
    expect(lockReason('deep_aquifer_drill', { ...at, research: { ...at.research, completed: all.filter((t) => t !== 'orbiter_mk3') } }, baseEnv('insight', []))).not.toBeNull();
    expect(lockReason('deep_aquifer_drill', { ...at, research: { ...at.research, completed: all } }, baseEnv('insight', all))).toBeNull();
  });
});

describe('Families', () => {
  it('grow by about half in 90 sols with free beds and stop when the beds are full', () => {
    let c = 6;
    let g = 0;
    // 6 colonists, 100 beds: lots of room, so faster than the base rate.
    for (let i = 0; i < 90 / 0.05; i++) ({ colonists: c, growth: g } = PopulationManager.step(c, 100, g, 0.05, false));
    expect(c).toBeGreaterThanOrEqual(9);
    let full = PopulationManager.step(12, 12, 0.5, 10, false);
    expect(full.colonists).toBe(12);
    expect(full.paused).toBe('no_beds');
    full = PopulationManager.step(1, 12, 0, 10, false);
    expect(full.paused).toBe('no_pair');
  });

  it('empty beds speed growth up', () => {
    expect(PopulationManager.ratePerSol(6, 18)).toBeGreaterThan(PopulationManager.ratePerSol(6, 7) * 1.5);
  });

  it('a base with a new dome grows in the simulation, and pauses when out of food', () => {
    const s0 = createInitialState();
    // A second dome, with a solar farm and batteries to keep it warm at night.
    const extra = [makeBuilding('habitat', 14, 14, 0, true, 0), makeBuilding('solar_farm', -30, 14, 0, true, 0), makeBuilding('battery_bank', 24, -12, 0, true, 0)];
    let s = run({ ...s0, buildings: [...s0.buildings, ...extra], started: true }, 30);
    expect(s.colony.colonists).toBeGreaterThan(6);
    s = { ...s0, buildings: [...s0.buildings, ...extra], resources: { ...s0.resources, food: 0 } };
    expect(run(s, 5).colony.colonists).toBe(6);
  });
});

describe('Orbiter spots base sites', () => {
  it('sites appear one by one as the map progresses', () => {
    const s0 = createInitialState();
    const region = 'MC-19'; // Opportunity, Eberswalde, Holden
    const launch = MissionManager.launchScan(s0, regions, region);
    if (!launch.ok) throw new Error(launch.reason);
    let s: GameState = { ...s0, missions: [launch.mission] };
    const total = launch.mission.durationSols;
    s = run(s, total * 0.4);
    const seenMid = sitesIn(region).filter((x) => s.sitesSeen[x.id]).length;
    expect(seenMid).toBe(1);
    s = run(s, total * 0.7);
    expect(sitesIn(region).every((x) => s.sitesSeen[x.id] === 1)).toBe(true);
  });
});

describe('Founding a base', () => {
  function ready(): GameState {
    const s0 = createInitialState();
    const dome = makeBuilding('habitat', 14, 14, 0, true, 0);
    return { ...s0, buildings: [...s0.buildings, dome], colony: { ...s0.colony, colonists: 10 }, resources: { ...s0.resources, iron: 800, regolith: 800 } };
  }

  it('a convoy takes a woman and a man, drives there and founds a new base with a depot', () => {
    const s = ready();
    expect(MissionManager.checkFounding(s, 'nili_fossae').ok).toBe(true);
    const res = MissionManager.launchFounding(s, 'nili_fossae');
    if (!res.ok) throw new Error(res.reason);
    expect(res.colonists).toBe(8);
    let st: GameState = { ...s, resources: res.resources, colony: { ...s.colony, colonists: res.colonists }, missions: [res.mission] };
    st = run(st, res.mission.durationSols + 4);
    expect(st.otherBases.length).toBe(1);
    const nb = st.otherBases[0];
    expect(nb.siteId).toBe('nili_fossae');
    expect(nb.colony.colonists).toBe(FOUNDING.crew);
    expect(nb.buildings.some((b) => b.type === 'storage_depot')).toBe(true);
    expect(nb.resources.iron).toBeGreaterThan(200);
    // Switch to it: its data moves to the top, Jezero goes to otherBases.
    const sw = switchBase(st, nb.id)!;
    expect(sw.base.siteId).toBe('nili_fossae');
    expect(sw.otherBases.some((b) => b.siteId === 'jezero')).toBe(true);
    // Building there pays from its own depot.
    const placed = ConstructionManager.place(sw, { type: 'solar_farm', gridX: 10, gridY: 10, rotation: 0 });
    expect(placed.ok).toBe(true);
    // Both bases keep running while the other one is on screen.
    const later = run(sw, 2);
    expect(later.otherBases.find((b) => b.siteId === 'jezero')!.power.batteryCapacityKwh).toBeGreaterThan(0);
  });

  it('refuses sites that are too far, unseen, or when the crew is too small', () => {
    const s = ready();
    expect(MissionManager.checkFounding(s, 'gale').ok).toBe(false); // not mapped yet
    const seen = { ...s, sitesSeen: { ...s.sitesSeen, olympus: 1 as const } };
    expect(MissionManager.checkFounding(seen, 'olympus')).toMatchObject({ ok: false, reason: expect.stringMatching(/too far/) });
    expect(MissionManager.checkFounding({ ...s, colony: { ...s.colony, colonists: 3 } }, 'nili_fossae').ok).toBe(false);
  });
});

describe('Research', () => {
  it('labs take a project through its stages, pausing for test materials', () => {
    const s0 = createInitialState();
    const lab = makeBuilding('research_lab', 14, 14, 0, true, 0);
    let s: GameState = { ...s0, buildings: [...s0.buildings, lab], research: { ...s0.research, active: [{ id: 'better_drills', stage: 0, progress: 0, awaiting: false }] } };
    s = run(s, 10);
    // The concept study is done; the lab prototype waits for its materials.
    expect(s.research.active).toEqual([expect.objectContaining({ id: 'better_drills', stage: 0, awaiting: true })]);
    expect(stageMaterials(TECH_BY_ID.better_drills, 1)).toMatchObject({ iron: expect.any(Number), regolith: expect.any(Number) });
    for (let i = 0; i < STAGES.length && !s.research.completed.includes('better_drills'); i++) {
      s = { ...s, research: { ...s.research, active: s.research.active.map((p) => (p.awaiting ? { ...p, stage: p.stage + 1, progress: 0, awaiting: false } : p)) } };
      s = run(s, 10);
    }
    expect(s.research.completed).toContain('better_drills');
    expect(s.research.active).toEqual([]);
  });

  it('several labs run several projects at once, sharing their points', () => {
    const s0 = createInitialState();
    const labs = [makeBuilding('research_lab', 14, 14, 0, true, 0), makeBuilding('research_lab', 18, 14, 0, true, 0)];
    expect(labSlots([[...s0.buildings, ...labs]])).toBe(2);
    const start = (id: 'better_drills' | 'hydroponics' | 'dust_cleaning') => ({ id, stage: 0, progress: 0, awaiting: false });
    let s: GameState = { ...s0, buildings: [...s0.buildings, ...labs], research: { ...s0.research, active: [start('better_drills'), start('hydroponics')] } };
    s = run(s, 1);
    const [a, b] = s.research.active;
    expect(a.progress).toBeGreaterThan(0);
    expect(a.progress).toBeCloseTo(b.progress, 5);
  });

  it('stages add up to the full project cost', () => {
    for (const t of TECHS) expect(STAGES.reduce((sum, _, i) => sum + stageRp(t, i), 0)).toBeCloseTo(t.cost, -1);
  });
});

describe('Saves', () => {
  it('round-trips several bases and research; old saves load as one base', () => {
    const s0 = createInitialState();
    const st: GameState = {
      ...s0,
      research: {
        completed: ['hydroponics', 'dust_cleaning'],
        active: [
          { id: 'big_dome', stage: 1, progress: 40, awaiting: false },
          { id: 'better_drills', stage: 0, progress: 18, awaiting: true },
        ],
        shelved: { fission: { stage: 2, progress: 5, awaiting: true } },
      },
    };
    const back = fromSave(toSave(st));
    expect(back.research).toEqual(st.research);
    // Saves from the one-project-at-a-time days load with that project running.
    const single = toSave(s0);
    single.state.research = { completed: [], active: 'big_dome', stage: 1, progress: 40, awaiting: false, shelved: {} } as never;
    expect(fromSave(single).research.active).toEqual([{ id: 'big_dome', stage: 1, progress: 40, awaiting: false }]);
    expect(back.base.siteId).toBe('jezero');
    const old = toSave(s0);
    old.version = 3;
    const o = old.state as Partial<typeof old.state>;
    delete o.base;
    delete o.otherBases;
    delete o.research;
    delete o.sitesSeen;
    const loaded = fromSave(old);
    expect(loaded.base.id).toBe('base-jezero');
    expect(loaded.otherBases).toEqual([]);
    expect(SAVE_VERSION).toBe(5);
    expect(SITE_BY_ID.jezero.home).toBe(true);
  });
});
