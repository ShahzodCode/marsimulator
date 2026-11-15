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

/**
 * Night heating. Heaters work harder when the air outside is colder.
 *   - Air at Gale crater runs from about −2 °C by day to −75 °C at night (S36, Curiosity REMS).
 *   - Inside is kept at 21 °C (game value).
 *   - Heat loss grows with the gap between inside and outside (standard heat-transfer rule).
 *   - About half of a heated building's base power is heating; the rest is air and lights (game value).
 * The outside air warms with the sun in the day and stays at its coldest all night (simplified).
 */
export const NIGHT_HEATING = {
  insideC: 21,
  dayAirC: -2,
  nightAirC: -75,
  heatShare: 0.5,
};

function insideOutsideGap(sun: number): number {
  return NIGHT_HEATING.insideC - (NIGHT_HEATING.nightAirC + (NIGHT_HEATING.dayAirC - NIGHT_HEATING.nightAirC) * sun);
}

/** Outside air temperature right now (°C). */
export function outsideAirC(timeSols: number): number {
  return NIGHT_HEATING.nightAirC + (NIGHT_HEATING.dayAirC - NIGHT_HEATING.nightAirC) * sunFactor(timeSols);
}

/**
 * Multiplier on heated buildings' base power at this time of sol. It averages exactly 1 over a
 * whole sol, so planning (which uses sol averages) is unchanged — but nights draw more and
 * batteries matter. About ×1.16 at night and ×0.66 at noon.
 */
export function heatingTimeFactor(timeSols: number): number {
  const avgGap = insideOutsideGap(AVERAGE_SUN); // the gap is linear in the sun, so its average uses the average sun
  return 1 - NIGHT_HEATING.heatShare + (NIGHT_HEATING.heatShare * insideOutsideGap(sunFactor(timeSols))) / avgGap;
}

/** Building priority when power is short: lower numbers get electricity first. */
export const POWER_PRIORITY = {
  lifeSupport: 0,
  living: 1,
  food: 2,
  water: 2,
  industry: 3,
} as const;
