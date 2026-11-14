# Asset Request — "Mars Colony Command" asset pack v2

> Copy everything below this line into the other AI.

---

You are a 3D/technical artist building an **asset pack for a browser game**. Deliver **one single `.zip` file**. Everything must work by dropping files into the project — no build tools, no plugins, and at most **one small optional HTML file** of code (a viewer, described in §7). Read the whole brief before you start.

## 1. The game (context)

**Mars Colony Command** is a browser-based Mars settlement manager for **kids aged 7–12**. It runs on **Three.js (r187) + TypeScript + Vite**. The player looks at a stylised 3D Mars from an **always top-down orbital camera** that zooms from the whole planet down to a settlement in Jezero Crater. They place buildings on a grid, connect them with roads, balance resources (regolith, iron, water, oxygen, food, hydrogen, electricity), and send survey rovers to explore regions of Mars.

Tone: **friendly, readable, toy-like but believable**. Think "a clean NASA concept model a kid could recognise" — chunky shapes, clear silhouettes, bright trim colours, glowing windows. Everything is based on real Mars technology (NASA habitats, MOXIE, Perseverance-style rovers), simplified. No weapons, nothing scary, no text or logos on the models (no NASA "meatball", no brand names, no flags).

Because the camera mostly looks **down from above at 30–70° pitch**, **roofs and top surfaces matter most**. Give tops interesting detail (vents, hatches, panels, pipes, dust tint) and keep silhouettes readable from far away.

## 2. Technical rules (must follow exactly)

**Format**
- `.glb` (binary glTF 2.0), one model per file. Textures (if any) **embedded** in the GLB.
- **No Draco, no meshopt, no KTX2/Basis** compression — the game's loader is a plain `GLTFLoader`.
- No cameras, no lights, no armatures/skinning. Simple **node animations are not used**; motion comes from the `spin` property (below).
- PBR **metallic-roughness** materials only (Principled BSDF → glTF). Vertex colours are fine.

**Scale, axes, origin**
- **1 unit = 1 settlement grid cell.** Footprints below are given in cells (width = east/west, depth = north/south).
- glTF is **+Y up**. In Blender terms: +X east, +Y north, +Z up, exported with "+Y Up" ticked.
- The model's origin (0,0,0) is the **centre of its footprint at ground level**. Nothing may stick out beyond the footprint in X/Z (small overhangs ≤ 0.2 cells are OK).
- Buildings sit on uneven terrain: extend a **foundation/plinth down to y = −0.65** so they never look like they float.
- Rotation 0 = the building's "front door / road side" faces **south (+Z in glTF)**. Roads connect to the south edge.

**Moving parts (`spin`)**
- Any node whose glTF `extras` contains `"spin": <number>` is rotated by the game at that many **radians per second around the node's local +Y axis**.
- Put each spinning part in **its own node with its origin at the pivot**. For parts that turn around a horizontal axle (wheels, fans on a wall), rotate the node so its *local* +Y lies along the axle.
- In Blender: object custom property `spin` (float) + export with "Include → Custom Properties" ticked. Name these objects `spin_<something>`.

**Materials & lighting**
- The game adds its own soft environment map; you don't need one.
- Emissive strength **≤ 2.6** (higher gets clamped). For "glow" materials use base colour black + emissive colour.
- Glass: alpha-blend, alpha ≈ 0.2–0.3, roughness ≈ 0.05. Keep glass panels to a minimum; they are expensive.
- Please **reuse this palette** so new models match the existing ones (name your materials with these names where they fit — identical names let the game share them):

