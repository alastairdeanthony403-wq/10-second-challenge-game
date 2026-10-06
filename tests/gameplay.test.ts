import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { AdaptiveDifficulty, Difficulty, rampDifficulty, tune } from '../src/gameplay/Difficulty';
import type { MiniGameDefinition } from '../src/gameplay/MiniGame';
import { MiniGameRegistry } from '../src/gameplay/MiniGameRegistry';
import { MiniGameSelector } from '../src/gameplay/MiniGameSelector';
import { ALL_MINIGAMES } from '../src/gameplay/minigames';
import { rollModifier } from '../src/gameplay/Modifiers';
import { MAX_ENDLESS_ROUNDS, Run } from '../src/gameplay/RunManager';
import {
  buildScore,
  comboMultiplier,
  computePoints,
  maxPointsPerRound,
  nextCombo,
  normalizeScore,
  rankFor,
  ratingFor,
  sanitizeScore,
  type ScoreResult,
} from '../src/gameplay/Scoring';

const score = (s: number): ScoreResult => sanitizeScore({ score: s, summaryKey: 'x' });

describe('Scoring', () => {
  it('normalizes into 0–100 integers', () => {
    expect(normalizeScore(-5)).toBe(0);
    expect(normalizeScore(150)).toBe(100);
    expect(normalizeScore(42.6)).toBe(43);
    expect(normalizeScore(Number.NaN)).toBe(0);
  });

  it('maps ratings to the documented bands', () => {
    expect(ratingFor(0)).toBe('FAIL');
    expect(ratingFor(29)).toBe('FAIL');
    expect(ratingFor(30)).toBe('OK');
    expect(ratingFor(49)).toBe('OK');
    expect(ratingFor(50)).toBe('GOOD');
    expect(ratingFor(70)).toBe('GREAT');
    expect(ratingFor(90)).toBe('AMAZING');
    expect(ratingFor(99)).toBe('AMAZING');
    expect(ratingFor(100)).toBe('PERFECT');
  });

  it('accuracy scales completion; idling never scores', () => {
    expect(buildScore({ raw: 0, accuracy: 1, completion: 0, summaryKey: 'k' }).score).toBe(0);
    expect(buildScore({ raw: 0, accuracy: 0.5, completion: 1, completionWeight: 0.7, summaryKey: 'k' }).score).toBe(85);
    expect(buildScore({ raw: 0, accuracy: 1, completion: 0.5, summaryKey: 'k' }).score).toBe(50);
  });

  it('buildScore: minimum, maximum and perfect', () => {
    expect(buildScore({ raw: 0, accuracy: 0, completion: 0, summaryKey: 'k' }).score).toBe(0);
    const perfect = buildScore({ raw: 10, accuracy: 1, completion: 1, summaryKey: 'k' });
    expect(perfect.score).toBe(100);
    expect(perfect.failReasonKey).toBeUndefined();
    // Near-perfect is never rounded up to PERFECT.
    expect(buildScore({ raw: 10, accuracy: 0.99, completion: 1, summaryKey: 'k' }).score).toBe(99);
  });

  it('buildScore clamps bad inputs and attaches a fail reason', () => {
    const s = buildScore({ raw: Number.NaN, accuracy: 5, completion: -1, summaryKey: 'k', failReasonKey: 'fail.x' });
    expect(s.accuracy).toBe(1);
    expect(s.completion).toBe(0);
    expect(s.raw).toBe(0);
    expect(s.score).toBe(0);
    expect(s.failReasonKey).toBe('fail.x');
  });

  it('sanitizeScore handles garbage from a misbehaving mini-game', () => {
    expect(sanitizeScore(null).score).toBe(0);
    expect(sanitizeScore({ score: 1e9 } as never).score).toBe(100);
  });

  it('combo: GOOD+ increments, PERFECT boosts, OK holds, FAIL breaks', () => {
    expect(nextCombo(0, 60)).toBe(1);
    expect(nextCombo(2, 100)).toBe(4);
    expect(nextCombo(3, 40)).toBe(3);
    expect(nextCombo(4, 10)).toBe(0);
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(3)).toBe(3);
    expect(comboMultiplier(12)).toBe(5);
  });

  it('points include combo, perfect bonus and modifier', () => {
    expect(computePoints(80, 3).total).toBe(240);
    expect(computePoints(40, 3).total).toBe(40); // OK scores are not multiplied
    expect(computePoints(100, 1).total).toBe(150);
    expect(computePoints(100, 5, 2).total).toBe((500 + 50) * 2);
    expect(computePoints(100, 5, 2, 150).total).toBeLessThanOrEqual(maxPointsPerRound());
  });

  it('ranks scale with average score', () => {
    expect(rankFor(0)).toBe('rank.sleepy');
    expect(rankFor(45)).toBe('rank.quick_thinker');
    expect(rankFor(75)).toBe('rank.speed_demon');
    expect(rankFor(99)).toBe('rank.legend');
  });
});

