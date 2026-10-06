import type { InputAction } from '../core/InputTypes';
import type { Canvas2D, CompletionState, FinishReason, MiniGame, MiniGameContext } from './MiniGame';
import { sanitizeScore, type ScoreResult } from './Scoring';
import { roundRect } from '../render/Draw';

/**
 * Shared lifecycle for every mini-game. Subclasses implement the `on*` hooks;
 * this class guarantees ordering, ignores input once finished and makes
 * complete()/cleanup() idempotent.
 */
export abstract class MiniGameBase implements MiniGame {
  private lifecycle: CompletionState = 'idle';
  private reason: FinishReason | null = null;
  private cachedScore: ScoreResult | null = null;
  protected ctx!: MiniGameContext;
  /** Gameplay seconds since start (already scaled by speed modifiers). */
  protected time = 0;

  get state(): CompletionState {
    return this.lifecycle;
  }

  get finishReason(): FinishReason | null {
    return this.reason;
  }

  get isActive(): boolean {
    return this.lifecycle === 'active';
  }

  get width(): number {
    return this.ctx.width;
  }

  get height(): number {
    return this.ctx.height;
  }

  initialize(ctx: MiniGameContext): void {
    if (this.lifecycle !== 'idle') return;
    this.ctx = ctx;
    this.lifecycle = 'initialized';
  }

  prepare(): void {
    if (this.lifecycle !== 'initialized') return;
    this.onPrepare();
    this.lifecycle = 'prepared';
  }

  start(): void {
    if (this.lifecycle !== 'prepared') return;
    this.lifecycle = 'active';
    this.onStart();
  }

  update(dt: number): void {
    if (this.lifecycle !== 'active') {
      if (this.lifecycle === 'finished') this.onFinishedUpdate(dt);
      return;
    }
    const scaled = dt * this.ctx.speed;
    this.time += scaled;
    this.onUpdate(scaled);
  }

  handleInput(action: InputAction): void {
    if (this.lifecycle !== 'active') return;
    this.onInput(action);
  }

  complete(reason: FinishReason): void {
    if (this.lifecycle !== 'active' && this.lifecycle !== 'prepared') return;
    this.lifecycle = 'finished';
    this.reason = reason;
    this.onComplete(reason);
  }

  calculateScore(): ScoreResult {
    if (!this.cachedScore || this.lifecycle !== 'finished') {
      this.cachedScore = sanitizeScore(this.computeScore());
    }
    return this.cachedScore;
  }

  render(g: Canvas2D): void {
    if (this.lifecycle === 'idle' || this.lifecycle === 'initialized' || this.lifecycle === 'cleaned') return;
    this.onRender(g);
  }

  cleanup(): void {
    if (this.lifecycle === 'cleaned') return;
    this.onCleanup();
    this.lifecycle = 'cleaned';
  }

  /** Ends the challenge early; the framework notices via `state`. */
  protected finish(reason: 'success' | 'fail'): void {
    this.complete(reason);
  }

  protected abstract onPrepare(): void;
  protected onStart(): void {}
  protected abstract onUpdate(dt: number): void;
  protected abstract onInput(action: InputAction): void;
  protected onComplete(_reason: FinishReason): void {}
  /** Keeps idle animations alive behind the results card. */
  protected onFinishedUpdate(_dt: number): void {}
  protected abstract computeScore(): ScoreResult;
  protected abstract onRender(g: Canvas2D): void;
  protected onCleanup(): void {}

  /** Size helper honouring the TINY modifier. */
  protected size(base: number): number {
    return base * this.ctx.sizeScale;
  }

  /** Large centered status label drawn in the play area (e.g. "WATCH!"). */
  protected banner(g: Canvas2D, label: string, color: string, y = this.height * 0.12): void {
    g.font = `900 64px "Baloo 2", system-ui, sans-serif`;
    const w = g.measureText(label).width + 80;
    roundRect(g, this.width / 2 - w / 2, y - 48, w, 96, 48, this.ctx.palette.shadow);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(label, this.width / 2, y + 4);
  }
}
