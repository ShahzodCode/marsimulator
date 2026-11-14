/**
 * Geography used to build the stylised Mars terrain and the map labels.
 *
 * Positions use planetocentric latitude and EAST longitude (degrees), taken from
 * commonly published values (USGS / NASA). Sizes and heights are rounded and
 * approximate — the terrain is a stylised reconstruction, not a MOLA elevation model.
 * Heights are kilometres relative to the Mars datum (“sea level”).
 */

export interface LabelFeature {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: 'volcano' | 'canyon' | 'basin' | 'crater' | 'plain' | 'polar';
  fact: string;
  /** Labels are hidden when the camera is closer than this altitude (scene units). */
  minAltitude?: number;
}

export const LABEL_FEATURES: LabelFeature[] = [
  { id: 'olympus', name: 'Olympus Mons', lat: 18.65, lon: 226.2, kind: 'volcano', fact: 'Tallest volcano in the Solar System — about 22 km high and as wide as France.' },
  { id: 'valles', name: 'Valles Marineris', lat: -13.9, lon: 300.8, kind: 'canyon', fact: 'A canyon system about 4,000 km long and up to 7 km deep.' },
  { id: 'hellas', name: 'Hellas Planitia', lat: -42.4, lon: 70.5, kind: 'basin', fact: 'A giant impact basin about 2,300 km wide — the lowest point on Mars.' },
  { id: 'gale', name: 'Gale Crater', lat: -5.4, lon: 137.8, kind: 'crater', fact: 'Curiosity rover has explored this 154 km crater and its central mountain since 2012.' },
  { id: 'tharsis', name: 'Tharsis Montes', lat: 1.5, lon: 247.0, kind: 'volcano', fact: 'Three giant volcanoes in a row: Arsia, Pavonis and Ascraeus Mons.' },
  { id: 'elysium', name: 'Elysium Mons', lat: 25.0, lon: 147.2, kind: 'volcano', fact: 'The biggest volcano of the Elysium volcanic region.' },
  { id: 'argyre', name: 'Argyre Planitia', lat: -49.7, lon: 316.0, kind: 'basin', fact: 'An impact basin about 1,800 km across, ringed by mountains.' },
  { id: 'utopia', name: 'Utopia Planitia', lat: 49.7, lon: 118.0, kind: 'plain', fact: 'A huge plain where the Viking 2 lander touched down in 1976.' },
  { id: 'syrtis', name: 'Syrtis Major', lat: 8.4, lon: 69.5, kind: 'plain', fact: 'A dark volcanic plain — one of the first features seen on Mars through telescopes.' },
  { id: 'isidis', name: 'Isidis Planitia', lat: 13.0, lon: 87.0, kind: 'basin', fact: 'An old impact basin. Jezero crater sits on its western edge.' },
  { id: 'npole', name: 'North Polar Cap', lat: 85, lon: 0, kind: 'polar', fact: 'A dome of water ice about 1,000 km across.' },
  { id: 'spole', name: 'South Polar Cap', lat: -86, lon: 315, kind: 'polar', fact: 'Water ice topped by a thin layer of frozen carbon dioxide (dry ice).' },
];

// ---------------------------------------------------------------------------
// Terrain-building features (approximate shapes)
// ---------------------------------------------------------------------------

export interface VolcanoFeature {
  lat: number;
  lon: number;
  /** Height above surroundings, km. */
  height: number;
  /** Base radius, km. */
  radius: number;
  calderaRadius: number;
}

export const VOLCANOES: VolcanoFeature[] = [
  { lat: 18.65, lon: 226.2, height: 19, radius: 310, calderaRadius: 40 }, // Olympus Mons
  { lat: 11.92, lon: 255.92, height: 11, radius: 210, calderaRadius: 28 }, // Ascraeus Mons
  { lat: 1.48, lon: 247.04, height: 8, radius: 190, calderaRadius: 25 }, // Pavonis Mons
  { lat: -8.26, lon: 239.91, height: 10, radius: 220, calderaRadius: 55 }, // Arsia Mons
  { lat: 40.4, lon: 250.4, height: 4, radius: 650, calderaRadius: 60 }, // Alba Mons (very broad, low)
  { lat: 25.02, lon: 147.21, height: 9, radius: 200, calderaRadius: 7 }, // Elysium Mons
  { lat: 32.1, lon: 150.2, height: 4, radius: 90, calderaRadius: 6 }, // Hecates Tholus
  { lat: -32.1, lon: 91.8, height: 1.5, radius: 250, calderaRadius: 30 }, // Hadriacus Mons
  { lat: -21.4, lon: 106.5, height: 2, radius: 250, calderaRadius: 20 }, // Tyrrhenus Mons
];

