import type { Canvas2D } from '../gameplay/MiniGame';
import { Effects } from './Effects';

/** Shortest side of the world in landscape; portrait uses a narrower world so phones get bigger targets. */
export const WORLD_MIN = 1000;
export const WORLD_MIN_PORTRAIT = 800;
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2.1;
const MAX_DPR = 2;

export interface WorldSize {
  width: number;
  height: number;
}

/** Computes world dimensions for a viewport, clamping extreme aspect ratios. */
export function worldSizeFor(cssWidth: number, cssHeight: number): WorldSize {
  const aspect = Math.max(MIN_ASPECT, Math.min(MAX_ASPECT, cssWidth / Math.max(1, cssHeight)));
  return aspect >= 1
    ? { width: Math.round(WORLD_MIN * aspect), height: WORLD_MIN }
    : { width: WORLD_MIN_PORTRAIT, height: Math.round(WORLD_MIN_PORTRAIT / aspect) };
}

/**
 * Canvas renderer with a world→screen transform, letterboxing, a reusable
 * camera (zoom / pan / shake) and the shared effects layer.
 */
export class Renderer {
  readonly g: Canvas2D;
  readonly effects = new Effects();
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private world: WorldSize = { width: WORLD_MIN, height: WORLD_MIN };
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private shakeAmount = 0;
  private flashColor = '#fff';
  private flashAlpha = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  /** Disables shake entirely (accessibility). */
  reducedShake = false;
  background = '#12082b';
  gridColor = 'rgba(255,255,255,0.05)';

  constructor(readonly canvas: HTMLCanvasElement) {
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('Canvas 2D not supported');
    this.g = g;
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.cssW = Math.max(1, cssWidth);
    this.cssH = Math.max(1, cssHeight);
    this.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.updateTransform();
  }

  /** World size that best fits the current viewport (captured when a challenge is prepared). */
  suggestWorld(): WorldSize {
    return worldSizeFor(this.cssW, this.cssH);
  }

  setWorld(world: WorldSize): void {
    this.world = world;
    this.updateTransform();
  }

  get worldSize(): WorldSize {
    return this.world;
  }

  private updateTransform(): void {
    this.scale = Math.min(this.cssW / this.world.width, this.cssH / this.world.height);
    this.offsetX = (this.cssW - this.world.width * this.scale) / 2;
    this.offsetY = (this.cssH - this.world.height * this.scale) / 2;
  }

  /** Converts a client (CSS pixel) position relative to the canvas into world units. */
  toWorld(cssX: number, cssY: number): { x: number; y: number } {
    const zx = (cssX - this.offsetX) / this.scale;
    const zy = (cssY - this.offsetY) / this.scale;
    // Undo camera zoom/pan around the world centre.
    const cx = this.world.width / 2;
    const cy = this.world.height / 2;
    return { x: (zx - cx) / this.zoom + cx - this.panX, y: (zy - cy) / this.zoom + cy - this.panY };
  }

  shake(intensity: number): void {
    if (this.reducedShake) return;
    this.shakeAmount = Math.min(40, Math.max(this.shakeAmount, intensity));
  }

  flash(color: string, strength = 0.4): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, Math.min(0.6, strength));
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.5, Math.min(2, zoom));
  }

  pan(x: number, y: number): void {
    this.panX = x;
    this.panY = y;
  }

  /** Restores the default camera; called after every challenge. */
  resetCamera(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.shakeAmount = 0;
  }

  update(dt: number): void {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 90);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);
    this.effects.update(dt);
  }

  /** Draws one frame: background, the world callback (with camera), effects and flash. */
  render(drawWorld: ((g: Canvas2D) => void) | null, dimWorld = 0): void {
    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = this.background;
    g.fillRect(0, 0, this.cssW, this.cssH);

    const sx = this.shakeAmount > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    const sy = this.shakeAmount > 0 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    g.translate(this.offsetX + sx, this.offsetY + sy);
    g.scale(this.scale, this.scale);
    const cx = this.world.width / 2;
    const cy = this.world.height / 2;
    g.translate(cx, cy);
    g.scale(this.zoom, this.zoom);
    g.translate(-cx + this.panX, -cy + this.panY);

    this.drawGrid(g);
    if (drawWorld) {
      g.save();
      try {
        drawWorld(g);
      } catch (err) {
        console.error('[Renderer] mini-game render failed', err);
      }
      g.restore();
    }
    if (dimWorld > 0) {
      g.fillStyle = `rgba(0,0,0,${dimWorld})`;
      g.fillRect(-2000, -2000, this.world.width + 4000, this.world.height + 4000);
    }
    this.effects.render(g);

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.flashAlpha > 0.01) {
      g.globalAlpha = this.flashAlpha;
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, this.cssW, this.cssH);
      g.globalAlpha = 1;
    }
  }

  private drawGrid(g: Canvas2D): void {
    const step = 100;
    g.strokeStyle = this.gridColor;
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= this.world.width; x += step) {
      g.moveTo(x, 0);
      g.lineTo(x, this.world.height);
    }
    for (let y = 0; y <= this.world.height; y += step) {
      g.moveTo(0, y);
      g.lineTo(this.world.width, y);
    }
    g.stroke();
  }
}
