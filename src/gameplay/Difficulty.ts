export enum Difficulty {
  EASY = 0,
  NORMAL = 1,
  HARD = 2,
  EXTREME = 3,
}

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  [Difficulty.EASY]: 'EASY',
  [Difficulty.NORMAL]: 'NORMAL',
  [Difficulty.HARD]: 'HARD',
  [Difficulty.EXTREME]: 'EXTREME',
};

export function clampDifficulty(value: number): Difficulty {
  return Math.max(Difficulty.EASY, Math.min(Difficulty.EXTREME, Math.round(value))) as Difficulty;
}

/** Picks the tuning value for a difficulty: `tune(d, [easy, normal, hard, extreme])`. */
export function tune<T>(difficulty: Difficulty, values: readonly [T, T, T, T]): T {
  return values[clampDifficulty(difficulty)];
}

/**
 * Tracks recent normalized scores and nudges difficulty by at most one step.
 * It only changes the challenge parameters — scores are never altered.
 */
export class AdaptiveDifficulty {
  private recent: number[] = [];
  private offset = 0;

  constructor(
    private readonly windowSize = 3,
    private readonly raiseAbove = 85,
    private readonly lowerBelow = 35,
  ) {}

  record(score: number): void {
    this.recent.push(score);
    if (this.recent.length > this.windowSize) this.recent.shift();
    if (this.recent.length < this.windowSize) return;
    const avg = this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
    if (avg >= this.raiseAbove) this.offset = Math.min(1, this.offset + 1);
    else if (avg <= this.lowerBelow) this.offset = Math.max(-1, this.offset - 1);
    else return;
    this.recent = [];
  }

  get adjustment(): number {
    return this.offset;
  }

  apply(base: Difficulty): Difficulty {
    return clampDifficulty(base + this.offset);
  }

  reset(): void {
    this.recent = [];
    this.offset = 0;
  }
}

/** Base difficulty curve for a run: a gentle ramp so the first rounds teach and the last ones test. */
export function rampDifficulty(roundIndex: number, totalRounds: number | null): Difficulty {
  if (totalRounds === null) {
    // Endless: steps up every 5 rounds.
    return clampDifficulty(Math.floor(roundIndex / 5));
  }
  const t = totalRounds <= 1 ? 0 : roundIndex / (totalRounds - 1);
  if (t < 0.25) return Difficulty.EASY;
  if (t < 0.65) return Difficulty.NORMAL;
  if (t < 0.95) return Difficulty.HARD;
  return Difficulty.EXTREME;
}
