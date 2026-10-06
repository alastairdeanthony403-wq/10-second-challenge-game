/**
 * "Perfect play" bots: prove every mini-game can actually reach 100 (PERFECT)
 * within the 10-second limit, so no game is unbalanced against the others.
 * Bots peek at private state, which is fine for tests.
 */
import { describe, expect, it } from 'vitest';
import { Difficulty } from '../src/gameplay/Difficulty';
import type { MiniGameDefinition } from '../src/gameplay/MiniGame';
import { ALL_MINIGAMES } from '../src/gameplay/minigames';
import { createHarness, type Harness } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Bot = (h: Harness, g: any, frame: number) => void;

const def = (id: string): MiniGameDefinition => ALL_MINIGAMES.find((d) => d.id === id)!;

const BOTS: Record<string, Bot> = {
  tap_target: (h, g) => {
    const t = g.pool.active.find((x: any) => !x.fake && x.age > 0.05);
    if (t) h.send({ type: 'pointerDown', x: t.x, y: t.y, id: 1 });
  },
  dont_tap_red: (h, g) => {
    const b = g.pool.active.find((x: any) => !x.bad && x.age > 0.05);
    if (b) h.send({ type: 'pointerDown', x: b.x, y: b.y, id: 1 });
  },
  bullseye: (h, g, f) => {
    if (f % 10 === 0) h.send({ type: 'pointerDown', x: g.x, y: g.y, id: 1 });
  },
  remember_order: (h, g) => {
    if (g.phase === 'input') h.send({ type: 'choice', index: g.sequence[g.entered] });
  },
  whats_missing: (h, g) => {
    if (g.phase === 'answer') h.send({ type: 'choice', index: g.options.indexOf(g.items[g.missingIndex]) });
  },
  type_this: (h, g, f) => {
    if (f % 2 === 0) h.send({ type: 'text', char: g.word[g.charIndex] });
  },
  stop_meter: (h, g) => {
    if (!g.stopped && Math.abs(g.pos - g.zoneCenter) < g.zoneHalf * 0.2) h.send({ type: 'primary' });
  },
  collect_everything: (h, g) => {
    const star = g.stars.filter((s: any) => !s.taken).sort((a: any, b: any) => Math.hypot(a.x - g.px, a.y - g.py) - Math.hypot(b.x - g.px, b.y - g.py))[0];
    if (star) h.send({ type: 'pointerDown', x: star.x, y: star.y, id: 1 });
  },
  sort_it: (h, g, f) => {
    if (f % 3 === 0 && g.queue[0]) h.send({ type: 'choice', index: g.queue[0].bin });
  },
  save_egg: (h, g) => {
    const lowest = g.eggs.reduce((a: any, b: any) => (b.y > a.y ? b : a));
    h.send({ type: 'pointerMove', x: lowest.x, y: 0, id: 1, pressed: false });
  },
  lightning_tap: (h, g) => {
    if (g.phase === 'go') h.send({ type: 'primary' });
  },
  odd_one_out: (h, g, f) => {
    if (f % 3 === 0) {
      const c = g.cellCenter(g.oddIndex);
      h.send({ type: 'pointerDown', x: c.x, y: c.y, id: 1 });
    }
  },
  button_mash: (h) => h.send({ type: 'primary' }),
  stack_perfectly: (h, g) => {
    const top = g.stack[g.stack.length - 1];
    if (Math.abs(g.moverX - top.x) <= 8) h.send({ type: 'primary' });
  },
  biggest_number: (h, g, f) => {
    if (f % 3 === 0) h.send({ type: 'choice', index: g.numbers.indexOf(Math.max(...g.numbers)) });
  },
  dodge: (h, g) => {
    // Stand in the widest gap among rocks near the player.
    const threats = g.rocks.active.filter((r: any) => r.y > g.py - 600 && r.y < g.py + 80);
    let bestX = g.px;
    let bestScore = -Infinity;
    for (let x = 60; x <= h.ctx.width - 60; x += 40) {
      const clearance = Math.min(...threats.map((r: any) => Math.abs(r.x - x) - r.r), 9999) - Math.abs(x - g.px) * 0.05;
      if (clearance > bestScore) {
        bestScore = clearance;
        bestX = x;
      }
    }
    h.send({ type: 'pointerMove', x: bestX, y: 0, id: 1, pressed: false });
  },
  feed_monster: (h, g, f) => {
    const step = f % 3;
    if (step === 0 && !g.held) {
      const food = g.things.find((t: any) => t.food);
      if (food) h.send({ type: 'pointerDown', x: food.x, y: food.y, id: 1 });
    } else if (step === 1 && g.held) {
      h.send({ type: 'pointerMove', x: g.mouth.x, y: g.mouth.y, id: 1, pressed: true });
    } else if (step === 2 && g.held) {
      h.send({ type: 'pointerUp', x: g.mouth.x, y: g.mouth.y, id: 1 });
    }
  },
};

describe('every mini-game has a bot', () => {
  it('covers all registered games', () => {
    for (const d of ALL_MINIGAMES) expect(BOTS[d.id], d.id).toBeTypeOf('function');
  });
});

describe.each(Object.keys(BOTS))('perfect play: %s', (id) => {
  it.each([Difficulty.EASY, Difficulty.NORMAL])('can score PERFECT (100) at difficulty %i', (difficulty) => {
    let best = 0;
    // A few seeds: randomness (e.g. a lucky rock) shouldn't decide whether perfection is possible.
    for (let seed = 1; seed <= 5 && best < 100; seed++) {
      const h = createHarness(def(id), { difficulty, seed });
      h.run(11, (harness, frame) => BOTS[id](harness, harness.game, frame));
      expect(h.game.state).toBe('finished');
      best = Math.max(best, h.game.calculateScore().score);
    }
    expect(best).toBe(100);
  });
});

describe.each(ALL_MINIGAMES.map((d) => d.id))('idle player: %s', (id) => {
  it('doing nothing never passes', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const h = createHarness(def(id), { difficulty: Difficulty.NORMAL, seed });
      h.run(11);
      expect(h.game.calculateScore().score, `seed ${seed}`).toBeLessThan(30);
    }
  });
});
