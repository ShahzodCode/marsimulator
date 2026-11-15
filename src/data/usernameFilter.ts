/**
 * Names other players can see on the leaderboard must be kid-safe. Same list as
 * `public.username_ok` in supabase/migrations/0002_leaderboard.sql — keep them in step.
 * Short words that hide inside normal names (e.g. "ass" in "Cassini", "hell" in
 * "Hellas") are left out on purpose; an admin can still hide a bad name.
 */
const BLOCKED = [
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'bastard', 'asshole', 'arsehole', 'nigger', 'nigga',
  'faggot', 'retard', 'penis', 'vagina', 'porn', 'sexy', 'boobs', 'nazi', 'hitler', 'rapist', 'pedo', 'wank', 'twat', 'dildo',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', $: 's', '@': 'a', '!': 'i' };

/** Lower case, no spaces / _ / -, common number-for-letter swaps undone. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_-]/g, '')
    .replace(/[013457$@!]/g, (c) => LEET[c] ?? c);
}

export function isNameAllowed(name: string): boolean {
  const n = normalizeName(name);
  return !BLOCKED.some((w) => n.includes(w));
}
