import type { InputAction, InputCapability, InputSnapshot } from '../core/InputTypes';
import type { Random } from '../core/Random';
import type { Difficulty } from './Difficulty';
import type { ModifierId } from './Modifiers';
import type { ScoreResult } from './Scoring';
import type { Palette } from '../render/Theme';

export type Category = 'reflex' | 'accuracy' | 'memory' | 'speed' | 'timing' | 'movement' | 'drag' | 'logic' | 'chaos';

export const CATEGORIES: readonly Category[] = ['reflex', 'accuracy', 'memory', 'speed', 'timing', 'movement', 'drag', 'logic', 'chaos'];

export type CompletionState = 'idle' | 'initialized' | 'prepared' | 'active' | 'finished' | 'cleaned';

export type FinishReason = 'time' | 'success' | 'fail' | 'aborted';

export type UnlockRequirement =
  | { type: 'none' }
  | { type: 'runs'; count: number }
  | { type: 'bestScore'; points: number }
  | { type: 'achievement'; id: string };

/** Data-driven description of a mini-game. Balancing lives here, not in core systems. */
export interface MiniGameDefinition {
  id: string;
  nameKey: string;
  instructionKey: string;
  descriptionKey: string;
  category: Category;
  /** Seconds; capped at 10 by the framework. */
  timeLimit: number;
  /** Relative selection weight. */
  weight: number;
  /** Multiplier for points (balancing knob, default 1). */
  scoreMultiplier: number;
  unlock: UnlockRequirement;
  /** Non-generic modifiers this game knows how to honour. */
  modifiers: readonly ModifierId[];
  inputs: readonly InputCapability[];
  /** Short emoji/icon for menus and intros. */
  icon: string;
  create: () => MiniGame;
}

/** Feedback hooks a mini-game can fire. Decoupled so games stay headless & testable. */
export interface EffectsApi {
  burst(x: number, y: number, color: string, count?: number): void;
  floatText(x: number, y: number, text: string, color?: string): void;
  shake(intensity: number): void;
  flash(color: string, strength?: number): void;
  sfx(name: SfxName): void;
}

export type SfxName = 'tap' | 'hit' | 'miss' | 'bad' | 'pop' | 'whoosh' | 'select' | 'tick' | 'bounce' | 'splat' | 'type' | 'drop' | 'collect';

export interface CameraApi {
  setZoom(zoom: number): void;
  pan(x: number, y: number): void;
}

export interface MiniGameContext {
  rng: Random;
  difficulty: Difficulty;
  modifier: ModifierId | null;
  /** World size in units (shorter side is 1000 in landscape, width 800 in portrait). */
  width: number;
  height: number;
  speed: number;
  sizeScale: number;
  input: Readonly<InputSnapshot>;
  fx: EffectsApi;
  camera: CameraApi;
  palette: Palette;
  /** Seconds left on the shared challenge timer. */
  timeLeft(): number;
  /** Seconds since the challenge started. */
  elapsed(): number;
  /** Localization lookup for in-canvas text. */
  t(key: string, params?: Record<string, string | number>): string;
}

/** Drawing surface passed to render(). World units; the renderer handles scaling. */
export type Canvas2D = CanvasRenderingContext2D;

export interface MiniGame {
  readonly state: CompletionState;
  readonly finishReason: FinishReason | null;
  initialize(ctx: MiniGameContext): void;
  prepare(): void;
  start(): void;
  update(dt: number): void;
  handleInput(action: InputAction): void;
  complete(reason: FinishReason): void;
  calculateScore(): ScoreResult;
  render(g: Canvas2D): void;
  cleanup(): void;
}
