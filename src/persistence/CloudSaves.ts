import { supabase, cloudUserId } from './supabase';
import { isSaveData, type SaveData } from './SaveSchema';

const TABLE = 'game_saves';

/** Supabase-backed save slots (table: public.game_saves, see supabase/migrations). */
export const CloudSaves = {
  async put(data: SaveData, slot: string): Promise<boolean> {
    const userId = await cloudUserId();
    if (!supabase || !userId) return false;
    const { error } = await supabase.from(TABLE).upsert(
      {
        user_id: userId,
        slot,
        version: data.version,
        sol: Math.floor(data.state.timeSols) + 1,
        data,
        saved_at: data.savedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,slot' },
    );
    if (error) throw new Error(error.message);
    return true;
  },

  async get(slot: string): Promise<SaveData | null> {
    const userId = await cloudUserId();
    if (!supabase || !userId) return null;
    const { data, error } = await supabase.from(TABLE).select('data').eq('user_id', userId).eq('slot', slot).maybeSingle();
    if (error) throw new Error(error.message);
    const raw = (data as { data?: unknown } | null)?.data;
    return isSaveData(raw) ? raw : null;
  },
};
