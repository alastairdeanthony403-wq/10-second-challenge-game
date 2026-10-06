import type { Random } from '../core/Random';
import { PERFECT_BONUS } from './Scoring';

export type ModifierId = 'double' | 'reverse' | 'tiny' | 'speed' | 'chaos' | 'perfect_bonus';

export interface ModifierDef {
  id: ModifierId;
  nameKey: string;
  /** Applied to points after the combo multiplier. */
  pointsMultiplier: number;
  perfectBonus: number;
  /** Multiplies gameplay speed (entities), never the 10-second timer. */
  speedMultiplier: number;
  /** Scales target sizes in games that support it. */
  sizeMultiplier: number;
  /** Generic modifiers can apply to any mini-game; others need explicit support. */
  generic: boolean;
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  double: { id: 'double', nameKey: 'modifier.double', pointsMultiplier: 2, perfectBonus: PERFECT_BONUS, speedMultiplier: 1, sizeMultiplier: 1, generic: true },
  perfect_bonus: { id: 'perfect_bonus', nameKey: 'modifier.perfect_bonus', pointsMultiplier: 1, perfectBonus: PERFECT_BONUS * 3, speedMultiplier: 1, sizeMultiplier: 1, generic: true },
  reverse: { id: 'reverse', nameKey: 'modifier.reverse', pointsMultiplier: 1.5, perfectBonus: PERFECT_BONUS, speedMultiplier: 1, sizeMultiplier: 1, generic: false },
  tiny: { id: 'tiny', nameKey: 'modifier.tiny', pointsMultiplier: 1.5, perfectBonus: PERFECT_BONUS, speedMultiplier: 1, sizeMultiplier: 0.6, generic: false },
  speed: { id: 'speed', nameKey: 'modifier.speed', pointsMultiplier: 1.5, perfectBonus: PERFECT_BONUS, speedMultiplier: 1.35, sizeMultiplier: 1, generic: false },
  chaos: { id: 'chaos', nameKey: 'modifier.chaos', pointsMultiplier: 2, perfectBonus: PERFECT_BONUS, speedMultiplier: 1.2, sizeMultiplier: 0.8, generic: false },
};

export interface ModifierRules {
  /** Chance per eligible round. */
  chance: number;
  /** No special rounds before this round index. */
  firstEligibleRound: number;
}

export const DEFAULT_MODIFIER_RULES: ModifierRules = { chance: 0.15, firstEligibleRound: 2 };

/**
 * Rolls a special round. Used sparingly: never twice in a row, never in the
 * opening rounds, and only modifiers the chosen mini-game supports.
 */
export function rollModifier(
  rng: Random,
  roundIndex: number,
  previous: ModifierId | null,
  supported: readonly ModifierId[],
  rules: ModifierRules = DEFAULT_MODIFIER_RULES,
): ModifierId | null {
  // Always consume the same number of rolls so deterministic runs stay aligned.
  const roll = rng.next();
  const choice = rng.next();
  if (roundIndex < rules.firstEligibleRound || previous !== null) return null;
  if (roll >= rules.chance) return null;
  const pool = (Object.values(MODIFIERS) as ModifierDef[])
    .filter((m) => m.generic || supported.includes(m.id))
    .map((m) => m.id);
  if (pool.length === 0) return null;
  return pool[Math.floor(choice * pool.length)];
}
