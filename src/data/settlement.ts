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

export const STARTING_BUILDINGS: StartingBuilding[] = [
  { type: 'habitat', gridX: -4, gridY: 6, rotation: 0 },
  { type: 'greenhouse', gridX: 8, gridY: -3, rotation: 0 },
  { type: 'life_support', gridX: -15, gridY: -2, rotation: 0 },
  { type: 'solar_farm', gridX: -5, gridY: -17, rotation: 0 },
];

export type DecorationKind = 'plaza' | 'landing_pad' | 'comm_tower' | 'rover' | 'crates';

export interface Decoration {
  kind: DecorationKind;
  /** Centre in cells. */
  x: number;
  y: number;
  /** Reserved footprint (cells) — buildings cannot overlap it. */
  width: number;
  height: number;
  rotation: number;
}

export const DECORATIONS: Decoration[] = [
  { kind: 'plaza', x: 0, y: 0, width: 6, height: 6, rotation: 0 },
  { kind: 'landing_pad', x: -20, y: -18, width: 10, height: 10, rotation: 0 },
  { kind: 'comm_tower', x: -10, y: 10, width: 3, height: 3, rotation: 0 },
  { kind: 'rover', x: 6, y: -7, width: 3, height: 2, rotation: 0.4 },
  { kind: 'crates', x: 9, y: 7, width: 3, height: 2, rotation: 0 },
];
