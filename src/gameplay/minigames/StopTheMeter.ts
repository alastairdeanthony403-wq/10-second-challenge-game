import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, clamp01, type ScoreResult } from '../Scoring';
import { circle, roundRect, text } from '../../render/Draw';

const ATTEMPTS = 3;
const PAUSE_AFTER_STOP = 0.5;

/** TIMING — stop the swinging needle inside the target zone. Three meters. */
export class StopTheMeter extends MiniGameBase {
  private pos = 0;
  private phaseAngle = 0;
  private cyclesPerSec = 0.9;
  private zoneCenter = 0.5;
  private zoneHalf = 0.08;
  private eased = false;
  private stopped = false;
  private stopTimer = 0;
  private results: number[] = [];

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.cyclesPerSec = tune(d, [0.75, 0.95, 1.2, 1.5]);
    this.zoneHalf = tune(d, [0.09, 0.07, 0.055, 0.045]) * this.ctx.sizeScale;
    this.eased = d >= 2;
    this.newMeter();
  }

  private newMeter(): void {
    this.zoneCenter = this.ctx.rng.range(0.2, 0.8);
    this.phaseAngle = this.ctx.rng.range(0, Math.PI * 2);
    this.stopped = false;
    this.stopTimer = 0;
  }

  protected onUpdate(dt: number): void {
    if (this.stopped) {
      this.stopTimer += dt;
      if (this.stopTimer >= PAUSE_AFTER_STOP) {
        if (this.results.length >= ATTEMPTS) this.finish('success');
        else this.newMeter();
      }
      return;
    }
    this.phaseAngle += dt * this.cyclesPerSec * Math.PI * 2;
    if (this.eased) {
      // Sinusoidal swing: fast in the middle, slow at the ends.
      this.pos = 0.5 - 0.5 * Math.cos(this.phaseAngle);
    } else {
      // Linear ping-pong.
      const t = (this.phaseAngle / (Math.PI * 2)) % 1;
      this.pos = t < 0.5 ? t * 2 : 2 - t * 2;
    }
  }

  protected onInput(action: InputAction): void {
    if (this.stopped) return;
    if (action.type !== 'primary' && action.type !== 'pointerDown') return;
    this.stopped = true;
    const d = Math.abs(this.pos - this.zoneCenter);
    const s = clamp01(1 - Math.max(0, d - this.zoneHalf * 0.25) / (this.zoneHalf * 2));
    this.results.push(s);
    const p = this.ctx.palette;
    const { x, y } = this.needlePoint();
    const label = s >= 1 ? this.ctx.t('fx.perfect') : s >= 0.6 ? `+${Math.round(s * 100)}` : this.ctx.t('fx.miss');
    this.ctx.fx.floatText(x, y - 120, label, s >= 1 ? p.accent : s >= 0.6 ? p.good : p.bad);
    this.ctx.fx.burst(x, y, s >= 0.6 ? p.good : p.bad, s >= 1 ? 30 : 12);
    this.ctx.fx.sfx(s >= 0.6 ? 'hit' : 'miss');
    if (s < 0.6) this.ctx.fx.shake(8);
  }

  private bar() {
    const w = Math.min(this.width - 140, 1100);
    return { x: (this.width - w) / 2, y: this.height * 0.5 - 50, w, h: 100 };
  }

  private needlePoint() {
    const b = this.bar();
    return { x: b.x + this.pos * b.w, y: b.y + b.h / 2 };
  }

  protected computeScore(): ScoreResult {
    const total = this.results.reduce((a, b) => a + b, 0);
    const avg = total / ATTEMPTS;
    const inZone = this.results.filter((r) => r >= 0.6).length;
    return buildScore({
      raw: Math.round(total * 100),
      completion: avg,
      accuracy: avg,
      summaryKey: 'summary.zones',
      summaryParams: { hits: inZone, total: ATTEMPTS },
      failReasonKey: this.results.length < ATTEMPTS ? 'fail.too_slow' : 'fail.bad_timing',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    const b = this.bar();
    roundRect(g, b.x, b.y + 10, b.w, b.h, b.h / 2, 'rgba(0,0,0,0.3)');
    roundRect(g, b.x, b.y, b.w, b.h, b.h / 2, p.bgAlt, 'rgba(255,255,255,0.25)', 5);
    const zx = b.x + (this.zoneCenter - this.zoneHalf) * b.w;
    const zw = this.zoneHalf * 2 * b.w;
    roundRect(g, zx, b.y + 8, zw, b.h - 16, 12, p.good);
    const perfectW = zw * 0.25;
    roundRect(g, zx + zw / 2 - perfectW / 2, b.y + 8, perfectW, b.h - 16, 6, p.accent);
    // Hatching so the zone is not identified by colour alone.
    g.save();
    g.beginPath();
    g.rect(zx, b.y + 8, zw, b.h - 16);
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 6;
    for (let x = zx - b.h; x < zx + zw + b.h; x += 24) {
      g.beginPath();
      g.moveTo(x, b.y);
      g.lineTo(x + b.h, b.y + b.h);
      g.stroke();
    }
    g.restore();
    const { x } = this.needlePoint();
    g.fillStyle = this.stopped ? p.accent : '#fff';
    g.fillRect(x - 7, b.y - 40, 14, b.h + 80);
    circle(g, x, b.y - 46, 22, this.stopped ? p.accent : '#fff');
    for (let i = 0; i < ATTEMPTS; i++) {
      const r = this.results[i];
      const color = r === undefined ? 'rgba(255,255,255,0.15)' : r >= 1 ? p.accent : r >= 0.6 ? p.good : p.bad;
      circle(g, this.width / 2 + (i - 1) * 80, this.height * 0.5 + 150, 24, color);
    }
    text(g, this.ctx.t('ui.press_to_stop'), this.width / 2, this.height * 0.5 - 170, 46, p.textDim, 'center', 800);
  }
}

export const stopTheMeterDef: MiniGameDefinition = {
  id: 'stop_meter',
  nameKey: 'game.stop_meter.name',
  instructionKey: 'game.stop_meter.instruction',
  descriptionKey: 'game.stop_meter.desc',
  category: 'timing',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['tiny', 'speed', 'chaos'],
  inputs: ['primary', 'pointer'],
  icon: '⏱️',
  create: () => new StopTheMeter(),
};
