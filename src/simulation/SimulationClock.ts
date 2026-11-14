import type { SimSpeed } from '../state/types';

/** Fixed simulation step in sols (0.4 s of real time at 1×). */
export const SIM_STEP_SOLS = 0.01;
/** Real seconds per sol at 1× speed. */
export const SECONDS_PER_SOL = 40;
/** Safety cap so a long stall never freezes the page catching up. */
export const MAX_STEPS_PER_FRAME = 50;

export interface ClockInput {
  paused: boolean;
  started: boolean;
  speed: SimSpeed;
}

/**
 * Fixed-step accumulator: real frame time × speed is collected, and the simulation runs in
 * whole SIM_STEP_SOLS steps. Leftover time carries over to the next frame, so results are
 * the same at 30 fps or 144 fps. While paused, nothing is collected.
 */
export class SimulationClock {
  private accumulator = 0;

  /** Returns how many fixed steps to run for this frame. */
  tick(realDt: number, s: ClockInput): number {
    if (s.paused || !s.started || !(realDt > 0)) return 0;
    this.accumulator += (realDt * s.speed) / SECONDS_PER_SOL;
    let steps = Math.floor(this.accumulator / SIM_STEP_SOLS + 1e-9);
    if (steps > MAX_STEPS_PER_FRAME) {
      // Very long stall (e.g. a hidden tab): keep the backlog bounded instead of dropping it all.
      this.accumulator = Math.min(this.accumulator, MAX_STEPS_PER_FRAME * 2 * SIM_STEP_SOLS);
      steps = MAX_STEPS_PER_FRAME;
    }
    this.accumulator = Math.max(0, this.accumulator - steps * SIM_STEP_SOLS);
    return steps;
  }

  /** Fraction of the way to the next step (0..1), for smooth UI interpolation. */
  get alpha(): number {
    return this.accumulator / SIM_STEP_SOLS;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
