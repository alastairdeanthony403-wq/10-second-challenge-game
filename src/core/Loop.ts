/** Largest step we simulate in one frame; protects against tab-switch time jumps. */
export const MAX_FRAME_DT = 0.1;

export class Loop {
  private rafId = 0;
  private last = 0;
  private running = false;
  private frameTimes: number[] = [];

  constructor(private readonly tick: (dt: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.frameTimes.push(dt);
      if (this.frameTimes.length > 60) this.frameTimes.shift();
      try {
        this.tick(dt);
      } catch (err) {
        console.error('[Loop] frame error', err);
      }
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  get fps(): number {
    if (this.frameTimes.length === 0) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return avg > 0 ? 1 / avg : 0;
  }
}
