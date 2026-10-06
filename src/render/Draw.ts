import type { Canvas2D } from '../gameplay/MiniGame';

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon' | 'cross' | 'heart';

export const SHAPES: readonly ShapeKind[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon'];

export function circle(g: Canvas2D, x: number, y: number, r: number, fill: string, stroke?: string, lineWidth = 6): void {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lineWidth;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

export function roundRect(g: Canvas2D, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, lineWidth = 6): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = lineWidth;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function polygon(g: Canvas2D, x: number, y: number, r: number, sides: number, rotation: number): void {
  g.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

export function shapePath(g: Canvas2D, kind: ShapeKind, x: number, y: number, r: number, rotation = 0): void {
  switch (kind) {
    case 'circle':
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      break;
    case 'square':
      polygon(g, x, y, r * 1.18, 4, Math.PI / 4 + rotation);
      break;
    case 'triangle':
      polygon(g, x, y + r * 0.15, r * 1.25, 3, -Math.PI / 2 + rotation);
      break;
    case 'diamond':
      polygon(g, x, y, r * 1.2, 4, rotation);
      break;
    case 'hexagon':
      polygon(g, x, y, r * 1.08, 6, rotation);
      break;
    case 'star': {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + rotation + (i / 10) * Math.PI * 2;
        const rad = i % 2 === 0 ? r * 1.25 : r * 0.55;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      break;
    }
    case 'cross': {
      const t = r * 0.38;
      g.beginPath();
      g.rect(x - r, y - t, r * 2, t * 2);
      g.rect(x - t, y - r, t * 2, r * 2);
      break;
    }
    case 'heart': {
      g.beginPath();
      g.moveTo(x, y + r * 0.9);
      g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.45);
      g.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
      g.closePath();
      break;
    }
  }
}

export function shape(g: Canvas2D, kind: ShapeKind, x: number, y: number, r: number, fill: string, stroke?: string, rotation = 0, lineWidth = 6): void {
  shapePath(g, kind, x, y, r, rotation);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lineWidth;
    g.strokeStyle = stroke;
    g.lineJoin = 'round';
    g.stroke();
  }
}

export function text(
  g: Canvas2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = 'center',
  weight = 800,
  baseline: CanvasTextBaseline = 'middle',
): void {
  g.font = `${weight} ${size}px "Baloo 2", "Segoe UI", system-ui, sans-serif`;
  g.textAlign = align;
  g.textBaseline = baseline;
  g.fillStyle = color;
  g.fillText(value, x, y);
}

export function emoji(g: Canvas2D, value: string, x: number, y: number, size: number): void {
  g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(value, x, y + size * 0.05);
}

/** Symbol overlays so state never relies on color alone. */
export function checkMark(g: Canvas2D, x: number, y: number, r: number, color: string): void {
  g.beginPath();
  g.moveTo(x - r * 0.5, y);
  g.lineTo(x - r * 0.1, y + r * 0.4);
  g.lineTo(x + r * 0.55, y - r * 0.4);
  g.lineWidth = Math.max(4, r * 0.22);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.stroke();
}

export function crossMark(g: Canvas2D, x: number, y: number, r: number, color: string): void {
  g.beginPath();
  g.moveTo(x - r * 0.45, y - r * 0.45);
  g.lineTo(x + r * 0.45, y + r * 0.45);
  g.moveTo(x + r * 0.45, y - r * 0.45);
  g.lineTo(x - r * 0.45, y + r * 0.45);
  g.lineWidth = Math.max(4, r * 0.22);
  g.lineCap = 'round';
  g.strokeStyle = color;
  g.stroke();
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function ring(g: Canvas2D, x: number, y: number, r: number, color: string, lineWidth = 4): void {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  g.lineWidth = lineWidth;
  g.strokeStyle = color;
  g.stroke();
}
