import type { BuildingType } from './buildings';
import type { ResourceId } from './resources';
import { REGIONS, regionIndexAt } from './regions';
import { SETTLEMENT } from './settlement';

/**
 * Base sites: real places on Mars where a new base can be founded.
 *
 * Every site is a real location with published coordinates (planetocentric latitude, EAST
 * longitude), taken from NASA landing sites, NASA landing-site candidates, the 2015 human
 * Exploration Zone workshop, or the USGS/IAU Gazetteer of Planetary Nomenclature. The source
 * of each one is in `sources` (IDs from docs/sources.md). NASA chose landing sites and their
 * candidates for flat, safe ground; for the other places our construction robots grade a
 * flat pad, like they did at Jezero.
 *
 * Traits come from published observations (cited per trait in TRAITS). The *effects* of a
 * trait are game values and are labelled that way in the UI.
 */

export type TraitId =
  | 'ice_cap'
  | 'buried_glacier'
  | 'ground_ice'
  | 'hematite'
  | 'clays'
  | 'flood_rocks'
  | 'lava_tube'
  | 'deep_water'
  | 'dusty'
  | 'volcano'
  | 'canyon'
  | 'basin_air'
  | 'polar_night';

export interface TraitDefinition {
  id: TraitId;
  name: string;
  icon: string;
  /** good = mostly an advantage, bad = mostly a problem, mixed = both. */
  tone: 'good' | 'bad' | 'mixed';
  /** What it means, for kids. */
  text: string;
  /** What it does in the game (game values). */
  effect: string;
  /** The orbiter can only say "likely" until the crew (or a better orbiter) confirms it. */
  orbitConfidence: 'sure' | 'likely';
  /** Needs this research before the orbiter can see it at all. */
  hiddenUntil?: 'orbiter_mk3';
  sources: string[];
}

