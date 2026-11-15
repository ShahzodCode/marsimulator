import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state/factory';
import { chapterUnlocked, GUIDE } from './guide';
import { rankById } from './progression';

const open = (s: Parameters<typeof chapterUnlocked>[1]) => GUIDE.filter((c) => chapterUnlocked(c, s)).map((c) => c.id);

describe('Guidebook', () => {
  it('a new game opens only the starting chapters', () => {
    const s = createInitialState();
    expect(open(s)).toEqual(GUIDE.filter((c) => c.unlock.kind === 'start').map((c) => c.id));
  });

  it('chapters open with progress and every chapter can open', () => {
    const s = createInitialState();
    const later = { ...s, progression: { ...s.progression, level: rankById('hero_of_mars').level, milestones: ['goal-first-build'] }, discoveredRegions: { ...s.discoveredRegions, 'MC-01': true, 'MC-02': true } };
    expect(open(later)).toHaveLength(GUIDE.length);
  });

  it('every chapter has a page and a unique id', () => {
    expect(new Set(GUIDE.map((c) => c.id)).size).toBe(GUIDE.length);
    for (const c of GUIDE) expect(c.pages.length).toBeGreaterThan(0);
  });
});
