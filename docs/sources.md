# Sources

This file lists every fact the game takes from an outside source: which value, where it is used, the exact
link, and whether someone has checked it against that link. **Add a row whenever a real-world number goes
into the game.** If a value is a game choice or an estimate, mark it that way so nobody mistakes it for NASA data.

Status key:
- **Verified**: checked against the linked page on the date shown.
- **Mismatch**: the linked source says something different from the game. See the note.
- **Unverified**: the code cites this source, but nobody has checked the link yet.
- **Game value / estimate**: not from a source on purpose.

---

## 1. Sources

| ID | Source | Link | Accessed |
|---|---|---|---|
| S1 | NASA Mars Fact Sheet (NSSDCA, NASA Goddard; page "Last Updated 19 May 2025") | https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html | 2026-11-14 |
| S2 | Life Support Baseline Values and Assumptions Document (BVAD), NASA/TP-2015-218570 **Rev2**, Feb 2022, Ewert, Chen & Powell, NASA JSC | Record: https://ntrs.nasa.gov/citations/20210024855 · PDF: https://ntrs.nasa.gov/api/citations/20210024855/downloads/BVAD_2.15.22-final.pdf | 2026-11-14 |
| S3 | NASA: "NASA Achieves Water Recovery Milestone on International Space Station" (June 2023) | https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/ | 2026-11-14 (search result only) |
| S4 | NASA/JPL: "NASA's Oxygen-Generating Experiment MOXIE Completes Mars Mission" (6 Sep 2023) | https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/ | 2026-11-14 |
| S5 | NASA STMD: "Mars Oxygen In-Situ Resource Utilization Experiment (MOXIE)" (updated 13 Feb 2024) | https://www.nasa.gov/space-technology-mission-directorate/tdm/mars-oxygen-in-situ-resource-utilization-experiment-moxie/ | 2026-11-14 |

Older BVAD editions (do not cite for current values): original 2015, https://ntrs.nasa.gov/citations/20150002905 ·
Rev1 2018, https://ntrs.nasa.gov/citations/20180001338

---

## 2. Values used in the game

| Value in game | Where | Source | What the source says | Status |
|---|---|---|---|---|
| Sunlight at Mars 586.2 W/m² | `src/data/power.ts` `SOLAR.irradianceKwPerM2` | S1 | "Solar irradiance (W/m2) 586.2" | Verified |
| Sol = 24.6597 h | `src/data/recipes.ts` `SOL_HOURS` | S1 | "Length of day (hrs) 24.6597" | Verified |
| Oxygen per colonist 0.84 kg/sol | `src/data/resources.ts` `COLONIST_NEEDS_PER_SOL.oxygen` | S2 | Rev2 nominal value is **0.895 kg/CM-d** (Table 3-31, p. 58). 0.84 kg appears only in Table 3-23 (short-mission reference crewmember, p. 47). | **Mismatch**: the code comment says "BVAD Rev2 ≈ 0.84". Either change it to 0.895 or cite Table 3-23. |
| Water per colonist 2.9 kg/sol (2.5 drinking + food + 0.4 hygiene) | `src/data/resources.ts` `COLONIST_NEEDS_PER_SOL.water` | S2 | Table 4-20 (p. 72), "Early Planetary Base": total human consumption 2.50, personal hygiene 0.4 kg/CM-d. The same column lists 0.50 urinal flush and 1.08 shower, for a total of 4.48 kg/CM-d. | Verified (the game leaves out flush and shower) |
| Food per colonist 1.8 kg/sol | `src/data/resources.ts` `COLONIST_NEEDS_PER_SOL.food` | S2 | ISS food planning value 1.83 kg/CM-d, later raised to 2.39 kg/CM-d including packaging (food section of the BVAD). Food solids without packaging: 0.800 kg/CM-d (Table 3-31). | Verified (close to 1.83) |
| Water recovery 98 % | `src/data/resources.ts` `WATER_RECOVERY` | S3 | 98 % total water recovery on the US segment of the ISS, made possible by the Brine Processor Assembly. Before it, recovery was 93–94 %. | Verified from search result; the page itself was not opened |
| MOXIE made 6–12 g O₂ per hour | `src/data/recipes.ts` comment | S4 | "At its most efficient, MOXIE was able to produce 12 grams of oxygen an hour … twice as much as NASA's original goals" (so the goal was about 6 g/h, which is our calculation). 122 g in total over 16 runs, 98 % purity or better. | Verified |
| First oxygen on Mars, April 2021 | `src/data/buildings.ts` MOXIE fun fact | S5 | "On April 20, 2021, MOXIE created oxygen on Mars for the first time." | Verified |
| "Toaster-sized" MOXIE | `src/data/buildings.ts` MOXIE fun fact | S4 / S5 | S4 says "microwave-oven-size", S5 says "about the size of a car battery". | **Mismatch**: change the wording |
| Full-scale MOXIE: 2–3 kg O₂/h at about 25 kW | `src/data/recipes.ts` `MOXIE_FULL_SCALE` | none yet | S5 only says "about 100 times larger than the test model". Neither NASA page gives a kg/h or kW figure for a full-scale unit. A news search turned up "2 to 3 kg per hour" (space.com and others, quoting MIT), which is not a NASA source. | **Unverified**: 25 kW has no source |
| Mars air is about 95 % CO₂ | `src/data/resources.ts` oxygen description | S1 | CO₂ 95.1 % by volume (S5 says "about 96%") | Verified |
| Sunlight a bit less than half of Earth's | `src/data/buildings.ts` solar fun fact | S1 | Ratio to Earth 0.431 | Verified |
| Night colder than −70 °C | `src/data/buildings.ts` battery fun fact | S1 | Viking 1 site: −89 to −31 °C | Verified |
| Night lasts about 12 h | `src/data/buildings.ts` battery fun fact; `src/data/power.ts` `sunFactor` | none | Depends on latitude and season; no source checked | Unverified (simplification) |
| Water electrolysis 9 kg water → 8 kg O₂ + 1 kg H₂ | `src/data/recipes.ts` `ELECTROLYSIS` | chemistry (molar masses) | not applicable | Textbook fact |
| Electrolysis about 50 kWh per kg H₂ (minimum 39.4) | `src/data/recipes.ts` `ELECTROLYSIS.kwhPerKgH2` | none | not applicable | Unverified: industry figure, needs a source |
| Mars soil about 18 % FeO (rover APXS) | `src/data/recipes.ts` comment | none | not applicable | Unverified |
| Jezero Base at 18.38° N, 77.58° E | `src/data/settlement.ts` | none | not applicable | Unverified |
| Mars place positions (craters, volcanoes, regions) | `src/data/marsFeatures.ts`, `src/data/regions.ts` | "USGS / NASA", no link | not applicable | Unverified |
| Ice finds (SHARAD radar, mid-latitude ice, polar caps) | `src/data/missions.ts` `REGION_REWARDS` text | none | Ice amounts are game values | Facts unverified; amounts are game values |
| Panel efficiency 25 %, air transmission 0.85 | `src/data/power.ts` | none | not applicable | Estimate |
| Hen water and egg numbers | `src/data/recipes.ts` `HENS` | poultry averages, no link | not applicable | Estimate |
| Solar farm area, MOXIE 1/10 scale, building costs, storage sizes, starting stock, ice reserve, depot supply | `src/data/*` | none | not applicable | Game value |

