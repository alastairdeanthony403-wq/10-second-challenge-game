import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, clamp01, type ScoreResult } from '../Scoring';
import { circle, emoji, text } from '../../render/Draw';

const ATTEMPTS = 3;
const FEEDBACK_TIME = 0.5;
const SLOWEST_MS = 650;

type Phase = 'wait' | 'decoy' | 'go' | 'feedback';

/** REFLEX — wait for GO, then tap instantly. Tapping early is a foul. */
export class LightningTap extends MiniGameBase {
  private phase: Phase = 'wait';
  private phaseTime = 0;
  private waitFor = 1.5;
  private decoyAt = -1;
  private results: number[] = [];
  private reactions: number[] = [];
  private fouls = 0;
  private perfectMs = 250;
  private lastLabel = '';
  private lastGood = true;

  protected onPrepare(): void {
    this.perfectMs = tune(this.ctx.difficulty, [280, 250, 225, 210]);
    this.armWait();
  }

  private armWait(): void {
    const rng = this.ctx.rng;
    this.phase = 'wait';
    this.phaseTime = 0;
    this.waitFor = rng.range(0.8, tune(this.ctx.difficulty, [1.5, 1.7, 1.9, 2.0]));
    this.decoyAt = this.ctx.difficulty >= 2 && rng.chance(0.5) ? rng.range(0.3, this.waitFor - 0.3) : -1;
  }

  protected onUpdate(dt: number): void {
    this.phaseTime += dt;
    if (this.phase === 'wait') {
      if (this.decoyAt > 0 && this.phaseTime >= this.decoyAt && this.phaseTime < this.decoyAt + 0.35) {
        this.phase = 'decoy';
      } else if (this.phaseTime >= this.waitFor) {
        this.phase = 'go';
        this.phaseTime = 0;
        this.ctx.fx.sfx('whoosh');
      }
    } else if (this.phase === 'decoy') {
      if (this.phaseTime >= this.decoyAt + 0.35) this.phase = 'wait';
    } else if (this.phase === 'go') {
      if (this.phaseTime * 1000 >= SLOWEST_MS * 1.6) this.record(0, this.ctx.t('fx.too_slow'), false);
    } else if (this.phase === 'feedback' && this.phaseTime >= FEEDBACK_TIME) {
      if (this.results.length >= ATTEMPTS) this.finish(this.results.some((r) => r > 0) ? 'success' : 'fail');
      else this.armWait();
    }
  }

  private record(score: number, label: string, good: boolean): void {
    this.results.push(score);
    this.lastLabel = label;
    this.lastGood = good;
    this.phase = 'feedback';
    this.phaseTime = 0;
  }

  protected onInput(action: InputAction): void {
    if (action.type !== 'pointerDown' && action.type !== 'primary') return;
    const p = this.ctx.palette;
    if (this.phase === 'wait' || this.phase === 'decoy') {
      this.fouls++;
      this.ctx.fx.sfx('bad');
      this.ctx.fx.shake(10);
      this.record(0, this.ctx.t('fx.too_early'), false);
    } else if (this.phase === 'go') {
      const ms = Math.round(this.phaseTime * 1000 / this.ctx.speed);
      this.reactions.push(ms);
      const s = ms <= this.perfectMs ? 1 : clamp01(1 - (ms - this.perfectMs) / (SLOWEST_MS - this.perfectMs)) * 0.9 + 0.1;
      this.ctx.fx.sfx('hit');
      this.ctx.fx.burst(this.width / 2, this.height / 2, p.good, 24);
      this.record(s, `${ms} ms`, true);
    }
  }

  protected computeScore(): ScoreResult {
    const total = this.results.reduce((a, b) => a + b, 0);
    const best = this.reactions.length ? Math.min(...this.reactions) : 0;
    return buildScore({
      raw: best,
      completion: total / ATTEMPTS,
      accuracy: total / ATTEMPTS,
      summaryKey: best ? 'summary.reaction' : 'summary.none',
      summaryParams: { ms: best },
      failReasonKey: this.fouls > 0 ? 'fail.too_early' : 'fail.too_slow',
      reactionMs: best || undefined,
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const r = Math.min(this.width, this.height) * 0.3;
    if (this.phase === 'go') {
      circle(g, cx, cy, r * (1 + Math.min(0.08, this.phaseTime)), p.good, '#fff', 10);
      emoji(g, '⚡', cx, cy - r * 0.15, r * 0.7);
      text(g, this.ctx.t('ui.tap_now'), cx, cy + r * 0.55, r * 0.3, '#fff', 'center', 900);
    } else if (this.phase === 'decoy') {
      circle(g, cx, cy, r, p.warn, '#fff', 10);
      emoji(g, '🤔', cx, cy - r * 0.15, r * 0.6);
      text(g, this.ctx.t('ui.not_yet'), cx, cy + r * 0.55, r * 0.25, '#000', 'center', 900);
    } else if (this.phase === 'feedback') {
      circle(g, cx, cy, r, this.lastGood ? p.bgAlt : p.bad, '#fff', 6);
      text(g, this.lastLabel, cx, cy, r * 0.32, '#fff', 'center', 900);
    } else {
      circle(g, cx, cy, r, p.bad, 'rgba(255,255,255,0.5)', 6);
      emoji(g, '✋', cx, cy - r * 0.15, r * 0.6);
      text(g, this.ctx.t('ui.wait'), cx, cy + r * 0.55, r * 0.28, '#fff', 'center', 900);
    }
    for (let i = 0; i < ATTEMPTS; i++) {
      const res = this.results[i];
      circle(g, cx + (i - 1) * 70, this.height - 70, 22, res === undefined ? 'rgba(255,255,255,0.15)' : res > 0 ? p.good : p.bad);
    }
  }
}

export const lightningTapDef: MiniGameDefinition = {
  id: 'lightning_tap',
  nameKey: 'game.lightning_tap.name',
  instructionKey: 'game.lightning_tap.instruction',
  descriptionKey: 'game.lightning_tap.desc',
  category: 'reflex',
  timeLimit: 10,
  weight: 0.9,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: [],
  inputs: ['primary', 'pointer'],
  icon: '⚡',
  create: () => new LightningTap(),
};
