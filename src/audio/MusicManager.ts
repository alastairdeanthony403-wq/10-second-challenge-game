import type { AudioManager } from './AudioManager';

export type MusicMood = 'off' | 'menu' | 'game';

const BASS = [0, 0, 7, 0, 5, 5, 3, 5];
const LEAD = [12, -1, 15, -1, 19, 17, 15, -1, 12, -1, 10, 12, -1, 7, 10, -1];
const ROOT_HZ = 110; // A2
const LOOKAHEAD = 0.12;

const hz = (semitones: number) => ROOT_HZ * Math.pow(2, semitones / 12);

/**
 * Tiny step sequencer for energetic arcade music. Tempo and layers rise with
 * `intensity` so the final seconds feel urgent. Scheduling uses the audio clock.
 */
export class MusicManager {
  private mood: MusicMood = 'off';
  private nextTime = 0;
  private step = 0;
  private intensity = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly audio: AudioManager) {}

  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (mood === 'off') {
      this.stopScheduler();
      return;
    }
    this.startScheduler();
  }

  /** 0 = calm, 1 = final-seconds panic. */
  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
  }

  private get bpm(): number {
    return this.mood === 'menu' ? 112 : 132 + this.intensity * 28;
  }

  private startScheduler(): void {
    if (this.timer) return;
    const ctx = this.audio.context;
    this.nextTime = ctx ? ctx.currentTime + 0.05 : 0;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  private stopScheduler(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const ctx = this.audio.context;
    const out = this.audio.musicOutput;
    if (!ctx || !out || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(ctx, out, this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(ctx: AudioContext, out: AudioNode, step: number, t: number, len: number): void {
    const game = this.mood === 'game';
    // Kick on quarters.
    if (step % 4 === 0) this.tone(ctx, out, 150, 45, t, 0.12, 'sine', 0.55);
    // Hats on off-beats (more in game mode).
    if (step % 2 === 1 || (game && this.intensity > 0.6)) this.noiseHat(ctx, out, t, game ? 0.07 : 0.04);
    // Snare on 2 and 4 in game mode.
    if (game && step % 8 === 4) this.noiseHat(ctx, out, t, 0.14, 1800);
    // Bass on eighths.
    if (step % 2 === 0) {
      const bar = Math.floor(step / 16) % 4;
      const note = BASS[(Math.floor(step / 2) + bar * 2) % BASS.length];
      this.tone(ctx, out, hz(note), undefined, t, len * 1.8, 'square', 0.12);
    }
    // Lead melody only during gameplay; denser when intense.
    if (game) {
      const n = LEAD[step % LEAD.length];
      if (n >= 0 && (this.intensity > 0.3 || step % 2 === 0)) this.tone(ctx, out, hz(n + 12), undefined, t, len * 0.9, 'triangle', 0.07 + this.intensity * 0.05);
    }
  }

  private tone(ctx: AudioContext, out: AudioNode, f: number, to: number | undefined, t: number, dur: number, wave: OscillatorType, level: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(out);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  private hatBuffer: AudioBuffer | null = null;

  private noiseHat(ctx: AudioContext, out: AudioNode, t: number, level: number, freq = 7000): void {
    if (!this.hatBuffer || this.hatBuffer.sampleRate !== ctx.sampleRate) {
      // Built once and reused for every hit.
      const len = Math.floor(ctx.sampleRate * 0.05);
      this.hatBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.hatBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.hatBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = level;
    src.connect(filter).connect(gain).connect(out);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    src.start(t);
  }

  dispose(): void {
    this.stopScheduler();
  }
}
