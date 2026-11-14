# Plan: multiple bases, transport routes and power lasers

Goal: the player grows from Jezero Base to several bases across Mars. New bases are founded by **landing**
at NASA candidate sites. Later the player links bases with **transport routes** (crew rovers nearby, fuel
hoppers far away) and **laser power links**. Sources are S17–S20 in `docs/sources.md`.

Order: Phase 0 → 1 → 2 → 3 → 4 → 5. Each phase ships on its own and keeps old saves working.

---

## Phase 0 · Make expeditions usable (do first)

What I found (2026-11-14): the rules work. A test on a fresh game sends a crew to all five regions next to
the home region (MC-05, MC-06, MC-12, MC-14, MC-21: 1,800–3,100 km, 8–14 sols round trip). So the problem
is how the player gets there, not the simulation. Likely causes:

1. The **Send crew rover** button only appears after the orbital map finishes (about 2.5 sols, roughly
   100 s at 1×). Nothing says "map first, then send a crew".
2. The panel opens on the home region, which shows no actions. The player has to scroll the list and pick
   a region.
3. Only regions **next to an explored region** can be visited. Most regions show a disabled button.
4. A trip takes 8–14 sols (5–9 minutes at 1×, plus nights and storms) before anything happens.

Fixes:
- When the panel opens, select the best next region automatically (an open frontier region, closest first).
- Show a three-step tracker (Map → Crew → Outpost) for the selected region. Steps that are locked say why.
- Mark regions where a crew can go now on the map, and list them first.
- Let the player choose a crew rover right after starting a scan ("Send crew when mapped"), so there is no
  extra wait.
- Show the rover's route on the globe right away and show its progress in the HUD mission strip.
- Add a test for the full flow: scan → expedition → explored → outpost, driven by `SimulationEngine`.

Open question for the user: what exactly happened when you tried? (No button, button greyed out, crew left
but never arrived?) This decides which fix comes first.

---

## Phase 1 · Data model: many bases (the big refactor)

Today the whole `GameState` is one base: `buildings`, `roads`, `resources`, `storage`, `power`, `colony` and
`deposits`. Also `SETTLEMENT.lat/lon` is used in about 10 files (terrain, grid, camera, rover routes,
labels, info panel).

New shape:

```ts
interface Base {
  id: string; name: string; siteId: string; regionId: string; lat: number; lon: number;
  foundedSol: number;
  buildings; roads; resources; storage; power; colony; deposits;
}
GameState {
  bases: Base[]; activeBaseId: string;          // per base
  timeSols, progression, missions, outposts, discoveredRegions, exploredRegions, ... // shared
}
```

- **Each base keeps its own resources.** This is realistic and gives the transport routes a reason to
  exist. Global progression (XP, rank, research, map) stays shared.
- `SimulationEngine` runs the production, power and colonist loop for each base. Sunlight comes from that
  base's longitude, so bases on opposite sides of Mars have day and night at opposite times.
- Missions and outposts get `fromBaseId`. Routes start from that base, not from `SETTLEMENT`.
- Save version 4: an old save becomes `bases[0]` = Jezero Base. Add a migration test.
- Store actions (`placeBuilding`, `launchExpedition`, …) act on the active base.

---

## Phase 2 · Showing several bases

- `terrainGen` bakes one high-detail flattened patch at `SETTLEMENT_FRAME`. Change it to a patch at any
  site: build the detailed ground only for the **active** base, and regenerate it when the player switches.
  Other bases show as a low-detail marker with a few building models.
- `SettlementManager` gets a `Base` instead of the global state. One instance lives at a time and is
  swapped on switch.
- HUD base switcher (name, resource summary, alerts badge). The "home" camera button flies to the active base.
- `MapLabels`, `InfoPanels` and `CameraController` read the active base, not `SETTLEMENT`.

---

## Phase 3 · Founding new bases by landing (main way to expand)

**Landing sites.** New file `src/data/landingSites.ts`. It holds the candidate Exploration Zones from
NASA's 2015 workshop (S17): name, lat/lon, source, and the MC tile it lies in. NASA has not *approved*
any site. These are *proposed candidates*, and the game should say so honestly ("NASA candidate site").
To do: read the 47 names and coordinates from the workshop record and log them in sources.md.

Rules (S18):
- Latitude within ±50°, elevation at or below +2 km (MOLA). Check against our terrain height and explain
  in the UI: "Too high: the air is too thin for parachutes."
- The site's region must be **mapped from orbit**. A crew expedition is *not* required, so expansion no
  longer depends on expeditions.
