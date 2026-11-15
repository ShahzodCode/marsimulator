import type { BuildingInstance } from '../state/types';
import type { BuildingType } from '../data/buildings';
import { supabase } from './supabase';
import { Auth, type Account } from './Auth';

/**
 * The online leaderboard and other players' public profiles (Supabase functions in
 * supabase/migrations/0002_leaderboard.sql). Other players' saves are never read
 * directly — only the few fields those functions hand out.
 */

export type LeaderboardSort = 'xp' | 'colonists' | 'buildings' | 'bases';

export const SORTS: { id: LeaderboardSort; label: string; unit: string }[] = [
  { id: 'xp', label: 'XP', unit: 'XP' },
  { id: 'colonists', label: 'Crew', unit: 'crew' },
  { id: 'buildings', label: 'Buildings', unit: 'buildings' },
  { id: 'bases', label: 'Bases', unit: 'bases' },
];

export interface LeaderboardRow {
  userId: string;
  username: string;
  xp: number;
  sol: number;
  colonists: number;
  buildings: number;
  bases: number;
  online: boolean;
  /** The value the board is sorted by. */
  score: number;
  /** 1-based place on the whole board (ties share a place). */
  position: number;
  isMe: boolean;
}

export interface MyPosition {
  position: number;
  score: number;
  total: number;
  /** False when the player switched "Show me on the leaderboard" off. */
  listed: boolean;
}

/** What a visit needs to draw a building — the rest of a building stays private. */
export type PublicBuilding = Pick<BuildingInstance, 'id' | 'type' | 'gridX' | 'gridY' | 'rotation' | 'constructionProgress' | 'connected'>;

export interface PublicBase {
  id: string;
  name: string;
  siteId: string;
  lat: number;
  lon: number;
  foundedSol: number;
  colonists: number;
  buildings: PublicBuilding[];
  roads: string[];
}

export interface PublicColony {
  userId: string;
  username: string;
  xp: number;
  sol: number;
  colonists: number;
  buildings: number;
  bases: PublicBase[];
  regions: number;
  milestones: string[];
  online: boolean;
  savedAt: string;
}

export type Loaded<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'guest' | 'unavailable' | 'offline' | 'error'; message: string };

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; value: Loaded<unknown> }>();

function fail(reason: 'guest' | 'unavailable' | 'offline' | 'error', message: string): Loaded<never> {
  return { ok: false, reason, message };
}

/** Turns a Supabase / network error into a reason the UI can explain. */
function fromError(error: { message?: string; code?: string } | null | undefined): Loaded<never> {
  const msg = (error?.message ?? '').toLowerCase();
  // The migration hasn't been run yet: the function or table doesn't exist.
  if (error?.code === 'PGRST202' || error?.code === 'PGRST205' || error?.code === '42883' || error?.code === '42P01' || msg.includes('could not find the function')) {
    console.warn('Leaderboard: the database is not set up. Run supabase/migrations/0002_leaderboard.sql once in the Supabase SQL Editor.', error);
    return fail('unavailable', 'The leaderboard is not switched on yet — please tell a grown-up.');
  }
  if (msg.includes('fetch') || msg.includes('network')) return fail('offline', 'Could not reach the server. Check your internet connection.');
  return fail('error', 'Something went wrong loading the leaderboard. Try again in a moment.');
}

async function cached<T>(key: string, fresh: boolean, load: () => Promise<Loaded<T>>): Promise<Loaded<T>> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value as Loaded<T>;
  const value = await load();
  // Only keep answers worth repeating; errors are retried next time.
  if (value.ok) cache.set(key, { at: Date.now(), value });
  return value;
}

