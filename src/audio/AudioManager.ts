import type { SfxName } from '../gameplay/MiniGame';
import type { Settings } from '../progression/Settings';

export type UiSfx =
  | 'click'
  | 'hover'
  | 'countdown'
  | 'go'
  | 'success'
  | 'perfect'
  | 'fail'
  | 'timeup'
  | 'urgent'
  | 'record'
  | 'combo'
  | 'achievement'
  | 'life_lost';

export type SoundName = SfxName | UiSfx;

type Wave = OscillatorType;

interface Note {
  /** Frequency in Hz (end frequency for slides via `to`). */
  f: number;
  to?: number;
  at?: number;
  dur: number;
  wave?: Wave;
  gain?: number;
}

/** Every sound is synthesized: no asset files to load, nothing to go missing. */
const SOUNDS: Record<SoundName, { notes: Note[]; noise?: { dur: number; gain: number; at?: number } }> = {
  tap: { notes: [{ f: 880, dur: 0.05, wave: 'square', gain: 0.25 }] },
  hit: { notes: [{ f: 660, to: 1320, dur: 0.09, wave: 'triangle', gain: 0.5 }] },
  miss: { notes: [{ f: 220, to: 160, dur: 0.1, wave: 'sawtooth', gain: 0.2 }] },
  bad: { notes: [{ f: 180, to: 90, dur: 0.22, wave: 'sawtooth', gain: 0.35 }, { f: 185, to: 92, dur: 0.22, wave: 'square', gain: 0.15 }] },
  pop: { notes: [{ f: 500 + 0, to: 900, dur: 0.05, wave: 'sine', gain: 0.35 }] },
  whoosh: { notes: [], noise: { dur: 0.25, gain: 0.25 } },
  select: { notes: [{ f: 520, dur: 0.06, wave: 'triangle', gain: 0.35 }] },
  tick: { notes: [{ f: 1200, dur: 0.04, wave: 'square', gain: 0.2 }] },
  bounce: { notes: [{ f: 300, to: 600, dur: 0.1, wave: 'sine', gain: 0.45 }] },
  splat: { notes: [{ f: 120, to: 40, dur: 0.35, wave: 'sawtooth', gain: 0.3 }], noise: { dur: 0.3, gain: 0.35 } },
  type: { notes: [{ f: 1500, dur: 0.03, wave: 'square', gain: 0.15 }] },
  drop: { notes: [{ f: 400, to: 250, dur: 0.08, wave: 'triangle', gain: 0.4 }] },
  collect: { notes: [{ f: 988, dur: 0.06, wave: 'square', gain: 0.2 }, { f: 1319, at: 0.06, dur: 0.1, wave: 'square', gain: 0.2 }] },
  click: { notes: [{ f: 700, dur: 0.04, wave: 'triangle', gain: 0.3 }] },
  hover: { notes: [{ f: 1100, dur: 0.02, wave: 'sine', gain: 0.08 }] },
  countdown: { notes: [{ f: 523, dur: 0.12, wave: 'square', gain: 0.25 }] },
  go: { notes: [{ f: 784, dur: 0.1, wave: 'square', gain: 0.3 }, { f: 1047, at: 0.08, dur: 0.25, wave: 'square', gain: 0.3 }] },
  success: { notes: [523, 659, 784].map((f, i) => ({ f, at: i * 0.07, dur: 0.12, wave: 'triangle' as Wave, gain: 0.35 })) },
  perfect: { notes: [523, 659, 784, 1047, 1319].map((f, i) => ({ f, at: i * 0.06, dur: 0.16, wave: 'square' as Wave, gain: 0.22 })) },
  fail: { notes: [{ f: 392, dur: 0.15, wave: 'triangle', gain: 0.3 }, { f: 330, at: 0.15, dur: 0.15, wave: 'triangle', gain: 0.3 }, { f: 262, at: 0.3, dur: 0.3, wave: 'triangle', gain: 0.3 }] },
  timeup: { notes: [{ f: 880, dur: 0.1, wave: 'square', gain: 0.25 }, { f: 660, at: 0.12, dur: 0.25, wave: 'square', gain: 0.25 }] },
  urgent: { notes: [{ f: 1000, dur: 0.05, wave: 'square', gain: 0.18 }] },
  record: { notes: [659, 784, 988, 1319, 988, 1319].map((f, i) => ({ f, at: i * 0.09, dur: 0.14, wave: 'square' as Wave, gain: 0.22 })) },
  combo: { notes: [{ f: 660, to: 1320, dur: 0.15, wave: 'sine', gain: 0.3 }] },
  achievement: { notes: [784, 988, 1175, 1568].map((f, i) => ({ f, at: i * 0.08, dur: 0.2, wave: 'triangle' as Wave, gain: 0.3 })) },
  life_lost: { notes: [{ f: 300, to: 100, dur: 0.4, wave: 'sawtooth', gain: 0.3 }] },
};

const MAX_VOICES = 24;
const MIN_REPEAT_GAP = 0.025;

/**
 * Centralized audio: one AudioContext, master/music/sfx buses, a voice cap and
 * per-sound throttling (a lightweight form of pooling for synthesized voices).
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeVoices = 0;
  private lastPlayed = new Map<SoundName, number>();
  private settings: Settings | null = null;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get musicOutput(): GainNode | null {
    return this.musicBus;
  }

  /** Must be called from a user gesture (browser autoplay policy). Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        if (this.settings) this.applySettings(this.settings);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (err) {
      console.warn('[Audio] unavailable', err);
      this.ctx = null;
    }
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.masterVolume, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(settings.sfxEnabled ? settings.sfxVolume : 0, now, 0.02);
    this.musicBus.gain.setTargetAtTime(settings.musicEnabled ? settings.musicVolume * 0.5 : 0, now, 0.02);
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  play(name: SoundName, pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running') return;
    if (this.settings && (!this.settings.sfxEnabled || this.settings.sfxVolume <= 0)) return;
    const def = SOUNDS[name];
    if (!def) return;
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < MIN_REPEAT_GAP) return;
    if (this.activeVoices >= MAX_VOICES) return;
    this.lastPlayed.set(name, now);
    for (const note of def.notes) this.playNote(note, now, pitch);
    if (def.noise) this.playNoise(def.noise.dur, def.noise.gain, now + (def.noise.at ?? 0));
  }

  private playNote(note: Note, now: number, pitch: number): void {
    const ctx = this.ctx!;
    const start = now + (note.at ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.wave ?? 'sine';
    osc.frequency.setValueAtTime(note.f * pitch, start);
    if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to * pitch, start + note.dur);
    const peak = (note.gain ?? 0.3) * 0.6;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);
    osc.connect(gain).connect(this.sfxBus!);
    this.activeVoices++;
    osc.onended = () => {
      this.activeVoices--;
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(start);
    osc.stop(start + note.dur + 0.02);
  }

  private playNoise(dur: number, level: number, start: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, start);
    filter.frequency.exponentialRampToValueAtTime(3000, start + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level * 0.5, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter).connect(gain).connect(this.sfxBus!);
    this.activeVoices++;
    src.onended = () => {
      this.activeVoices--;
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    src.start(start);
    src.stop(start + dur);
  }
}
