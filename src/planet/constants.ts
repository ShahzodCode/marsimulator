/** Planet constants with no dependencies (safe to import from the terrain worker). */
export const MARS_RADIUS_KM = 3389.5;
export const R = 100;
export const KM_TO_UNITS = R / MARS_RADIUS_KM;
/** Vertical exaggeration so relief is readable on a stylised globe. */
export const ELEVATION_EXAGGERATION = 6;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
