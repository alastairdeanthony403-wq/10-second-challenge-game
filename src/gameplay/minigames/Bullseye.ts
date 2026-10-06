import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, clamp01, type ScoreResult } from '../Scoring';
import { circle, crossMark, dist, text } from '../../render/Draw';

const SHOTS = 3;
/** Inside this fraction of the radius counts as a dead-centre hit. */
const PERFECT_FRACTION = 0.1;

interface Mark {
  x: number;
  y: number;
  score: number;
  age: number;
}

/** ACCURACY — three shots; the closer to the centre the better. The board drifts on harder levels. */
export class Bullseye extends MiniGameBase {
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private radius = 180;
  private speed = 0;
  private shots: number[] = [];
  private marks: Mark[] = [];

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.radius = this.size(tune(d, [200, 180, 160, 140]));
    this.speed = tune(d, [0, 140, 240, 340]);
    this.place();
  }

  private place(): void {
    const m = this.radius + 40;
    this.x = this.ctx.rng.range(m, this.width - m);
    this.y = this.ctx.rng.range(m + 60, this.height - m);
    const a = this.ctx.rng.range(0, Math.PI * 2);
    this.vx = Math.cos(a) * this.speed;
    this.vy = Math.sin(a) * this.speed;
  }

  protected onUpdate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const r = this.radius;
    if (this.x < r || this.x > this.width - r) this.vx *= -1;
    if (this.y < r + 60 || this.y > this.height - r) this.vy *= -1;
    this.x = Math.max(r, Math.min(this.width - r, this.x));
    this.y = Math.max(r + 60, Math.min(this.height - r, this.y));
    for (const m of this.marks) m.age += dt;
  }

  protected onInput(action: InputAction): void {
    if (action.type !== 'pointerDown') return;
    const d = dist(action.x, action.y, this.x, this.y);
    const frac = d / this.radius;
    const s = frac <= PERFECT_FRACTION ? 1 : clamp01(1 - (frac - PERFECT_FRACTION) / (1 - PERFECT_FRACTION));
    this.shots.push(s);
    this.marks.push({ x: action.x - this.x, y: action.y - this.y, score: s, age: 0 });
    const p = this.ctx.palette;
    const label = s >= 1 ? this.ctx.t('fx.bullseye') : s > 0 ? `+${Math.round(s * 100)}` : this.ctx.t('fx.miss');
    this.ctx.fx.floatText(action.x, action.y - 40, label, s >= 1 ? p.accent : s > 0 ? p.text : p.bad);
    this.ctx.fx.burst(action.x, action.y, s > 0 ? p.accent : p.bad, s >= 1 ? 26 : 10);
    this.ctx.fx.sfx(s > 0 ? 'hit' : 'miss');
    if (s >= 1) this.ctx.fx.shake(6);
    if (this.shots.length >= SHOTS) this.finish('success');
  }

  protected computeScore(): ScoreResult {
    const total = this.shots.reduce((a, b) => a + b, 0);
    const avg = total / SHOTS;
    return buildScore({
      raw: Math.round(total * 100),
      completion: avg,
      accuracy: avg,
      summaryKey: 'summary.shots',
      summaryParams: { shots: this.shots.length, total: SHOTS, avg: Math.round(avg * 100) },
      failReasonKey: this.shots.length < SHOTS ? 'fail.too_slow' : 'fail.off_target',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    const r = this.radius;
    circle(g, this.x, this.y + 10, r, 'rgba(0,0,0,0.3)');
    const rings = [p.bad, '#fff', p.bad, '#fff', p.accent];
    rings.forEach((color, i) => circle(g, this.x, this.y, r * (1 - i * 0.2), color));
    circle(g, this.x, this.y, r * PERFECT_FRACTION, p.bg);
    for (const m of this.marks) {
      const mx = this.x + m.x;
      const my = this.y + m.y;
      circle(g, mx, my, 16, p.bg, '#fff', 4);
      crossMark(g, mx, my, 16, '#fff');
    }
    for (let i = 0; i < SHOTS; i++) {
      const used = i < this.shots.length;
      circle(g, 60 + i * 60, 56, 20, used ? 'rgba(255,255,255,0.15)' : p.accent);
    }
    text(g, `${SHOTS - this.shots.length}`, 60 + SHOTS * 60, 58, 36, p.text, 'left');
  }
}

export const bullseyeDef: MiniGameDefinition = {
  id: 'bullseye',
  nameKey: 'game.bullseye.name',
  instructionKey: 'game.bullseye.instruction',
  descriptionKey: 'game.bullseye.desc',
  category: 'accuracy',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['tiny', 'speed', 'chaos'],
  inputs: ['pointer'],
  icon: '🏹',
  create: () => new Bullseye(),
};
