import type { InputAction } from '../core/InputTypes';
import type { Canvas2D } from './MiniGame';
import { roundRect, text } from '../render/Draw';

export interface ChoiceButton {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Visual feedback timer for press "pop". */
  pulse: number;
  state: 'idle' | 'correct' | 'wrong';
}

/**
 * A responsive row/grid of answer buttons in world space. Handles pointer hit
 * testing and keyboard/gamepad choice (1–9) so every choice game gets
 * consistent input for free.
 */
export class ChoiceButtons {
  buttons: ChoiceButton[] = [];

  layout(count: number, area: { x: number; y: number; w: number; h: number }, maxCols = 4, gap = 24): void {
    const cols = Math.min(count, maxCols);
    const rows = Math.ceil(count / cols);
    const bw = (area.w - gap * (cols - 1)) / cols;
    const bh = Math.min((area.h - gap * (rows - 1)) / rows, bw * 1.1);
    const totalH = rows * bh + (rows - 1) * gap;
    const startY = area.y + (area.h - totalH) / 2;
    this.buttons = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, count - row * cols);
      const rowW = inRow * bw + (inRow - 1) * gap;
      const col = i - row * cols;
      this.buttons.push({
        x: area.x + (area.w - rowW) / 2 + col * (bw + gap),
        y: startY + row * (bh + gap),
        w: bw,
        h: bh,
        pulse: 0,
        state: 'idle',
      });
    }
  }

  /** Returns the chosen index for this action, or -1. */
  pick(action: InputAction): number {
    if (action.type === 'choice') return action.index < this.buttons.length ? action.index : -1;
    if (action.type === 'pointerDown') {
      return this.buttons.findIndex((b) => action.x >= b.x && action.x <= b.x + b.w && action.y >= b.y && action.y <= b.y + b.h);
    }
    return -1;
  }

  press(index: number, state: ChoiceButton['state'] = 'idle'): void {
    const b = this.buttons[index];
    if (!b) return;
    b.pulse = 1;
    b.state = state;
  }

  resetStates(): void {
    for (const b of this.buttons) b.state = 'idle';
  }

  update(dt: number): void {
    for (const b of this.buttons) b.pulse = Math.max(0, b.pulse - dt * 5);
  }

  center(index: number): { x: number; y: number } {
    const b = this.buttons[index];
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
  }

  render(
    g: Canvas2D,
    colors: { fill: string; stroke: string; good: string; bad: string; text: string },
    drawContent: (index: number, cx: number, cy: number, size: number) => void,
    showKeys = true,
  ): void {
    this.buttons.forEach((b, i) => {
      const s = 1 - b.pulse * 0.08;
      const w = b.w * s;
      const h = b.h * s;
      const x = b.x + (b.w - w) / 2;
      const y = b.y + (b.h - h) / 2;
      const stroke = b.state === 'correct' ? colors.good : b.state === 'wrong' ? colors.bad : colors.stroke;
      roundRect(g, x, y + 8, w, h, 28, 'rgba(0,0,0,0.3)');
      roundRect(g, x, y, w, h, 28, colors.fill, stroke, b.state === 'idle' ? 5 : 10);
      drawContent(i, x + w / 2, y + h / 2, Math.min(w, h));
      if (showKeys && this.buttons.length <= 9) text(g, String(i + 1), x + 26, y + 30, 26, colors.text, 'center', 700);
    });
  }
}
