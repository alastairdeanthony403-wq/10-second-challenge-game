import type { InputAction } from '../../core/InputTypes';
import { tune } from '../Difficulty';
import type { Canvas2D, MiniGameDefinition } from '../MiniGame';
import { MiniGameBase } from '../MiniGameBase';
import { buildScore, clamp01, type ScoreResult } from '../Scoring';
import { circle, dist, ring, shape } from '../../render/Draw';

interface Star {
  x: number;
  y: number;
  taken: boolean;
  spin: number;
}

interface Spike {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const PLAYER_RADIUS = 46;
const STAR_RADIUS = 36;
const SPIKE_RADIUS = 40;
const STUN_TIME = 0.6;

/** MOVEMENT — steer the blob (drag / pointer / arrows) to grab every star. Spikes stun you. */
export class CollectEverything extends MiniGameBase {
  private px = 0;
  private py = 0;
  private stars: Star[] = [];
  private spikes: Spike[] = [];
  private speed = 650;
  private stun = 0;
  private hits = 0;
  private followPointer = false;
  private target: { x: number; y: number } | null = null;

  protected onPrepare(): void {
    const d = this.ctx.difficulty;
    const count = tune(d, [8, 10, 12, 13]);
    const spikeCount = tune(d, [0, 1, 2, 3]);
    this.speed = tune(d, [700, 680, 660, 640]);
    this.px = this.width / 2;
    this.py = this.height / 2;
    const rng = this.ctx.rng;
    const m = 70;
    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      for (let attempt = 0; attempt < 20; attempt++) {
        x = rng.range(m, this.width - m);
        y = rng.range(m + 40, this.height - m);
        const clear = dist(x, y, this.px, this.py) > 150 && this.stars.every((s) => dist(s.x, s.y, x, y) > 110);
        if (clear) break;
      }
      this.stars.push({ x, y, taken: false, spin: rng.range(0, 6) });
    }
    for (let i = 0; i < spikeCount; i++) {
      const a = rng.range(0, Math.PI * 2);
      const sp = tune(d, [0, 220, 280, 340]);
      this.spikes.push({
        x: rng.pick([120, this.width - 120]),
        y: rng.range(120, this.height - 120),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
      });
    }
  }

  protected onUpdate(dt: number): void {
    const move = this.ctx.input.move;
    if (move.x !== 0 || move.y !== 0) this.followPointer = false;
    if (this.stun > 0) {
      this.stun -= dt;
    } else if (this.followPointer && this.target) {
      const dx = this.target.x - this.px;
      const dy = this.target.y - this.py;
      const d = Math.hypot(dx, dy);
      if (d > 4) {
        const step = Math.min(d, this.speed * dt);
        this.px += (dx / d) * step;
        this.py += (dy / d) * step;
      }
    } else {
      const len = Math.hypot(move.x, move.y) || 1;
      const mag = Math.min(1, Math.hypot(move.x, move.y));
      this.px += (move.x / len) * mag * this.speed * dt;
      this.py += (move.y / len) * mag * this.speed * dt;
    }
    this.px = Math.max(PLAYER_RADIUS, Math.min(this.width - PLAYER_RADIUS, this.px));
    this.py = Math.max(PLAYER_RADIUS, Math.min(this.height - PLAYER_RADIUS, this.py));

    for (const s of this.stars) {
      s.spin += dt * 2;
      if (!s.taken && dist(s.x, s.y, this.px, this.py) < PLAYER_RADIUS + STAR_RADIUS) {
        s.taken = true;
        this.ctx.fx.burst(s.x, s.y, this.ctx.palette.accent, 12);
        this.ctx.fx.sfx('collect');
      }
    }
    for (const k of this.spikes) {
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (k.x < SPIKE_RADIUS || k.x > this.width - SPIKE_RADIUS) k.vx *= -1;
      if (k.y < SPIKE_RADIUS || k.y > this.height - SPIKE_RADIUS) k.vy *= -1;
      if (this.stun <= 0 && dist(k.x, k.y, this.px, this.py) < PLAYER_RADIUS + SPIKE_RADIUS * 0.8) {
        this.hits++;
        this.stun = STUN_TIME;
        this.ctx.fx.shake(14);
        this.ctx.fx.flash(this.ctx.palette.bad, 0.25);
        this.ctx.fx.sfx('bad');
        // Knock the player away from the spike.
        const dx = this.px - k.x;
        const dy = this.py - k.y;
        const d = Math.hypot(dx, dy) || 1;
        this.px += (dx / d) * 80;
        this.py += (dy / d) * 80;
      }
    }
    if (this.collected === this.stars.length) this.finish('success');
  }

  private get collected(): number {
    return this.stars.filter((s) => s.taken).length;
  }

  protected onInput(action: InputAction): void {
    if (action.type === 'pointerDown' || (action.type === 'pointerMove' && action.pressed)) {
      this.followPointer = true;
      this.target = { x: action.x, y: action.y };
    } else if (action.type === 'pointerMove' && this.followPointer) {
      this.target = { x: action.x, y: action.y };
    }
  }

  protected computeScore(): ScoreResult {
    const total = this.stars.length;
    return buildScore({
      raw: this.collected,
      completion: this.collected / total,
      accuracy: clamp01(1 - this.hits * 0.25),
      completionWeight: 0.85,
      summaryKey: 'summary.collected',
      summaryParams: { collected: this.collected, total },
      failReasonKey: this.hits >= 2 ? 'fail.spiked' : 'fail.too_slow',
    });
  }

  protected onRender(g: Canvas2D): void {
    const p = this.ctx.palette;
    for (const s of this.stars) {
      if (s.taken) continue;
      shape(g, 'star', s.x, s.y, STAR_RADIUS, p.accent, '#fff', Math.sin(s.spin) * 0.3, 4);
    }
    for (const k of this.spikes) {
      shape(g, 'star', k.x, k.y, SPIKE_RADIUS, p.bad, '#000', this.time * 4, 4);
    }
    const stunned = this.stun > 0;
    circle(g, this.px, this.py + 8, PLAYER_RADIUS, 'rgba(0,0,0,0.3)');
    circle(g, this.px, this.py, PLAYER_RADIUS, stunned ? p.textDim : p.a, '#fff', 6);
    // Eyes looking toward movement target.
    circle(g, this.px - 15, this.py - 8, 9, '#fff');
    circle(g, this.px + 15, this.py - 8, 9, '#fff');
    circle(g, this.px - 15, this.py - 6, 4, '#000');
    circle(g, this.px + 15, this.py - 6, 4, '#000');
    if (this.followPointer && this.target && !stunned) {
      ring(g, this.target.x, this.target.y, 14, 'rgba(255,255,255,0.4)', 4);
    }
    shape(g, 'star', 56, 50, 26, p.accent);
    g.font = '800 40px "Baloo 2", system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = p.text;
    g.fillText(`${this.collected}/${this.stars.length}`, 96, 52);
  }
}

export const collectEverythingDef: MiniGameDefinition = {
  id: 'collect_everything',
  nameKey: 'game.collect_everything.name',
  instructionKey: 'game.collect_everything.instruction',
  descriptionKey: 'game.collect_everything.desc',
  category: 'movement',
  timeLimit: 10,
  weight: 1,
  scoreMultiplier: 1,
  unlock: { type: 'none' },
  modifiers: ['speed', 'reverse', 'chaos'],
  inputs: ['move', 'pointer', 'drag'],
  icon: '⭐',
  create: () => new CollectEverything(),
};
