export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  reducedShake: boolean;
  reducedEffects: boolean;
  highContrast: boolean;
  colorBlind: boolean;
  textScale: number;
  adaptiveDifficulty: boolean;
  theme: string;
  language: string;
}

export const TEXT_SCALES = [1, 1.15, 1.3] as const;

export function defaultSettings(prefersReducedMotion = false): Settings {
  return {
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 0.8,
    musicEnabled: true,
    sfxEnabled: true,
    reducedShake: prefersReducedMotion,
    reducedEffects: prefersReducedMotion,
    highContrast: false,
    colorBlind: false,
    textScale: 1,
    adaptiveDifficulty: true,
    theme: 'neon',
    language: 'en',
  };
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 && v.length < 40 ? v : fallback;
}

/** Coerces untrusted data into valid settings, keeping any valid fields. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const scale = num(r.textScale, d.textScale, 1, 1.3);
  return {
    masterVolume: num(r.masterVolume, d.masterVolume, 0, 1),
    musicVolume: num(r.musicVolume, d.musicVolume, 0, 1),
    sfxVolume: num(r.sfxVolume, d.sfxVolume, 0, 1),
    musicEnabled: bool(r.musicEnabled, d.musicEnabled),
    sfxEnabled: bool(r.sfxEnabled, d.sfxEnabled),
    reducedShake: bool(r.reducedShake, d.reducedShake),
    reducedEffects: bool(r.reducedEffects, d.reducedEffects),
    highContrast: bool(r.highContrast, d.highContrast),
    colorBlind: bool(r.colorBlind, d.colorBlind),
    textScale: TEXT_SCALES.reduce((best, s) => (Math.abs(s - scale) < Math.abs(best - scale) ? s : best), 1),
    adaptiveDifficulty: bool(r.adaptiveDifficulty, d.adaptiveDifficulty),
    theme: str(r.theme, d.theme),
    language: str(r.language, d.language),
  };
}
