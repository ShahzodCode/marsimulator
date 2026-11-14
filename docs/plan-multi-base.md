# Plan: base sites, new bases, population and research

Version 3, 2026-11-14. Includes the user's answers on population, separate resources, the research tree and
real-data sites. Sources: S8, S17–S26 in `docs/sources.md`.

**Goal.**
- Every Mars tile holds real NASA-studied base sites, each with real strengths and weaknesses.
- The orbiter reveals the sites while it maps.
- Bases are founded by crew convoys from existing bases. **No one comes from Earth**: the population grows
  on Mars and spreads into free beds.
- A research skill tree unlocks specialised mega-buildings and better orbiters. The best orbiter finds the
  deep groundwater.

---

## Decisions made (user, 2026-11-14)

1. **Population grows on Mars only, limited by beds.** No recruits from Earth. Half the people are women.
   With free beds, a base grows by 50% every 90 sols. More empty beds make it faster, and a completely
   empty dome speeds it up most. With no free bed, growth stops.
2. **Each base keeps its own resources.** Clicking a base's Central Storage Depot shows everything that
   base holds.
3. **Research is a branching skill tree.** It unlocks new buildings and specialised mass-production drills.
   These are slow to build and have strong pros and some cons. Deep groundwater is found only after the
   orbiter is upgraded.
4. **Sites come from real NASA data.** Every site must have enough of a resource for at least one resource
   factory, and flat enough ground for a base and transport routes.

---

## Phase 0 · Fix the expedition experience

The rules work; the problem is finding them.
- Open the panel on the best next tile.
- Show a step tracker (Map → Crew → Base/Outpost) with reasons for locked steps.
- Let the player book the crew while the orbiter is still mapping.
- Show active trips in the HUD.
- Add a test for the whole flow.

Convoys reuse this code.

## Phase 1 · Real base sites + reveal while scanning

**Where the sites come from.** Only places NASA has studied or certified as flat and safe:
- the 47 candidate Exploration Zones from the 2015 human landing site workshop (S17), all within ±50°;
- NASA landing sites, past and present: Viking 1 and 2, Pathfinder, Spirit, Opportunity, Phoenix (68° N,
  for the north polar tile), Curiosity, InSight, Perseverance. A landing site is flat and safe by
  definition;
- final candidate sites from NASA's rover site selections (Curiosity, Perseverance): for example Mawrth
  Vallis, Eberswalde, Holden, NE Syrtis, Columbia Hills;
- the south polar tile: the Mars Polar Lander target area (76° S), which NASA chose for flat ground.

**Rules for each site** (checked by a unit test over the whole data file):
- At least one factory resource with a real source behind it: an ice signal (SWIM, S22; polar caps), iron
  (hematite at Meridiani), hydrated clays, or good regolith. A site with only "some regolith" does not count.
- Flat ground: our terrain's slope within the build radius and along the first stretch of each route must
  be below a limit (game value). NASA sites already pass this in reality; the test makes sure our terrain
  agrees.
- Target **2–4 sites per tile**. If a tile has fewer real sites, we **report the gap**; we don't invent
  sites. The coverage table goes into this file when the data is collected.

**Data:** `src/data/baseSites.ts`: `{ id, regionId, name, lat, lon, traits, blurb, sources }`. Some traits
are worked out from latitude and our terrain height; the rest are written by hand from the sources. Trait
table:

