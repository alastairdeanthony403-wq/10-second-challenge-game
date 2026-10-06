import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { Difficulty } from '../src/gameplay/Difficulty';
import { ALL_MINIGAMES } from '../src/gameplay/minigames';
import { hasKey } from '../src/i18n/i18n';
import { createHarness, randomAction } from './helpers';

const DIFFICULTIES = [Difficulty.EASY, Difficulty.NORMAL, Difficulty.HARD, Difficulty.EXTREME];

describe.each(ALL_MINIGAMES.map((d) => [d.id, d] as const))('mini-game %s', (_id, def) => {
  it('has a valid definition and localized strings', () => {
    expect(def.timeLimit).toBeLessThanOrEqual(10);
    expect(def.weight).toBeGreaterThan(0);
    for (const key of [def.nameKey, def.instructionKey, def.descriptionKey]) expect(hasKey(key), key).toBe(true);
  });

  it.each(DIFFICULTIES)('completes within 10 seconds with no input at difficulty %i', (difficulty) => {
    const h = createHarness(def, { difficulty });
    expect(h.game.state).toBe('active');
    h.run(11);
    expect(h.game.state).toBe('finished');
    expect(h.timer.elapsed).toBeLessThanOrEqual(10);
    const score = h.game.calculateScore();
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(score.score)).toBe(true);
    h.game.cleanup();
    expect(h.game.state).toBe('cleaned');
  });

  it.each(DIFFICULTIES)('survives random input fuzzing at difficulty %i', (difficulty) => {
    for (let seed = 1; seed <= 4; seed++) {
      const rng = new Random(seed * 99);
      const h = createHarness(def, { difficulty, seed, modifier: rng.chance(0.5) ? (def.modifiers[0] ?? null) : null });
      h.run(11, (harness, frame) => {
        if (frame % 3 === 0) harness.send(randomAction(rng, harness.ctx.width, harness.ctx.height));
        harness.input.move.x = Math.sin(frame / 20);
        harness.input.move.y = Math.cos(frame / 25);
      });
      expect(h.game.state).toBe('finished');
      const score = h.game.calculateScore();
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(typeof score.summaryKey).toBe('string');
      if (score.score < 30) expect(score.failReasonKey).toBeTruthy();
      h.game.cleanup();
    }
  });

  it('ignores input after completion', () => {
    const h = createHarness(def);
    h.run(11);
    const before = h.game.calculateScore().score;
    for (let i = 0; i < 50; i++) h.send({ type: 'pointerDown', x: 500, y: 500, id: 1 });
    h.send({ type: 'primary' });
    expect(h.game.calculateScore().score).toBe(before);
  });

  it('works on a portrait screen', () => {
    const h = createHarness(def, { width: 800, height: 1700 });
    h.run(11, (harness, frame) => {
      if (frame % 10 === 0) harness.send({ type: 'pointerDown', x: 500, y: 950, id: 1 });
    });
    expect(h.game.state).toBe('finished');
  });

  it('is deterministic for the same seed', () => {
    const play = () => {
      const rng = new Random(5);
      const h = createHarness(def, { seed: 42 });
      h.run(11, (harness, frame) => {
        if (frame % 4 === 0) harness.send(randomAction(rng, harness.ctx.width, harness.ctx.height));
      });
      return h.game.calculateScore();
    };
    expect(play()).toEqual(play());
  });

  it('cleanup is idempotent and complete() only fires once', () => {
    const h = createHarness(def);
    h.game.complete('time');
    const reason = h.game.finishReason;
    h.game.complete('fail');
    expect(h.game.finishReason).toBe(reason);
    h.game.cleanup();
    h.game.cleanup();
    expect(h.game.state).toBe('cleaned');
  });
});
