import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import { ChoiceButtons } from '../ChoiceButtons';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { text } from '../../render/Draw';

/** LOGIC — pick the biggest number. Harder levels use closer values. */
export class BiggestNumber extends MiniGameBase {
  private numbers: number[] = [];
  private goal = 6;
  private correct = 0;
  private wrong = 0;
  private buttons = new ChoiceButtons();

  protected onPrepare(): void {
    this.goal = tune(this.ctx.difficulty, [6, 7, 8, 8]);
    this.buttons.layout(4, { x: 60, y: this.height * 0.25, w: this.width - 120, h: this.height * 0.6 }, this.width > this.height ? 4 : 2, 30);
    this.newRound();
  }

  private newRound(): void {
    const rng = this.ctx.rng;
    const d = this.ctx.difficulty;
    const [min, max, spread] = tune(d, [
      [1, 50, 999] as const,
      [10, 99, 999] as const,
      [100, 999, 40] as const,
      [1000, 9999, 30] as const,
    ]);
    const set = new Set<number>();
    const anchor = rng.int(min, max);
    while (set.size < 4) {
      const v = spread >= 999 ? rng.int(min, max) : Math.max(min, Math.min(max, anchor + rng.int(-spread, spread)));
      set.add(v);
    }
    this.numbers = rng.shuffle([...set]);
    // On EXTREME, include a digit-swap decoy (e.g. 4718 vs 4781) so players must read carefully.
    if (d >= 3) {
      const big = Math.max(...this.numbers);
      const s = String(big).split('');
      [s[s.length - 1], s[s.length - 2]] = [s[s.length - 2], s[s.length - 1]];
      const swapped = Number(s.join(''));
      if (swapped !== big && !this.numbers.includes(swapped)) {
        const smallestIdx = this.numbers.indexOf(Math.min(...this.numbers));
        this.numbers[smallestIdx] = swapped;
      }
    }
    this.buttons.resetStates();
  }

  protected onUpdate(dt: number): void {
    this.buttons.update(dt);
  }

  protected onInput(action: InputAction): void {
    const idx = this.buttons.pick(action);
    if (idx < 0) return;
    const best = Math.max(...this.numbers);
    const c = this.buttons.center(idx);
    if (this.numbers[idx] === best) {
      this.correct++;
      this.buttons.press(idx, 'correct');
      this.ctx.fx.burst(c.x, c.y, this.ctx.palette.good, 14);
      this.ctx.fx.sfx('hit');
      if (this.correct >= this.goal) this.finish('success');
      else this.newRound();
    } else {
      this.wrong++;
      this.buttons.press(idx, 'wrong');
      this.ctx.fx.shake(8);
      this.ctx.fx.sfx('bad');
      this.ctx.fx.floatText(c.x, c.y - 60, this.ctx.t('fx.wrong'), this.ctx.palette.bad);
    }
  }

  protected computeScore(): ScoreResult {
    return buildScore({
      raw: this.correct,
      completion: this.correct / this.goal,
      accuracy: this.correct / Math.max(1, this.correct + this.wrong),
      completionWeight: 0.7,
      summaryKey: 'summary.correct',
      summaryParams: { correct: this.correct, total: this.goal },
      failReasonKey: this.wrong > this.correct ? 'fail.wrong_pick' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    text(g, `${this.correct}/${this.goal}`, 40, 46, 40, p.text, 'left', 800);
    text(g, this.ctx.t('ui.biggest'), this.width / 2, this.height * 0.12, 56, p.accent, 'center', 900);
    this.buttons.render(g, { fill: p.bgAlt, stroke: 'rgba(255,255,255,0.2)', good: p.good, bad: p.bad, text: p.textDim }, (i, x, y, s) =>
      text(g, String(this.numbers[i]), x, y, Math.min(s * 0.38, (this.buttons.buttons[i].w * 0.8) / Math.max(2, String(this.numbers[i]).length) * 1.7), p.text, 'center', 900),
    );
  }
}

export const biggestNumberDef: MiniGameDefinition = {
  id: 'biggest_number',
  nameKey: 'game.biggest_number.name',
  instructionKey: 'game.biggest_number.instruction',
  descriptionKey: 'game.biggest_number.desc',
  category: 'logic',
  timeLimit: 10,
  weight: 0.9,
  scoreMultiplier: 1,
  unlock: { type: 'runs', count: 3 },
  modifiers: [],
  inputs: ['pointer', 'choice'],
  icon: '🔢',
  create: () => new BiggestNumber(),
};
