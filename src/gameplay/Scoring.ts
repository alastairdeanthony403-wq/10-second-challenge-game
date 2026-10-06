export type Rating = 'FAIL' | 'OK' | 'GOOD' | 'GREAT' | 'AMAZING' | 'PERFECT';

export const PASS_THRESHOLD = 30;
export const COMBO_THRESHOLD = 50;
export const MAX_COMBO_MULTIPLIER = 5;
export const PERFECT_BONUS = 50;

/** Standardized output every mini-game produces, whatever its mechanic. */
export interface ScoreResult {
  /** Mechanic-specific raw value (hits, ms, distance…) for stats/debug. */
  raw: number;
  /** 0–1: how precise the player's inputs were. */
  accuracy: number;
  /** 0–1: how much of the objective was achieved. */
  completion: number;
  /** 0–1: overall weighted performance. */
  performance: number;
  /** Final normalized score 0–100 (integer). */
  score: number;
  /** Localization key + params explaining what happened ("12 / 15 hit"). */
  summaryKey: string;
  summaryParams?: Record<string, string | number>;
  /** Present when the score is a FAIL, explaining why. */
  failReasonKey?: string;
  /** Optional: reaction time in ms for the stats screen. */
  reactionMs?: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ratingFor(score: number): Rating {
  const s = normalizeScore(score);
  if (s >= 100) return 'PERFECT';
  if (s >= 90) return 'AMAZING';
  if (s >= 70) return 'GREAT';
  if (s >= 50) return 'GOOD';
  if (s >= PASS_THRESHOLD) return 'OK';
  return 'FAIL';
}

export interface ScoreInput {
  raw: number;
  accuracy: number;
  completion: number;
  /** Share of the score that completion earns on its own; the rest scales with accuracy (default 0.7). */
  completionWeight?: number;
  summaryKey: string;
  summaryParams?: Record<string, string | number>;
  failReasonKey?: string;
  reactionMs?: number;
}

/**
 * Builds a ScoreResult from completion & accuracy:
 *   performance = completion × (w + (1 − w) × accuracy)
 * Accuracy only matters for work actually done, so idling never scores, and
 * 100 requires both to be perfect. Values are clamped against bad inputs.
 */
export function buildScore(input: ScoreInput): ScoreResult {
  const accuracy = clamp01(input.accuracy);
  const completion = clamp01(input.completion);
  const w = input.completionWeight ?? 0.7;
  const performance = clamp01(completion * (w + (1 - w) * accuracy));
  // Snap tiny float error so genuinely perfect play reads as 100.
  const score = normalizeScore(performance >= 0.9995 ? 100 : Math.min(99, performance * 100));
  return {
    raw: Number.isFinite(input.raw) ? input.raw : 0,
    accuracy,
    completion,
    performance,
    score,
    summaryKey: input.summaryKey,
    summaryParams: input.summaryParams,
    failReasonKey: score < PASS_THRESHOLD ? (input.failReasonKey ?? 'fail.generic') : undefined,
    reactionMs: input.reactionMs,
  };
}

/** Sanitizes a ScoreResult coming out of a mini-game (defensive: never trust it blindly). */
export function sanitizeScore(result: Partial<ScoreResult> | null | undefined): ScoreResult {
  const score = normalizeScore(result?.score ?? 0);
  return {
    raw: Number.isFinite(result?.raw) ? (result!.raw as number) : 0,
    accuracy: clamp01(result?.accuracy ?? 0),
    completion: clamp01(result?.completion ?? 0),
    performance: clamp01(result?.performance ?? score / 100),
    score,
    summaryKey: result?.summaryKey ?? 'summary.none',
    summaryParams: result?.summaryParams,
    failReasonKey: score < PASS_THRESHOLD ? (result?.failReasonKey ?? 'fail.generic') : undefined,
    reactionMs: result?.reactionMs,
  };
}

export function comboMultiplier(combo: number): number {
  return Math.max(1, Math.min(MAX_COMBO_MULTIPLIER, combo));
}

/** Combo rules: GOOD+ adds 1, PERFECT adds 2, OK holds, FAIL breaks. */
export function nextCombo(combo: number, score: number): number {
  const s = normalizeScore(score);
  if (s >= 100) return combo + 2;
  if (s >= COMBO_THRESHOLD) return combo + 1;
  if (s >= PASS_THRESHOLD) return combo;
  return 0;
}

export interface PointsBreakdown {
  base: number;
  multiplier: number;
  modifierMultiplier: number;
  perfectBonus: number;
  total: number;
}

export function computePoints(score: number, comboAfter: number, modifierMultiplier = 1, perfectBonus = PERFECT_BONUS): PointsBreakdown {
  const base = normalizeScore(score);
  const multiplier = base >= COMBO_THRESHOLD ? comboMultiplier(comboAfter) : 1;
  const bonus = base >= 100 ? perfectBonus : 0;
  const total = Math.round((base * multiplier + bonus) * modifierMultiplier);
  return { base, multiplier, modifierMultiplier, perfectBonus: bonus, total };
}

/** Max points a single round can legally award — used to validate leaderboard submissions. */
export function maxPointsPerRound(): number {
  return Math.round((100 * MAX_COMBO_MULTIPLIER + PERFECT_BONUS * 3) * 2);
}

export interface RankDef {
  min: number;
  key: string;
}

/** Run titles by average normalized score. */
export const RANKS: readonly RankDef[] = [
  { min: 93, key: 'rank.legend' },
  { min: 82, key: 'rank.master' },
  { min: 70, key: 'rank.speed_demon' },
  { min: 55, key: 'rank.fast_hands' },
  { min: 40, key: 'rank.quick_thinker' },
  { min: 20, key: 'rank.warming_up' },
  { min: 0, key: 'rank.sleepy' },
];

export function rankFor(averageScore: number): string {
  const avg = Number.isFinite(averageScore) ? averageScore : 0;
  return (RANKS.find((r) => avg >= r.min) ?? RANKS[RANKS.length - 1]).key;
}