describe('Difficulty', () => {
  it('tune picks per-level values', () => {
    expect(tune(Difficulty.HARD, [1, 2, 3, 4])).toBe(3);
  });

  it('ramps across a run and in endless', () => {
    expect(rampDifficulty(0, 10)).toBe(Difficulty.EASY);
    expect(rampDifficulty(5, 10)).toBe(Difficulty.NORMAL);
    expect(rampDifficulty(8, 10)).toBe(Difficulty.HARD);
    expect(rampDifficulty(9, 10)).toBe(Difficulty.EXTREME);
    expect(rampDifficulty(0, null)).toBe(Difficulty.EASY);
    expect(rampDifficulty(12, null)).toBe(Difficulty.HARD);
    expect(rampDifficulty(500, null)).toBe(Difficulty.EXTREME);
  });

  it('adaptive difficulty moves at most one step either way', () => {
    const a = new AdaptiveDifficulty();
    for (let i = 0; i < 9; i++) a.record(98);
    expect(a.adjustment).toBe(1);
    expect(a.apply(Difficulty.EXTREME)).toBe(Difficulty.EXTREME);
    for (let i = 0; i < 9; i++) a.record(5);
    expect(a.adjustment).toBe(-1);
    expect(a.apply(Difficulty.EASY)).toBe(Difficulty.EASY);
  });
});

describe('MiniGameRegistry', () => {
  it('registers every built-in game with unique ids', () => {
    const r = new MiniGameRegistry();
    r.registerAll(ALL_MINIGAMES);
    expect(r.size).toBe(ALL_MINIGAMES.length);
    expect(r.size).toBeGreaterThanOrEqual(10);
  });

  it('rejects duplicates and invalid definitions; caps time to 10s', () => {
    const r = new MiniGameRegistry();
    const spy = console.error;
    console.error = () => {};
    const base = ALL_MINIGAMES[0];
    expect(r.register({ ...base, timeLimit: 30 })).toBe(true);
    expect(r.get(base.id)?.timeLimit).toBe(10);
    expect(r.register(base)).toBe(false);
    expect(r.register({ ...base, id: 'x', weight: 0 })).toBe(false);
    expect(r.register({ ...base, id: '' })).toBe(false);
    console.error = spy;
  });
});

describe('MiniGameSelector', () => {
  const pool = ALL_MINIGAMES;

  it('never repeats the same game consecutively', () => {
    const sel = new MiniGameSelector(pool, new Random(3));
    let prev = '';
    for (let i = 0; i < 500; i++) {
      const g = sel.next();
      expect(g.id).not.toBe(prev);
      prev = g.id;
    }
  });

  it('avoids recent games and the same category back-to-back', () => {
    const sel = new MiniGameSelector(pool, new Random(9));
    const picks = Array.from({ length: 300 }, () => sel.next());
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i].category).not.toBe(picks[i - 1].category);
      const recent = picks.slice(Math.max(0, i - 5), i).map((p) => p.id);
      expect(recent).not.toContain(picks[i].id);
    }
  });

  it('covers the whole pool over time', () => {
    const sel = new MiniGameSelector(pool, new Random(11));
    const seen = new Set(Array.from({ length: 200 }, () => sel.next().id));
    expect(seen.size).toBe(pool.length);
  });

  it('works with tiny pools (relaxes constraints instead of failing)', () => {
    const one = new MiniGameSelector(pool.slice(0, 1), new Random(1));
    expect(one.next().id).toBe(pool[0].id);
    expect(one.next().id).toBe(pool[0].id);
    const two = new MiniGameSelector([pool[0], pool[1]], new Random(1));
    const a = two.next().id;
    expect(two.next().id).not.toBe(a);
  });

  it('is deterministic for a seed', () => {
    const a = new MiniGameSelector(pool, new Random(77));
    const b = new MiniGameSelector(pool, new Random(77));
    for (let i = 0; i < 30; i++) expect(a.next().id).toBe(b.next().id);
  });

  it('throws on an empty pool', () => {
    expect(() => new MiniGameSelector([], new Random(1))).toThrow();
  });
});

describe('Modifiers', () => {
  it('never appear in the first rounds or twice in a row', () => {
    const rng = new Random(5);
    expect(rollModifier(rng, 0, null, ['tiny'], { chance: 1, firstEligibleRound: 2 })).toBeNull();
    expect(rollModifier(rng, 5, 'double', ['tiny'], { chance: 1, firstEligibleRound: 2 })).toBeNull();
    expect(rollModifier(rng, 5, null, ['tiny'], { chance: 1, firstEligibleRound: 2 })).not.toBeNull();
  });

  it('only picks modifiers the game supports (or generic ones)', () => {
    const rng = new Random(8);
    for (let i = 0; i < 200; i++) {
      const m = rollModifier(rng, 5, null, [], { chance: 1, firstEligibleRound: 0 });
      expect(['double', 'perfect_bonus']).toContain(m);
    }
  });
});

const defs = (): MiniGameDefinition[] => [...ALL_MINIGAMES];

