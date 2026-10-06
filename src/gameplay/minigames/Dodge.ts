import type { InputAction } from '../../core/InputTypes';
import { Pool } from '../../core/Pool';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, clamp01, type ScoreResult } from '../Scoring';
import { circle, crossMark, roundRect, shape } from '../../render/Draw';

interface Rock {
  x: number;
  y: number;
  r: number;
  vy: number;
  spin: number;
}

const PLAYER_R = 44;
const MAX_HITS = 3;
const INVULNERABLE = 0.8;
const KEY_SPEED = 1300;

/** MOVEMENT — slide left/right to dodge the falling rocks. Three hits and you're out. */
export class Dodge extends MiniGameBase {
  private rocks = new Pool<Rock>(() => ({ x: 0, y: 0, r: 0, vy: 0, spin: 0 }), () => {}, 16);
  private px = 0;
  private pointerX: number | null = null;
  private spawnTimer = 0;
  private interval = 0.5;
  private fallSpeed = 600;
  private hits = 0;
  private invuln = 0;
  private survived = 0;

  private get py(): number {
    return this.height - 110;
  }

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.interval = tune(d, [0.42, 0.34, 0.27, 0.22]);
    this.fallSpeed = tune(d, [650, 780, 900, 1020]);
    this.px = this.width / 2;
  }

  private spawn(): void {
    const r = this.rocks.acquire();
    r.r = this.ctx.rng.range(40, 75) * (this.ctx.modifier === 'tiny' ? 0.7 : 1);
    // Bias some rocks toward the player so standing still is never safe.
    r.x = this.ctx.rng.chance(0.35) ? this.px + this.ctx.rng.range(-80, 80) : this.ctx.rng.range(r.r, this.width - r.r);
    r.y = -r.r;
    r.vy = this.fallSpeed * this.ctx.rng.range(0.85, 1.2);
    r.spin = this.ctx.rng.range(0, 6);
  }

  protected onUpdate(dt: number): void {
    const move = this.ctx.input.move.x;
    if (move !== 0) {
      this.pointerX = null;
      this.px += move * KEY_SPEED * dt;
    } else if (this.pointerX !== null) {
      this.px += (this.pointerX - this.px) * Math.min(1, dt * 18);
    }
    this.px = Math.max(PLAYER_R, Math.min(this.width - PLAYER_R, this.px));
    this.invuln = Math.max(0, this.invuln - dt);

    this.spawnTimer += dt;
    while (this.spawnTimer >= this.interval) {
      this.spawnTimer -= this.interval;
      this.spawn();
    }
    for (const r of [...this.rocks.active]) {
      r.y += r.vy * dt;
      r.spin += dt * 3;
      if (r.y - r.r > this.height) {
        this.rocks.release(r);
        continue;
      }
      if (this.invuln <= 0 && Math.hypot(r.x - this.px, r.y - this.py) < r.r * 0.85 + PLAYER_R) {
        this.hits++;
        this.invuln = INVULNERABLE;
        this.rocks.release(r);
        this.ctx.fx.shake(16);
        this.ctx.fx.flash(this.ctx.palette.bad, 0.3);
        this.ctx.fx.sfx('bad');
        if (this.hits >= MAX_HITS) {
          this.survived = this.ctx.elapsed();
          this.finish('fail');
          return;
        }
      }
    }
  }

  protected onInput(action: InputAction): void {
    if (action.type === 'pointerDown' || action.type === 'pointerMove') this.pointerX = action.x;
  }

  protected computeScore(): ScoreResult {
    const total = this.ctx.elapsed() + this.ctx.timeLeft();
    const alive = this.hits < MAX_HITS;
    const survived = alive ? total : this.survived;
    return buildScore({
      raw: this.hits,
      completion: clamp01(survived / total) * (alive ? 1 : 0.6),
      accuracy: clamp01(1 - this.hits / MAX_HITS),
      completionWeight: 0.5,
      summaryKey: 'summary.dodge',
      summaryParams: { hits: this.hits, seconds: survived.toFixed(1) },
      failReasonKey: 'fail.crushed',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    for (const r of this.rocks.active) shape(g, 'hexagon', r.x, r.y, r.r, '#8d7b6a', '#5c4d40', r.spin, 6);
    const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
    if (!blink) {
      circle(g, this.px, this.py, PLAYER_R, p.d, '#fff', 6);
      circle(g, this.px - 14, this.py - 8, 7, '#000');
      circle(g, this.px + 14, this.py - 8, 7, '#000');
    }
    roundRect(g, 0, this.height - 50, this.width, 50, 0, 'rgba(255,255,255,0.05)');
    for (let i = 0; i < MAX_HITS; i++) {
      const x = 60 + i * 70;
      const lost = i < this.hits;
      shape(g, 'heart', x, 56, 26, lost ? 'rgba(255,255,255,0.15)' : p.bad);
      if (lost) crossMark(g, x, 56, 22, p.textDim);
    }
  }

  protected override onCleanup(): void {
    this.rocks.releaseAll();
  }
}

export const dodgeDef: MiniGameDefinition = {
  id: 'dodge',
  nameKey: 'game.dodge.name',
  instructionKey: 'game.dodge.instruction',
  descriptionKey: 'game.dodge.desc',
  category: 'movement',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'bestScore', points: 2000 },
  modifiers: ['speed', 'reverse', 'tiny', 'chaos'],
  inputs: ['move', 'pointer'],
  icon: '🪨',
  create: () => new Dodge(),
};
