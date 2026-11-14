import type { ResourceId } from '../data/resources';

/**
 * Typed pub/sub for transient, fire-and-forget events (things that *happened*).
 * Persistent game data lives in the Zustand store, never in events.
 */
export interface GameEvents {
  'building:completed': { id: string };
  'region:discovered': { id: string };
  /** A production cycle finished and its goods were stored. */
  'production:delivered': { buildingId: string; delivered: Partial<Record<ResourceId, number>> };
  'camera:flyTo': { lat: number; lon: number; altitude?: number };
  'camera:home': void;
  'camera:globe': void;
  'pointer:surface': { lat: number; lon: number; regionId: string } | null;
  'placement:feedback': { valid: boolean; message: string | null };
  'game:saved': { ok: boolean; message: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(type: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(type: K, ...args: GameEvents[K] extends void ? [] : [GameEvents[K]]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of set) h(args[0]);
  }
}