export const TRAITS: Record<TraitId, TraitDefinition> = {
  ice_cap: {
    id: 'ice_cap',
    name: 'Polar ice cap',
    icon: '🏔️',
    tone: 'mixed',
    text: 'A giant cap of water ice, kilometres thick. Endless water, but brutally cold: winter nights reach about −123 °C.',
    effect: 'Ice drills ×2 and an enormous ice reserve · heating ×2.5 · greenhouse domes can’t be built',
    orbitConfidence: 'sure',
    sources: ['S25'],
  },
  buried_glacier: {
    id: 'buried_glacier',
    name: 'Buried glacier',
    icon: '🧊',
    tone: 'good',
    text: 'Radar shows a glacier of almost pure ice hidden under a blanket of dust and rock.',
    effect: 'Ice drills ×1.8 and a huge ice reserve',
    orbitConfidence: 'likely',
    sources: ['S22'],
  },
  ground_ice: {
    id: 'ground_ice',
    name: 'Shallow ground ice',
    icon: '❄️',
    tone: 'good',
    text: 'Ice is mixed into the soil just below the surface — NASA’s SWIM maps show it poleward of about 40°.',
    effect: 'Ice drills ×1.4 and a bigger ice reserve',
    orbitConfidence: 'likely',
    sources: ['S22'],
  },
  hematite: {
    id: 'hematite',
    name: 'Hematite field',
    icon: '⛏️',
    tone: 'good',
    text: 'The ground is full of hematite, an iron mineral. Opportunity found it as tiny round “blueberries”.',
    effect: 'Iron refineries ×2 · unlocks the Hematite Strip Mine (research)',
    orbitConfidence: 'sure',
    sources: ['S28'],
  },
  clays: {
    id: 'clays',
    name: 'Water-bearing clays',
    icon: '🧱',
    tone: 'good',
    text: 'Clay minerals that formed in water long ago. They still hold water inside the rock.',
    effect: 'Ice drills ×1.15 · a little extra regolith',
    orbitConfidence: 'sure',
    sources: ['S28'],
  },
  flood_rocks: {
    id: 'flood_rocks',
    name: 'Flood deposits',
    icon: '🪨',
    tone: 'good',
    text: 'Ancient floods dumped a jumble of rocks from all over the highlands here.',
    effect: 'Excavators ×1.2 · refineries ×1.2',
    orbitConfidence: 'sure',
    sources: ['S27'],
  },
  lava_tube: {
    id: 'lava_tube',
    name: 'Lava-tube cave',
    icon: '🕳️',
    tone: 'good',
    text: 'Holes in the ground (“skylights”) lead into caves left by old lava rivers — natural shelter from radiation.',
    effect: 'Unlocks the Lava-Tube Habitat (research) · habitats cost 20% less',
    orbitConfidence: 'likely',
    sources: ['S23'],
  },
  deep_water: {
    id: 'deep_water',
    name: 'Deep groundwater',
    icon: '🌊',
    tone: 'good',
    text: 'Seismic waves suggest rock soaked with liquid water 11.5–20 km down — far deeper than any drill today.',
    effect: 'The Deep Aquifer Drill (research) gives water without ever running out',
    orbitConfidence: 'likely',
    hiddenUntil: 'orbiter_mk3',
    sources: ['S21'],
  },
  dusty: {
    id: 'dusty',
    name: 'Thick dust',
    icon: '🌫️',
    tone: 'mixed',
    text: 'Bright, fine dust covers everything here. It is easy to dig, but it settles on solar panels.',
    effect: 'Solar −20% · excavators ×1.3',
    orbitConfidence: 'sure',
    sources: ['S26'],
  },
  volcano: {
    id: 'volcano',
    name: 'Volcanic heights',
    icon: '🌋',
    tone: 'mixed',
    text: 'High on a giant volcano: the sky is clear, but the air is even thinner and colder.',
    effect: 'Solar +10% · heating ×1.4 · habitats need 30% more shielding',
    orbitConfidence: 'sure',
    sources: ['S24'],
  },
  canyon: {
    id: 'canyon',
    name: 'Canyon floor',
    icon: '🏜️',
    tone: 'mixed',
    text: 'Deep in a canyon: layered walls full of minerals, thicker air, but rough ground for roads.',
    effect: 'Refineries ×1.2 · habitats need 10% less shielding · roads cost more',
    orbitConfidence: 'sure',
    sources: ['S24'],
  },
  basin_air: {
    id: 'basin_air',
    name: 'Thick air',
    icon: '🌬️',
    tone: 'good',
    text: 'Low ground has more air overhead: Hellas has about twice the pressure of Mars “sea level” and about half the radiation of high ground.',
    effect: 'Habitats need 25% less shielding',
    orbitConfidence: 'sure',
    sources: ['S24'],
  },
  polar_night: {
    id: 'polar_night',
    name: 'Long polar night',
    icon: '🌑',
    tone: 'bad',
    text: 'Near the poles the Sun stays low for months, and in winter it does not rise at all.',
    effect: 'Solar −60%',
    orbitConfidence: 'sure',
    sources: ['S25'],
  },
};

export interface BaseSite {
  id: string;
  regionId: string;
  name: string;
  lat: number;
  /** East longitude, 0..360. */
  lon: number;
  traits: TraitId[];
  blurb: string;
  /** IDs in docs/sources.md for the position (traits cite their own sources). */
  sources: string[];
  /** The starting base. */
  home?: boolean;
}

type SiteSeed = Omit<BaseSite, 'regionId'>;