---

## 3. Other verified data, ready to use

These values were read from the sources above but are not in the game yet.

**From S1 (Mars Fact Sheet):**
- Gravity 3.73 m/s² (0.380 × Earth); mean radius 3389.5 km
- Year 686.980 Earth days; obliquity 25.19° (gives Mars seasons)
- Surface pressure 6.36 mb (4.0–8.7 mb with the seasons)
- Average temperature −59 °C; Viking 1 site daily range −89 to −31 °C
- Air: CO₂ 95.1 %, N₂ 2.59 %, Ar 1.94 %, O₂ 0.16 %, CO 0.06 %
- Wind: 2–7 m/s in summer, 5–10 m/s in fall, 17–30 m/s in a dust storm (Viking sites)

**From S2 (BVAD Rev2):**
- Table 3-31 (p. 58): CO₂ breathed out 1.085 kg/CM-d; food energy 12.778 MJ/CM-d (about 3,050 kcal); urine water 1.420 kg/CM-d; metabolic water 0.490 kg/CM-d
- Table 4-20 (p. 72), "Mature Planetary Base": total water use 9.12 kg/CM-d (shower 1.08, laundry 1.1, dish wash 3.54); plant growth water 4.00 kg/m²·d
- Table 4-91 (p. 174), crop gas exchange per m² of growing area per day (examples): lettuce O₂ 7.78 g, CO₂ taken in 10.70 g, water 2.10 kg; dry bean O₂ 30.67 g; rice O₂ 36.55 g

**From S4 / S5 (MOXIE):**
- A crewed Mars launch needs about 33–50 t of propellant; oxygen made on Mars could supply more than 75 % of it

---

## 4. Lookup log

Every outside lookup, in order.

| Date | What was looked up | Where | Result |
|---|---|---|---|
| 2026-11-14 | BVAD record and Rev2 PDF | ntrs.nasa.gov (API and full-text PDF) | Downloaded; read Tables 3-23, 3-31, 4-20, 4-91 |
| 2026-11-14 | Mars Fact Sheet | nssdc.gsfc.nasa.gov | Read; values in § 2 and § 3 |
| 2026-11-14 | MOXIE final results and full-scale plans | nasa.gov (S4, S5) | Read; no full-scale kW figure found |
| 2026-11-14 | ISS 98 % water recovery | web search, nasa.gov result (S3) | Confirmed from the search summary; the page itself was not opened |
| 2026-11-14 | MOXIE full-scale 2–3 kg/h | web search (space.com, CNN and others) | Figure appears in news reports quoting MIT; no NASA page found |
