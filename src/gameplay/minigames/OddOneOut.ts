import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { ring, shape, text, type ShapeKind } from '../../render/Draw';

interface Puzzle {
  base: ShapeKind;
  odd: ShapeKind;
  baseRot: number;
  oddRot: number;
  oddScale: number;
}

/** LOGIC — one shape is different (form, direction or size — never only colour). Find it. */
export class OddOneOut extends MiniGameBase {
  private grid = 3;
  private oddIndex = 0;
  private puzzle!: Puzzle;
  private goal = 5;
  private found = 0;
  private wrong = 0;
  private cell = 0;
  private origin = { x: 0, y: 0 };
  private flashWrong = -1;
  private flashTime = 0;
  private color = '#fff';

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.grid = tune(d, [3, 4, 4, 5]);
    this.goal = tune(d, [5, 5, 6, 6]);
    this.newPuzzle();
  }

  private newPuzzle(): void {
    const rng = this.ctx.rng;
    const d = this.ctx.difficulty;
    const kind = rng.int(0, d >= 2 ? 2 : d);
    const p = this.ctx.palette;
    this.color = rng.pick([p.a, p.b, p.c, p.d]);
    if (kind === 0) {
      // Different shape (pairs chosen to be clearly distinct).
      const [base, odd] = rng.pick<[ShapeKind, ShapeKind]>([['circle', 'square'], ['square', 'triangle'], ['star', 'circle'], ['triangle', 'diamond'], ['hexagon', 'star']]);
      this.puzzle = { base, odd, baseRot: 0, oddRot: 0, oddScale: 1 };
    } else if (kind === 1) {
      // Same triangle pointing another way.
      const turn = rng.pick([Math.PI, Math.PI / 2, -Math.PI / 2]);
      this.puzzle = { base: 'triangle', odd: 'triangle', baseRot: 0, oddRot: turn, oddScale: 1 };
    } else {
      // Size difference (subtler on EXTREME).
      const base = rng.pick<ShapeKind>(['circle', 'square', 'star', 'hexagon']);
      this.puzzle = { base, odd: base, baseRot: 0, oddRot: 0, oddScale: d >= 3 ? 0.72 : 0.62 };
    }
    this.oddIndex = rng.int(0, this.grid * this.grid - 1);
    const area = Math.min(this.width - 80, this.height - 140);
    this.cell = area / this.grid;
    this.origin = { x: (this.width - area) / 2, y: (this.height - area) / 2 + 30 };
  }

  protected onUpdate(dt: number): void {
    this.flashTime = Math.max(0, this.flashTime - dt);
  }

  private cellCenter(i: number) {
    const col = i % this.grid;
    const row = Math.floor(i / this.grid);
    return { x: this.origin.x + (col + 0.5) * this.cell, y: this.origin.y + (row + 0.5) * this.cell };
  }

  protected onInput(action: InputAction): void {
    if (action.type !== 'pointerDown') return;
    const col = Math.floor((action.x - this.origin.x) / this.cell);
    const row = Math.floor((action.y - this.origin.y) / this.cell);
    if (col < 0 || row < 0 || col >= this.grid || row >= this.grid) return;
    const idx = row * this.grid + col;
    const c = this.cellCenter(idx);
    if (idx === this.oddIndex) {
      this.found++;
      this.ctx.fx.burst(c.x, c.y, this.ctx.palette.good, 18);
      this.ctx.fx.sfx('hit');
      if (this.found >= this.goal) this.finish('success');
      else this.newPuzzle();
    } else {
      this.wrong++;
      this.flashWrong = idx;
      this.flashTime = 0.3;
      this.ctx.fx.shake(8);
      this.ctx.fx.sfx('bad');
    }
  }

  protected computeScore(): ScoreResult {
    return buildScore({
      raw: this.found,
      completion: this.found / this.goal,
      accuracy: this.found / Math.max(1, this.found + this.wrong),
      completionWeight: 0.75,
      summaryKey: 'summary.found',
      summaryParams: { found: this.found, goal: this.goal },
      failReasonKey: this.wrong > this.found ? 'fail.wrong_pick' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    const r = this.cell * 0.3;
    for (let i = 0; i < this.grid * this.grid; i++) {
      const c = this.cellCenter(i);
      const odd = i === this.oddIndex;
      const kind = odd ? this.puzzle.odd : this.puzzle.base;
      const rot = odd ? this.puzzle.oddRot : this.puzzle.baseRot;
      const scale = odd ? this.puzzle.oddScale : 1;
      shape(g, kind, c.x, c.y, r * scale, this.color, '#fff', rot, 4);
      if (i === this.flashWrong && this.flashTime > 0) ring(g, c.x, c.y, r * 1.5, p.bad, 8);
    }
    text(g, `${this.found}/${this.goal}`, 40, 46, 40, p.text, 'left', 800);
  }
}

export const oddOneOutDef: MiniGameDefinition = {
  id: 'odd_one_out',
  nameKey: 'game.odd_one_out.name',
  instructionKey: 'game.odd_one_out.instruction',
  descriptionKey: 'game.odd_one_out.desc',
  category: 'logic',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: [],
  inputs: ['pointer'],
  icon: '🧩',
  create: () => new OddOneOut(),
};
