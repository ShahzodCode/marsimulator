/**
 * Mars regions = the 30 USGS "Mars Charts" (MC-01 … MC-30) quadrangles.
 * This is the real cartographic division used by planetary scientists:
 *   - MC-01 / MC-30: polar caps (above 65° N / below 65° S)
 *   - 30°–65° bands: 6 quadrangles, 60° of longitude each
 *   - 0°–30° bands: 8 quadrangles, 45° of longitude each
 *
 * The band/column index used here is mirrored exactly in the globe shader (FogOfWar).
 * Longitudes are degrees EAST in [0, 360).
 */

export interface RegionDefinition {
  /** Index 0..29 used by rendering (band order, see regionIndexAt). */
  index: number;
  id: string;
  name: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  description: string;
  highlights: string[];
}

interface RegionSeed {
  id: string;
  name: string;
  description: string;
  highlights: string[];
}

// Ordered by [band][column] where column = floor(lonEast / width).
const NORTH_POLAR: RegionSeed = {
  id: 'MC-01',
  name: 'Mare Boreum',
  description: 'The north polar region. A giant cap of water ice, layered like a cake, covers the pole.',
  highlights: ['North polar ice cap (Planum Boreum)', 'Layered ice deposits'],
};
const NORTH_MID: RegionSeed[] = [
  { id: 'MC-05', name: 'Ismenius Lacus', description: 'Northern plains along the edge of the ancient highlands, with flat-topped mesas.', highlights: ['Lyot crater', 'Deuteronilus Mensae'] },
  { id: 'MC-06', name: 'Casius', description: 'Smooth northern lowlands with signs of buried ice.', highlights: ['Utopia Planitia (west)', 'Nilosyrtis Mensae'] },
  { id: 'MC-07', name: 'Cebrenia', description: 'Northern plains north of the Elysium volcanoes.', highlights: ['Utopia Planitia (Viking 2, 1976)', 'Hecates Tholus'] },
  { id: 'MC-02', name: 'Diacria', description: 'Wide, dusty northern plains far from the volcanoes.', highlights: ['Arcadia Planitia (west)'] },
  { id: 'MC-03', name: 'Arcadia', description: 'Gentle plains next to Alba Mons, a huge but very flat volcano.', highlights: ['Alba Mons', 'Arcadia Planitia'] },
  { id: 'MC-04', name: 'Mare Acidalium', description: 'Dark northern plains — one of the first features astronomers saw through telescopes.', highlights: ['Acidalia Planitia', 'Cydonia Mensae'] },
];
const NORTH_EQ: RegionSeed[] = [
  { id: 'MC-12', name: 'Arabia', description: 'Old, heavily cratered highlands covered in bright dust.', highlights: ['Arabia Terra', 'Cassini crater'] },
  { id: 'MC-13', name: 'Syrtis Major', description: 'Home of our base! Dark volcanic plains next to the Isidis basin and Jezero crater, an ancient lake.', highlights: ['Jezero crater (Perseverance rover, 2021)', 'Syrtis Major Planum', 'Isidis Planitia'] },
  { id: 'MC-14', name: 'Amenthes', description: 'The boundary between southern highlands and northern lowlands.', highlights: ['Isidis Planitia (east)', 'Nepenthes Mensae'] },
  { id: 'MC-15', name: 'Elysium', description: 'The second-biggest volcanic region on Mars.', highlights: ['Elysium Mons', 'Elysium Planitia (InSight lander, 2018)'] },
  { id: 'MC-08', name: 'Amazonis', description: 'Very smooth, young plains — some of the flattest land on Mars.', highlights: ['Amazonis Planitia', 'Western flank of Olympus Mons'] },
  { id: 'MC-09', name: 'Tharsis', description: 'Land of giant volcanoes, including Olympus Mons, the tallest volcano in the Solar System.', highlights: ['Olympus Mons', 'Ascraeus Mons', 'Pavonis Mons'] },
  { id: 'MC-10', name: 'Lunae Palus', description: 'Plains carved by ancient floods that flowed north long ago.', highlights: ['Kasei Valles', 'Chryse Planitia (Viking 1, 1976)'] },
  { id: 'MC-11', name: 'Oxia Palus', description: 'Where huge outflow channels empty into Chryse Planitia.', highlights: ['Ares Vallis (Pathfinder, 1997)', 'Aram Chaos'] },
];
const SOUTH_EQ: RegionSeed[] = [
  { id: 'MC-20', name: 'Sinus Sabaeus', description: 'Ancient cratered highlands south of the equator.', highlights: ['Schiaparelli crater', 'Terra Sabaea'] },
  { id: 'MC-21', name: 'Iapygia', description: 'Rugged highlands holding the enormous Huygens crater.', highlights: ['Huygens crater', 'Iapygia highlands'] },
  { id: 'MC-22', name: 'Mare Tyrrhenum', description: 'Highlands with an old, worn-down volcano called Tyrrhenus Mons.', highlights: ['Tyrrhenus Mons', 'Hesperia Planum'] },
  { id: 'MC-23', name: 'Aeolis', description: 'Home of Gale crater, explored by the Curiosity rover since 2012.', highlights: ['Gale crater & Mount Sharp', 'Aeolis Mensae'] },
  { id: 'MC-16', name: 'Memnonia', description: 'Highlands with strange, wind-carved rock formations.', highlights: ['Medusae Fossae Formation', 'Mangala Valles'] },
  { id: 'MC-17', name: 'Phoenicis Lacus', description: 'High volcanic plateau with a maze of canyons called Noctis Labyrinthus.', highlights: ['Arsia Mons', 'Noctis Labyrinthus'] },
  { id: 'MC-18', name: 'Coprates', description: 'The heart of Valles Marineris — a canyon system as long as the United States is wide.', highlights: ['Valles Marineris', 'Coprates Chasma'] },
  { id: 'MC-19', name: 'Margaritifer Sinus', description: 'Jumbled “chaos” terrain where Valles Marineris ends.', highlights: ['Meridiani Planum (Opportunity, 2004)', 'Eos Chasma'] },
];
const SOUTH_MID: RegionSeed[] = [
  { id: 'MC-27', name: 'Noachis', description: 'Some of the oldest, most cratered land on Mars.', highlights: ['Noachis Terra', 'Argyre rim'] },
  { id: 'MC-28', name: 'Hellas', description: 'The giant Hellas impact basin — the lowest place on Mars.', highlights: ['Hellas Planitia', 'Hadriacus Mons'] },
  { id: 'MC-29', name: 'Eridania', description: 'Highlands that may once have held a huge lake.', highlights: ['Eridania basin', 'Ariadnes Colles'] },
  { id: 'MC-24', name: 'Phaethontis', description: 'Southern highlands with gullies on crater walls.', highlights: ['Newton crater', 'Terra Sirenum'] },
  { id: 'MC-25', name: 'Thaumasia', description: 'A high plateau south of Valles Marineris.', highlights: ['Lowell crater', 'Thaumasia highlands'] },
  { id: 'MC-26', name: 'Argyre', description: 'The Argyre impact basin, ringed by mountains.', highlights: ['Argyre Planitia', 'Galle crater (“Happy Face”)'] },
];
const SOUTH_POLAR: RegionSeed = {
  id: 'MC-30',
  name: 'Mare Australe',
  description: 'The south polar region with a cap of frozen carbon dioxide on top of water ice.',
  highlights: ['South polar cap (Planum Australe)', 'CO₂ ice “Swiss cheese” terrain'],
};

