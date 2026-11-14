# Mars Colony Command

A browser-based Mars civilization management simulator for kids aged 7–12.
Manage a Martian settlement from a top-down planetary view: build infrastructure,
balance resources and explore the real geography of Mars.

Built with **Three.js**, **TypeScript**, **Vite** and **Zustand**.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Other commands:

- `npm run build` — type-check and build for production into `dist/`
- `npm run preview` — serve the production build
- `npm run typecheck` — TypeScript only

## Controls

- Drag: move the map · Scroll / pinch: zoom · Right-drag or Q/E: rotate
- Space: pause · 1 / 2 / 3: speed 1× / 2× / 4×
- B build · X explore · M missions · T research · I base info
- R rotate the building preview · Esc cancel · H fly to base · G whole planet

## What's in Stage 1

- Stylised 3D Mars globe with real landmarks at their real coordinates (Olympus Mons,
  Valles Marineris, Hellas, Gale, Jezero …). Terrain is a procedural approximation,
  not a NASA elevation model. It is generated in a Web Worker and cached in IndexedDB.
- Always top-down orbital camera, from the whole globe down to the settlement.
- Fog of war over the 30 USGS "Mars Chart" regions (MC-01 … MC-30), revealed by survey rovers.
- Starting settlement in Jezero Crater: habitat, solar farm, life support, and a greenhouse
  with crops and chickens in a protected coop.
- Click-to-place construction on the curved surface with validity preview.
- Centralised Zustand game state, simulation with pause and speed controls, warnings
  (nothing is ever destroyed), basic IndexedDB save/load.

## Project layout

```
src/
  core/         Game (composition root), loop, clock, input, event bus
  planet/       globe, terrain generator (+ worker), camera, regions, fog of war
  settlement/   grid on the curved surface, placement rules, buildings, roads
  simulation/   resources and the colony simulation
  data/         buildings, resources, regions, Mars features, progression
  state/        Zustand store and types
  ui/           HUD, panels, alerts, map controls and labels
  persistence/  save system and terrain cache
```