| Trait | Basis | Effect in game |
|---|---|---|
| ☀️ Sunlight (worked out) | Latitude; polar night | Solar × about cos(latitude); no solar in polar winter |
| 🥶 Cold (worked out) | Latitude + height; polar nights about −123 °C (S25) | Heating power × 1.2–2.5 |
| 🧊 Too cold for domes | Polar caps (S25) | No greenhouse; habitat needs insulation (iron) |
| 🌬️ Thick air / low ground (worked out) | Height; Hellas ≈ 1,155 Pa (S24) | Less radiation, so cheaper habitat shielding |
| 🌫️ Dusty | TES Dust Cover Index (S26) | Solar −20%; digging +30% |
| ❄️ Shallow ground ice | SWIM (S22) | Ice drill ×1.5–2, large reserve |
| 🏔️ Ice cap / buried glacier | Polar caps; SWIM glaciers (S22) | Huge ice reserve |
| ⛏️ Hematite iron | Meridiani (Opportunity) | Iron refinery ×2, big reserve |
| 🧱 Hydrated clays | Jezero, Mawrth, Nili Fossae | Water bonus from regolith; science bonus |
| 🕳️ Lava-tube cave | Arsia Mons skylights (S23) | Extra beds and cheap shielding (only with research) |
| 🌊 Deep groundwater | InSight, 11.5–20 km down (S21) | **Hidden** until the Mk III orbiter (Phase 7) |
| ⚖️ Balanced | Mid-latitude, middle height | No penalties |

**Reveal.**
- Sites appear one by one at ⅓, ⅔ and 100% of the scan, each with a pin and a toast.
- With the basic orbiter, some traits show as "likely".
- The crew confirms them on arrival, or a better orbiter does (Phase 7).
- The Exploration panel lists the site cards for each tile.

## Phase 2 · Data model: many bases, separate resources

- Add `Base { id, name, siteId, regionId, lat, lon, foundedSol, buildings, roads, resources, storage,
  power, colony: { colonists, women, beds, growth }, deposits }` and `activeBaseId`.
- Shared across bases: time, XP, research, maps, missions.
- The simulation runs each base on its own, with its own site modifiers and its own sun.
- The HUD shows the **active base's** resources. **Clicking the Central Storage Depot** opens that base's
  full inventory: every resource, its storage limit, and what is coming in or going out per sol.
- Save version 4: an old save becomes `bases[0]` = Jezero Base. Add a migration test.

## Phase 3 · Showing several bases

- Detailed ground only for the active base, rebuilt at its site when the player switches. This replaces the
  fixed `SETTLEMENT_FRAME`.
- Other bases show as pins plus a few low-detail models.
- HUD base switcher. About 10 files move from `SETTLEMENT.lat/lon` to the active base.

## Phase 4 · Population growth (per base)

Rules (game values, labelled as such in the UI):
- **Women = half the colonists** (rounded down). With no women, there's no growth. Every founding crew is
  1 woman + 1 man.
- **Base rate:** +50% per 90 sols, i.e. per sol `ln(1.5) / 90 × colonists`, collected into a "growth"
  counter. Each time it passes 1, a new colonist is born, but only into a free bed.
- **Free beds speed it up:** rate × (1 + 2 × free beds / total beds). A brand-new empty dome roughly
  triples the rate until it fills up.
- **No free bed → no growth.** The counter stops and the UI says "All beds are full. Build a Habitat Dome
  so families can grow."
- A newborn needs a bed, food, water and oxygen from the day it's born.
- Display: a growth bar on the base panel ("next colonist in ~12 sols") and a toast for each birth.

Honest teaching note (fun fact in the UI): a real human pregnancy lasts about 9 months (about 270 sols).
The game speeds family growth up, just as it speeds up the orbiter and rovers. Scientists also don't yet
know how Mars gravity and radiation would affect pregnancy. Source to add.

**Suggestion (needs your OK):** also pause growth while the base is short of food, water or oxygen, so a
base in trouble doesn't get worse.

People spreading out: they leave a full base by founding convoy (Phase 5). Later, they move by themselves
along transport routes to bases with free beds (Phase 8).

## Phase 5 · Founding convoys

1. Pick a revealed site within convoy range (game value, about 3,000 km) of **any** base.
2. Choose the **starting base**. It gives up 1 woman + 1 man and the founding kit:
   - depot parts (game value: about 300 kg iron + 200 kg regolith);
   - a starter solar panel + battery;
   - supplies for the trip plus the first sols.
   Cargo rovers each carry 998 kg (S8), so the convoy size depends on the kit's weight.
3. The drive works like an expedition: daylight only, storms, route on the globe, new rover models.
4. On arrival: a new base with its depot at the site. The crew lives in the rover until the first habitat is
   built, and the "likely" traits get confirmed.
5. A rank or research gate controls how many bases the player can have.