function build(): RegionDefinition[] {
  const out: RegionDefinition[] = [];
  const push = (seed: RegionSeed, latMin: number, latMax: number, lonMin: number, lonMax: number) => {
    out.push({ ...seed, index: out.length, latMin, latMax, lonMin, lonMax });
  };
  push(NORTH_POLAR, 65, 90, 0, 360);
  NORTH_MID.forEach((s, i) => push(s, 30, 65, i * 60, i * 60 + 60));
  NORTH_EQ.forEach((s, i) => push(s, 0, 30, i * 45, i * 45 + 45));
  SOUTH_EQ.forEach((s, i) => push(s, -30, 0, i * 45, i * 45 + 45));
  SOUTH_MID.forEach((s, i) => push(s, -65, -30, i * 60, i * 60 + 60));
  push(SOUTH_POLAR, -90, -65, 0, 360);
  return out;
}

export const REGIONS: RegionDefinition[] = build();
export const REGION_BY_ID: Record<string, RegionDefinition> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

/** Region index for a lat / lon (lon may be any range; normalised to [0, 360)). Mirrors the GLSL version. */
export function regionIndexAt(lat: number, lon: number): number {
  const l = ((lon % 360) + 360) % 360;
  if (lat >= 65) return 0;
  if (lat >= 30) return 1 + Math.min(5, Math.floor(l / 60));
  if (lat >= 0) return 7 + Math.min(7, Math.floor(l / 45));
  if (lat > -30) return 15 + Math.min(7, Math.floor(l / 45));
  if (lat > -65) return 23 + Math.min(5, Math.floor(l / 60));
  return 29;
}

export const HOME_REGION_ID = 'MC-13';
