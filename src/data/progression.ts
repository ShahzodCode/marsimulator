import type { Cost } from '../simulation/ResourceManager';

/** Player progression and exploration-mission tuning (game values). */

export const LEVELS = [
  { level: 1, xp: 0, title: 'Outpost' },
  { level: 2, xp: 60, title: 'Base' },
  { level: 3, xp: 160, title: 'Settlement' },
  { level: 4, xp: 320, title: 'Colony' },
  { level: 5, xp: 550, title: 'Town' },
  { level: 6, xp: 900, title: 'City' },
];

export const XP_REWARDS = {
  buildingComplete: 20,
  regionDiscovered: 45,
};

export const RESEARCH_UNLOCK_LEVEL = 3;

export function levelForXp(xp: number): (typeof LEVELS)[number] {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  return cur;
}

export function nextLevel(level: number): (typeof LEVELS)[number] | null {
  return LEVELS.find((l) => l.level === level + 1) ?? null;
}

export const SURVEY = {
  /** An uncrewed survey rover is built from these materials. */
  cost: { iron: 30, regolith: 10 } as Cost,
  maxConcurrent: 2,
  /** Base duration + distance / speed. */
  baseSols: 0.8,
  kmPerSol: 3200,
};

/** Upcoming technologies (research system arrives in a later stage). */
export const TECHNOLOGIES = [
  { id: 'moxie', name: 'Oxygen from Air', icon: '🫧', description: 'Pull oxygen straight out of the carbon-dioxide atmosphere, like NASA’s MOXIE experiment on Perseverance.' },
  { id: 'nuclear', name: 'Compact Fission Power', icon: '⚛️', description: 'Steady power day and night — even during dust storms.' },
  { id: 'bricks', name: 'Regolith Bricks', icon: '🧱', description: 'Sinter Martian soil into strong bricks to build cheaper habitats.' },
  { id: 'hydroponics', name: 'Advanced Hydroponics', icon: '🥬', description: 'Grow more food with less water by feeding roots directly.' },
  { id: 'rovers', name: 'Long-Range Rovers', icon: '🚙', description: 'Faster survey missions that can travel farther.' },
];