describe('Run / modes', () => {
  it('quick play is exactly 10 rounds', () => {
    const run = new Run('quick', { pool: defs(), seed: 1 });
    let rounds = 0;
    while (!run.isOver()) {
      run.prepareChallenge();
      run.recordResult(score(60));
      rounds++;
    }
    expect(rounds).toBe(10);
    const s = run.summary();
    expect(s.players[0].rounds).toBe(10);
    expect(s.players[0].maxScore).toBe(1000);
    expect(s.players[0].scoreSum).toBe(600);
  });

  it('prepareChallenge is idempotent until a result is recorded', () => {
    const run = new Run('quick', { pool: defs(), seed: 1 });
    const a = run.prepareChallenge();
    expect(run.prepareChallenge()).toBe(a);
    run.recordResult(score(50));
    expect(run.prepareChallenge()).not.toBe(a);
  });

  it('recordResult without a challenge throws (guard against double results)', () => {
    const run = new Run('quick', { pool: defs(), seed: 1 });
    expect(() => run.recordResult(score(10))).toThrow();
  });

  it('tracks combo, best combo, perfects and points', () => {
    const run = new Run('quick', { pool: defs(), seed: 2, adaptive: false });
    const results = [60, 70, 100, 10, 55];
    const outcomes = results.map((s) => {
      run.prepareChallenge();
      return run.recordResult(score(s));
    });
    expect(outcomes.map((o) => o.comboAfter)).toEqual([1, 2, 4, 0, 1]);
    expect(outcomes[3].comboBroken).toBe(true);
    const p = run.players[0];
    expect(p.bestCombo).toBe(4);
    expect(p.perfects).toBe(1);
    expect(p.failed).toBe(1);
    expect(p.completed).toBe(4);
    expect(p.points).toBe(outcomes.reduce((a, o) => a + o.points.total, 0));
  });

  it('endless ends when lives run out', () => {
    const run = new Run('endless', { pool: defs(), seed: 3 });
    let rounds = 0;
    while (!run.isOver() && rounds < 50) {
      run.prepareChallenge();
      run.recordResult(score(rounds % 2 ? 10 : 80));
      rounds++;
    }
    expect(run.players[0].lives).toBe(0);
    expect(rounds).toBe(6);
  });

  it('endless has a hard safety cap', () => {
    const run = new Run('endless', { pool: defs(), seed: 3 });
    let rounds = 0;
    while (!run.isOver() && rounds < 1000) {
      run.prepareChallenge();
      run.recordResult(score(90));
      rounds++;
    }
    expect(rounds).toBe(MAX_ENDLESS_ROUNDS);
  });

  it('daily mode gives everyone the same sequence for a date (regardless of pool order)', () => {
    const date = new Date(2026, 9, 6);
    const seq = (pool: MiniGameDefinition[]) => {
      const run = new Run('daily', { pool, date });
      const ids: string[] = [];
      while (!run.isOver()) {
        const c = run.prepareChallenge();
        ids.push(`${c.def.id}:${c.difficulty}:${c.modifier}:${c.seed}`);
        run.recordResult(score(Math.random() * 100));
      }
      return ids;
    };
    const a = seq(defs());
    const b = seq(defs().reverse());
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    const otherDay = new Run('daily', { pool: defs(), date: new Date(2026, 9, 7) });
    expect(otherDay.dailyKey).toBe('20261007');
  });

  it('duel: both players play the same challenge each round', () => {
    const run = new Run('duel', { pool: defs(), seed: 4, players: 2 });
    expect(run.players).toHaveLength(2);
    let rounds = 0;
    while (!run.isOver()) {
      const c1 = run.prepareChallenge();
      expect(run.activePlayerIndex).toBe(0);
      run.recordResult(score(80));
      expect(run.awaitingNextPlayer).toBe(true);
      expect(run.isOver()).toBe(false);
      const c2 = run.prepareChallenge();
      expect(c2).toBe(c1);
      expect(run.activePlayerIndex).toBe(1);
      run.recordResult(score(40));
      rounds++;
    }
    expect(rounds).toBe(5);
    const s = run.summary();
    expect(s.winnerIndex).toBe(0);
  });

  it('party supports up to 4 players and detects ties', () => {
    const run = new Run('party', { pool: defs(), seed: 4, players: 9 });
    expect(run.players).toHaveLength(4);
    while (!run.isOver()) {
      run.prepareChallenge();
      run.recordResult(score(70));
    }
    expect(run.summary().winnerIndex).toBeNull();
  });

  it('forced difficulty and forced next game (debug) are honoured', () => {
    const run = new Run('quick', { pool: defs(), seed: 1, forcedDifficulty: Difficulty.EXTREME });
    const target = defs().find((d) => d.id === 'bullseye')!;
    run.forceNext(target);
    const c = run.prepareChallenge();
    expect(c.def.id).toBe('bullseye');
    expect(c.difficulty).toBe(Difficulty.EXTREME);
  });
});