- Show a 100 km Exploration Zone ring around the site (S18).
- At most one base per site. Rank gates the 2nd, 3rd, … base.

**Landing flow.**
1. Pick a site → see the reason for each rule (pass/fail) and the costs.
2. Book a lander for the next **Earth launch window**. Real windows come about every 26 months; the game
   shortens this with a multiplier and shows a countdown. Source to add before coding.
3. A cargo lander arrives first (prebuilt habitat, solar farm, life support, starting supplies). The crew
   lands on a later window, or after a short gap at game speed.
4. Crew: new colonists from Earth, plus an option to move some from an existing base.
5. Entry, descent and landing are shown on the globe (flight arc + flare), then the base appears.

**Decision needed:** what pays for a landing? Options: (a) each launch window brings one free landing
package, (b) it costs resources at the home base (in-situ parts) plus a fixed Earth shipment, (c) a new
"Earth support" points currency earned by goals. Recommendation: **(a) with a rank gate**. It is the most
realistic (cargo comes from Earth) and the simplest for kids.

---

## Phase 4 · Dedicated transport routes between bases (late game)

A `TransportRoute { id, fromBaseId, toBaseId, mode, cargo: resource→kg per trip, enabled }`.

- **Rover route** (`mode: 'rover'`): uses the crew-rover numbers already in the game (SEV speed and
  payload, S8, with the 8× game multiplier). Route length and climb come from `MissionManager.planRoute`
  (now base to base). Building one costs iron and regolith per km plus a garage at each end. Trips drive
  only in daylight and stop for storms, the same as expeditions. Allowed only below a distance limit
  (game value, about 3,000 km).
- **Hopper route** (`mode: 'hopper'`): a rocket that flies between far bases. It burns **methane + oxygen**
  made on Mars: the Sabatier reaction (CO₂ + H₂ → CH₄ + H₂O) plus the oxygen we already make (MOXIE,
  S4/S5). Needs a new `methane` resource, a `sabatier_plant` building, and a `launch_pad` at each end.
  Fuel per trip grows with distance. Payload is a game value until a source is found.
- Routes panel: list the routes, a cargo slider for each resource, an "in transit" bar, and the vehicle
  moving on the globe (reuse `RoverFleet`).
- Outposts keep delivering to the nearest base (`fromBaseId`).

---

## Phase 5 · Laser power links (late game)

Realism check: a laser needs a clear line of sight. Mars is small, so the horizon is only a few km away,
and a ground laser cannot reach a base on the other side of the planet. NASA's studies beam power **from
orbit** (S19), and NASA is funding laser power beaming work for the Moon and Mars (S20). So:

- **Laser link** building: transmitter or receiver at a base.
- Bases within line of sight: a direct link. In practice this means an outpost next to the base.
- Far bases: need a **power relay satellite** (research + orbital launch). Power goes up to the satellite
  and down to the other base.
- The player sets kW to send. The receiver gets `kW × efficiency`. Efficiency is a game value until we
  find a NASA figure, and the UI marks it as an estimate. Dust storms lower it (Opportunity's storm, S11).
- The teaching moment: a base in daylight can power a base in night. Bases on opposite sides of Mars
  share their sunshine. Show both bases' day/night on the globe while the beam is on.
- A **comms relay orbiter** (cheaper, earlier) is required before a second crewed base. It also unlocks
  the power relay.

---

## Files touched (estimate)

| Phase | Files |
|---|---|
| 0 | `ui/ExplorationPanel.ts`, `ui/HUD.ts`, `planet/RoverFleet.ts`, new test |
| 1 | `state/types.ts`, `state/factory.ts`, `state/gameStore.ts`, `simulation/*`, `persistence/SaveSchema.ts` |
| 2 | `planet/terrainGen.ts`, `settlement/*`, `planet/CameraController.ts`, `ui/MapLabels.ts`, `ui/InfoPanels.ts`, `core/Game.ts` |
| 3 | new `data/landingSites.ts`, new `ui/LandingPanel.ts`, `simulation/MissionManager.ts` (landing missions) |
| 4 | new `simulation/TransportManager.ts`, `data/buildings.ts`, `data/resources.ts` (methane), new routes panel |
| 5 | new `simulation/PowerLinkManager.ts`, `simulation/PowerManager.ts`, `data/buildings.ts` |

## Sources still to look up before coding

- The 47 Exploration Zone names and coordinates (S17 workshop record).
- Earth–Mars launch window period (about 26 months).
- DRA 5.0 crew size and cargo-before-crew plan.
- A hopper payload/fuel figure, or mark it as a game value.
- Laser power beaming end-to-end efficiency, or mark it as a game value.