const SEEDS: SiteSeed[] = [
  // --- North polar (MC-01) ---
  { id: 'phoenix', name: 'Phoenix landing site', lat: 68.22, lon: 234.25, traits: ['ground_ice', 'polar_night'], blurb: 'NASA’s Phoenix lander scraped the soil here in 2008 and found bright water ice just centimetres down.', sources: ['S27'] },
  { id: 'planum_boreum', name: 'Planum Boreum', lat: 88.0, lon: 15.0, traits: ['ice_cap', 'polar_night'], blurb: 'The top of the north polar ice cap: a layered dome of water ice about 1,000 km across.', sources: ['S29'] },
  // --- Northern mid-latitudes ---
  { id: 'deuteronilus', name: 'Deuteronilus Mensae', lat: 39.11, lon: 23.199, traits: ['buried_glacier', 'clays'], blurb: 'Flat-topped mesas with glaciers hiding under the rubble. A favourite NASA candidate for the first human base.', sources: ['S17', 'S32'] },
  { id: 'protonilus', name: 'Protonilus Mensae', lat: 42.012, lon: 47.681, traits: ['buried_glacier'], blurb: 'Another NASA candidate Exploration Zone, with ice-filled valleys along the old highland edge.', sources: ['S17', 'S32'] },
  { id: 'lyot', name: 'Lyot crater', lat: 50.8, lon: 29.3, traits: ['ground_ice', 'basin_air'], blurb: 'A big crater so deep that its floor is one of the lowest places in the north.', sources: ['S29'] },
  { id: 'utopia', name: 'Utopia Planitia', lat: 49.7, lon: 118.0, traits: ['buried_glacier'], blurb: 'Radar found a layer of buried ice here holding about as much water as Lake Superior.', sources: ['S30'] },
  { id: 'viking2', name: 'Viking 2 landing site', lat: 47.668, lon: 134.28, traits: ['ground_ice'], blurb: 'Viking 2 landed here in 1976 and photographed frost on the rocks in winter.', sources: ['S27'] },
  { id: 'hecates', name: 'Hecates Tholus', lat: 32.12, lon: 150.24, traits: ['volcano', 'ground_ice'], blurb: 'A volcano in the north of Elysium, with glacier deposits on its flanks.', sources: ['S29'] },
  { id: 'arcadia', name: 'Arcadia Planitia', lat: 49.02, lon: 188.15, traits: ['buried_glacier'], blurb: 'Fresh craters here have dug up pure white ice just under the surface.', sources: ['S29', 'S22'] },
  { id: 'erebus', name: 'Erebus Montes', lat: 35.68, lon: 185.0, traits: ['ground_ice'], blurb: 'Low hills poking out of the plains, with signs of buried ice all around.', sources: ['S29'] },
  { id: 'alba', name: 'Alba Mons', lat: 41.08, lon: 249.29, traits: ['volcano', 'ground_ice'], blurb: 'The widest volcano on Mars, but so flat you would hardly notice you were on one.', sources: ['S29'] },
  { id: 'tempe', name: 'Tempe Terra', lat: 39.7, lon: 289.0, traits: ['ground_ice', 'flood_rocks'], blurb: 'Old cratered highlands cut by long cracks.', sources: ['S29'] },
  { id: 'acidalia', name: 'Acidalia Planitia', lat: 49.76, lon: 339.26, traits: ['ground_ice'], blurb: 'Dark plains whose patterned ground looks like frozen soil on Earth.', sources: ['S29'] },
  { id: 'cydonia', name: 'Cydonia', lat: 40.74, lon: 350.54, traits: ['ground_ice', 'flood_rocks'], blurb: 'Mesas on the highland edge (home of the famous “Face on Mars”, just a hill).', sources: ['S29'] },
  // --- Northern equator band ---
  { id: 'arabia', name: 'Arabia Terra', lat: 21.25, lon: 5.72, traits: ['dusty', 'clays'], blurb: 'Ancient highlands covered in bright dust, with layered rocks from long-ago water.', sources: ['S29'] },
  { id: 'cassini', name: 'Cassini crater', lat: 23.35, lon: 32.11, traits: ['dusty', 'basin_air'], blurb: 'A 400 km crater with a smooth, dusty floor.', sources: ['S29'] },
  { id: 'terra_sabaea', name: 'Terra Sabaea', lat: 2.0, lon: 42.0, traits: ['clays'], blurb: 'Rugged old highlands with water-made minerals in the crater walls.', sources: ['S29'] },
  { id: 'jezero', name: 'Jezero crater', lat: SETTLEMENT.lat, lon: SETTLEMENT.lon, traits: ['clays', 'flood_rocks'], blurb: 'An ancient lake with a river delta, explored by Perseverance. Our first base!', sources: ['S27'], home: true },
  { id: 'nili_fossae', name: 'Nili Fossae', lat: 22.57, lon: 76.8, traits: ['clays'], blurb: 'Huge troughs where orbiters see some of the richest mineral deposits on Mars.', sources: ['S29'] },
  { id: 'hebrus', name: 'Hebrus Valles', lat: 20.083, lon: 126.633, traits: ['lava_tube', 'ground_ice'], blurb: 'A NASA candidate Exploration Zone with channels that may hide caves and ice.', sources: ['S17', 'S32'] },
  { id: 'insight', name: 'InSight landing site', lat: 4.502, lon: 135.623, traits: ['dusty', 'deep_water'], blurb: 'The flattest, safest spot NASA could find. InSight listened to marsquakes here for four years.', sources: ['S27'] },
  { id: 'elysium_mons', name: 'Elysium Mons', lat: 25.0, lon: 147.2, traits: ['volcano', 'dusty', 'lava_tube'], blurb: 'The biggest volcano of the Elysium region.', sources: ['S29'] },
  { id: 'amazonis', name: 'Amazonis Planitia', lat: 25.75, lon: 197.09, traits: ['dusty', 'ground_ice'], blurb: 'Some of the smoothest, flattest land on the whole planet.', sources: ['S29'] },
  { id: 'olympus', name: 'Olympus Mons foothills', lat: 18.65, lon: 226.2, traits: ['volcano', 'dusty', 'lava_tube'], blurb: 'At the foot of the tallest volcano in the Solar System.', sources: ['S29'] },
  { id: 'tharsis', name: 'Tharsis Montes', lat: 1.5, lon: 247.0, traits: ['volcano', 'dusty', 'lava_tube'], blurb: 'Between three giant volcanoes in a row.', sources: ['S29'] },
  { id: 'viking1', name: 'Viking 1 landing site', lat: 22.269, lon: 312.049, traits: ['flood_rocks'], blurb: 'The first successful Mars landing, in 1976, on rocky plains carved by floods.', sources: ['S27'] },
  { id: 'pathfinder', name: 'Pathfinder landing site', lat: 19.095, lon: 326.747, traits: ['flood_rocks'], blurb: 'Where the little Sojourner rover drove in 1997, at the mouth of Ares Vallis.', sources: ['S27'] },
  { id: 'mawrth', name: 'Mawrth Vallis', lat: 23.9883, lon: 341.0399, traits: ['clays'], blurb: 'A final-four candidate for Curiosity, with thick layers of water-made clay.', sources: ['S27'] },
  // --- Southern equator band ---
  { id: 'schiaparelli', name: 'Schiaparelli crater', lat: -2.7, lon: 16.7, traits: ['dusty', 'basin_air'], blurb: 'A 460 km crater with layered rocks on its floor.', sources: ['S29'] },
  { id: 'huygens', name: 'Huygens crater', lat: -13.5, lon: 55.5, traits: ['clays'], blurb: 'A huge ringed crater proposed as a NASA human Exploration Zone.', sources: ['S17', 'S32'] },
  { id: 'hesperia', name: 'Hesperia Planum', lat: -22.26, lon: 110.0, traits: ['flood_rocks'], blurb: 'Smooth lava plains with wrinkle ridges.', sources: ['S29'] },
  { id: 'gale', name: 'Gale crater', lat: -4.59, lon: 137.44, traits: ['clays', 'hematite', 'basin_air'], blurb: 'Curiosity’s home since 2012, with Mount Sharp in the middle.', sources: ['S27'] },
  { id: 'spirit', name: 'Spirit landing site (Gusev)', lat: -14.571892, lon: 175.47848, traits: ['clays', 'dusty'], blurb: 'Spirit landed here in 2004 and found rocks altered by hot water.', sources: ['S27'] },
  { id: 'medusae', name: 'Medusae Fossae', lat: -3.2, lon: 197.0, traits: ['dusty'], blurb: 'Soft, wind-carved rock that is easy to dig.', sources: ['S29'] },
  { id: 'mangala', name: 'Mangala Valles', lat: -11.6, lon: 209.0, traits: ['flood_rocks', 'ground_ice'], blurb: 'Flood channels with signs of old glaciers.', sources: ['S29'] },
  { id: 'arsia', name: 'Arsia Mons', lat: -8.26, lon: 239.91, traits: ['volcano', 'dusty', 'lava_tube'], blurb: 'HiRISE photographed pits here that may be skylights into lava-tube caves.', sources: ['S29', 'S23'] },
  { id: 'melas', name: 'Melas Chasma', lat: -10.4, lon: 287.3, traits: ['canyon', 'clays', 'hematite'], blurb: 'The widest part of Valles Marineris, with layered minerals in its walls.', sources: ['S29'] },
  { id: 'opportunity', name: 'Opportunity landing site (Meridiani)', lat: -1.9462, lon: 354.4734, traits: ['hematite', 'clays'], blurb: 'Opportunity found the hematite “blueberries” here — proof of ancient water.', sources: ['S27'] },
  { id: 'eberswalde', name: 'Eberswalde crater', lat: -23.8953, lon: 326.7426, traits: ['clays', 'flood_rocks'], blurb: 'A final-four candidate for Curiosity, with a beautiful old river delta.', sources: ['S27'] },
  { id: 'holden', name: 'Holden crater', lat: -26.4007, lon: 325.1615, traits: ['clays', 'flood_rocks'], blurb: 'A final-four candidate for Curiosity: an old lake bed with layered clays.', sources: ['S27'] },
  // --- Southern mid-latitudes ---
  { id: 'hellas', name: 'Hellas Planitia', lat: -42.4, lon: 70.5, traits: ['basin_air', 'ground_ice'], blurb: 'The bottom of the biggest basin: the thickest air and lowest radiation on Mars.', sources: ['S29', 'S24'] },
  { id: 'ariadnes', name: 'Ariadnes Colles', lat: -34.5, lon: 172.78, traits: ['clays', 'ground_ice'], blurb: 'Knobby hills in the Eridania basin, which may once have been a huge lake.', sources: ['S29'] },
  { id: 'newton', name: 'Newton crater', lat: -40.47, lon: 201.9, traits: ['ground_ice'], blurb: 'Gullies on its walls may have been carved by melting ice.', sources: ['S29'] },
  { id: 'sirenum', name: 'Terra Sirenum', lat: -39.7, lon: 210.0, traits: ['clays', 'ground_ice'], blurb: 'Highlands with salty deposits from long-gone lakes.', sources: ['S29'] },
  { id: 'lowell', name: 'Lowell crater', lat: -51.97, lon: 278.6, traits: ['ground_ice'], blurb: 'A ringed crater far in the south, with ice in the ground.', sources: ['S29'] },
  { id: 'argyre', name: 'Argyre Planitia', lat: -49.7, lon: 316.0, traits: ['basin_air', 'ground_ice'], blurb: 'A basin ringed by mountains, low enough for thicker air.', sources: ['S29'] },
  { id: 'galle', name: 'Galle crater', lat: -51.2, lon: 329.1, traits: ['ground_ice'], blurb: 'The “Happy Face” crater, smiling up at the orbiters.', sources: ['S29'] },
  { id: 'noachis', name: 'Noachis Terra', lat: -45.0, lon: 350.0, traits: ['ground_ice', 'clays'], blurb: 'Some of the oldest ground on Mars.', sources: ['S29'] },
  // --- South polar (MC-30) ---
  { id: 'planum_australe', name: 'Planum Australe', lat: -83.9, lon: 160.0, traits: ['ice_cap', 'polar_night'], blurb: 'The south polar cap: water ice under a thin layer of frozen carbon dioxide.', sources: ['S29'] },
  { id: 'ultimi', name: 'Ultimi Scopuli', lat: -76.0, lon: 165.0, traits: ['ice_cap', 'polar_night'], blurb: 'Where NASA’s Mars Polar Lander was meant to land in 1999 — chosen for its flat, layered ice.', sources: ['S29'] },
];

