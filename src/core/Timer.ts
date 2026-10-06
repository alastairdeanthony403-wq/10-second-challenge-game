export const CHALLENGE_DURATION = 10;

/**
 * Countdown driven by the frame loop's delta time (never frame counts).
 * Fires `onExpire` exactly once, never goes negative, and ignores time while paused.
 */
export class ChallengeTimer {
  private remainingTime: number;
  private running = false;
  private paused = false;
  private expired = false;
  private expireHandler: (() => void) | null = null;

  constructor(readonly duration: number = CHALLENGE_DURATION) {
    if (!(duration > 0)) throw new Error(`Invalid timer duration: ${duration}`);
    this.remainingTime = duration;
  }

  get remaining(): number {
    return this.remainingTime;
  }

  get elapsed(): number {
    return this.duration - this.remainingTime;
  }

  /** 0 at start → 1 at expiry. */
  get progress(): number {
    return this.elapsed / this.duration;
  }

  get isRunning(): boolean {
    return this.running && !this.paused && !this.expired;
  }

  get isExpired(): boolean {
    return this.expired;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  onExpire(handler: () => void): void {
    this.expireHandler = handler;
  }

  start(): void {
    if (this.expired) return;
    this.running = true;
    this.paused = false;
  }

  pause(): void {
    if (this.running) this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Stops without firing expiry (e.g. a mini-game finished early). */
  stop(): void {
    this.running = false;
  }

  reset(): void {
    this.remainingTime = this.duration;
    this.running = false;
    this.paused = false;
    this.expired = false;
  }

  update(dt: number): void {
    if (!this.isRunning) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.remainingTime = Math.max(0, this.remainingTime - dt);
    if (this.remainingTime === 0) {
      this.expired = true;
      this.running = false;
      const handler = this.expireHandler;
      this.expireHandler = null;
      handler?.();
    }
  }

  /** "10.0" … "0.1" "0.0". Rounds up so 0.0 only shows once time is actually up. */
  display(): string {
    return (Math.ceil(this.remainingTime * 10 - 1e-9) / 10).toFixed(1);
  }
}

interface Scheduled {
  id: number;
  at: number;
  fn: () => void;
}

/**
 * Game-time scheduler for transitions. Because it only advances when the game
 * updates it, pausing the game automatically pauses every pending transition.
 */
export class Scheduler {
  private now = 0;
  private nextId = 1;
  private tasks: Scheduled[] = [];

  after(seconds: number, fn: () => void): number {
    const id = this.nextId++;
    this.tasks.push({ id, at: this.now + Math.max(0, seconds), fn });
    return id;
  }

  cancel(id: number): void {
    this.tasks = this.tasks.filter((t) => t.id !== id);
  }

  clear(): void {
    this.tasks = [];
  }

  get pending(): number {
    return this.tasks.length;
  }

  update(dt: number): void {
    this.now += Math.max(0, dt);
    if (this.tasks.length === 0) return;
    const due = this.tasks.filter((t) => t.at <= this.now).sort((a, b) => a.at - b.at);
    if (due.length === 0) return;
    this.tasks = this.tasks.filter((t) => t.at > this.now);
    for (const task of due) task.fn();
  }
}
