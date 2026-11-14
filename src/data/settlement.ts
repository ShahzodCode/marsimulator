import type { BuildingType } from './buildings';

/**
 * The starting settlement: "Jezero Base", built on the floor of Jezero crater
 * (an ancient lake bed explored by NASA's Perseverance rover).
 *
 * Grid coordinates are settlement cells: x = east, y = north, origin = settlement centre.
 * A building's (gridX, gridY) is the south-west corner of its footprint.
 */

export const SETTLEMENT = {
  name: 'Jezero Base',
  lat: 18.38,
  lon: 77.58,
  /** Scene units per grid cell (planet radius = 100 units). */
  cellSize: 0.01,
  /** Buildable radius in cells. */
  buildRadius: 40,
  /** Terrain is graded flat out to this radius (cells). */
  flattenRadius: 48,
};

export interface StartingBuilding {
  type: BuildingType;
  gridX: number;
  gridY: number;
  rotation: number;
}

/** The central storage depot fills the 6×6 hub at the centre; every road grows from it. */
export const DEPOT = { gridX: -3, gridY: -3 } as const;

export const STARTING_BUILDINGS: StartingBuilding[] = [
  { type: 'storage_depot', gridX: DEPOT.gridX, gridY: DEPOT.gridY, rotation: 0 },
  // The rest of the starting base sits a short drive out from the depot.
  { type: 'habitat', gridX: -4, gridY: 11, rotation: 0 },
  { type: 'greenhouse', gridX: 13, gridY: -3, rotation: 0 },
  { type: 'life_support', gridX: -20, gridY: -3, rotation: 0 },
  { type: 'solar_farm', gridX: -5, gridY: -22, rotation: 0 },
  // The ice drill keeps the water supply steady (life support splits water into oxygen).
  { type: 'ice_drill', gridX: 12, gridY: 12, rotation: 0 },
];
