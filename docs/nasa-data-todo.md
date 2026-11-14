# NASA data to-do

A list of fixes and ideas for later. Source IDs (S1–S5) and the full links are in [sources.md](sources.md).
When an item is done, tick it and update the matching row in `sources.md`.

## A. Fixes: the game doesn't match its cited source

- [ ] **Oxygen per colonist.** `src/data/resources.ts` uses `COLONIST_NEEDS_PER_SOL.oxygen = 0.84`, and the comment says it comes from BVAD Rev2. The Rev2 nominal value is **0.895 kg/CM-d** (S2, Table 3-31, p. 58); 0.84 is only in Table 3-23 (short mission, p. 47). Change it to 0.895, or keep 0.84 and cite Table 3-23. After the change, re-run the "starting settlement" surplus test and retune if it fails.
- [ ] **Full-scale MOXIE: 2–3 kg O₂/h at 25 kW** (`src/data/recipes.ts`, `MOXIE_FULL_SCALE`). Neither NASA page (S4, S5) gives these figures. The 2–3 kg/h figure comes from news articles quoting MIT, and the 25 kW figure has no source at all. Find a NASA or MIT paper (e.g. Hecht et al., MOXIE) or mark these as game values.
- [ ] **MOXIE "toaster-sized"** (`src/data/buildings.ts`, MOXIE fun fact). NASA says "microwave-oven-size" (S4) or "about the size of a car battery" (S5). Fix the wording.

## B. Values that still need a source

- [ ] ISS 98 % water recovery (S3): open the NASA page itself and confirm it.
- [ ] Jezero Base coordinates 18.38° N, 77.58° E (`src/data/settlement.ts`)
- [ ] Mars place positions (`src/data/marsFeatures.ts`, `src/data/regions.ts`): cite USGS or NASA pages
- [ ] Mars soil about 18 % FeO from rover APXS (`src/data/recipes.ts`)
- [ ] Electrolysis about 50 kWh per kg H₂ (`src/data/recipes.ts`, `ELECTROLYSIS`)
- [ ] "Night lasts about 12 h" (`src/data/buildings.ts` battery fun fact, `src/data/power.ts` `sunFactor`)
- [ ] Ice and iron finds in `src/data/missions.ts` (SHARAD radar, Opportunity's hematite "blueberries", polar caps): add NASA links

## C. Places that could use NASA data (most impact first)

1. [ ] **Greenhouse crops**: `crops` in `src/data/recipes.ts` uses made-up numbers. Use BVAD Table 4-91 (p. 174) for oxygen, CO₂ and water per m² per day by crop (lettuce, beans, rice and others), give the greenhouse a real growing area, and maybe make each crop its own choice.
2. [ ] **Carbon dioxide**: colonists breathe out 1.085 kg CO₂ per day (BVAD Table 3-31). Track it as a resource used by plants or a CO₂ scrubber.
3. [ ] **Water use**: the game counts only drinking and basic hygiene water. A "Mature Planetary Base" adds showers, laundry and dish washing, 9.12 kg per person per day in total (BVAD Table 4-20, p. 72). This could be a later "comfort" upgrade.
4. [ ] **Building power**: habitat 5 kW, excavator 4 kW, refinery 10 kW and grow-lights 8 kW are guesses. Use BVAD Table 3-2 (typical ISS system power).
5. [ ] **Seasons and dust storms**: the Mars year is 686.98 days, the tilt is 25.19°, pressure ranges 4.0–8.7 mb, and dust-storm winds reach 17–30 m/s (S1). Change sunlight with the seasons and lower solar output during dust storms.
6. [ ] **Temperature**: the Viking 1 site ranges from −89 to −31 °C over a day (S1). Use it for habitat heating power at night.
7. [ ] **Habitat size**: housing is 6 per habitat (a game value). Use BVAD Table 3-8 (living space for 4- and 6-person crews).
8. [ ] **Batteries**: the 600 kWh battery bank is a guess. Use BVAD Table 3-17 (advanced rechargeable batteries).
9. [ ] **Rocket fuel goal**: a crewed launch from Mars needs about 33–50 t of propellant, and Mars-made oxygen can supply more than 75 % of it (S5). Make it a long-term mission that uses the stored hydrogen.
10. [ ] **Survey rewards**: link each region's "find" text to its NASA source (see B).