| name | base colour | metallic | roughness | notes |
|---|---|---|---|---|
| hull_white | #e9e6df | 0.05 | 0.42 | main hull |
| hull_offwhite | #d6d1c7 | 0.05 | 0.55 | secondary panels |
| panel_grey | #b9b5ad | 0.1 | 0.6 | |
| trim_orange | #e2622a | 0 | 0.45 | accent stripes |
| trim_teal | #2aa596 | 0 | 0.45 | accent stripes |
| safety_yellow | #efb128 | 0 | 0.5 | railings, hazard |
| signal_red | #c8322a | 0 | 0.5 | |
| steel | #a9b0b8 | 0.85 | 0.32 | |
| aluminium | #c9ced3 | 0.9 | 0.25 | |
| dark_metal | #373c44 | 0.6 | 0.45 | machinery |
| rubber_black | #1d1f23 | 0 | 0.85 | tyres, seals |
| mli_gold | #d7a640 | 1.0 | 0.28 | insulation foil |
| copper | #b8703e | 1.0 | 0.35 | pipes, coils |
| sintered_regolith | #8f8072 | 0 | 0.95 | foundations, bricks |
| pad_regolith | #a39282 | 0 | 1.0 | landing/ground pads |
| loose_regolith | #a4532b | 0 | 1.0 | soil heaps |
| regolith_dark | #7a3c1f | 0 | 1.0 | |
| regolith_bag | #9c6a48 | 0 | 0.95 | sandbag shielding |
| glass | #bfe3ff | 0 | 0.05 | alpha 0.22 |
| window_dark | #1c2b3a | 0.3 | 0.08 | unlit windows |
| window_warm | #2a2015 | 0 | 0.2 | emissive #ffcf8a |
| glow_cyan / glow_orange / glow_green / glow_red / glow_white | #000000 | 0 | 1 | emissive #5ff3ff / #ff8a2a / #6dff8a / #ff3b3b / #fff1d6 |

A light reddish **dust tint** near the bottom of walls is welcome (vertex colour or a small gradient texture).

**Budgets (per file)**
- Buildings: **≤ 40 000 triangles, ≤ 1.5 MB**. Vehicles/props: **≤ 12 000 triangles, ≤ 500 KB**. Tiny props/decals: ≤ 2 000 triangles.
- Textures: optional, max **1024×1024**, PNG or JPG, embedded. Prefer flat materials + bevels over textures.
- Bevel edges slightly (≈ 0.015–0.03 units) so they catch light. Apply all modifiers and transforms before export.
- Merge static parts that share a material; keep the node count low (< 60 nodes per building).

## 3. What to build (in priority order)

Do Tier A completely before Tier B. Tier C is a bonus. File names must match exactly.

### Tier A — buildings that currently only have placeholder box models

| file | name in game | footprint (cells) | what it is / must show |
|---|---|---|---|
| `storage_depot.glb` | Central Storage Depot | 6 × 6 | The heart of the base; every road starts here. A low, wide warehouse/hangar with a big south-facing loading door, stacked crates and bins visible, a small maintenance robot or robotic arm (arm base may `spin` slowly ≈ 0.4), a beacon light on top. Should feel "central" — slightly taller than neighbours, strong orange/teal trim. |
| `battery_bank.glb` | Battery Bank | 4 × 4 | Rows of chunky battery cabinets on a concrete pad, thick cables to a junction box, green status lights (glow_green), cooling fins on top, a small radiator fan (`spin` ≈ 3). |
| `moxie_unit.glb` | MOXIE Oxygen Maker | 4 × 4 | A scaled-up version of NASA's MOXIE (solid-oxide electrolysis that turns Martian CO₂ into O₂): an air-intake with a dust filter and a fan (`spin` ≈ 4), a gold-foiled box (the hot "oven" core), a compressor, and white/teal oxygen tanks. Cyan glow accents. |
| `storage_silo.glb` | Storage Silo & Tanks | 5 × 5 | One or two tall bins for solids (regolith/iron/food) next to a cluster of pressurised spherical/capsule tanks for water, oxygen, hydrogen, colour-banded (blue = water, teal = oxygen, white with red band = hydrogen). Ladders, railings, pipes between tanks. |

### Tier B — new assets the game will use next