The old explore + outpost flow stays as the cheap way to tap a resource without a base.

## Phase 6 · Site modifiers in the simulation

- `SiteModifiers { solarMult, heatingMult, recipeMult, depositSize, bannedBuildings, shieldingCost, bedBonus }`,
  applied in `PowerManager`, `ProductionManager`, `ConstructionManager` and the build menu.
- Banned buildings say why.
- Unit tests for each trait.

## Phase 7 · Research skill tree

- **Research Lab** building (already promised at rank Settlement Commander). Colonists working there make
  research points (RP) per sol. Each technology takes RP plus sols.
- The Research panel becomes a visual tree. A node unlocks when its parent is done. Most nodes unlock
  buildings; some upgrade existing ones.

Draft branches. Each mega-building is slow to build, very strong, and has a real cost.

| Branch | Nodes (in order) | Example pros / cons |
|---|---|---|
| ⚡ Energy | Battery Bank → Dust-cleaning panels → **Compact Fission Reactor** (NASA Kilopower/KRUSTY, source to add) → Laser power links | Fission: steady power day and night and in storms / very expensive, fixed spot |
| ⛏️ Mining | Regolith Bricks → **Bucket-Wheel Megadigger** → **Hematite Strip Mine** (iron sites only) | Megadigger ×4 regolith / 30 sols to build, 120 kW, kicks up dust (−10% solar at that base) |
| 🧊 Water | Better ice drill → **Glacier Mine** (glacier/ice-cap sites only) → **Deep Aquifer Drill** | Glacier Mine ×5 water / only on ice sites, high power. Deep drill: endless water / enormous cost, very long build, needs the Mk III discovery |
| 🌱 Life | Advanced Hydroponics → **Big Dome** (more beds, so faster growth) → **Lava-Tube Habitat** (cave sites only) | Lava tube: lots of beds, radiation-safe / only at cave sites, long build |
| 🛰️ Orbit | **Orbiter Mk II** (faster scans, confirms "likely" traits) → **Orbiter Mk III with ground-penetrating radar** (like the real SHARAD and MARSIS radars) → reveals buried glaciers clearly and **deep groundwater** | Mk III needs a lot of RP and iron to "launch" |
| 🚙 Transport | Longer convoy range → Rover routes → Fuel hopper (methane from the Sabatier reaction) | — |

**Deep groundwater** (S21) appears **only after the Mk III orbiter** rescans a tile. In reality it was
found by InSight's seismometer, not a satellite. The UI can say "the radar orbiter and seismic data point
to water 11.5–20 km down". The Deep Aquifer Drill is honestly labelled as future technology.

## Phase 8 · Transport routes, migration and lasers (later)

**Built 2026-11-15:**
- **Pipelines** (`src/data/logistics.ts`, `src/simulation/Logistics.ts`). A Pipeline Pump Station stands at each
  end. The player drags from one base to another with the pipeline tool (P), just like laying roads. Each
  pipeline costs a building's worth plus more per 100 km, and robots take some sols to lay it. When it works,
  both bases even out every resource (as a share of their storage). The bases on one network also pay for
  each other's buildings when one runs short.
- **Cargo Hauler Garage**: 3 haulers (based on ATHLETE, S34). The player drags the garage's arrow onto a
  base, sets the load with sliders in the building panel, and presses Send. The haulers drive in daylight,
  unload, and come back. Anything that doesn't fit at the other base rides back home.

- Rover routes and fuel-hopper routes as in version 1.
- Along a route, colonists **move by themselves** from full bases to bases with free beds.
- Laser power links: direct within line of sight, or through an orbiting relay for far bases (S19).

---

## Still open

- Pause growth during shortages (recommended above)? Your call.
- Sources to read before coding:
  - the S17 workshop list (site names and coordinates);
  - the Curiosity and Perseverance final-candidate lists;
  - Phoenix and Mars Polar Lander coordinates;
  - a NASA page for the Hellas numbers;
  - NASA Kilopower/KRUSTY;
  - human pregnancy length, and what NASA says about pregnancy and space radiation;
  - S8: how long a crew can live in the SEV.
