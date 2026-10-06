import type { InputAction } from '../../core/InputTypes';
import { Pool } from '../../core/Pool';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, clamp01, type ScoreResult } from '../Scoring';
import { checkMark, circle, crossMark, dist, easeOutBack, shape } from '../../render/Draw';

interface Blob {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  bad: boolean;
}

const MAX_STRIKES = 3;

/** REFLEX — tap the safe (✓ circle) blobs, avoid the dangerous (✕ spiky) ones. */
export class DontTapRed extends MiniGameBase {
  private pool = new Pool<Blob>(() => ({ x: 0, y: 0, r: 0, age: 0, life: 0, bad: false }), () => {}, 10);
  private spawnTimer = 0;
  private interval = 0.5;
  private badRatio = 0.3;
  private life = 1.5;
  private radius = 80;
  private goal = 10;
  private hits = 0;
  private strikes = 0;
  private emptyTaps = 0;

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.interval = tune(d, [0.55, 0.45, 0.38, 0.32]);
    this.badRatio = tune(d, [0.3, 0.38, 0.45, 0.5]);
    this.life = tune(d, [1.7, 1.4, 1.15, 0.95]);
    this.radius = this.size(tune(d, [90, 80, 70, 62]));
    const expectedGood = (10 / this.interval) * (1 - this.badRatio);
    this.goal = Math.max(6, Math.round(expectedGood * 0.72));
    this.spawn();
  }

  private spawn(): void {
    const b = this.pool.acquire();
    const m = this.radius + 30;
    for (let i = 0; i < 12; i++) {
      b.x = this.ctx.rng.range(m, this.width - m);
      b.y = this.ctx.rng.range(m, this.height - m);
      if (this.pool.active.every((o) => o === b || dist(o.x, o.y, b.x, b.y) > o.r * 2 + 20)) break;
    }
    b.r = this.radius;
    b.age = 0;
    b.life = this.life;
    b.bad = this.ctx.rng.chance(this.badRatio);
  }

  protected onUpdate(dt: number): void {
    this.spawnTimer += dt;
    while (this.spawnTimer >= this.interval) {
      this.spawnTimer -= this.interval;
      this.spawn();
    }
    for (const b of [...this.pool.active]) {
      b.age += dt;
      if (b.age >= b.life) this.pool.release(b);
    }
  }

  protected onInput(action: InputAction): void {
    if (action.type !== 'pointerDown') return;
    // Prefer the most recent blob on overlap (drawn on top).
    const hit = [...this.pool.active].reverse().find((b) => dist(b.x, b.y, action.x, action.y) <= b.r * 1.1);
    const p = this.ctx.palette;
    if (!hit) {
      this.emptyTaps++;
      this.ctx.fx.sfx('miss');
      return;
    }
    this.pool.release(hit);
    if (hit.bad) {
      this.strikes++;
      this.ctx.fx.flash(p.bad, 0.35);
      this.ctx.fx.shake(14);
      this.ctx.fx.sfx('bad');
      this.ctx.fx.floatText(hit.x, hit.y, this.ctx.t('fx.ouch'), p.bad);
      if (this.strikes >= MAX_STRIKES) this.finish('fail');
      return;
    }
    this.hits++;
    this.ctx.fx.burst(hit.x, hit.y, p.good, 14);
    this.ctx.fx.sfx('hit');
    if (this.hits >= this.goal) this.finish('success');
  }

  protected computeScore(): ScoreResult {
    const strikePenalty = this.strikes / MAX_STRIKES;
    const tapAccuracy = this.hits / Math.max(1, this.hits + this.emptyTaps * 0.5);
    return buildScore({
      raw: this.hits,
      completion: this.strikes >= MAX_STRIKES ? (this.hits / this.goal) * 0.5 : this.hits / this.goal,
      accuracy: clamp01(tapAccuracy * (1 - strikePenalty)),
      completionWeight: 0.6,
      summaryKey: 'summary.hits_strikes',
      summaryParams: { hits: this.hits, goal: this.goal, strikes: this.strikes },
      failReasonKey: this.strikes >= MAX_STRIKES ? 'fail.tapped_red' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    for (const b of this.pool.active) {
      const appear = easeOutBack(Math.min(1, b.age / 0.15));
      const fade = Math.min(1, (b.life - b.age) / 0.2);
      const r = b.r * appear * (0.6 + 0.4 * fade);
      g.globalAlpha = Math.max(0, fade);
      if (b.bad) {
        shape(g, 'star', b.x, b.y, r * 0.95, p.bad, '#fff', b.age * 2, 6);
        crossMark(g, b.x, b.y, r * 0.7, '#fff');
      } else {
        circle(g, b.x, b.y, r, p.good, '#fff', 6);
        checkMark(g, b.x, b.y, r * 0.8, '#fff');
      }
      g.globalAlpha = 1;
    }
    // Strike indicators.
    for (let i = 0; i < MAX_STRIKES; i++) {
      const x = this.width - 60 - i * 70;
      circle(g, x, 60, 26, i < this.strikes ? p.bad : 'rgba(255,255,255,0.15)');
      if (i < this.strikes) crossMark(g, x, 60, 22, '#fff');
    }
  }

  protected override onCleanup(): void {
    this.pool.releaseAll();
  }
}

export const dontTapRedDef: MiniGameDefinition = {
  id: 'dont_tap_red',
  nameKey: 'game.dont_tap_red.name',
  instructionKey: 'game.dont_tap_red.instruction',
  descriptionKey: 'game.dont_tap_red.desc',
  category: 'reflex',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['tiny', 'speed', 'chaos'],
  inputs: ['pointer'],
  icon: '🛑',
  create: () => new DontTapRed(),
};
