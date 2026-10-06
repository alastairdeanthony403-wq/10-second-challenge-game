import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, type ScoreResult } from '../Scoring';
import { circle, emoji, text } from '../../render/Draw';

const FOODS = ['🍔', '🍕', '🍩', '🍎', '🍪', '🍌', '🧁', '🍗'];
const JUNK = ['💣', '🧦', '👟', '🔩', '🧽'];
const ITEM_R = 64;

interface Thing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  icon: string;
  food: boolean;
  held: boolean;
}

/** CHAOS — drag food into the hungry monster's mouth; don't feed it junk! */
export class FeedTheMonster extends MiniGameBase {
  private things: Thing[] = [];
  private held: Thing | null = null;
  private fed = 0;
  private junkFed = 0;
  private goal = 6;
  private chew = 0;
  private sick = 0;
  private spawnTimer = 0;
  private interval = 0.9;
  private speed = 200;

  private get mouth() {
    return { x: this.width / 2, y: this.height - 170, r: 150 };
  }

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    this.goal = tune(d, [5, 6, 7, 8]);
    this.interval = tune(d, [0.8, 0.7, 0.6, 0.5]);
    this.speed = tune(d, [160, 240, 320, 400]);
    for (let i = 0; i < 4; i++) this.spawn(i < 3);
  }

  private spawn(forceFood = false): void {
    const rng = this.ctx.rng;
    const food = forceFood || rng.chance(0.65);
    const a = rng.range(0, Math.PI * 2);
    this.things.push({
      x: rng.range(ITEM_R, this.width - ITEM_R),
      y: rng.range(ITEM_R + 60, this.height * 0.5),
      vx: Math.cos(a) * this.speed,
      vy: Math.sin(a) * this.speed,
      icon: food ? rng.pick(FOODS) : rng.pick(JUNK),
      food,
      held: false,
    });
  }

  protected onUpdate(dt: number): void {
    this.chew = Math.max(0, this.chew - dt * 3);
    this.sick = Math.max(0, this.sick - dt);
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.interval && this.things.length < 9) {
      this.spawnTimer = 0;
      this.spawn();
    }
    const limitY = this.height * 0.62;
    for (const t of this.things) {
      if (t.held) continue;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      if (t.x < ITEM_R || t.x > this.width - ITEM_R) t.vx *= -1;
      if (t.y < ITEM_R + 40 || t.y > limitY) t.vy *= -1;
      t.x = Math.max(ITEM_R, Math.min(this.width - ITEM_R, t.x));
      t.y = Math.max(ITEM_R + 40, Math.min(limitY, t.y));
    }
  }

  protected onInput(action: InputAction): void {
    if (action.type === 'pointerDown') {
      const t = [...this.things].reverse().find((o) => Math.hypot(o.x - action.x, o.y - action.y) <= ITEM_R * 1.2);
      if (t) {
        t.held = true;
        this.held = t;
        this.ctx.fx.sfx('select');
      }
    } else if (action.type === 'pointerMove' && this.held) {
      this.held.x = action.x;
      this.held.y = action.y;
    } else if (action.type === 'pointerUp' && this.held) {
      const t = this.held;
      this.held = null;
      t.held = false;
      const m = this.mouth;
      if (Math.hypot(t.x - m.x, t.y - m.y) <= m.r + ITEM_R * 0.5) this.eat(t);
    }
  }

  private eat(t: Thing): void {
    this.things.splice(this.things.indexOf(t), 1);
    const m = this.mouth;
    if (t.food) {
      this.fed++;
      this.chew = 1;
      this.ctx.fx.sfx('collect');
      this.ctx.fx.burst(m.x, m.y - 40, this.ctx.palette.good, 16);
      this.ctx.fx.floatText(m.x, m.y - 200, this.ctx.t('fx.yum'), this.ctx.palette.good);
      if (this.fed >= this.goal) this.finish('success');
    } else {
      this.junkFed++;
      this.sick = 0.8;
      this.ctx.fx.sfx('bad');
      this.ctx.fx.shake(14);
      this.ctx.fx.floatText(m.x, m.y - 200, this.ctx.t('fx.yuck'), this.ctx.palette.bad);
    }
  }

  protected computeScore(): ScoreResult {
    return buildScore({
      raw: this.fed,
      completion: this.fed / this.goal,
      accuracy: this.fed / Math.max(1, this.fed + this.junkFed * 2),
      completionWeight: 0.7,
      summaryKey: 'summary.fed',
      summaryParams: { fed: this.fed, goal: this.goal },
      failReasonKey: this.junkFed > 0 ? 'fail.fed_junk' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    const m = this.mouth;
    // Monster body.
    const bodyColor = this.sick > 0 ? '#7bc96f' : p.b;
    circle(g, m.x, m.y + 60, m.r * 1.4, bodyColor, '#fff', 6);
    circle(g, m.x - 70, m.y - 80, 34, '#fff');
    circle(g, m.x + 70, m.y - 80, 34, '#fff');
    circle(g, m.x - 70, m.y - 76, 14, '#000');
    circle(g, m.x + 70, m.y - 76, 14, '#000');
    const open = this.held?.food ? 1 : 0.6 - this.chew * 0.4;
    g.beginPath();
    g.ellipse(m.x, m.y + 30, m.r * 0.8, Math.max(10, m.r * 0.55 * open), 0, 0, Math.PI * 2);
    g.fillStyle = '#2a0a1a';
    g.fill();
    for (const t of this.things) {
      if (t.held) circle(g, t.x, t.y, ITEM_R * 1.15, 'rgba(255,255,255,0.15)');
      emoji(g, t.icon, t.x, t.y, ITEM_R * 1.5);
    }
    text(g, `${this.fed}/${this.goal}`, 40, 46, 40, p.text, 'left', 800);
  }
}

export const feedTheMonsterDef: MiniGameDefinition = {
  id: 'feed_monster',
  nameKey: 'game.feed_monster.name',
  instructionKey: 'game.feed_monster.instruction',
  descriptionKey: 'game.feed_monster.desc',
  category: 'chaos',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'achievement', id: 'on_fire' },
  modifiers: ['speed', 'chaos'],
  inputs: ['drag', 'pointer'],
  icon: '👾',
  create: () => new FeedTheMonster(),
};
