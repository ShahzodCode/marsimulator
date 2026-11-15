import { describe, expect, it } from 'vitest';
import { isNameAllowed } from '../data/usernameFilter';
import { validateUsername } from './Auth';
import { toColony, toRow } from './Leaderboard';

describe('username filter', () => {
  it('lets normal and space-themed names through', () => {
    for (const n of ['Commander Nova', 'Cassini_Kid', 'Hellas Explorer', 'Classic-7', 'Ава']) expect(isNameAllowed(n)).toBe(true);
  });

  it('blocks rude words, also with spaces or number swaps', () => {
    for (const n of ['shit head', 'Sh1t', 'b_i_t_c_h', 'P0RN star']) expect(isNameAllowed(n)).toBe(false);
  });

  it('is part of the username check', () => {
    expect(validateUsername('Fuk-it')).toMatch(/friendlier/);
    expect(validateUsername('Nova')).toBeNull();
  });
});

describe('leaderboard data', () => {
  it('maps a board row and survives odd values', () => {
    const row = toRow({ user_id: 'u1', username: 'Nova', xp: '120', sol: 4, colonists: null, buildings: 9, bases: 1, online: true, score: 120, position: 2, is_me: false });
    expect(row).toMatchObject({ userId: 'u1', username: 'Nova', xp: 120, colonists: 0, position: 2, online: true, isMe: false });
  });

  it('maps a public colony and drops broken buildings', () => {
    const c = toColony({
      userId: 'u1',
      username: 'Nova',
      xp: 300,
      sol: 12,
      milestones: ['first_home', 7],
      baseList: [
        {
          id: 'base-jezero',
          name: 'Jezero Base',
          siteId: 'jezero',
          lat: 18.4,
          lon: 77.5,
          colonists: 6,
          roads: ['1,2', 3],
          buildingList: [
            { id: 'b1', type: 'habitat', gridX: 1, gridY: 2, rotation: 5, constructionProgress: 2, connected: true },
            { type: 'habitat' },
          ],
        },
      ],
    });
    expect(c?.bases).toHaveLength(1);
    expect(c?.bases[0].roads).toEqual(['1,2']);
    expect(c?.bases[0].buildings).toEqual([{ id: 'b1', type: 'habitat', gridX: 1, gridY: 2, rotation: 1, constructionProgress: 1, connected: true }]);
    expect(c?.milestones).toEqual(['first_home']);
  });

  it('returns null for an empty answer (player not on the board)', () => {
    expect(toColony(null)).toBeNull();
  });
});
