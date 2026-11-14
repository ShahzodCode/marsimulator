/**
 * requestAnimationFrame loop with clamped delta time. Pauses automatically when the
 * tab is hidden (browsers stop rAF), and never feeds huge deltas after a stall.
 */
export class GameLoop {
  private last = 0;
  private handle = 0;
  private running = false;

  constructor(private frame: (dt: number, time: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt, now / 1000);
      this.handle = requestAnimationFrame(tick);
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