function guardSignedIn(): Loaded<never> | null {
  if (!supabase) return fail('unavailable', 'Online features are not available in this version.');
  if (!Auth.current) return fail('guest', 'Log in to see the other commanders.');
  return null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

export function toRow(r: Record<string, unknown>): LeaderboardRow {
  return {
    userId: str(r.user_id),
    username: str(r.username, 'Commander'),
    xp: num(r.xp),
    sol: num(r.sol),
    colonists: num(r.colonists),
    buildings: num(r.buildings),
    bases: num(r.bases),
    online: r.online === true,
    score: num(r.score),
    position: num(r.place),
    isMe: r.is_me === true,
  };
}

export function toColony(raw: unknown): PublicColony | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const list = Array.isArray(c.baseList) ? (c.baseList as Record<string, unknown>[]) : [];
  const bases: PublicBase[] = list
    .map((b, i) => ({
      id: str(b.id, `base-${i}`),
      name: str(b.name, i === 0 ? 'Jezero Base' : `Base ${i + 1}`),
      siteId: str(b.siteId, 'jezero'),
      lat: num(b.lat),
      lon: num(b.lon),
      foundedSol: num(b.foundedSol),
      colonists: num(b.colonists),
      roads: Array.isArray(b.roads) ? (b.roads as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      buildings: (Array.isArray(b.buildingList) ? (b.buildingList as Record<string, unknown>[]) : [])
        .filter((x) => typeof x.id === 'string' && typeof x.type === 'string')
        .map((x) => ({
          id: str(x.id),
          type: x.type as BuildingType,
          gridX: num(x.gridX),
          gridY: num(x.gridY),
          rotation: num(x.rotation) % 4,
          constructionProgress: Math.min(1, num(x.constructionProgress)),
          connected: x.connected === true,
        })),
    }));
  return {
    userId: str(c.userId),
    username: str(c.username, 'Commander'),
    xp: num(c.xp),
    sol: num(c.sol),
    colonists: num(c.colonists),
    buildings: num(c.buildings),
    bases,
    regions: num(c.regions),
    milestones: Array.isArray(c.milestones) ? (c.milestones as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    online: c.online === true,
    savedAt: str(c.savedAt),
  };
}

export const Leaderboard = {
  /** Top players for a sort order, or the players whose name contains `search`. */
  async list(sort: LeaderboardSort, search = '', fresh = false): Promise<Loaded<LeaderboardRow[]>> {
    const blocked = guardSignedIn();
    if (blocked) return blocked;
    const term = search.trim().slice(0, 20);
    return cached(`list:${sort}:${term.toLowerCase()}`, fresh, async () => {
      try {
        const { data, error } = await supabase!.rpc('get_leaderboard', { sort, max_rows: 50, search: term || null });
        if (error) return fromError(error);
        return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map(toRow) };
      } catch (e) {
        return fromError(e as Error);
      }
    });
  },

  async myPosition(sort: LeaderboardSort, fresh = false): Promise<Loaded<MyPosition | null>> {
    const blocked = guardSignedIn();
    if (blocked) return blocked;
    return cached(`me:${sort}`, fresh, async () => {
      try {
        const { data, error } = await supabase!.rpc('get_my_position', { sort });
        if (error) return fromError(error);
        const r = ((data ?? []) as Record<string, unknown>[])[0];
        return { ok: true, data: r ? { position: num(r.place), score: num(r.score), total: num(r.total), listed: r.listed === true } : null };
      } catch (e) {
        return fromError(e as Error);
      }
    });
  },

  /** A player's public profile and base layouts (null when they're not on the board). */
  async colony(userId: string, fresh = false): Promise<Loaded<PublicColony | null>> {
    const blocked = guardSignedIn();
    if (blocked) return blocked;
    return cached(`colony:${userId}`, fresh, async () => {
      try {
        const { data, error } = await supabase!.rpc('get_public_colony', { target: userId });
        if (error) return fromError(error);
        return { ok: true, data: toColony(data) };
      } catch (e) {
        return fromError(e as Error);
      }
    });
  },

  /**
   * The signed-in player's public profile: the name others see (a placeholder such as
   * "Commander 4821" until they pick one) and whether they show on the board (default: yes).
   * Every account gets one automatically (migration 0003); null if it doesn't exist.
   */
  async myProfile(): Promise<{ username: string; visible: boolean } | null> {
    const account = Auth.current;
    if (!supabase || !account) return null;
    const { data } = await supabase.from('profiles').select('username, show_on_leaderboard').eq('user_id', account.id).maybeSingle();
    const row = data as { username?: string; show_on_leaderboard?: boolean } | null;
    return row ? { username: row.username ?? '', visible: row.show_on_leaderboard ?? true } : null;
  },

  async setVisible(show: boolean): Promise<{ ok: boolean; message?: string }> {
    const account = Auth.current;
    if (!supabase || !account) return { ok: false, message: 'Log in first.' };
    // The profile row exists from sign-up, so only the switch changes (the name stays as it is).
    const { data, error } = await supabase
      .from('profiles')
      .update({ show_on_leaderboard: show, updated_at: new Date().toISOString() })
      .eq('user_id', account.id)
      .select('user_id');
    cache.clear();
    if (error) {
      const f = fromError(error);
      return { ok: false, message: f.ok ? undefined : f.message };
    }
    if (data?.length) return { ok: true };
    // No profile yet (database set up before automatic profiles): make one with the chosen name.
    if (!account.username) return { ok: false, message: 'Pick your name first.' };
    const up = await supabase
      .from('profiles')
      .upsert({ user_id: account.id, username: account.username, show_on_leaderboard: show, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    return up.error ? { ok: false, message: 'Could not change that right now.' } : { ok: true };
  },

  clearCache(): void {
    cache.clear();
  },
};

/**
 * Keeps the public profile row in step with the account's username: after picking or
 * changing a name, and after each log-in (covers accounts made before the leaderboard).
 * Only the name is written, so the player's "show me" choice is never overwritten.
 */
async function syncProfile(account: Account | null): Promise<void> {
  if (!supabase || !account?.username) return;
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: account.id, username: account.username, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.warn('Profile sync failed:', error.message);
  cache.clear();
}

void Auth.ready.then(() => syncProfile(Auth.current));
Auth.onChange((account, change) => {
  cache.clear();
  if (change !== 'logout') void syncProfile(account);
});
