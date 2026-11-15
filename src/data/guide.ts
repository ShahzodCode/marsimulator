import type { GameState } from '../state/types';
import { hasRank, rankById, type RankId } from './progression';

/**
 * The Commander's Guidebook — pure data. Chapters open one by one as the player
 * progresses, so a new player only reads what they need right now. Every text is the
 * English i18n key (translated with t() in ui/GuideBook.ts).
 */

export type GuideUnlock =
  | { kind: 'start' }
  /** Reached this rank. */
  | { kind: 'rank'; rank: RankId }
  /** Finished the first new building (the “Build something new” goal). */
  | { kind: 'first_build' }
  /** Mapped at least this many regions from orbit (the home region counts). */
  | { kind: 'regions'; count: number };

export interface GuidePage {
  /** A big picture for the page (emoji). */
  art: string;
  title: string;
  body: string[];
  /** A short highlighted tip at the bottom. */
  tip?: string;
}

export interface GuideChapter {
  id: string;
  icon: string;
  title: string;
  unlock: GuideUnlock;
  pages: GuidePage[];
}

export const GUIDE: GuideChapter[] = [
  {
    id: 'welcome',
    icon: '👋',
    title: 'Welcome, Commander!',
    unlock: { kind: 'start' },
    pages: [
      {
        art: '🧑‍🚀🪐',
        title: 'Welcome, Commander!',
        body: [
          'You run a real base on Mars, in Jezero Crater. Keep your crew safe, build new machines and explore the whole planet.',
          'Drag to move the map. Scroll or pinch to zoom. Right-drag or Q / E turns it around.',
          'Press H to fly home to your base and G to see the whole planet.',
        ],
        tip: 'A sol is one Martian day: 24 hours and 39 minutes. Space pauses time, and 1, 2, 3 change the speed.',
      },
    ],
  },
  {
    id: 'crew',
    icon: '🫁',
    title: 'Keep your crew alive',
    unlock: { kind: 'start' },
    pages: [
      {
        art: '🥕💧💨',
        title: 'Food, water and air',
        body: [
          'Your colonists need food, water and oxygen every sol. Watch the bars at the top of the screen.',
          'The Ice Drill melts buried ice into water. The Life-Support Plant splits water into oxygen to breathe and recycles 98 % of used water.',
          'The Greenhouse & Chicken Coop grows food from water and electricity.',
        ],
        tip: 'Nothing is ever destroyed. If something runs low, families just stop growing until you fix it.',
      },
    ],
  },
  {
    id: 'power',
    icon: '⚡',
    title: 'Sunshine and cold nights',
    unlock: { kind: 'start' },
    pages: [
      {
        art: '☀️🔆',
        title: 'Electricity from the Sun',
        body: [
          'Solar Farms make electricity only while the Sun is up. Every machine needs some power.',
          'Point at the ⚡ box at the top to see how much power you make and how much is spare for new buildings.',
          'If there is not enough, life support gets power first and big machines wait.',
        ],
        tip: 'You can switch a building off in its panel to save power for something more important.',
      },
      {
        art: '🌙🥶',
        title: 'Nights are freezing',
        body: [
          'At night the Sun is gone, so solar panels stop working.',
          'Outside it gets very cold: about −2 °C in the afternoon but −75 °C at night! Habitats and domes need more power at night to stay warm inside.',
          'In the warm afternoon the heaters rest and use less.',
        ],
        tip: 'Real numbers: NASA’s Curiosity rover measured these air temperatures in Gale Crater.',
      },
    ],
  },
  {
    id: 'building',
    icon: '🏗️',
    title: 'Building your base',
    unlock: { kind: 'start' },
    pages: [
      {
        art: '🏗️🧱',
        title: 'Placing buildings',
        body: [
          'Press B (or the Build button) and pick a building. Click on the ground to place it, R turns it and Esc cancels.',
          'Buildings cost regolith (Martian soil) and iron. The Regolith Excavator digs soil and the Iron Refinery turns it into iron.',
          'A new building also needs spare electricity — build a Solar Farm first if it says so.',
        ],
        tip: 'Every finished building gives you XP!',
      },
      {
        art: '🛣️📦',
        title: 'Roads and storage',
        body: [
          'Machines send what they make along roads to the Central Storage Depot. Press N to draw roads from a building to the depot.',
          'Each storage building holds only so much. When it is full, machines wait — build a Storage Silo & Tanks for more room.',
          'Supply ships drop a little regolith and iron at the depot every 2 sols, so you are never stuck.',
        ],
      },
    ],
  },
  {
    id: 'explore',
    icon: '🛰️',
    title: 'Exploring Mars',
    unlock: { kind: 'first_build' },
    pages: [
      {
        art: '🛰️🗺️',
        title: 'Step 1: map from orbit',
        body: [
          'Press X to open Exploration. Pick a region on the globe and press “Map from orbit”.',
          'Your orbiter takes pictures from space, the fog clears and you can see what is there.',
        ],
        tip: 'This is how NASA explores Mars too: first from orbit, then on the ground.',
      },
      {
        art: '🚙🌪️',
        title: 'Step 2: send a crew rover',
        body: [
          'Next to a mapped region, send the crew rover. Two astronauts drive there to look closely and collect samples.',
          'The rover parks at night because its solar panels need the Sun. A dust storm can stop it for a while — it waits safely.',
          'Good finds like ice or iron give you rewards and XP.',
        ],
      },
    ],
  },
  {
    id: 'ranks',
    icon: '🎖️',
    title: 'Ranks and missions',
    unlock: { kind: 'first_build' },
    pages: [
      {
        art: '🎖️⭐',
        title: 'Earn XP, climb ranks',
        body: [
          'You get XP for finished buildings, explored regions and goals. Press M to see your goals.',
          'XP raises your rank — from Junior Pioneer all the way to Hero of Mars. Each new rank unlocks buildings, rovers and more bases.',
          'This guidebook grows with you: new chapters open as your rank goes up.',
        ],
        tip: 'Click your profile at the top to see your rank and the leaderboard.',
      },
    ],
  },
  {
    id: 'outposts',
    icon: '⛺',
    title: 'Outposts',
    unlock: { kind: 'rank', rank: 'astronaut_candidate' },
    pages: [
      {
        art: '⛺🧊',
        title: 'Outposts send cargo home',
        body: [
          'After a crew explores a region with ice or iron, you can build a small outpost there (Step 3 in Exploration).',
          'A cargo rover brings what it digs back to your base, load by load, until the site is used up.',
          'You now also have a second crew rover and the Storage Silo & Tanks.',
        ],
      },
    ],
  },
  {
    id: 'new_bases',
    icon: '🚩',
    title: 'A second base',
    unlock: { kind: 'regions', count: 2 },
    pages: [
      {
        art: '🚩🚐',
        title: 'Found a new base',
        body: [
          'While the orbiter maps a region, base sites appear one by one. These are real places NASA studied for landing.',
          'Pick a site in Exploration and send a founding convoy. Two colonists move there for good and start a new family.',
          'Every site is different: icy sites need more heating, dusty sites get less sunshine, some have iron or caves.',
        ],
        tip: 'Use the base switcher at the top to jump between your bases.',
      },
    ],
  },
  {
    id: 'night_power',
    icon: '🔋',
    title: 'Power through the night',
    unlock: { kind: 'rank', rank: 'mars_engineer' },
    pages: [
      {
        art: '🔋🌙',
        title: 'Battery Bank',
        body: [
          'A Battery Bank stores spare sunshine in the day and gives it back at night, when the heaters need it most.',
          'Build enough Solar Farms so that the batteries are full by sunset.',
        ],
        tip: 'Watch the battery bar in the ⚡ box. If it is empty before sunrise, build more batteries or solar panels.',
      },
      {
        art: '💨🤖',
        title: 'MOXIE Oxygen Maker',
        body: [
          'MOXIE makes oxygen straight from the Martian air, which is mostly carbon dioxide. It needs no water!',
          'A small MOXIE really worked on NASA’s Perseverance rover.',
        ],
      },
    ],
  },
  {
    id: 'logistics',
    icon: '🚚',
    title: 'Trucks and pipelines',
    unlock: { kind: 'rank', rank: 'rover_pilot' },
    pages: [
      {
        art: '🚚📦',
        title: 'Cargo Hauler Garage',
        body: [
          'A garage sends cargo trucks to another base. Drag the orange arrow on the garage onto the base you want to supply.',
          'Move the sliders to load the trucks, or switch on automatic to repeat the load every trip.',
        ],
      },
      {
        art: '🛢️↔️',
        title: 'Pipelines',
        body: [
          'Build a Pipeline Pump Station at two bases. Press P, press on one base and drag onto the other.',
          'The pipeline shares goods so both bases even out. If something pinches the pipe, repair robots drive out and fix it by themselves.',
        ],
      },
    ],
  },
  {
    id: 'research',
    icon: '🔬',
    title: 'Research',
    unlock: { kind: 'rank', rank: 'settlement_commander' },
    pages: [
      {
        art: '🔬🧪',
        title: 'Research Lab',
        body: [
          'Build a Research Lab, then press T to pick a project. Labs make research points every sol.',
          'Each project goes through four stages, like real NASA technology: concept study, lab prototype, field test and mission ready.',
          'Research gives better drills, cleaner solar panels, faster rovers and giant new buildings.',
        ],
        tip: 'More labs finish projects faster.',
      },
    ],
  },
  {
    id: 'big_machines',
    icon: '🏭',
    title: 'Giant machines',
    unlock: { kind: 'rank', rank: 'mission_specialist' },
    pages: [
      {
        art: '🏭⛏️',
        title: 'Think big',
        body: [
          'Research unlocks the Bucket-Wheel Megadigger, the Big Dome and the Glacier Mine.',
          'Some only work at the right site: a Glacier Mine needs ice in the ground. The Big Dome needs lots of heating power.',
          'At Flight Engineer you can research a Compact Fission Reactor: steady power day and night, even in a dust storm.',
        ],
      },
    ],
  },
  {
    id: 'hero',
    icon: '🌟',
    title: 'Road to Hero of Mars',
    unlock: { kind: 'rank', rank: 'base_director' },
    pages: [
      {
        art: '🌋🌟',
        title: 'The last frontier',
        body: [
          'Base Director unlocks the Lava-Tube Habitat — a home inside a cave that shields from radiation — and the Deep Aquifer Drill.',
          'Run up to 12 bases, finish every research project and become a Hero of Mars!',
        ],
        tip: 'Real astronauts will need these same skills. Maybe one day it will be you!',
      },
    ],
  },
];

type GuideState = Pick<GameState, 'progression' | 'discoveredRegions' | 'buildings' | 'otherBases'>;

export function chapterUnlocked(c: GuideChapter, s: GuideState): boolean {
  const u = c.unlock;
  switch (u.kind) {
    case 'start':
      return true;
    case 'rank':
      return hasRank(s.progression.level, u.rank);
    case 'first_build':
      return s.progression.milestones.includes('goal-first-build') || s.progression.level > 1 || s.otherBases.length > 0;
    case 'regions':
      return Object.values(s.discoveredRegions).filter(Boolean).length >= u.count || s.otherBases.length > 0;
  }
}

/** How to open a locked chapter, as an English i18n key plus its parameters. */
export function unlockHint(c: GuideChapter): { text: string; params?: Record<string, string> } {
  const u = c.unlock;
  switch (u.kind) {
    case 'start':
      return { text: '' };
    case 'rank':
      return { text: 'Reach the rank {rank} to open this chapter.', params: { rank: rankById(u.rank).title } };
    case 'first_build':
      return { text: 'Build your first new building to open this chapter.' };
    case 'regions':
      return { text: 'Map a new region from orbit to open this chapter.' };
  }
}
