import { gameStore } from '../state/gameStore';

/** Real seconds per sol at 1× speed. */
export const SECONDS_PER_SOL = 40;
/** A Martian solar day is 24 h 39 min 35 s. */
export const SOL_HOURS = 24.6597;

/**
 * Converts real elapsed time into simulated time using the pause / speed state.
 */
export class GameClock {
  /** Returns how many sols should be simulated for a real-time delta (seconds). */
  tick(realDt: number): number {
    const { paused, speed, started } = gameStore.getState();
    if (paused || !started) return 0;
    return (realDt * speed) / SECONDS_PER_SOL;
  }
}

/** "Sol 12 · 14:05" — sol number plus Mars local time (24 Martian hours per sol). */
export function formatMarsTime(timeSols: number): { sol: number; clock: string } {
  const sol = Math.floor(timeSols) + 1;
  const frac = timeSols - Math.floor(timeSols);
  // Day starts at 06:00 local time so the first sol begins in the morning.
  const minutes = Math.floor(((frac * 24 + 6) % 24) * 60);
  const hh = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mm = (minutes % 60).toString().padStart(2, '0');
  return { sol, clock: `${hh}:${mm}` };
}
