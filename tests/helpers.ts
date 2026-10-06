import { createInputSnapshot, type InputAction, type InputSnapshot } from '../src/core/InputTypes';
import { Random } from '../src/core/Random';
import { ChallengeTimer } from '../src/core/Timer';
import { Difficulty } from '../src/gameplay/Difficulty';
import type { EffectsApi, MiniGame, MiniGameContext, MiniGameDefinition } from '../src/gameplay/MiniGame';
import { MODIFIERS, type ModifierId } from '../src/gameplay/Modifiers';
import { THEMES } from '../src/render/Theme';

export const nullFx: EffectsApi = {
  burst: () => {},
  floatText: () => {},
  shake: () => {},
  flash: () => {},
  sfx: () => {},
};

export interface Harness {
  game: MiniGame;
  ctx: MiniGameContext;
  timer: ChallengeTimer;
  input: InputSnapshot;
  /** Advances game + timer; completes with 'time' on expiry like the real GameManager. */
  step(dt?: number): void;
  run(seconds: number, perFrame?: (h: Harness, frame: number) => void): void;
  send(action: InputAction): void;
}

export function createHarness(
  def: MiniGameDefinition,
  opts: { difficulty?: Difficulty; modifier?: ModifierId | null; seed?: number; width?: number; height?: number } = {},
): Harness {
  const timer = new ChallengeTimer(def.timeLimit);
  const input = createInputSnapshot();
  const mod = opts.modifier ? MODIFIERS[opts.modifier] : null;
  const ctx: MiniGameContext = {
    rng: new Random(opts.seed ?? 1234),
    difficulty: opts.difficulty ?? Difficulty.NORMAL,
    modifier: opts.modifier ?? null,
    width: opts.width ?? 1600,
    height: opts.height ?? 1000,
    speed: mod?.speedMultiplier ?? 1,
    sizeScale: mod?.sizeMultiplier ?? 1,
    input,
    fx: nullFx,
    camera: { setZoom: () => {}, pan: () => {} },
    palette: THEMES[0].palette,
    timeLeft: () => timer.remaining,
    elapsed: () => timer.elapsed,
    t: (key) => key,
  };
  const game = def.create();
  game.initialize(ctx);
  game.prepare();
  game.start();
  timer.onExpire(() => game.complete('time'));
  timer.start();
  const h: Harness = {
    game,
    ctx,
    timer,
    input,
    step(dt = 1 / 60) {
      if (game.state !== 'active') return;
      game.update(dt);
      timer.update(dt);
    },
    run(seconds, perFrame) {
      const frames = Math.ceil(seconds * 60);
      for (let i = 0; i < frames && game.state === 'active'; i++) {
        perFrame?.(h, i);
        h.step();
      }
    },
    send(action) {
      game.handleInput(action);
    },
  };
  return h;
}

/** Sends a random but plausible action — a crude fuzzer for robustness tests. */
export function randomAction(rng: Random, w: number, h: number): InputAction {
  const roll = rng.int(0, 9);
  const x = rng.range(0, w);
  const y = rng.range(0, h);
  switch (roll) {
    case 0:
    case 1:
    case 2:
      return { type: 'pointerDown', x, y, id: 1 };
    case 3:
      return { type: 'pointerMove', x, y, id: 1, pressed: rng.chance(0.5) };
    case 4:
      return { type: 'pointerUp', x, y, id: 1 };
    case 5:
      return { type: 'primary' };
    case 6:
      return { type: 'text', char: String.fromCharCode(65 + rng.int(0, 25)) };
    case 7:
      return { type: 'choice', index: rng.int(0, 5) };
    case 8:
      return { type: 'direction', dir: rng.pick(['left', 'right', 'up', 'down'] as const) };
    default:
      return { type: 'secondary' };
  }
}
