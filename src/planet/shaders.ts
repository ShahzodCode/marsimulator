/** GLSL snippets shared by the globe and settlement ground materials. */

export const GLSL_NOISE = /* glsl */ `
float gHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float gNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i + vec3(0, 0, 0)), gHash(i + vec3(1, 0, 0)), f.x),
                 mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x),
                 mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/** Region index from latitude / east longitude — mirrors regionIndexAt() in data/regions.ts. */
export const GLSL_REGIONS = /* glsl */ `
float regionIndex(float lat, float lonE) {
  if (lat >= 65.0) return 0.0;
  if (lat >= 30.0) return 1.0 + min(5.0, floor(lonE / 60.0));
  if (lat >= 0.0) return 7.0 + min(7.0, floor(lonE / 45.0));
  if (lat > -30.0) return 15.0 + min(7.0, floor(lonE / 45.0));
  if (lat > -65.0) return 23.0 + min(5.0, floor(lonE / 60.0));
  return 29.0;
}
`;
