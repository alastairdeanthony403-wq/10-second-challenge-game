# Adding a mini-game

Adding a game takes five steps, and none of them touch the core loop, state machine, UI or scoring code.

1. **Create the class** in `src/gameplay/minigames/MyGame.ts`, extending `MiniGameBase`.
2. **Create the definition** (data) in the same file.
3. **Add strings** to `src/i18n/en.ts`: `game.<id>.name`, `game.<id>.instruction` (short and in capitals,
   readable in about a second) and `game.<id>.desc`, plus any summary or fail keys you use.
4. **Register it** by adding the definition to `ALL_MINIGAMES` in `src/gameplay/minigames/index.ts`.
5. **Test it.** `npm test` automatically runs the new game through lifecycle, timeout, fuzzing,
   portrait-layout, determinism and idle-player checks. Add a perfect-play bot to `BOTS` in
   `tests/perfect.test.ts`; the suite fails until every game has one, which proves 100 is reachable.

You can try it immediately with `npm run dev`: open the 🛠 debug menu and choose your game under
**Force mini-game**.

## Complete example: "Pop the Bubbles"

```ts
import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { circle, dist, text } from '../../render/Draw';

interface Bubble { x: number; y: number; r: number; vy: number }

export class PopTheBubbles extends MiniGameBase {
  private bubbles: Bubble[] = [];
  private popped = 0;
  private misses = 0;
  private goal = 10;

  // Build the level. Use ONLY this.ctx.rng for randomness (Daily/Duel determinism).
  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.goal = tune(d, [8, 10, 12, 14]);
    const speed = tune(d, [120, 180, 240, 300]);
    for (let i = 0; i < this.goal + 4; i++) {
      this.bubbles.push({
        x: this.ctx.rng.range(80, this.width - 80),
        y: this.height + i * 160,
        r: this.size(70),               // size() honours the TINY TARGETS modifier
        vy: -speed,
      });
    }
  }

  // dt is already scaled by the SPEED modifier. Never read the clock yourself.
  protected onUpdate(dt: number): void {
    for (const b of this.bubbles) b.y += b.vy * dt;
  }

  // Abstract actions only. Mouse, touch, keyboard cursor and gamepad all arrive as pointerDown.
  protected onInput(action: InputAction): void {
    if (action.type !== 'pointerDown') return;
    const hit = this.bubbles.find((b) => dist(b.x, b.y, action.x, action.y) <= b.r);
    if (!hit) {
      this.misses++;
      this.ctx.fx.sfx('miss');
      return;
    }
    this.bubbles.splice(this.bubbles.indexOf(hit), 1);
    this.popped++;
    this.ctx.fx.burst(hit.x, hit.y, this.ctx.palette.a, 12);
    this.ctx.fx.sfx('pop');
    if (this.popped >= this.goal) this.finish('success');   // end early on success
  }

  // Report completion & accuracy in [0, 1]; buildScore normalizes to 0–100.
  protected computeScore(): ScoreResult {
    return buildScore({
      raw: this.popped,
      completion: this.popped / this.goal,
      accuracy: this.popped / Math.max(1, this.popped + this.misses),
      summaryKey: 'summary.hits',
      summaryParams: { hits: this.popped, goal: this.goal },
      failReasonKey: 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    for (const b of this.bubbles) circle(g, b.x, b.y, b.r, this.ctx.palette.a, '#fff', 6);
    text(g, `${this.popped}/${this.goal}`, 40, 46, 40, this.ctx.palette.text, 'left');
  }
}

export const popTheBubblesDef: MiniGameDefinition = {
  id: 'pop_bubbles',
  nameKey: 'game.pop_bubbles.name',
  instructionKey: 'game.pop_bubbles.instruction',
  descriptionKey: 'game.pop_bubbles.desc',
  category: 'reflex',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },              // or { type: 'runs', count: 5 } etc.
  modifiers: ['tiny', 'speed'],           // special rounds this game supports
  inputs: ['pointer'],                    // drives the virtual cursor / key mapping
  icon: '🫧',
  create: () => new PopTheBubbles(),
};
```

## Rules of thumb

- **Instantly understandable.** The instruction should be 2–5 words. If it needs a paragraph, reject the idea.
- **Fits in 10 seconds.** Tune goals so a strong player can finish (and get PERFECT) in roughly 6–9 seconds.
- **Clear success and failure.** Call `this.finish('success' | 'fail')` to end early. Otherwise the shared
  timer ends the challenge. Always give a `failReasonKey` that explains what went wrong.
- **Feedback for every action.** Use `this.ctx.fx` (burst, floatText, shake, flash, sfx).
- **Never rely on colour alone.** Pair colour with a shape, symbol, pattern or label.
- **Difficulty should change the challenge, not just the speed.** Add decoys, motion, more options,
  closer values, wind, and so on.
- **Clean up.** Release pooled objects in `onCleanup()`. Don't add global listeners; you don't need any.
- **Keep text big.** Use 40+ world units for in-canvas text. Remember the portrait world is 800 units wide.
- **Spawn many objects with `Pool`** (`core/Pool.ts`) instead of allocating each frame.
- **Camera tweaks are fine.** `this.ctx.camera.setZoom()` and `pan()` are reset automatically after the challenge.

## Content variants

One class can yield many variants through `tune()` and the special-round modifiers. For example, Tap the
Target goes from static to moving to moving with fakes, Don't Tap Red raises its red ratio, and TINY
TARGETS, SPEED ROUND and CHAOS ROUND stack on top. Prefer adding variants before adding new classes.
