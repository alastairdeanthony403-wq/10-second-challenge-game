import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { roundRect, text } from '../../render/Draw';

interface Block {
  x: number;
  w: number;
  color: string;
}

const BLOCK_H = 70;
const PERFECT_TOLERANCE = 10;

/** TIMING — drop the sliding block onto the tower. Overhangs are sliced off. */
export class StackPerfectly extends MiniGameBase {
  private stack: Block[] = [];
  private moverX = 0;
  private moverW = 0;
  private dir = 1;
  private speed = 600;
  private goal = 7;
  private overlapSum = 0;
  private perfects = 0;
  private fallen: { x: number; y: number; w: number; vy: number; color: string }[] = [];
  private scroll = 0;
  private colors: string[] = [];

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.speed = tune(d, [520, 650, 780, 900]);
    this.goal = tune(d, [5, 6, 7, 8]);
    const p = this.ctx.palette;
    this.colors = [p.a, p.b, p.c, p.d, p.warn];
    const baseW = this.size(Math.min(460, this.width * 0.5));
    this.stack.push({ x: (this.width - baseW) / 2, w: baseW, color: p.textDim });
    this.spawnMover();
  }

  private spawnMover(): void {
    const top = this.stack[this.stack.length - 1];
    this.moverW = top.w;
    this.dir = this.stack.length % 2 === 0 ? -1 : 1;
    this.moverX = top.x - this.dir * this.ctx.rng.range(280, 420);
  }

  private rowY(index: number): number {
    return this.height - 80 - (index + 1) * BLOCK_H + this.scroll;
  }

  protected onUpdate(dt: number): void {
    this.moverX += this.dir * this.speed * dt;
    if (this.moverX + this.moverW > this.width + this.moverW * 0.4) this.dir = -1;
    if (this.moverX < -this.moverW * 0.4) this.dir = 1;
    const targetScroll = Math.max(0, (this.stack.length - 5) * BLOCK_H);
    this.scroll += (targetScroll - this.scroll) * Math.min(1, dt * 6);
    for (const f of this.fallen) {
      f.vy += 2600 * dt;
      f.y += f.vy * dt;
    }
    this.fallen = this.fallen.filter((f) => f.y < this.height + 200);
  }

  protected onInput(action: InputAction): void {
    if (action.type !== 'primary' && action.type !== 'pointerDown') return;
    const top = this.stack[this.stack.length - 1];
    const color = this.colors[this.stack.length % this.colors.length];
    const y = this.rowY(this.stack.length);
    let left = Math.max(this.moverX, top.x);
    let right = Math.min(this.moverX + this.moverW, top.x + top.w);
    const p = this.ctx.palette;
    if (Math.abs(this.moverX - top.x) <= PERFECT_TOLERANCE) {
      left = top.x;
      right = top.x + top.w;
      this.perfects++;
      this.ctx.fx.floatText(this.width / 2, y - 40, this.ctx.t('fx.perfect'), p.accent);
      this.ctx.fx.burst(this.width / 2, y + BLOCK_H / 2, p.accent, 20);
      this.ctx.fx.sfx('hit');
    } else {
      this.ctx.fx.sfx('drop');
    }
    const overlap = right - left;
    if (overlap <= 0) {
      this.fallen.push({ x: this.moverX, y, w: this.moverW, vy: 0, color });
      this.ctx.fx.shake(16);
      this.ctx.fx.sfx('bad');
      this.finish('fail');
      return;
    }
    // Slice the overhang off and let it fall.
    if (this.moverX < left) this.fallen.push({ x: this.moverX, y, w: left - this.moverX, vy: 0, color });
    if (this.moverX + this.moverW > right) this.fallen.push({ x: right, y, w: this.moverX + this.moverW - right, vy: 0, color });
    this.overlapSum += overlap / this.moverW;
    this.stack.push({ x: left, w: overlap, color });
    if (this.placed >= this.goal) {
      this.finish('success');
      return;
    }
    this.spawnMover();
  }

  private get placed(): number {
    return this.stack.length - 1;
  }

  protected computeScore(): ScoreResult {
    const placed = this.placed;
    return buildScore({
      raw: placed,
      completion: placed / this.goal,
      accuracy: placed === 0 ? 0 : this.overlapSum / placed,
      completionWeight: 0.6,
      summaryKey: 'summary.stacked',
      summaryParams: { placed, goal: this.goal, perfects: this.perfects },
      failReasonKey: this.finishReason === 'fail' ? 'fail.missed_stack' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, this.height - 80 + this.scroll, this.width, 80);
    this.stack.forEach((b, i) => roundRect(g, b.x, this.rowY(i), b.w, BLOCK_H - 4, 10, b.color, 'rgba(255,255,255,0.4)', 3));
    for (const f of this.fallen) roundRect(g, f.x, f.y, f.w, BLOCK_H - 4, 10, f.color);
    if (this.isActive) {
      const color = this.colors[this.stack.length % this.colors.length];
      const y = this.rowY(this.stack.length);
      roundRect(g, this.moverX, y, this.moverW, BLOCK_H - 4, 10, color, '#fff', 4);
      // Guide line showing where the tower edge is.
      const top = this.stack[this.stack.length - 1];
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.setLineDash([10, 10]);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(top.x, y - 10);
      g.lineTo(top.x, y + BLOCK_H);
      g.moveTo(top.x + top.w, y - 10);
      g.lineTo(top.x + top.w, y + BLOCK_H);
      g.stroke();
      g.setLineDash([]);
    }
    text(g, `${this.placed}/${this.goal}`, 40, 46, 40, p.text, 'left', 800);
  }
}

export const stackPerfectlyDef: MiniGameDefinition = {
  id: 'stack_perfectly',
  nameKey: 'game.stack_perfectly.name',
  instructionKey: 'game.stack_perfectly.instruction',
  descriptionKey: 'game.stack_perfectly.desc',
  category: 'timing',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'runs', count: 2 },
  modifiers: ['tiny', 'speed'],
  inputs: ['primary', 'pointer'],
  icon: '🧱',
  create: () => new StackPerfectly(),
};
