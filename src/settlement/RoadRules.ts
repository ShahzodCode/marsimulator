import { SETTLEMENT } from '../data/settlement';
import type { BuildingInstance } from '../state/types';
import { footprintRect, type Rect } from './PlacementRules';

/**
 * Pure road-network rules (no rendering), shared by the store, the simulation and the view.
 *
 * Roads are laid by the player one square "tile" at a time. A tile is ROAD_TILE × ROAD_TILE
 * grid cells, centred on (ROAD_TILE·tx, ROAD_TILE·ty) — this offset makes the 6×6 central
 * storage depot exactly 3×3 tiles, so the depot is the hub every road network grows from.
 *
 * Rules:
 *  - a new tile must touch (share an edge with) the depot or an existing road tile,
 *    or sit right in front of a building (so a road can start at any building),
 *  - tiles can't overlap buildings or the depot (except a 1-cell margin, see BUILDING_MARGIN),
 *  - a building is "connected" when a road tile reachable from the depot runs along it.
 */

export const ROAD_TILE = 2;
export const ROAD_COST = { regolith: 2 } as const;

/** N, E, S, W as (dx, dy) in grid space (y = north). */
export const DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

export type RoadProblem = 'exists' | 'outside' | 'reserved' | 'building' | 'disconnected' | null;

export const ROAD_PROBLEM_TEXT: Record<Exclude<RoadProblem, null>, string> = {
  exists: 'There is already a road here.',
  outside: 'Too far from the base — stay inside the bright circle.',
  reserved: 'Roads can’t go over the Storage Depot.',
  building: 'A building is in the way.',
  disconnected: 'Start next to a building, the Storage Depot or another road piece.',
};

export const roadKey = (tx: number, ty: number): string => `${tx},${ty}`;

export function parseRoadKey(key: string): [number, number] {
  const i = key.indexOf(',');
  return [Number(key.slice(0, i)), Number(key.slice(i + 1))];
}

export function tileRect(tx: number, ty: number): Rect {
  const h = ROAD_TILE / 2;
  return { x0: tx * ROAD_TILE - h, y0: ty * ROAD_TILE - h, x1: tx * ROAD_TILE + h, y1: ty * ROAD_TILE + h };
}

/** Tile under a grid-space point. */
export function pointToTile(x: number, y: number): { tx: number; ty: number } {
  return { tx: Math.round(x / ROAD_TILE), ty: Math.round(y / ROAD_TILE) };
}

/** The central storage depot (the road hub) covers tiles -1..1 on both axes. */
export function isPlazaTile(tx: number, ty: number): boolean {
  return Math.abs(tx) <= 1 && Math.abs(ty) <= 1;
}

/**
 * Road tiles are 2 cells wide but buildings snap to single cells, so the tile right in
 * front of a building can overlap its footprint by one cell. Footprints have room to
 * spare at their edges, so roads may cover that outer cell.
 */
const BUILDING_MARGIN = 1;

function inset(r: Rect, d: number): Rect {
  return { x0: r.x0 + d, y0: r.y0 + d, x1: r.x1 - d, y1: r.y1 - d };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Gap (cells) between two non-overlapping rects along the axis where they face each other. */
function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1);
  const dy = Math.max(0, b.y0 - a.y1, a.y0 - b.y1);
  // Facing edges must overlap on the other axis (no diagonal-only contact).
  if (dx > 0 && dy > 0) return Infinity;
  if (dx === 0 && dy === 0) return 0;
  const sideOverlap = dx > 0 ? Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) : Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  return sideOverlap > 0 ? dx + dy : Infinity;
}

/** Can a road tile be built here, ignoring connectivity? */
function siteProblem(tx: number, ty: number, buildings: BuildingInstance[]): RoadProblem {
  if (isPlazaTile(tx, ty)) return 'reserved';
  const r = tileRect(tx, ty);
  const corners: [number, number][] = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x0, r.y1],
    [r.x1, r.y1],
  ];
  if (corners.some(([x, y]) => Math.hypot(x, y) > SETTLEMENT.buildRadius)) return 'outside';
  for (const b of buildings) if (overlaps(r, inset(footprintRect(b.type, b.gridX, b.gridY, b.rotation), BUILDING_MARGIN))) return 'building';
  return null;
}

/** True when the tile shares an edge with the plaza or with a tile in `roads`. */
export function touchesNetwork(tx: number, ty: number, roads: ReadonlySet<string>): boolean {
  for (const [dx, dy] of DIRS) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (isPlazaTile(nx, ny) || roads.has(roadKey(nx, ny))) return true;
  }
  return false;
}

/** True when the tile sits right in front of (runs along) any building. */
export function frontsBuilding(tx: number, ty: number, buildings: BuildingInstance[]): boolean {
  return buildings.some((b) => buildingSideOfTile(tx, ty, b) !== null);
}

/**
 * A new piece must join the depot, another road piece, or sit in front of a building —
 * so players can start a road at a building's door and pave back toward the base.
 * Only pieces linked to the depot count as connecting a building (see connectedBuildingIds).
 */
export function checkRoad(tx: number, ty: number, roads: ReadonlySet<string>, buildings: BuildingInstance[]): RoadProblem {
  if (roads.has(roadKey(tx, ty))) return 'exists';
  const p = siteProblem(tx, ty, buildings);
  if (p) return p;
  return touchesNetwork(tx, ty, roads) || frontsBuilding(tx, ty, buildings) ? null : 'disconnected';
}

