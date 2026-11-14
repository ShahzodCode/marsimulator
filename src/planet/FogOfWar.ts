import { REGIONS } from '../data/regions';
import type { GlobeUniforms } from './Mars';

/**
 * Drives the globe's fog-of-war uniforms from the discovered-region state,
 * animating newly revealed regions instead of popping them in.
 */
export class FogOfWar {
  private target: number[];

  constructor(private uniforms: GlobeUniforms) {
    this.target = REGIONS.map(() => 0);
  }

  /** Sync with game state. `instant` skips the reveal animation (initial load / save restore). */
  setDiscovered(discovered: Record<string, boolean>, instant = false): void {
    const values = this.uniforms.uDiscovered.value;
    for (const r of REGIONS) {
      this.target[r.index] = discovered[r.id] ? 1 : 0;
      if (instant) values[r.index] = this.target[r.index];
    }
  }

  setHover(index: number): void {
    this.uniforms.uHover.value = index;
  }

  setSelected(index: number): void {
    this.uniforms.uSelected.value = index;
  }

  update(dt: number): void {
    const values = this.uniforms.uDiscovered.value;
    const k = Math.min(1, dt * 0.8);
    for (let i = 0; i < values.length; i++) {
      const t = this.target[i];
      if (values[i] !== t) {
        const v = values[i] + Math.sign(t - values[i]) * k;
        values[i] = Math.abs(t - v) < 0.01 || Math.sign(t - v) !== Math.sign(t - values[i]) ? t : v;
      }
    }
  }
}
