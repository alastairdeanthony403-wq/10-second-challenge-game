import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { circle, roundRect, text } from '../../render/Draw';

/** SPEED — mash to pump the balloon until it pops. */
export class ButtonMash extends MiniGameBase {
  private presses = 0;
  private goal = 50;
  private pulse = 0;
  private popped = false;
  private leak = 0;

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.goal = tune(d, [40, 48, 56, 62]);
    // Harder levels slowly deflate the balloon, so pauses cost progress.
    this.leak = tune(d, [0, 0, 1.2, 2]);
  }

  protected onUpdate(dt: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 8);
    if (this.leak > 0 && this.presses > 0) this.presses = Math.max(0, this.presses - this.leak * dt);
    // Camera creeps in as the balloon swells (restored automatically after the challenge).
    this.ctx.camera.setZoom(1 + 0.06 * Math.min(1, this.presses / this.goal));
  }

  protected onInput(action: InputAction): void {
    if (action.type !== 'primary' && action.type !== 'pointerDown' && action.type !== 'secondary') return;
    this.presses += 1;
    this.pulse = 1;
    this.ctx.fx.sfx('pop');
    if (Math.floor(this.presses) % 10 === 0) {
      this.ctx.fx.floatText(this.width / 2, this.height * 0.2, `${Math.floor(this.presses)}!`, this.ctx.palette.accent);
    }
    if (this.presses >= this.goal) {
      this.popped = true;
      const r = this.balloonRadius();
      this.ctx.fx.burst(this.width / 2, this.height * 0.42, this.ctx.palette.b, 60);
      this.ctx.fx.shake(18);
      this.ctx.fx.flash('#ffffff', 0.4);
      this.ctx.fx.floatText(this.width / 2, this.height * 0.42 - r, this.ctx.t('fx.pop'), this.ctx.palette.accent);
      this.finish('success');
    }
  }

  private balloonRadius(): number {
    const t = Math.min(1, this.presses / this.goal);
    return Math.min(this.width, this.height) * (0.08 + 0.26 * t);
  }

  protected computeScore(): ScoreResult {
    const presses = Math.floor(this.presses);
    return buildScore({
      raw: presses,
      completion: this.popped ? 1 : presses / this.goal,
      accuracy: 1,
      completionWeight: 1,
      summaryKey: 'summary.presses',
      summaryParams: { presses, goal: this.goal },
      failReasonKey: 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    const cx = this.width / 2;
    const cy = this.height * 0.42;
    if (!this.popped) {
      const r = this.balloonRadius() * (1 + this.pulse * 0.04);
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, cy + r);
      g.quadraticCurveTo(cx + 30, cy + r + 80, cx, this.height * 0.78);
      g.stroke();
      g.beginPath();
      g.ellipse(cx, cy, r * 0.9, r, 0, 0, Math.PI * 2);
      g.fillStyle = p.b;
      g.fill();
      circle(g, cx - r * 0.35, cy - r * 0.4, r * 0.15, 'rgba(255,255,255,0.5)');
    }
    // Pump button.
    const bw = Math.min(520, this.width * 0.6);
    const bh = 120;
    const by = this.height * 0.8 + this.pulse * 8;
    roundRect(g, cx - bw / 2, this.height * 0.8 + 12, bw, bh, 40, 'rgba(0,0,0,0.35)');
    roundRect(g, cx - bw / 2, by, bw, bh, 40, p.accent, '#fff', 6);
    text(g, this.ctx.t('ui.mash'), cx, by + bh / 2 + 4, 56, '#1a1030', 'center', 900);
    const t = Math.min(1, this.presses / this.goal);
    roundRect(g, 40, 30, this.width - 80, 24, 12, 'rgba(255,255,255,0.12)');
    roundRect(g, 40, 30, (this.width - 80) * t, 24, 12, p.b);
  }
}

export const buttonMashDef: MiniGameDefinition = {
  id: 'button_mash',
  nameKey: 'game.button_mash.name',
  instructionKey: 'game.button_mash.instruction',
  descriptionKey: 'game.button_mash.desc',
  category: 'speed',
  timeLimit: 10,
  weight: 0.8,
  scoreMultiplier: 1,
  unlock: { type: 'runs', count: 1 },
  modifiers: [],
  inputs: ['primary', 'pointer'],
  icon: '🎈',
  create: () => new ButtonMash(),
};
