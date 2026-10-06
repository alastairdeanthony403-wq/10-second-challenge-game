import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, clamp01, type ScoreResult } from '../Scoring';
import { roundRect, text } from '../../render/Draw';

interface Egg {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  broken: boolean;
}

const EGG_RX = 44;
const EGG_RY = 56;
const PADDLE_H = 34;
const PADDLE_KEY_SPEED = 1500;

/** CHAOS — keep the egg(s) bouncing on your trampoline. Wind gusts push them around. */
export class SaveTheEgg extends MiniGameBase {
  private eggs: Egg[] = [];
  private paddleX = 0;
  private paddleW = 280;
  private gravity = 1400;
  private wind = 0;
  private windTarget = 0;
  private windTimer = 0;
  private windStrength = 0;
  private bounces = 0;
  private survived = 0;
  private pointerX: number | null = null;
  private splatAt: { x: number; y: number } | null = null;

  private get paddleY(): number {
    return this.height - 110;
  }

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.gravity = tune(d, [1300, 1550, 1800, 2000]);
    this.paddleW = this.size(tune(d, [340, 290, 250, 230]));
    this.windStrength = tune(d, [0, 260, 420, 520]);
    const eggCount = tune(d, [1, 1, 1, 2]);
    this.paddleX = this.width / 2;
    for (let i = 0; i < eggCount; i++) {
      const offset = eggCount === 1 ? 0 : (i === 0 ? -1 : 1) * Math.min(220, this.width * 0.2);
      // A random sideways drift means doing nothing is never a winning strategy.
      const drift = this.ctx.rng.range(160, 260) * (this.ctx.rng.chance(0.5) ? 1 : -1);
      this.eggs.push({ x: this.width / 2 + offset, y: this.height * 0.25 - i * 120, vx: drift, vy: 0, spin: 0, broken: false });
    }
  }

  protected onUpdate(dt: number): void {
    // Paddle control: pointer has priority while moving, otherwise keys/stick.
    const move = this.ctx.input.move.x;
    if (move !== 0) {
      this.pointerX = null;
      this.paddleX += move * PADDLE_KEY_SPEED * dt;
    } else if (this.pointerX !== null) {
      this.paddleX += (this.pointerX - this.paddleX) * Math.min(1, dt * 20);
    }
    const half = this.paddleW / 2;
    this.paddleX = Math.max(half, Math.min(this.width - half, this.paddleX));

    this.windTimer -= dt;
    if (this.windTimer <= 0 && this.windStrength > 0) {
      this.windTimer = this.ctx.rng.range(1.2, 2.2);
      this.windTarget = this.ctx.rng.range(-1, 1) * this.windStrength;
    }
    this.wind += (this.windTarget - this.wind) * Math.min(1, dt * 2);

    const peakY = this.height * 0.14;
    for (const egg of this.eggs) {
      egg.vy += this.gravity * dt;
      egg.vx += this.wind * dt;
      egg.vx *= 1 - Math.min(0.9, dt * 0.4);
      egg.x += egg.vx * dt;
      egg.y += egg.vy * dt;
      egg.spin += egg.vx * dt * 0.01;
      if (egg.x < EGG_RX) {
        egg.x = EGG_RX;
        egg.vx = Math.abs(egg.vx) * 0.8;
      } else if (egg.x > this.width - EGG_RX) {
        egg.x = this.width - EGG_RX;
        egg.vx = -Math.abs(egg.vx) * 0.8;
      }
      const top = this.paddleY - PADDLE_H / 2;
      if (egg.vy > 0 && egg.y + EGG_RY >= top && egg.y + EGG_RY <= top + 50 && Math.abs(egg.x - this.paddleX) <= half + EGG_RX * 0.6) {
        // Bounce high enough to reach the top area; hit offset steers sideways.
        const height = this.paddleY - peakY;
        egg.vy = -Math.sqrt(2 * this.gravity * height);
        egg.vx += ((egg.x - this.paddleX) / half) * 380;
        egg.y = top - EGG_RY;
        this.bounces++;
        this.ctx.fx.sfx('bounce');
        this.ctx.fx.burst(egg.x, top, this.ctx.palette.accent, 6);
      }
      if (egg.y - EGG_RY > this.height) {
        egg.broken = true;
        this.splatAt = { x: egg.x, y: this.height - 30 };
        this.ctx.fx.sfx('splat');
        this.ctx.fx.shake(20);
        this.ctx.fx.burst(egg.x, this.height - 30, '#ffe066', 30);
        this.survived = this.ctx.elapsed();
        this.finish('fail');
        return;
      }
    }
  }

  protected onInput(action: InputAction): void {
    if (action.type === 'pointerDown' || action.type === 'pointerMove') this.pointerX = action.x;
  }

  protected computeScore(): ScoreResult {
    const timeLimit = this.ctx.elapsed() + this.ctx.timeLeft();
    const survivedAll = !this.eggs.some((e) => e.broken);
    const survived = survivedAll ? timeLimit : this.survived;
    const completion = clamp01(survived / timeLimit);
    return buildScore({
      raw: this.bounces,
      completion: survivedAll ? 1 : completion * 0.85,
      accuracy: survivedAll ? 1 : completion,
      summaryKey: 'summary.egg',
      summaryParams: { seconds: survived.toFixed(1), bounces: this.bounces },
      failReasonKey: 'fail.egg_broke',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    // Ground.
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, this.height - 30, this.width, 30);
    // Wind indicator.
    if (Math.abs(this.wind) > 40) {
      const dir = Math.sign(this.wind);
      const n = Math.min(3, Math.ceil(Math.abs(this.wind) / 180));
      text(g, (dir > 0 ? '»' : '«').repeat(n), this.width / 2, 60, 60, p.textDim);
    }
    for (const egg of this.eggs) {
      if (egg.broken) continue;
      g.save();
      g.translate(egg.x, egg.y);
      g.rotate(egg.spin);
      g.beginPath();
      g.ellipse(0, 0, EGG_RX, EGG_RY, 0, 0, Math.PI * 2);
      g.fillStyle = '#fff8e7';
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = '#e8d5a8';
      g.stroke();
      // Worried face.
      g.fillStyle = '#222';
      g.beginPath();
      g.arc(-14, -8, 6, 0, Math.PI * 2);
      g.arc(14, -8, 6, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(0, 18, 10, Math.PI * 1.1, Math.PI * 1.9);
      g.lineWidth = 4;
      g.strokeStyle = '#222';
      g.stroke();
      g.restore();
      // Drop shadow on the paddle line helps judge position.
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(egg.x, this.paddleY + 30, EGG_RX * 0.8, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (this.splatAt) {
      g.fillStyle = '#ffd43b';
      g.beginPath();
      g.ellipse(this.splatAt.x, this.splatAt.y, 90, 22, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(this.splatAt.x - 40, this.splatAt.y - 4, 50, 14, 0.1, 0, Math.PI * 2);
      g.fill();
    }
    roundRect(g, this.paddleX - this.paddleW / 2, this.paddleY - PADDLE_H / 2, this.paddleW, PADDLE_H, PADDLE_H / 2, p.b, '#fff', 5);
    text(g, `${this.ctx.t('fx.bounces')}: ${this.bounces}`, 40, 46, 36, p.textDim, 'left', 700);
  }
}

export const saveTheEggDef: MiniGameDefinition = {
  id: 'save_egg',
  nameKey: 'game.save_egg.name',
  instructionKey: 'game.save_egg.instruction',
  descriptionKey: 'game.save_egg.desc',
  category: 'chaos',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['tiny', 'reverse', 'speed', 'chaos'],
  inputs: ['move', 'pointer'],
  icon: '🥚',
  create: () => new SaveTheEgg(),
};