export const BASE_SITES: BaseSite[] = SEEDS.map((s) => ({ ...s, regionId: REGIONS[regionIndexAt(s.lat, s.lon)].id }));
export const SITE_BY_ID: Record<string, BaseSite> = Object.fromEntries(BASE_SITES.map((s) => [s.id, s]));
export const HOME_SITE_ID = 'jezero';

export function sitesIn(regionId: string): BaseSite[] {
  return BASE_SITES.filter((s) => s.regionId === regionId);
}

/** Traits the player can see right now (some need the radar orbiter). */
export function visibleTraits(site: BaseSite, research: readonly string[]): TraitId[] {
  return site.traits.filter((t) => !TRAITS[t].hiddenUntil || research.includes(TRAITS[t].hiddenUntil!));
}

// ---------------------------------------------------------------------------
// Site effects (game values)
// ---------------------------------------------------------------------------

export interface SiteModifiers {
  /** Solar output multiplier (latitude, dust, polar night). */
  solar: number;
  /** Multiplier on heating/air power of living and food buildings. */
  heating: number;
  /** Output multiplier per resource for production recipes. */
  output: Partial<Record<ResourceId, number>>;
  /** Ice reserve multiplier. */
  iceReserve: number;
  /** Multiplier on habitat construction cost (radiation shielding). */
  shielding: number;
  /** Buildings that can't be built here, with the reason. */
  banned: Partial<Record<BuildingType, string>>;
  /** Buildings that can ONLY be built where the site has this trait. */
  traits: TraitId[];
}