/** Every road tile reachable from the plaza. */
export function reachableRoads(roads: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [];
  for (const key of roads) {
    const [tx, ty] = parseRoadKey(key);
    if (DIRS.some(([dx, dy]) => isPlazaTile(tx + dx, ty + dy))) {
      seen.add(key);
      queue.push([tx, ty]);
    }
  }
  while (queue.length) {
    const [tx, ty] = queue.pop()!;
    for (const [dx, dy] of DIRS) {
      const k = roadKey(tx + dx, ty + dy);
      if (roads.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push([tx + dx, ty + dy]);
      }
    }
  }
  return seen;
}

/** Removing a tile is only allowed when every other road stays joined to the plaza. */
export function canRemoveRoad(key: string, roads: ReadonlySet<string>): boolean {
  if (!roads.has(key)) return false;
  const before = reachableRoads(roads);
  const rest = new Set(roads);
  rest.delete(key);
  const after = reachableRoads(rest);
  for (const k of before) if (k !== key && !after.has(k)) return false;
  return true;
}

/**
 * If the tile runs along a building, returns which side of the tile it is on and how far
 * the road has to reach to touch it (1 = tile edge, 2 = one cell further).
 */
export function buildingSideOfTile(tx: number, ty: number, b: BuildingInstance): { dir: number; reach: number } | null {
  const t = tileRect(tx, ty);
  let f = footprintRect(b.type, b.gridX, b.gridY, b.rotation);
  let gap: number;
  if (overlaps(t, f)) {
    // Tile sits on the building's outer margin: it touches the building directly.
    f = inset(f, BUILDING_MARGIN);
    if (overlaps(t, f) || rectGap(t, f) !== 0) return null;
    gap = 0;
  } else {
    gap = rectGap(t, f);
    if (gap > 1) return null;
  }
  let dir: number;
  if (f.y0 >= t.y1) dir = 0;
  else if (f.x0 >= t.x1) dir = 1;
  else if (f.y1 <= t.y0) dir = 2;
  else dir = 3;
  return { dir, reach: 1 + gap };
}

/** Ids of buildings that a plaza-connected road runs along. */
export function connectedBuildingIds(buildings: BuildingInstance[], roads: ReadonlySet<string>): Set<string> {
  const reach = reachableRoads(roads);
  const out = new Set<string>();
  for (const b of buildings) {
    // The depot is the hub every road starts from, so it always counts as connected.
    if (b.type === 'storage_depot') {
      out.add(b.id);
      continue;
    }
    const f = footprintRect(b.type, b.gridX, b.gridY, b.rotation);
    // Only test tiles in the ring around the footprint.
    const tx0 = Math.floor((f.x0 - 2) / ROAD_TILE);
    const tx1 = Math.ceil((f.x1 + 2) / ROAD_TILE);
    const ty0 = Math.floor((f.y0 - 2) / ROAD_TILE);
    const ty1 = Math.ceil((f.y1 + 2) / ROAD_TILE);
    search: for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        if (reach.has(roadKey(tx, ty)) && buildingSideOfTile(tx, ty, b)) {
          out.add(b.id);
          break search;
        }
      }
    }
  }
  return out;
}

/** True when a building footprint would cover a road tile. */
export function footprintHitsRoad(r: Rect, roads: ReadonlySet<string>): boolean {
  const tx0 = Math.floor((r.x0 - 1) / ROAD_TILE);
  const tx1 = Math.ceil((r.x1 + 1) / ROAD_TILE);
  const ty0 = Math.floor((r.y0 - 1) / ROAD_TILE);
  const ty1 = Math.ceil((r.y1 + 1) / ROAD_TILE);
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) if (roads.has(roadKey(tx, ty)) && overlaps(inset(r, BUILDING_MARGIN), tileRect(tx, ty))) return true;
  }
  return false;
}

/**
 * Shortest road paths that connect each given building to the network — used only to
 * pave the pre-built starting base (and old saves that had no roads yet).
 */
export function starterRoads(buildings: BuildingInstance[], existing: string[] = []): string[] {
  const roads = new Set(existing);
  for (const b of buildings) {
    // The depot is the hub itself — roads start from it, they don't lead to it.
    if (b.type === 'storage_depot' || connectedBuildingIds([b], roads).size) continue;
    // Multi-source BFS from every buildable tile that already touches the network.
    const prev = new Map<string, string | null>();
    const queue: [number, number][] = [];
    const lim = Math.ceil(SETTLEMENT.buildRadius / ROAD_TILE) + 1;
    // Seed only from depot-linked roads: stray pieces in front of buildings don't count.
    const net = reachableRoads(roads);
    for (let tx = -lim; tx <= lim; tx++) {
      for (let ty = -lim; ty <= lim; ty++) {
        const k = roadKey(tx, ty);
        if (!roads.has(k) && !siteProblem(tx, ty, buildings) && touchesNetwork(tx, ty, net)) {
          prev.set(k, null);
          queue.push([tx, ty]);
        }
      }
    }
    let goal: string | null = null;
    for (let i = 0; i < queue.length && !goal; i++) {
      const [tx, ty] = queue[i];
      const k = roadKey(tx, ty);
      if (buildingSideOfTile(tx, ty, b)) {
        goal = k;
        break;
      }
      for (const [dx, dy] of DIRS) {
        const nk = roadKey(tx + dx, ty + dy);
        if (prev.has(nk) || roads.has(nk) || siteProblem(tx + dx, ty + dy, buildings)) continue;
        prev.set(nk, k);
        queue.push([tx + dx, ty + dy]);
      }
    }
    for (let k = goal; k; k = prev.get(k) ?? null) roads.add(k);
  }
  return [...roads];
}
