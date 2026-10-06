import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import { ChoiceButtons } from '../ChoiceButtons';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { roundRect, shape, text, type ShapeKind } from '../../render/Draw';

const PAD_SHAPES: ShapeKind[] = ['circle', 'square', 'triangle', 'star', 'diamond', 'hexagon'];
const STEP_TIME = 0.55;
const GAP_TIME = 0.15;

/** MEMORY — watch a short sequence of symbols, then repeat it. */
export class RememberTheOrder extends MiniGameBase {
  private sequence: number[] = [];
  private padCount = 4;
  private phase: 'show' | 'input' = 'show';
  private showTimer = 0;
  private entered = 0;
  private mistakes = 0;
  private buttons = new ChoiceButtons();
  private colors: string[] = [];
  private stepTime = STEP_TIME;

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    const length = tune(d, [3, 4, 5, 6]);
    this.padCount = tune(d, [4, 4, 6, 6]);
    this.stepTime = tune(d, [0.6, 0.55, 0.5, 0.45]);
    const p = this.ctx.palette;
    this.colors = [p.a, p.b, p.c, p.d, p.warn, '#a78bfa'];
    this.sequence = [];
    for (let i = 0; i < length; i++) {
      let next = this.ctx.rng.int(0, this.padCount - 1);
      // Avoid immediate repeats; they are hard to read in a flashing display.
      if (i > 0 && next === this.sequence[i - 1]) next = (next + 1) % this.padCount;
      this.sequence.push(next);
    }
    const area = { x: 40, y: this.height * 0.5, w: this.width - 80, h: this.height * 0.46 };
    const portrait = this.height > this.width;
    this.buttons.layout(this.padCount, area, portrait ? (this.padCount <= 4 ? 2 : 3) : this.padCount <= 4 ? 4 : 3);
  }

  private get showDuration(): number {
    return this.sequence.length * (this.stepTime + GAP_TIME);
  }

  protected onUpdate(dt: number): void {
    this.buttons.update(dt);
    if (this.phase === 'show') {
      const before = Math.floor(this.showTimer / (this.stepTime + GAP_TIME));
      this.showTimer += dt;
      const after = Math.floor(this.showTimer / (this.stepTime + GAP_TIME));
      if (after !== before && after < this.sequence.length) this.ctx.fx.sfx('tick');
      if (this.showTimer >= this.showDuration) {
        this.phase = 'input';
        this.ctx.fx.sfx('whoosh');
      }
    }
  }

  protected onInput(action: InputAction): void {
    if (this.phase === 'show') {
      // Let eager players skip the remainder of the playback by tapping.
      return;
    }
    const idx = this.buttons.pick(action);
    if (idx < 0) return;
    const expected = this.sequence[this.entered];
    const c = this.buttons.center(idx);
    if (idx === expected) {
      this.entered++;
      this.buttons.press(idx, 'correct');
      this.ctx.fx.burst(c.x, c.y, this.colors[idx], 10);
      this.ctx.fx.sfx('select');
      if (this.entered >= this.sequence.length) this.finish('success');
    } else {
      this.mistakes++;
      this.buttons.press(idx, 'wrong');
      this.ctx.fx.shake(12);
      this.ctx.fx.sfx('bad');
      this.ctx.fx.floatText(c.x, c.y, this.ctx.t('fx.wrong'), this.ctx.palette.bad);
      this.finish('fail');
    }
  }

  protected computeScore(): ScoreResult {
    const len = this.sequence.length;
    return buildScore({
      raw: this.entered,
      completion: this.entered / len,
      accuracy: this.entered / Math.max(1, this.entered + this.mistakes),
      completionWeight: 0.8,
      summaryKey: 'summary.sequence',
      summaryParams: { correct: this.entered, total: len },
      failReasonKey: this.mistakes > 0 ? 'fail.wrong_order' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    // Display panel.
    const panelW = Math.min(this.width - 120, 760);
    const px = (this.width - panelW) / 2;
    const py = this.height * 0.06;
    const ph = this.height * 0.38;
    roundRect(g, px, py, panelW, ph, 36, p.bgAlt, 'rgba(255,255,255,0.15)', 4);
    const cx = this.width / 2;
    const cy = py + ph / 2 + 30;
    if (this.phase === 'show') {
      const step = Math.floor(this.showTimer / (this.stepTime + GAP_TIME));
      const within = this.showTimer - step * (this.stepTime + GAP_TIME);
      if (step < this.sequence.length && within < this.stepTime) {
        const idx = this.sequence[step];
        const pop = Math.min(1, within / 0.12);
        shape(g, PAD_SHAPES[idx], cx, cy, ph * 0.24 * (0.7 + 0.3 * pop), this.colors[idx], '#fff', 0, 8);
      }
      text(g, this.ctx.t('ui.watch'), cx, py + 50, 48, p.accent, 'center', 900);
    } else {
      // Progress dots.
      const n = this.sequence.length;
      const spacing = Math.min(110, (panelW - 80) / n);
      for (let i = 0; i < n; i++) {
        const x = cx - ((n - 1) * spacing) / 2 + i * spacing;
        if (i < this.entered) shape(g, PAD_SHAPES[this.sequence[i]], x, cy, spacing * 0.32, this.colors[this.sequence[i]], '#fff', 0, 4);
        else roundRect(g, x - spacing * 0.3, cy - spacing * 0.3, spacing * 0.6, spacing * 0.6, 12, undefined, 'rgba(255,255,255,0.35)', 4);
      }
      text(g, this.ctx.t('ui.your_turn'), cx, py + 50, 48, p.good, 'center', 900);
    }
    this.buttons.render(
      g,
      { fill: p.bgAlt, stroke: 'rgba(255,255,255,0.2)', good: p.good, bad: p.bad, text: p.textDim },
      (i, x, y, size) => shape(g, PAD_SHAPES[i], x, y, size * 0.26, this.colors[i], '#fff', 0, 5),
    );
    if (this.phase === 'show') {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, this.height * 0.5 - 20, this.width, this.height * 0.5 + 20);
    }
  }
}

export const rememberTheOrderDef: MiniGameDefinition = {
  id: 'remember_order',
  nameKey: 'game.remember_order.name',
  instructionKey: 'game.remember_order.instruction',
  descriptionKey: 'game.remember_order.desc',
  category: 'memory',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['speed'],
  inputs: ['pointer', 'choice'],
  icon: '🧠',
  create: () => new RememberTheOrder(),
};
