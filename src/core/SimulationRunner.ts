import { SIM_KEYS, stepSimulation, type SimEvent } from '../simulation/SimulationEngine';
import { SIM_STEP_SOLS, SimulationClock } from '../simulation/SimulationClock';
import type { AlertSpec } from '../simulation/Warnings';
import { gameStore, getRouteHeight, regionManager } from '../state/gameStore';
import type { GameState } from '../state/types';
import type { EventBus } from './EventBus';

/**
 * Connects the pure simulation to the store and the event bus. Rendering calls `frame`
 * every animation frame; the clock decides how many fixed steps that is (zero while
 * paused), and the result is written back in one store update.
 */
export class SimulationRunner {
  readonly clock = new SimulationClock();

  constructor(private events: EventBus) {}

  frame(realDt: number): void {
    const steps = this.clock.tick(realDt, gameStore.getState());
    if (steps > 0) this.run(steps, SIM_STEP_SOLS);
  }

  /** Recompute rates and statuses without advancing time (start-up, after loading). */
  refresh(): void {
    this.run(1, 0);
  }

  private run(steps: number, dt: number): void {
    let state: GameState = gameStore.getState();
    const events: SimEvent[] = [];
    const notices: AlertSpec[] = [];
    let warnings: AlertSpec[] = [];
    for (let i = 0; i < steps; i++) {
      const r = stepSimulation(state, dt, regionManager, { height: getRouteHeight() });
      state = r.state;
      events.push(...r.events);
      notices.push(...r.notices);
      warnings = r.warnings;
    }
    const patch: Partial<GameState> = {};
    for (const k of SIM_KEYS) (patch as Record<string, unknown>)[k] = state[k];
    gameStore.setState(patch);

    const store = gameStore.getState();
    for (const n of notices) store.pushAlert(n);
    store.setPersistentAlerts(warnings);
    for (const e of events) {
      if (e.type === 'production') this.events.emit('production:delivered', { buildingId: e.buildingId, delivered: e.delivered });
      else this.events.emit(e.type, { id: e.id });
    }
  }
}
