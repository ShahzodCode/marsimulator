import { REGIONS, REGION_BY_ID, regionIndexAt, type RegionDefinition } from '../data/regions';
import { angularDistance, MARS_RADIUS_KM } from './geo';

/**
 * Region queries: lookup by location, neighbours (for the exploration frontier),
 * centres and distances. Pure logic — rendering lives in FogOfWar / Mars.
 */
export class RegionManager {
  private neighbours = new Map<string, string[]>();

  constructor() {
    for (const a of REGIONS) {
      this.neighbours.set(
        a.id,
        REGIONS.filter((b) => b.id !== a.id && touches(a, b)).map((b) => b.id),
      );
    }
  }

  all(): RegionDefinition[] {
    return REGIONS;
  }

  get(id: string): RegionDefinition | undefined {
    return REGION_BY_ID[id];
  }

  at(lat: number, lon: number): RegionDefinition {
    return REGIONS[regionIndexAt(lat, lon)];
  }

  neighboursOf(id: string): string[] {
    return this.neighbours.get(id) ?? [];
  }

  /** A region can be surveyed when it touches at least one discovered region. */
  isFrontier(id: string, discovered: Record<string, boolean>): boolean {
    if (discovered[id]) return false;
    return this.neighboursOf(id).some((n) => discovered[n]);
  }

  center(id: string): { lat: number; lon: number } {
    const r = REGION_BY_ID[id];
    if (r.latMin >= 65) return { lat: 82, lon: 0 };
    if (r.latMax <= -65) return { lat: -82, lon: 0 };
    let lon = (r.lonMin + r.lonMax) / 2;
    if (lon > 180) lon -= 360;
    return { lat: (r.latMin + r.latMax) / 2, lon };
  }

  distanceKm(fromLat: number, fromLon: number, id: string): number {
    const c = this.center(id);
    return angularDistance(fromLat, fromLon, c.lat, c.lon) * MARS_RADIUS_KM;
  }
}

function touches(a: RegionDefinition, b: RegionDefinition): boolean {
  const latOverlap = a.latMin <= b.latMax && b.latMin <= a.latMax;
  if (!latOverlap) return false;
  const sharedLatEdge = a.latMin === b.latMax || b.latMin === a.latMax;
  const lonOverlap = rangesTouch(a.lonMin, a.lonMax, b.lonMin, b.lonMax, sharedLatEdge);
  return lonOverlap;
}

function rangesTouch(a0: number, a1: number, b0: number, b1: number, strict: boolean): boolean {
  // Longitudes wrap at 360; test the three shifted copies.
  for (const s of [-360, 0, 360]) {
    const lo = Math.max(a0, b0 + s);
    const hi = Math.min(a1, b1 + s);
    if (strict ? hi > lo : hi >= lo) return true;
  }
  return false;
}
