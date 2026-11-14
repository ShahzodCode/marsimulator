import { RESOURCE_IDS, RESOURCES, emptyResources, type ResourceId } from '../data/resources';

export type ResourceBag = Record<ResourceId, number>;
export type Cost = Partial<Record<ResourceId, number>>;

const EPS = 1e-9;

export type ResourceErrorCode = 'insufficient' | 'no_capacity' | 'invalid_amount';

export type ResourceResult =
  | { ok: true; amount: number }
  | { ok: false; code: ResourceErrorCode; message: string; missing?: Cost };

/**
 * Anything that can hold resources: the global depot inventory today; tanks, silos or a
 * cargo rover's hold once physical logistics arrive. Transfers only ever go through this
 * interface, so production recipes never need to know where goods physically are.
 */
export interface StorageRecord {
  get(id: ResourceId): number;
  /** Free space for this resource. */
  room(id: ResourceId): number;
  /** Adds up to `amount`; returns how much was actually stored. */
  put(id: ResourceId, amount: number): number;
  /** Removes up to `amount`; returns how much was actually removed. */
  take(id: ResourceId, amount: number): number;
}

/**
 * The colony's global material inventory, with storage limits.
 *
 * Invariants: an amount is never negative and never above its capacity. Every operation
 * either succeeds completely or changes nothing and explains why.
 * Electricity is not handled here (see PowerManager).
 */
export class ResourceManager implements StorageRecord {
  private amounts: ResourceBag;
  private capacity: ResourceBag;

  constructor(amounts: ResourceBag, capacity: ResourceBag) {
    this.capacity = { ...capacity };
    this.amounts = emptyResources();
    for (const id of RESOURCE_IDS) this.amounts[id] = clamp(amounts[id] ?? 0, 0, this.capacity[id]);
  }

  /** Plain copy of the current amounts. */
  snapshot(): ResourceBag {
    return { ...this.amounts };
  }

  get(id: ResourceId): number {
    return this.amounts[id];
  }

  capacityOf(id: ResourceId): number {
    return this.capacity[id];
  }

  room(id: ResourceId): number {
    return Math.max(0, this.capacity[id] - this.amounts[id]);
  }

  /** Enough of everything in `cost`? */
  has(cost: Cost): boolean {
    return ResourceManager.canAfford(this.amounts, cost);
  }

  /** Room for all of `bag`? Resources that are vented when full never block. */
  hasRoomFor(bag: Cost): boolean {
    return (Object.entries(bag) as [ResourceId, number][]).every(([id, v]) => RESOURCES[id].ventWhenFull || this.room(id) + EPS >= v);
  }

  /** Adds the full amount or nothing. */
  add(id: ResourceId, amount: number): ResourceResult {
    if (!(amount >= 0)) return { ok: false, code: 'invalid_amount', message: 'Amounts must be positive.' };
    if (amount > this.room(id) + EPS) {
      return { ok: false, code: 'no_capacity', message: `Not enough storage space for ${RESOURCES[id].name.toLowerCase()}.` };
    }
    this.amounts[id] = Math.min(this.capacity[id], this.amounts[id] + amount);
    return { ok: true, amount };
  }

  /** Adds as much as fits; returns the amount that did not fit. */
  addUpTo(id: ResourceId, amount: number): number {
    const added = this.put(id, amount);
    return Math.max(0, amount - added);
  }

  /** Removes the full amount or nothing. */
  consume(id: ResourceId, amount: number): ResourceResult {
    if (!(amount >= 0)) return { ok: false, code: 'invalid_amount', message: 'Amounts must be positive.' };
    if (amount > this.amounts[id] + EPS) {
      return {
        ok: false,
        code: 'insufficient',
        message: `Need ${Math.ceil(amount - this.amounts[id])} more ${RESOURCES[id].name.toLowerCase()}.`,
        missing: { [id]: amount - this.amounts[id] },
      };
    }
    this.amounts[id] = Math.max(0, this.amounts[id] - amount);
    return { ok: true, amount };
  }

