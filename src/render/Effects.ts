import { Pool } from '../core/Pool';
import type { Canvas2D } from '../gameplay/MiniGame';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  confetti: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

const MAX_PARTICLES = 400;

/** Pooled particles and floating text drawn in world space on top of the mini-game. */
export class Effects {
  private particles = new Pool<Particle>(
    () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 8, color: '#fff', rot: 0, vr: 0, confetti: false }),
    () => {},
    120,
  );
  private texts = new Pool<FloatingText>(() => ({ x: 0, y: 0, text: '', color: '#fff', life: 0, maxLife: 1 }), () => {}, 16);
  /** 0..1 scale applied to particle counts (reduced-effects setting). */
  intensity = 1;

  burst(x: number, y: number, color: string, count = 12): void {
    const n = Math.round(count * this.intensity);
    for (let i = 0; i < n && this.particles.size < MAX_PARTICLES; i++) {
      const p = this.particles.acquire();
      const a = Math.random() * Math.PI * 2;
      const speed = 200 + Math.random() * 500;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.maxLife = p.life = 0.35 + Math.random() * 0.35;
      p.size = 6 + Math.random() * 10;
      p.color = color;
      p.confetti = false;
      p.rot = 0;
      p.vr = 0;
    }
  }

  confetti(width: number, colors: string[], count = 120): void {
    const n = Math.round(count * this.intensity);
    for (let i = 0; i < n && this.particles.size < MAX_PARTICLES; i++) {
      const p = this.particles.acquire();
      p.x = Math.random() * width;
      p.y = -20 - Math.random() * 200;
      p.vx = (Math.random() - 0.5) * 300;
      p.vy = 200 + Math.random() * 400;
      p.maxLife = p.life = 1.6 + Math.random() * 1;
      p.size = 10 + Math.random() * 10;
      p.color = colors[i % colors.length];
      p.confetti = true;
      p.rot = Math.random() * 6;
      p.vr = (Math.random() - 0.5) * 12;
    }
  }

  floatText(x: number, y: number, text: string, color = '#fff'): void {
    if (this.texts.size > 12) this.texts.release(this.texts.active[0]);
    const t = this.texts.acquire();
    t.x = x;
    t.y = y;
    t.text = text;
    t.color = color;
    t.maxLife = t.life = 0.9;
  }

  update(dt: number): void {
    for (let i = this.particles.active.length - 1; i >= 0; i--) {
      const p = this.particles.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.release(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.confetti) {
        p.vx *= 1 - dt * 0.8;
        p.rot += p.vr * dt;
      } else {
        p.vx *= 1 - dt * 3;
        p.vy = p.vy * (1 - dt * 3) + 900 * dt;
      }
    }
    for (let i = this.texts.active.length - 1; i >= 0; i--) {
      const t = this.texts.active[i];
      t.life -= dt;
      t.y -= 90 * dt;
      if (t.life <= 0) this.texts.release(t);
    }
  }

  render(g: Canvas2D): void {
    for (const p of this.particles.active) {
      const a = Math.max(0, p.life / p.maxLife);
      g.globalAlpha = a;
      g.fillStyle = p.color;
      if (p.confetti) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g.restore();
      } else {
        const s = p.size * (0.4 + 0.6 * a);
        g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    g.globalAlpha = 1;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const t of this.texts.active) {
      const age = 1 - t.life / t.maxLife;
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.6 : 1.2 - Math.min(0.2, (age - 0.15) * 0.5);
      g.globalAlpha = Math.min(1, t.life / 0.3);
      g.font = `900 ${Math.round(54 * pop)}px "Baloo 2", system-ui, sans-serif`;
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.strokeText(t.text, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
  }

  clear(): void {
    this.particles.releaseAll();
    this.texts.releaseAll();
  }

  get particleCount(): number {
    return this.particles.size;
  }
}
