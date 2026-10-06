import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import { ChoiceButtons } from '../ChoiceButtons';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { roundRect, text } from '../../render/Draw';

/** Language-neutral word lists by difficulty tier (short, common, unambiguous letters). */
export const WORDS: readonly (readonly string[])[] = [
  ['CAT', 'SUN', 'DOG', 'BOX', 'HAT', 'RUN', 'FUN', 'CUP', 'MAP', 'JAM', 'ZAP', 'POP'],
  ['FAST', 'JUMP', 'STAR', 'GAME', 'FROG', 'BOLT', 'WAVE', 'ROCK', 'GOAL', 'ZOOM', 'QUIZ', 'TACO'],
  ['QUICK', 'BLAST', 'TIGER', 'PIXEL', 'SPEED', 'CANDY', 'ROBOT', 'MAGIC', 'TURBO', 'SPARK', 'PIZZA', 'NINJA'],
  ['ROCKET', 'JUNGLE', 'PLANET', 'WIZARD', 'TURTLE', 'BANANA', 'GALAXY', 'ROBOTS', 'FROZEN', 'SPRINT', 'PUZZLE', 'DRAGON'],
];

const ALPHABET = 'ABCDEFGHIJKLMNOPRSTUVWXYZ';

/** SPEED — type the words (keyboard) or tap the letter tiles in order (touch). */
export class TypeThis extends MiniGameBase {
  private words: string[] = [];
  private wordIndex = 0;
  private charIndex = 0;
  private correctChars = 0;
  private wrongChars = 0;
  private tiles: string[] = [];
  private buttons = new ChoiceButtons();
  private shakeTime = 0;
  private totalChars = 0;

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    const count = tune(d, [3, 3, 3, 3]);
    this.words = this.ctx.rng.sample(WORDS[d], count);
    this.totalChars = this.words.reduce((n, w) => n + w.length, 0);
    this.buildTiles();
  }

  private get word(): string {
    return this.words[this.wordIndex] ?? '';
  }

  private buildTiles(): void {
    const unique = [...new Set(this.word.split(''))];
    const decoyCount = Math.max(0, 8 - unique.length);
    const decoys = this.ctx.rng.sample(ALPHABET.split('').filter((c) => !unique.includes(c)), decoyCount);
    this.tiles = this.ctx.rng.shuffle([...unique, ...decoys]);
    this.buttons.layout(this.tiles.length, { x: 50, y: this.height * 0.5, w: this.width - 100, h: this.height * 0.44 }, 4, 20);
  }

  protected onUpdate(dt: number): void {
    this.buttons.update(dt);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
  }

  protected onInput(action: InputAction): void {
    let char: string | null = null;
    let tileIndex = -1;
    if (action.type === 'text') char = action.char.toUpperCase();
    else if (action.type === 'pointerDown') {
      tileIndex = this.buttons.pick(action);
      if (tileIndex >= 0) char = this.tiles[tileIndex];
    }
    if (!char) return;
    if (tileIndex < 0) tileIndex = this.tiles.indexOf(char);
    const expected = this.word[this.charIndex];
    if (char === expected) {
      this.charIndex++;
      this.correctChars++;
      this.ctx.fx.sfx('type');
      if (tileIndex >= 0) this.buttons.press(tileIndex, 'idle');
      if (this.charIndex >= this.word.length) this.nextWord();
    } else {
      this.wrongChars++;
      this.shakeTime = 0.25;
      this.ctx.fx.sfx('bad');
      if (tileIndex >= 0) this.buttons.press(tileIndex, 'wrong');
    }
  }

  private nextWord(): void {
    this.ctx.fx.burst(this.width / 2, this.height * 0.25, this.ctx.palette.good, 22);
    this.ctx.fx.floatText(this.width / 2, this.height * 0.14, this.ctx.t('fx.nice'), this.ctx.palette.good);
    this.ctx.fx.sfx('collect');
    this.wordIndex++;
    this.charIndex = 0;
    if (this.wordIndex >= this.words.length) {
      this.finish('success');
      return;
    }
    this.buildTiles();
  }

  protected computeScore(): ScoreResult {
    return buildScore({
      raw: this.correctChars,
      completion: this.correctChars / this.totalChars,
      accuracy: this.correctChars / Math.max(1, this.correctChars + this.wrongChars),
      completionWeight: 0.75,
      summaryKey: 'summary.words',
      summaryParams: { words: this.wordIndex, total: this.words.length },
      failReasonKey: this.wrongChars > this.correctChars ? 'fail.typos' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    const w = this.word;
    if (!w) return;
    const size = Math.min(150, (this.width - 160) / Math.max(4, w.length));
    const shake = this.shakeTime > 0 ? Math.sin(this.shakeTime * 80) * 12 : 0;
    const startX = this.width / 2 - ((w.length - 1) * size) / 2 + shake;
    const y = this.height * 0.25;
    roundRect(g, startX - size * 0.7, y - size * 0.75, (w.length - 1) * size + size * 1.4, size * 1.5, 30, p.bgAlt);
    for (let i = 0; i < w.length; i++) {
      const color = i < this.charIndex ? p.good : i === this.charIndex ? p.accent : p.text;
      text(g, w[i], startX + i * size, y, size * 0.95, color, 'center', 900);
      if (i === this.charIndex) roundRect(g, startX + i * size - size * 0.35, y + size * 0.52, size * 0.7, 8, 4, p.accent);
    }
    text(g, `${this.wordIndex + 1}/${this.words.length}`, 40, 40, 34, p.textDim, 'left', 700);
    this.buttons.render(
      g,
      { fill: p.bgAlt, stroke: 'rgba(255,255,255,0.2)', good: p.good, bad: p.bad, text: p.textDim },
      (i, x, cy, s) => text(g, this.tiles[i], x, cy, s * 0.5, p.text, 'center', 900),
      false,
    );
  }
}

export const typeThisDef: MiniGameDefinition = {
  id: 'type_this',
  nameKey: 'game.type_this.name',
  instructionKey: 'game.type_this.instruction',
  descriptionKey: 'game.type_this.desc',
  category: 'speed',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: [],
  inputs: ['text', 'pointer'],
  icon: '⌨️',
  create: () => new TypeThis(),
};