| file | footprint / size | what it is |
|---|---|---|
| `survey_rover.glb` | ≈ 1.6 long × 1.1 wide | Six-wheeled uncrewed survey rover (Perseverance-like proportions, but original design): mast with camera head, high-gain dish, solar panel deck on top, rocker-bogie legs. **Each of the 6 wheels is its own `spin_wheel_*` node** (local +Y along the axle, `spin` = 3). Front = +X. |
| `cargo_rover.glb` | ≈ 2.4 × 1.4 | Pressurised-looking utility truck that hauls crates between buildings: flat bed with 2 crates, cab with warm windows, 4–6 wheels as `spin_wheel_*` nodes. Front = +X. |
| `supply_lander.glb` | 6 × 6 | A landed cargo lander on four legs with a landing pad, open cargo ramp, a few crates on the ground, scorch marks on the pad. Used for "supply drop" events. |
| `landing_pad.glb` | 6 × 6 | Empty circular sintered-regolith pad with edge lights (glow_orange) and painted markings (geometry, not text). Flat, max height 0.3. |
| `comms_tower.glb` | 3 × 3 | Communications mast with a large dish (dish node may slowly `spin` ≈ 0.2 around vertical), blinking-red-light material on top, small equipment hut. |
| `construction_scaffold.glb` | 1 × 1 tile, ≈ 1.2 tall | A tileable scaffold/crane piece the game can scale to any footprint while a building is under construction: scaffold frame, safety_yellow rails, a tarp. Must look fine stretched to 4–10 cells (keep it simple and box-like). |
| `astronaut.glb` | ≈ 0.35 tall | Friendly low-poly astronaut in a white suit with a gold visor and orange accents, standing pose, ≤ 3 000 tris. No faces, no skeleton. |

### Tier C — props and non-3D assets (bonus, very welcome)

**Props** (`props/` folder, each ≤ 2 000 tris, origin at base centre):
`rock_small_1..3.glb`, `rock_large_1..2.glb` (Mars rocks, regolith colours), `crate.glb`, `barrel.glb`, `pipe_straight.glb` / `pipe_corner.glb` / `pipe_tee.glb` (1 cell long, copper/steel, for future fluid pipelines; pipe centre at y = 0.3, ends exactly at the cell edges so they tile), `conveyor_straight.glb` / `conveyor_corner.glb` (1 cell, belt top at y = 0.25, for solids), `solar_panel_single.glb`, `antenna_small.glb`, `floodlight.glb` (glow_white head).

**Building icons** (`icons/` folder): one **SVG per building and vehicle** (`storage_depot.svg`, `habitat.svg`, `solar_farm.svg`, `life_support.svg`, `greenhouse.svg`, `regolith_excavator.svg`, `iron_refinery.svg`, `ice_drill.svg`, `battery_bank.svg`, `moxie_unit.svg`, `storage_silo.svg`, `survey_rover.svg`, `cargo_rover.svg`). Rules: `viewBox="0 0 24 24"`, single colour using `fill="currentColor"` / `stroke="currentColor"` (opacity variations allowed), no embedded fonts, raster images, scripts or IDs, under 1 KB each. Simple and bold so they read at 20 px.

**Sound effects** (`audio/` folder): **original or CC0 only**, `.ogg` (Vorbis) 44.1 kHz, mono, normalised to about −14 LUFS, each < 150 KB:
`ui_click.ogg`, `ui_open_panel.ogg`, `build_place.ogg`, `build_complete.ogg` (short happy chime), `warning.ogg` (gentle, not alarming — kids), `rover_depart.ogg`, `rover_arrive.ogg`, `rank_up.ogg` (celebratory), and one seamless loop `ambient_wind_loop.ogg` (20–40 s, soft thin-atmosphere wind, loops with no click).

## 4. Realism notes (keep it grounded)

