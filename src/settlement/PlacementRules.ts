import { rotatedFootprint, type BuildingType } from '../data/buildings';
import { DECORATIONS, SETTLEMENT } from '../data/settlement';
import type { BuildingInstance } from '../state/types';
import { footprintHitsRoad } from './RoadRules';

/** Pure placement rules (no rendering), shared by the preview and the store. */

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type PlacementProblem = 'outside' | 'overlap' | 'reserved' | 'road' | null;

export function footprintRect(type: BuildingType, gridX: number, gridY: number, rotation: number): Rect {
  const fp = rotatedFootprint(type, rotation);
  return { x0: gridX, y0: gridY, x1: gridX + fp.width, y1: gridY + fp.height };
}

export function rectCenter(r: Rect): { x: number; y: number } {
  return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

const RESERVED: Rect[] = DECORATIONS.map((d) => ({
  x0: d.x - d.width / 2,
  y0: d.y - d.height / 2,
  x1: d.x + d.width / 2,
  y1: d.y + d.height / 2,
}));

/** Snaps a pointer position (grid coords) to the footprint's south-west corner. */
export function snapToGrid(type: BuildingType, rotation: number, x: number, y: number): { gridX: number; gridY: number } {
  const fp = rotatedFootprint(type, rotation);
  return { gridX: Math.round(x - fp.width / 2), gridY: Math.round(y - fp.height / 2) };
}

export function checkPlacement(
  type: BuildingType,
  gridX: number,
  gridY: number,
  rotation: number,
  buildings: BuildingInstance[],
  roads: ReadonlySet<string> = new Set(),
): PlacementProblem {
  const r = footprintRect(type, gridX, gridY, rotation);
  const corners: [number, number][] = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x0, r.y1],
    [r.x1, r.y1],
  ];
  if (corners.some(([x, y]) => Math.hypot(x, y) > SETTLEMENT.buildRadius)) return 'outside';
  if (RESERVED.some((res) => overlaps(r, res, 0.5))) return 'reserved';
  for (const b of buildings) {
    if (overlaps(r, footprintRect(b.type, b.gridX, b.gridY, b.rotation), 1)) return 'overlap';
  }
  if (footprintHitsRoad(r, roads)) return 'road';
  return null;
}

export const PROBLEM_TEXT: Record<Exclude<PlacementProblem, null>, string> = {
  outside: 'Too far from the base — build inside the bright circle.',
  overlap: 'Too close to another building.',
  reserved: 'This spot is reserved (landing pad, plaza or equipment).',
  road: 'A road is in the way — build next to it instead.',
};