/** Starting ice reserve multiplier for a trait set. */
function iceFactor(traits: readonly TraitId[]): number {
  if (traits.includes('ice_cap')) return 12;
  if (traits.includes('buried_glacier')) return 6;
  if (traits.includes('ground_ice')) return 2.5;
  if (traits.includes('clays')) return 1;
  return 0.6;
}

const COS_HOME = Math.cos((SETTLEMENT.lat * Math.PI) / 180);

/**
 * What a site does to a base. Latitude sets sunlight and cold (game values tuned so Jezero is
 * the reference: 1×); traits add the rest.
 */
export function siteModifiers(siteId: string): SiteModifiers {
  // Unknown ids (tests, labs) get a plain site at the home latitude with no traits.
  const site = SITE_BY_ID[siteId] ?? { ...SITE_BY_ID[HOME_SITE_ID], traits: [] };
  const t = site.traits;
  const absLat = Math.abs(site.lat);
  let solar = Math.max(0.05, Math.cos((absLat * Math.PI) / 180)) / COS_HOME;
  if (t.includes('dusty')) solar *= 0.8;
  if (t.includes('volcano')) solar *= 1.1;
  if (t.includes('polar_night')) solar *= 0.4;
  let heating = 1 + Math.max(0, absLat - 20) / 45;
  if (t.includes('ice_cap')) heating = Math.max(heating, 2.5);
  if (t.includes('volcano')) heating *= 1.4;
  const output: Partial<Record<ResourceId, number>> = {};
  const mul = (id: ResourceId, f: number) => (output[id] = (output[id] ?? 1) * f);
  if (t.includes('ice_cap')) mul('water', 2);
  else if (t.includes('buried_glacier')) mul('water', 1.8);
  else if (t.includes('ground_ice')) mul('water', 1.4);
  if (t.includes('clays')) {
    mul('water', 1.15);
    mul('regolith', 1.1);
  }
  if (t.includes('hematite')) mul('iron', 2);
  if (t.includes('flood_rocks')) {
    mul('regolith', 1.2);
    mul('iron', 1.2);
  }
  if (t.includes('canyon')) mul('iron', 1.2);
  if (t.includes('dusty')) mul('regolith', 1.3);
  let shielding = 1;
  if (t.includes('basin_air')) shielding *= 0.75;
  if (t.includes('canyon')) shielding *= 0.9;
  if (t.includes('volcano')) shielding *= 1.3;
  if (t.includes('lava_tube')) shielding *= 0.8;
  const banned: Partial<Record<BuildingType, string>> = {};
  if (t.includes('ice_cap')) banned.greenhouse = 'Too cold for a greenhouse dome: polar nights reach about −123 °C.';
  return { solar, heating, output, iceReserve: iceFactor(t), shielding, banned, traits: [...t] };
}

/** Ice reserve (kg) a new base at this site starts with. */
export function startingIce(siteId: string, baseReserve: number): number {
  return Math.round(baseReserve * siteModifiers(siteId).iceReserve);
}