Base shapes on real references, simplified: NASA Mars habitat concepts, the Perseverance/Curiosity rover layout, MOXIE (a ~toaster-sized box scaled up into a plant), Kilopower-style radiators, ISS-style battery ORUs. Mars has thin air and lots of dust: no open flames, no smoke stacks pouring black smoke; use radiators, vents with faint glow, dust-coloured lower walls, sandbag (regolith_bag) radiation shielding on crewed buildings. Use only your own original designs — no recreations of real company vehicles, film/game props, or logos.

## 5. Zip layout

```
mars-assets-v2.zip
├── manifest.json
├── README.md                 (short: what's inside, tools used, anything unusual)
├── viewer.html               (optional, see §7)
├── models/
│   ├── storage_depot.glb
│   ├── battery_bank.glb
│   ├── moxie_unit.glb
│   ├── storage_silo.glb
│   ├── survey_rover.glb
│   ├── ... (other Tier B)
│   └── props/ ...
├── icons/  *.svg
├── audio/  *.ogg
├── previews/ <same-name>.png   (one 512×512 render per model, 45° top-down view, transparent background)
└── source/   (optional) .blend files or Blender Python scripts that rebuild each model
```

Lower-case snake_case file names everywhere. Nothing else in the zip (no `__MACOSX`, no `.DS_Store`, no temp files). Total zip size **≤ 40 MB**.

## 6. `manifest.json` (required)

One entry per file, so the game can be wired up without guessing:

```json
{
  "pack": "mars-assets-v2",
  "units": "1 unit = 1 settlement grid cell, +Y up, origin = footprint centre at ground",
  "license": "CC0-1.0 (all original work)",
  "assets": [
    {
      "file": "models/battery_bank.glb",
      "id": "battery_bank",
      "kind": "building",
      "footprint": [4, 4],
      "height": 1.9,
      "triangles": 18234,
      "bytes": 412000,
      "spin_nodes": [{ "node": "spin_fan", "speed": 3.0 }],
      "materials": ["hull_white", "dark_metal", "glow_green"],
      "front": "+Z (south)",
      "notes": "Cable junction on the west side."
    },
    {
      "file": "audio/build_complete.ogg",
      "id": "build_complete",
      "kind": "sound",
      "duration_s": 1.4,
      "loop": false,
      "license": "CC0-1.0",
      "source": "synthesised"
    }
  ]
}
```

If any asset comes from a third-party CC0 library, put its source URL and author in that entry. Anything that isn't CC0 or your own work must not be in the pack.

## 7. Optional `viewer.html` (single file, keep it small)

One self-contained HTML file that loads Three.js **0.187.0** from `https://cdn.jsdelivr.net/npm/three@0.187.0/` via an import map, reads `manifest.json`, lists every model, and shows the selected one on a 1-cell grid with orbit controls, a sun light, a reddish ground plane, and the `spin` nodes rotating. A dropdown or buttons to switch models. No other code files.

## 8. Before you zip — checklist

- [ ] Every GLB opens in https://gltf-viewer.donmccurdy.com/ with no errors or validator warnings worth fixing.
- [ ] Origin at footprint centre, ground at y = 0, foundation reaches y = −0.65, front faces +Z.
- [ ] Nothing exceeds its footprint; triangle and size budgets met.
- [ ] No Draco/meshopt/KTX2; textures embedded; no cameras/lights.
- [ ] `spin` nodes have their pivot at the rotation centre and local +Y along the axis; the property survives export (check `extras` in the viewer).
- [ ] Material names follow the palette table.
- [ ] No text, logos, flags, faces, or copyrighted designs.
- [ ] Icons are single-colour `currentColor` SVGs; audio is .ogg, normalised, loops are seamless.
- [ ] `manifest.json` lists every file with correct numbers; previews exist for every model.
- [ ] One zip, clean layout, ≤ 40 MB.

If you can't finish everything, deliver Tier A complete and polished rather than everything half-done, and say in the README what's missing.
