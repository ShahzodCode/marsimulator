/**
 * requestAnimationFrame loop with clamped delta time. Pauses automatically when the
 * tab is hidden (browsers stop rAF), and never feeds huge deltas after a stall.
 * `minInterval` (ms) caps the frame rate: refreshes that come too soon are skipped.
 */
export class GameLoop {
  private last = 0;
  private handle = 0;
  private running = false;

  constructor(
    private frame: (dt: number, time: number) => void,
    private minInterval: () => number = () => 0,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.handle = requestAnimationFrame(tick);
      // A little slack so a 60 FPS cap on a 60 Hz screen never skips a frame.
      const interval = this.minInterval();
      if (interval > 0 && now - this.last < interval - 2) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt, now / 1000);
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
