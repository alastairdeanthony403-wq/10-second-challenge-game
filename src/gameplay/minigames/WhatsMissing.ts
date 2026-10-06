import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import { ChoiceButtons } from '../ChoiceButtons';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { emoji, roundRect, text } from '../../render/Draw';

export const ITEM_POOL = ['🍎', '🍌', '🍇', '🍓', '🍉', '🥕', '🌽', '🍄', '🌵', '🌻', '🐱', '🐶', '🐸', '🦊', '🐼', '🐙', '⚽', '🎈', '🎁', '🔔', '⭐', '🚀', '🚗', '🎸', '👑', '💎', '🍩', '🧀'];
const ROUNDS = 2;
const FEEDBACK_TIME = 0.55;

/** MEMORY — study the items, then spot which one vanished. Two quick rounds. */
export class WhatsMissing extends MiniGameBase {
  private items: string[] = [];
  private missingIndex = 0;
  private options: string[] = [];
  private phase: 'study' | 'answer' | 'feedback' = 'study';
  private phaseTime = 0;
  private studyTime = 2.4;
  private itemCount = 5;
  private round = 0;
  private correct = 0;
  private answered = 0;
  private buttons = new ChoiceButtons();
  private slots: { x: number; y: number }[] = [];

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.itemCount = tune(d, [4, 5, 6, 7]);
    this.studyTime = tune(d, [2.3, 2.2, 2.1, 2.0]);
    this.newRound();
  }

  private newRound(): void {
    const rng = this.ctx.rng;
    this.items = rng.sample(ITEM_POOL, this.itemCount);
    this.missingIndex = rng.int(0, this.items.length - 1);
    const missing = this.items[this.missingIndex];
    const unseen = ITEM_POOL.filter((i) => !this.items.includes(i));
    // Harder levels use a still-visible item as a decoy so players must really check.
    const visibleDecoy = this.ctx.difficulty >= 2 ? rng.sample(this.items.filter((i) => i !== missing), 1) : [];
    const decoys = [...visibleDecoy, ...rng.sample(unseen, 3 - visibleDecoy.length)];
    this.options = rng.shuffle([missing, ...decoys]);
    this.phase = 'study';
    this.phaseTime = 0;
    this.layoutSlots();
    this.buttons.layout(4, { x: 60, y: this.height * 0.62, w: this.width - 120, h: this.height * 0.32 }, this.height > this.width ? 2 : 4);
    this.buttons.resetStates();
  }

  private layoutSlots(): void {
    const n = this.items.length;
    const cols = Math.min(n, 4);
    const rows = Math.ceil(n / cols);
    const cell = Math.min((this.width - 120) / cols, (this.height * 0.48) / rows);
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const col = i - row * cols;
      this.slots.push({
        x: this.width / 2 + (col - (inRow - 1) / 2) * cell,
        y: this.height * 0.08 + cell / 2 + row * cell + (this.height * 0.48 - rows * cell) / 2,
      });
    }
  }

  protected onUpdate(dt: number): void {
    this.buttons.update(dt);
    this.phaseTime += dt;
    if (this.phase === 'study' && this.phaseTime >= this.studyTime) {
      this.phase = 'answer';
      this.phaseTime = 0;
      this.ctx.fx.sfx('whoosh');
    } else if (this.phase === 'feedback' && this.phaseTime >= FEEDBACK_TIME) {
      this.round++;
      if (this.round >= ROUNDS) this.finish(this.correct === ROUNDS ? 'success' : 'fail');
      else this.newRound();
    }
  }

  protected onInput(action: InputAction): void {
    if (this.phase !== 'answer') return;
    const idx = this.buttons.pick(action);
    if (idx < 0) return;
    this.answered++;
    const right = this.options[idx] === this.items[this.missingIndex];
    const c = this.buttons.center(idx);
    if (right) {
      this.correct++;
      this.buttons.press(idx, 'correct');
      this.ctx.fx.burst(c.x, c.y, this.ctx.palette.good, 16);
      this.ctx.fx.sfx('hit');
    } else {
      this.buttons.press(idx, 'wrong');
      this.buttons.buttons[this.options.indexOf(this.items[this.missingIndex])].state = 'correct';
      this.ctx.fx.shake(10);
      this.ctx.fx.sfx('bad');
    }
    this.phase = 'feedback';
    this.phaseTime = 0;
  }

  protected computeScore(): ScoreResult {
    return buildScore({
      raw: this.correct,
      completion: this.correct / ROUNDS,
      accuracy: this.answered === 0 ? 0 : this.correct / this.answered,
      completionWeight: 0.85,
      summaryKey: 'summary.correct',
      summaryParams: { correct: this.correct, total: ROUNDS },
      failReasonKey: this.answered < ROUNDS ? 'fail.too_slow' : 'fail.wrong_item',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    const cellSize = this.slots.length > 1 ? Math.abs(this.slots[1].x - this.slots[0].x) || 200 : 200;
    const size = Math.min(150, cellSize * 0.7);
    this.items.forEach((item, i) => {
      const s = this.slots[i];
      roundRect(g, s.x - size * 0.6, s.y - size * 0.6, size * 1.2, size * 1.2, 24, p.bgAlt);
      if (i === this.missingIndex && this.phase !== 'study') {
        text(g, '?', s.x, s.y, size * 0.8, p.accent);
      } else {
        emoji(g, item, s.x, s.y, size * 0.75);
      }
    });
    text(g, `${this.ctx.t('ui.round')} ${Math.min(this.round + 1, ROUNDS)}/${ROUNDS}`, 40, 40, 34, p.textDim, 'left', 700);
    if (this.phase === 'study') {
      const remain = 1 - this.phaseTime / this.studyTime;
      roundRect(g, this.width * 0.2, this.height * 0.58, this.width * 0.6 * remain, 14, 7, p.accent);
      this.banner(g, this.ctx.t('ui.memorize'), p.accent, this.height * 0.72);
      return;
    }
    this.buttons.render(g, { fill: p.bgAlt, stroke: 'rgba(255,255,255,0.2)', good: p.good, bad: p.bad, text: p.textDim }, (i, x, y, s) =>
      emoji(g, this.options[i], x, y, s * 0.5),
    );
  }
}

export const whatsMissingDef: MiniGameDefinition = {
  id: 'whats_missing',
  nameKey: 'game.whats_missing.name',
  instructionKey: 'game.whats_missing.instruction',
  descriptionKey: 'game.whats_missing.desc',
  category: 'memory',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['speed'],
  inputs: ['pointer', 'choice'],
  icon: '🔍',
  create: () => new WhatsMissing(),
};