  /** Atomic multi-resource payment: everything is paid, or nothing changes. */
  consumeAll(cost: Cost): ResourceResult {
    for (const v of Object.values(cost)) {
      if (!(v! >= 0)) return { ok: false, code: 'invalid_amount', message: 'Amounts must be positive.' };
    }
    if (!this.has(cost)) {
      const missing = ResourceManager.missing(this.amounts, cost);
      return { ok: false, code: 'insufficient', message: ResourceManager.describeMissing(this.amounts, cost), missing };
    }
    for (const [id, v] of Object.entries(cost) as [ResourceId, number][]) this.amounts[id] = Math.max(0, this.amounts[id] - v);
    return { ok: true, amount: 0 };
  }

  /** Atomic multi-resource delivery (vented byproducts are allowed to overflow). */
  addAll(bag: Cost): ResourceResult {
    if (!this.hasRoomFor(bag)) {
      const full = (Object.entries(bag) as [ResourceId, number][]).filter(([id, v]) => !RESOURCES[id].ventWhenFull && this.room(id) + EPS < v).map(([id]) => id);
      return { ok: false, code: 'no_capacity', message: `Storage is full of ${full.map((id) => RESOURCES[id].name.toLowerCase()).join(' and ')}.` };
    }
    for (const [id, v] of Object.entries(bag) as [ResourceId, number][]) this.put(id, v);
    return { ok: true, amount: 0 };
  }

  /** Removes up to `amount` (never below zero). For needs that can be partly met. */
  take(id: ResourceId, amount: number): number {
    const t = clamp(amount, 0, this.amounts[id]);
    this.amounts[id] -= t;
    return t;
  }

  put(id: ResourceId, amount: number): number {
    const p = clamp(amount, 0, this.room(id));
    this.amounts[id] = Math.min(this.capacity[id], this.amounts[id] + p);
    return p;
  }

  /** Moves up to `amount` between two storage records; returns what moved. */
  static transfer(from: StorageRecord, to: StorageRecord, id: ResourceId, amount: number): number {
    const n = Math.min(amount, from.get(id), to.room(id));
    if (!(n > 0)) return 0;
    from.take(id, n);
    to.put(id, n);
    return n;
  }

  // -------------------------------------------------------------------------
  // Pure helpers on plain resource records (used by the UI and the store)
  // -------------------------------------------------------------------------

  static empty(): ResourceBag {
    return emptyResources();
  }

  static canAfford(stock: ResourceBag, cost: Cost): boolean {
    return RESOURCE_IDS.every((id) => (cost[id] ?? 0) <= stock[id] + EPS);
  }

  /** How much of each resource is still missing for a cost. */
  static missing(stock: ResourceBag, cost: Cost): Cost {
    const out: Cost = {};
    for (const id of RESOURCE_IDS) {
      const need = (cost[id] ?? 0) - stock[id];
      if (need > EPS) out[id] = need;
    }
    return out;
  }

  static deduct(stock: ResourceBag, cost: Cost): ResourceBag {
    const out = { ...stock };
    for (const id of RESOURCE_IDS) out[id] = Math.max(0, out[id] - (cost[id] ?? 0));
    return out;
  }

  static describeMissing(stock: ResourceBag, cost: Cost): string {
    const m = ResourceManager.missing(stock, cost);
    const parts = (Object.keys(m) as ResourceId[]).map((id) => `${Math.ceil(m[id] ?? 0)} ${RESOURCES[id].unit} ${RESOURCES[id].name.toLowerCase()}`);
    return parts.length ? `Need ${parts.join(' and ')} more` : '';
  }

  /** Sols until a resource runs out at the current net rate (Infinity if not decreasing). */
  static solsRemaining(amount: number, ratePerSol: number): number {
    return ratePerSol < -1e-6 ? amount / -ratePerSol : Infinity;
  }
}

/** A building's own small store (goods waiting for a road). */
export class LocalStore implements StorageRecord {
  constructor(
    readonly items: Partial<Record<ResourceId, number>>,
    private cap: Partial<Record<ResourceId, number>>,
  ) {}

  get(id: ResourceId): number {
    return this.items[id] ?? 0;
  }

  room(id: ResourceId): number {
    return Math.max(0, (this.cap[id] ?? 0) - this.get(id));
  }

  put(id: ResourceId, amount: number): number {
    const p = clamp(amount, 0, this.room(id));
    if (p > 0) this.items[id] = this.get(id) + p;
    return p;
  }

  take(id: ResourceId, amount: number): number {
    const t = clamp(amount, 0, this.get(id));
    const left = this.get(id) - t;
    if (left > 1e-6) this.items[id] = left;
    else delete this.items[id];
    return t;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
