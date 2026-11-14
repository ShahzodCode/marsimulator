import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * Browser Supabase client (publishable key only — never the secret key).
 * `null` when the env vars are missing, in which case the game saves locally only.
 * The auth session (an email account — see Auth.ts) is kept in localStorage by
 * supabase-js. Guests have no session and save on this device only.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mars-colony-auth' } }) : null;

let userPromise: Promise<string | null> | null = null;

/** Forget the cached user id after logging in or out, so the next save uses the new session. */
export function resetCloudUser(): void {
  userPromise = null;
}

/** The signed-in account's user id (null for guests, or when offline / disabled). */
export function cloudUserId(): Promise<string | null> {
  if (!supabase) return Promise.resolve(null);
  if (!userPromise) {
    userPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      return user && !user.is_anonymous ? user.id : null;
    })().catch((e) => {
      console.warn('Cloud saves unavailable:', (e as Error).message);
      userPromise = null; // retry on the next save
      return null;
    });
  }
  return userPromise;
}
