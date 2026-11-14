# mars-assets-v2 — asset pack for Mars Colony Command

Everything in this pack is **original work, CC0-1.0**. No third-party assets, textures, samples or logos.

## What's inside

| folder | contents |
|---|---|
| `models/` | **Tier A** (4): `storage_depot`, `battery_bank`, `moxie_unit`, `storage_silo` · **Tier B** (7): `survey_rover`, `cargo_rover`, `supply_lander`, `landing_pad`, `comms_tower`, `construction_scaffold`, `astronaut` |
| `models/props/` | **Tier C** (15): `rock_small_1..3`, `rock_large_1..2`, `crate`, `barrel`, `pipe_straight/corner/tee`, `conveyor_straight/corner`, `solar_panel_single`, `antenna_small`, `floodlight` |
| `icons/` | 13 single-colour `currentColor` SVGs (24×24 viewBox, < 1 KB each) |
| `audio/` | 9 synthesised Ogg Vorbis sounds, 44.1 kHz mono, ≈ −14 LUFS |
| `previews/` | one 512×512 transparent PNG per model, rendered **from the exported GLB** at 45° from the south-east |
| `source/` | the Blender-Python scripts that rebuild everything (see below) |
| `manifest.json` | one entry per model / icon / sound with footprint, height, triangles, bytes, spin nodes, materials, glTF-space bounds, preview and icon paths |
| `viewer.html` | single-file Three.js 0.187.0 viewer (serve the folder over http, e.g. `npx serve`, then open `viewer.html`; `viewer.html#moxie_unit` jumps to a model) |

Nothing is missing from the brief: Tier A, B and C are all complete.

## Technical summary

- Plain **GLB (glTF 2.0)**, one model per file. No Draco / meshopt / KTX2, no textures at all, no cameras, lights, skins or animations.
  The only extension used is `KHR_materials_emissive_strength` (core Three.js `GLTFLoader` supports it) for the glow materials (strength 2.2; `window_warm` 1.6 — both under the 2.6 clamp).
- **1 unit = 1 grid cell, +Y up, origin = footprint centre at ground.** Building fronts face **+Z (south)**; vehicles face **+X**.
  Building foundations reach **y = −0.65**. Nothing overhangs its footprint by more than 0.02 cells.
- **Spin nodes**: every node named `spin_*` carries `extras.spin` (rad/s) and has its pivot at the rotation centre with local **+Y along the axis**.
  - `storage_depot`: `spin_arm` 0.4 (robot arm, vertical) · `battery_bank`: `spin_fan` 3 (vertical) · `moxie_unit`: `spin_fan` 4 (axis tilted 35° towards south, inside the intake duct) · `comms_tower`: `spin_dish` 0.2 (vertical; the red beacon rides on it)
  - `survey_rover`, `cargo_rover`: `spin_wheel_fl/ml/rl/fr/mr/rr` 3 (`l` = left = −Z side). Axles point along −Z, so a **positive** spin rolls the vehicle **forward (+X)**; negate it to reverse.
- **Materials** use the brief's palette names and values exactly. Three extra names were needed (also listed in `manifest.json → extra_materials`):
  `solar_blue` (#1b3466, metallic 0.5, roughness 0.22 — solar cells), `band_blue` (#2f6fd0 — the "blue = water" tank band), `scorch_black` (#2b2420 — lander scorch marks).
- **Dust tint**: the four Tier A buildings plus `supply_lander`, `landing_pad` and `comms_tower` carry a `COLOR_0` vertex-colour gradient (reddish below y ≈ 0.6, white above). `GLTFLoader` turns on `vertexColors` automatically. If the game swaps in shared materials by name, set `vertexColors = true` on them to keep the tint (or ignore it — the models look fine without).
- **Budgets**: largest building is 8 212 triangles / 383 KB (limit 40 000 / 1.5 MB); largest vehicle 5 844 triangles / 235 KB (limit 12 000 / 500 KB); every prop is under 1 300 triangles. Max 7 nodes per file.
- All 26 GLBs pass the Khronos **glTF-Validator with 0 errors, 0 warnings, 0 infos, 0 hints**, and were loaded in Three.js r187 through `viewer.html`.

## Things worth knowing (anything unusual)

- **Tiling props** are centred on the origin and exactly 1 cell long. `pipe_straight` / `conveyor_straight` run **west–east (X)**. `pipe_corner` / `conveyor_corner` join the **west (−X)** and **south (+Z)** edges; `pipe_tee` joins **west, east and south**. Rotate in 90° steps for the other cases. Pipe centre line is at y = 0.3, belt top at y = 0.25.
- `construction_scaffold` is a 1×1×1.27 open frame meant to be **scaled in X/Z** to the building footprint (it is all thin box members, so it stretches cleanly); scale Y to taste. Its posts reach y = −0.65.
- `supply_lander` includes its own round pad (so it can be dropped anywhere); `landing_pad` is the empty version and tops out at y = 0.25.
- `comms_tower`'s blinking light is the material named **`glow_red`** on the `spin_dish` node — animate that material's `emissiveIntensity` in-game to blink it. The tower is 4.3 tall.
- Rocks are bedded 0.03–0.13 below y = 0 so they sit into uneven terrain.
- `astronaut` is 0.35 tall, faces +Z, has a plain gold visor (no face) and no skeleton.
- **Audio**: all nine sounds are synthesised by `source/make_audio.py` (sine/bell partials, shaped noise). Loudness was measured with a BS.1770 K-weighted gated meter on the *decoded* files: every file is within −13.9 … −14.9 LUFS, peaks ≤ −1 dBFS (very short/peaky sounds go through a gentle soft limiter to get there). `ambient_wind_loop.ogg` is 30.000 s, built to be exactly periodic (noise generated in the frequency domain, gust LFOs use whole cycles per loop) and decodes to exactly 1 323 000 samples, so it loops without a click. It is normalised like the effects, so **play it quietly** (volume ≈ 0.15–0.3).
- Icons also cover the seven existing buildings (`habitat`, `solar_farm`, `life_support`, `greenhouse`, `regolith_excavator`, `iron_refinery`, `ice_drill`).

## Tools used / how to rebuild

Blender 5.3 (Python API only — every mesh is generated by code, no hand modelling), NumPy + Blender's `aud` module for audio. No other software.

```
blender --background --python source/build_all.py            # models/**.glb   (add "-- crate barrel" to build a subset)
blender --background --python source/render_previews.py      # previews/*.png
blender --background --python source/make_audio.py           # audio/*.ogg
blender --background --python source/make_icons.py           # icons/*.svg
blender --background --python source/make_manifest.py -- --zip   # manifest.json + ../mars-assets-v2.zip
```

`source/marslib.py` is the small modelling kit (palette, primitives, lathe, bevelled boxes, GLB export);
`models_buildings.py`, `models_tier_b.py` and `models_props.py` hold one function per model. The scripts write
intermediate stats to a `_build/` folder next to the pack. Authoring axes are Blender's (+Z up, front = −Y); the exporter converts to glTF +Y up.
