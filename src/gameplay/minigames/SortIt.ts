import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { easeOutCubic, roundRect, shape, text, type ShapeKind } from '../../render/Draw';

interface Bin {
  kind: ShapeKind;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  flash: number;
  flashGood: boolean;
}

interface Item {
  bin: number;
  x: number;
  y: number;
  /** Flight animation toward a bin after a keyboard/tap sort. */
  flyFrom?: { x: number; y: number };
  flyTo?: { x: number; y: number };
  flyT?: number;
}

const ITEM_RADIUS = 70;
const BIN_KINDS: ShapeKind[] = ['circle', 'square', 'triangle'];

/** DRAG & DROP — drag each shape into the matching bin (or tap a bin / use arrow keys). */
export class SortIt extends MiniGameBase {
  private bins: Bin[] = [];
  private queue: Item[] = [];
  private flying: Item[] = [];
  private dragging = false;
  private dragOffset = { x: 0, y: 0 };
  private goal = 8;
  private correct = 0;
  private wrong = 0;

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    const binCount = tune(d, [2, 2, 3, 3]);
    this.goal = tune(d, [7, 9, 10, 12]);
    const p = this.ctx.palette;
    const colors = [p.a, p.warn, p.d];
    const gap = 40;
    const bw = Math.min(360, (this.width - 120 - gap * (binCount - 1)) / binCount);
    const total = bw * binCount + gap * (binCount - 1);
    const bh = Math.min(300, this.height * 0.3);
    for (let i = 0; i < binCount; i++) {
      this.bins.push({
        kind: BIN_KINDS[i],
        color: colors[i],
        x: (this.width - total) / 2 + i * (bw + gap),
        y: this.height - bh - 40,
        w: bw,
        h: bh,
        flash: 0,
        flashGood: true,
      });
    }
    for (let i = 0; i < 3; i++) this.enqueue();
  }

  private get home() {
    return { x: this.width / 2, y: this.height * 0.3 };
  }

  private enqueue(): void {
    const prev = this.queue[this.queue.length - 1]?.bin;
    let bin = this.ctx.rng.int(0, this.bins.length - 1);
    // Avoid long runs of the same bin; they make the game trivial.
    if (bin === prev && this.ctx.rng.chance(0.5)) bin = (bin + 1) % this.bins.length;
    this.queue.push({ bin, x: this.home.x, y: this.home.y });
  }

  private get current(): Item | undefined {
    return this.queue[0];
  }

  protected onUpdate(dt: number): void {
    for (const b of this.bins) b.flash = Math.max(0, b.flash - dt * 3);
    const cur = this.current;
    if (cur && !this.dragging) {
      const k = Math.min(1, dt * 18);
      cur.x += (this.home.x - cur.x) * k;
      cur.y += (this.home.y - cur.y) * k;
    }
    for (const f of [...this.flying]) {
      f.flyT = Math.min(1, (f.flyT ?? 0) + dt * 6);
      const t = easeOutCubic(f.flyT);
      f.x = f.flyFrom!.x + (f.flyTo!.x - f.flyFrom!.x) * t;
      f.y = f.flyFrom!.y + (f.flyTo!.y - f.flyFrom!.y) * t;
      if (f.flyT >= 1) this.flying.splice(this.flying.indexOf(f), 1);
    }
  }

  private binAt(x: number, y: number): number {
    return this.bins.findIndex((b) => x >= b.x - 20 && x <= b.x + b.w + 20 && y >= b.y - 60 && y <= b.y + b.h);
  }

  private sortInto(binIndex: number, animate: boolean): void {
    const item = this.current;
    if (!item || binIndex < 0 || binIndex >= this.bins.length) return;
    this.queue.shift();
    this.enqueue();
    const bin = this.bins[binIndex];
    const good = item.bin === binIndex;
    bin.flash = 1;
    bin.flashGood = good;
    const cx = bin.x + bin.w / 2;
    const cy = bin.y + bin.h / 2;
    if (animate) {
      item.flyFrom = { x: item.x, y: item.y };
      item.flyTo = { x: cx, y: cy };
      item.flyT = 0;
      this.flying.push(item);
    }
    if (good) {
      this.correct++;
      this.ctx.fx.burst(cx, cy, bin.color, 14);
      this.ctx.fx.sfx('drop');
      if (this.correct >= this.goal) this.finish('success');
    } else {
      this.wrong++;
      this.ctx.fx.shake(10);
      this.ctx.fx.sfx('bad');
      this.ctx.fx.floatText(cx, bin.y - 30, this.ctx.t('fx.wrong'), this.ctx.palette.bad);
    }
  }

  protected onInput(action: InputAction): void {
    const item = this.current;
    if (!item) return;
    switch (action.type) {
      case 'pointerDown': {
        if (Math.hypot(action.x - item.x, action.y - item.y) <= ITEM_RADIUS * 1.5) {
          this.dragging = true;
          this.dragOffset = { x: item.x - action.x, y: item.y - action.y };
          this.ctx.fx.sfx('select');
        } else {
          const bin = this.binAt(action.x, action.y);
          if (bin >= 0) this.sortInto(bin, true);
        }
        break;
      }
      case 'pointerMove':
        if (this.dragging) {
          item.x = action.x + this.dragOffset.x;
          item.y = action.y + this.dragOffset.y;
        }
        break;
      case 'pointerUp': {
        if (!this.dragging) break;
        this.dragging = false;
        const bin = this.binAt(item.x, item.y);
        if (bin >= 0) this.sortInto(bin, false);
        else {
          item.x = this.home.x;
          item.y = this.home.y;
        }
        break;
      }
      case 'direction': {
        const map: Record<string, number> = this.bins.length === 2 ? { left: 0, right: 1 } : { left: 0, down: 1, up: 1, right: 2 };
        const bin = map[action.dir];
        if (bin !== undefined) this.sortInto(bin, true);
        break;
      }
      case 'choice':
        this.sortInto(action.index, true);
        break;
    }
  }

  protected computeScore(): ScoreResult {
    return buildScore({
      raw: this.correct,
      completion: this.correct / this.goal,
      accuracy: this.correct / Math.max(1, this.correct + this.wrong),
      completionWeight: 0.7,
      summaryKey: 'summary.sorted',
      summaryParams: { sorted: this.correct, goal: this.goal },
      failReasonKey: this.wrong > this.correct ? 'fail.wrong_bin' : 'fail.too_slow',
    });
  }

  private drawItem(g: Canvas2D, item: Item, scale = 1, alpha = 1): void {
    const bin = this.bins[item.bin];
    g.globalAlpha = alpha;
    shape(g, bin.kind, item.x, item.y, ITEM_RADIUS * scale, bin.color, '#fff', 0, 6);
    g.globalAlpha = 1;
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    this.bins.forEach((b, i) => {
      const glow = b.flash > 0 ? (b.flashGood ? p.good : p.bad) : 'rgba(255,255,255,0.3)';
      roundRect(g, b.x, b.y, b.w, b.h, 30, p.bgAlt, glow, b.flash > 0 ? 12 : 5);
      shape(g, b.kind, b.x + b.w / 2, b.y + b.h * 0.45, Math.min(b.w, b.h) * 0.2, b.color, '#fff', 0, 4);
      const keys = this.bins.length === 2 ? ['←', '→'] : ['←', '↓', '→'];
      text(g, keys[i], b.x + b.w / 2, b.y + b.h * 0.82, 40, p.textDim, 'center', 700);
    });
    // Upcoming queue (small, faded) to the right of the current item.
    this.queue.slice(1).forEach((item, i) => {
      const ghost = { ...item, x: this.home.x + 200 + i * 120, y: this.home.y };
      this.drawItem(g, ghost, 0.5, 0.45);
    });
    for (const f of this.flying) this.drawItem(g, f, 1 - (f.flyT ?? 0) * 0.5);
    const cur = this.current;
    if (cur) {
      this.drawItem(g, cur, this.dragging ? 1.1 : 1);
    }
    text(g, `${this.correct}/${this.goal}`, 40, 46, 40, p.text, 'left', 800);
  }
}

export const sortItDef: MiniGameDefinition = {
  id: 'sort_it',
  nameKey: 'game.sort_it.name',
  instructionKey: 'game.sort_it.instruction',
  descriptionKey: 'game.sort_it.desc',
  category: 'drag',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['speed'],
  inputs: ['drag', 'pointer', 'direction', 'choice'],
  icon: '📦',
  create: () => new SortIt(),
};
