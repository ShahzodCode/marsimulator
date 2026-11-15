import type { PublicColony } from '../persistence/Leaderboard';

/** Whose colony is on screen while visiting another player. */
export interface Visit {
  colony: PublicColony;
  /** The base the camera is at. */
  baseId: string;
}

export interface VisitHost {
  start(colony: PublicColony, baseId: string): void;
  stop(): void;
}

type Listener = (visit: Visit | null) => void;

/**
 * Tiny hub between the UI (leaderboard, visit banner) and the 3D spectator owned by
 * Game, so dialogs can start a visit without knowing about the scene.
 */
class VisitHub {
  private host: VisitHost | null = null;
  private visit: Visit | null = null;
  private listeners = new Set<Listener>();

  register(host: VisitHost): void {
    this.host = host;
  }

  get current(): Visit | null {
    return this.visit;
  }

  start(colony: PublicColony, baseId: string): void {
    this.host?.start(colony, baseId);
  }

  stop(): void {
    if (this.visit) this.host?.stop();
  }

  /** Called by the host once the scene really changed. */
  set(visit: Visit | null): void {
    this.visit = visit;
    for (const fn of this.listeners) fn(visit);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const Visits = new VisitHub();
