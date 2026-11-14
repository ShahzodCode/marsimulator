/**
 * Electricity — a flow (kW) plus stored energy (kWh). Never part of the material inventory;
 * in a later stage it travels through cables, not pipes or conveyors.
 *
 * Solar numbers:
 *   - Mean solar irradiance at Mars: 586.2 W/m² (NASA Mars Fact Sheet, NSSDC).
 *   - Panel efficiency ≈ 25 % (estimate for space-grade multi-junction cells).
 *   - Clear-sky atmospheric transmission ≈ 0.85 at noon (estimate; dust lowers it).
 */
export const SOLAR = {
  irradianceKwPerM2: 0.5862,
  panelEfficiency: 0.25,
  clearSkyTransmission: 0.85,
  /** Panel area of one Solar Farm (game value). */
  farmAreaM2: 640,
};

/** Noon output of one Solar Farm in kW (≈ 80 kW). */
export const SOLAR_FARM_PEAK_KW = SOLAR.irradianceKwPerM2 * SOLAR.panelEfficiency * SOLAR.clearSkyTransmission * SOLAR.farmAreaM2;

/**
 * Sun height through the sol, 0..1. The sol starts at 06:00 local time (sunrise) and the
 * sun sets at 18:00, so the first half of every sol is daylight.
 */
export function sunFactor(timeSols: number): number {
  const frac = timeSols - Math.floor(timeSols);
  return frac < 0.5 ? Math.sin(Math.PI * (frac / 0.5)) : 0;
}

/** Average of `sunFactor` over a whole sol (half a sine wave over half the sol = 1/π). */
export const AVERAGE_SUN = 1 / Math.PI;

/** Building priority when power is short: lower numbers get electricity first. */
export const POWER_PRIORITY = {
  lifeSupport: 0,
  living: 1,
  food: 2,
  water: 2,
  industry: 3,
} as const;