export interface BasinFeature {
  lat: number;
  lon: number;
  /** Radius to the rim, km. */
  radius: number;
  depth: number;
  rim: number;
}

export const BASINS: BasinFeature[] = [
  { lat: -42.4, lon: 70.5, radius: 1150, depth: 7.5, rim: 1.8 }, // Hellas
  { lat: -49.7, lon: 316.0, radius: 900, depth: 4.5, rim: 1.6 }, // Argyre
  { lat: 13.0, lon: 87.0, radius: 600, depth: 2.5, rim: 0.8 }, // Isidis
  { lat: 49.7, lon: 118.0, radius: 1600, depth: 1.5, rim: 0.0 }, // Utopia (buried, gentle)
];

/** Named craters (diameter km). Jezero is rendered separately in high detail. */
export interface CraterFeature {
  lat: number;
  lon: number;
  diameter: number;
  centralPeak?: number;
}

export const NAMED_CRATERS: CraterFeature[] = [
  { lat: -5.4, lon: 137.8, diameter: 154, centralPeak: 5.0 }, // Gale + Aeolis Mons (Mount Sharp)
  { lat: -13.9, lon: 55.6, diameter: 467 }, // Huygens
  { lat: -2.7, lon: 16.7, diameter: 459 }, // Schiaparelli
  { lat: 23.4, lon: 32.1, diameter: 415 }, // Cassini
  { lat: -40.8, lon: 201.9, diameter: 298 }, // Newton
  { lat: 50.8, lon: 29.3, diameter: 236 }, // Lyot
  { lat: -51.2, lon: 329.0, diameter: 230 }, // Galle
  { lat: -52.0, lon: 278.6, diameter: 203 }, // Lowell
];

/** Valles Marineris centre-line [lat, lonEast, halfWidthKm, depthKm]. */
export const VALLES_MARINERIS: [number, number, number, number][] = [
  [-6.5, 257, 70, 3], // Noctis Labyrinthus
  [-8.0, 264, 90, 4.5],
  [-9.5, 272, 110, 6],
  [-10.5, 282, 140, 7],
  [-12.0, 291, 150, 7],
  [-13.5, 299, 130, 6.5],
  [-13.0, 307, 110, 5.5],
  [-11.0, 315, 100, 4.5],
  [-8.0, 322, 110, 3.5],
  [-4.0, 328, 130, 2.5],
  [-1.0, 333, 120, 1.5],
];

/** A secondary northern trough (Candor / Ophir chasmata). */
export const VALLES_NORTH_BRANCH: [number, number, number, number][] = [
  [-5.5, 284, 70, 4],
  [-6.5, 291, 80, 5],
  [-7.5, 297, 50, 3],
];

/** Low-albedo (dark) regions [lat, lon, radiusDeg, strength]. */
export const DARK_ALBEDO: [number, number, number, number][] = [
  [8.4, 69.5, 11, 0.9], // Syrtis Major
  [0, 72, 8, 0.5],
  [46, 337, 13, 0.75], // Acidalia
  [-2, 2, 9, 0.7], // Sinus Meridiani
  [-8, 20, 9, 0.6], // Sinus Sabaeus
  [-25, 320, 12, 0.6], // Mare Erythraeum
  [-20, 145, 12, 0.65], // Mare Cimmerium
  [-15, 110, 10, 0.55], // Mare Tyrrhenum
  [-30, 270, 9, 0.35], // Solis Lacus
  [-50, 210, 14, 0.35], // Mare Sirenum area
  [-60, 30, 14, 0.4],
  [58, 270, 12, 0.3],
];

/** Bright dusty regions [lat, lon, radiusDeg, strength]. */
export const BRIGHT_ALBEDO: [number, number, number, number][] = [
  [20, 25, 18, 0.6], // Arabia Terra
  [5, 245, 22, 0.75], // Tharsis
  [15, 200, 15, 0.55], // Amazonis
  [20, 150, 12, 0.5], // Elysium
  [-42, 70, 14, 0.5], // Hellas floor (frost/dust)
  [-50, 316, 9, 0.35], // Argyre
];

export const POLAR_CAPS = {
  north: { lat: 90, lon: 0, radiusDeg: 9.5, height: 2.8 },
  south: { lat: -87, lon: 315, radiusDeg: 5.0, height: 2.5 },
};
