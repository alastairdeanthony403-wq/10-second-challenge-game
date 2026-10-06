import type { InputAction } from '../../core/InputTypes';
import { Pool } from '../../core/Pool';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { circle, dist, easeOutBack, shape } from '../../render/Draw';

interface Target {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  age: number;
  life: number;
  fake: boolean;
}

/** REFLEX — tap blue circles as fast as possible. Variants add motion and fake targets. */
export class TapTheTarget extends MiniGameBase {
  private pool = new Pool<Target>(() => ({ x: 0, y: 0, vx: 0, vy: 0, r: 0, age: 0, life: 0, fake: false }), (t) => Object.assign(t, { age: 0, fake: false }), 6);
  private hits = 0;
  private misses = 0;
  private goal = 0;
  private concurrent = 1;
  private life = 2;
  private radius = 80;
  private moveSpeed = 0;
  private fakeChance = 0;

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.goal = tune(d, [12, 14, 16, 18]);
    this.concurrent = tune(d, [1, 2, 2, 3]);
    this.life = tune(d, [2.2, 1.7, 1.4, 1.2]);
    this.radius = this.size(tune(d, [95, 82, 70, 60]));
    this.moveSpeed = tune(d, [0, 0, 160, 260]);
    this.fakeChance = tune(d, [0, 0, 0.15, 0.25]);
    for (let i = 0; i < this.concurrent; i++) this.spawn(false);
  }

  private spawn(allowFake = true): void {
    const t = this.pool.acquire();
    const margin = this.radius + 30;
    for (let attempt = 0; attempt < 12; attempt++) {
      t.x = this.ctx.rng.range(margin, this.width - margin);
      t.y = this.ctx.rng.range(margin, this.height - margin);
      if (this.pool.active.every((o) => o === t || dist(o.x, o.y, t.x, t.y) > o.r + this.radius + 20)) break;
    }
    const angle = this.ctx.rng.range(0, Math.PI * 2);
    t.vx = Math.cos(angle) * this.moveSpeed;
    t.vy = Math.sin(angle) * this.moveSpeed;
    t.r = this.radius;
    t.life = this.life;
    t.age = 0;
    t.fake = allowFake && this.ctx.rng.chance(this.fakeChance);
  }

  protected onUpdate(dt: number): void {
    for (const t of [...this.pool.active]) {
      t.age += dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (t.x < t.r || t.x > this.width - t.r) t.vx *= -1;
      if (t.y < t.r || t.y > this.height - t.r) t.vy *= -1;
      if (t.age >= t.life) {
        this.pool.release(t);
        this.spawn();
      }
    }
  }

  protected onInput(action: InputAction): void {
    if (action.type !== 'pointerDown') return;
    const hit = this.pool.active.find((t) => dist(t.x, t.y, action.x, action.y) <= t.r * 1.12);
    if (hit && !hit.fake) {
      this.hits++;
      this.ctx.fx.burst(hit.x, hit.y, this.ctx.palette.a, 14);
      this.ctx.fx.floatText(hit.x, hit.y - hit.r, `${this.hits}/${this.goal}`, this.ctx.palette.text);
      this.ctx.fx.sfx('hit');
      this.pool.release(hit);
      if (this.hits >= this.goal) {
        this.finish('success');
        return;
      }
      this.spawn();
    } else {
      this.misses++;
      this.ctx.fx.floatText(action.x, action.y, hit ? this.ctx.t('fx.fake') : this.ctx.t('fx.miss'), this.ctx.palette.bad);
      this.ctx.fx.sfx('miss');
      this.ctx.fx.shake(4);
      if (hit) {
        this.pool.release(hit);
        this.spawn();
      }
    }
  }

  protected computeScore(): ScoreResult {
    const taps = this.hits + this.misses;
    return buildScore({
      raw: this.hits,
      completion: this.hits / this.goal,
      accuracy: taps === 0 ? 0 : this.hits / taps,
      completionWeight: 0.75,
      summaryKey: 'summary.hits',
      summaryParams: { hits: this.hits, goal: this.goal },
      failReasonKey: this.misses > this.hits ? 'fail.too_many_misses' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    for (const t of this.pool.active) {
      const appear = Math.min(1, t.age / 0.18);
      const r = t.r * easeOutBack(appear);
      if (t.fake) {
        shape(g, 'square', t.x, t.y, r * 0.85, p.textDim, p.bg, 0, 8);
        continue;
      }
      circle(g, t.x, t.y + 8, r, 'rgba(0,0,0,0.3)');
      circle(g, t.x, t.y, r, p.a, '#fff', 8);
      circle(g, t.x, t.y, r * 0.45, '#fff');
      // Ring showing remaining lifetime.
      const remain = 1 - t.age / t.life;
      g.beginPath();
      g.arc(t.x, t.y, r + 14, -Math.PI / 2, -Math.PI / 2 + remain * Math.PI * 2);
      g.lineWidth = 6;
      g.strokeStyle = remain < 0.3 ? p.bad : 'rgba(255,255,255,0.7)';
      g.stroke();
    }
  }

  protected override onCleanup(): void {
    this.pool.releaseAll();
  }
}

export const tapTheTargetDef: MiniGameDefinition = {
  id: 'tap_target',
  nameKey: 'game.tap_target.name',
  instructionKey: 'game.tap_target.instruction',
  descriptionKey: 'game.tap_target.desc',
  category: 'reflex',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['tiny', 'speed', 'chaos'],
  inputs: ['pointer'],
  icon: '🎯',
  create: () => new TapTheTarget(),
};
