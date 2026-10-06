import { CATEGORIES, type Category } from '../gameplay/MiniGame';
import type { ModeId } from '../gameplay/RunManager';
import { defaultSettings, sanitizeSettings, type Settings } from './Settings';

export const SAVE_VERSION = 2;

export interface Stats {
  gamesPlayed: number;
  challengesPlayed: number;
  challengesCompleted: number;
  challengesFailed: number;
  perfects: number;
  totalScore: number;
  fastestReactionMs: number | null;
  categoryPlays: Record<Category, number>;
  categoryScore: Record<Category, number>;
  endlessBestRound: number;
  multiplayerGames: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  date: string;
  mode: string;
}

export interface DailyRecord {
  key: string;
  score: number;
  completed: boolean;
  best: number;
  history: Record<string, number>;
}

export interface SaveData {
  version: number;
  bestScore: number;
  bestScoreByMode: Partial<Record<ModeId, number>>;
  bestCombo: number;
  stats: Stats;
  gameBests: Record<string, number>;
  gamePlays: Record<string, number>;
  memoryStreak: number;
  unlockedGames: string[];
  unlockedThemes: string[];
  titles: string[];
  achievements: Record<string, number>;
  settings: Settings;
  daily: DailyRecord;
  leaderboards: Record<string, LeaderboardEntry[]>;
  playerName: string;
}

function categoryRecord(): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
}

export function defaultStats(): Stats {
  return {
    gamesPlayed: 0,
    challengesPlayed: 0,
    challengesCompleted: 0,
    challengesFailed: 0,
    perfects: 0,
    totalScore: 0,
    fastestReactionMs: null,
    categoryPlays: categoryRecord(),
    categoryScore: categoryRecord(),
    endlessBestRound: 0,
    multiplayerGames: 0,
  };
}

export function defaultSave(prefersReducedMotion = false): SaveData {
  return {
    version: SAVE_VERSION,
    bestScore: 0,
    bestScoreByMode: {},
    bestCombo: 0,
    stats: defaultStats(),
    gameBests: {},
    gamePlays: {},
    memoryStreak: 0,
    unlockedGames: [],
    unlockedThemes: [],
    titles: [],
    achievements: {},
    settings: defaultSettings(prefersReducedMotion),
    daily: { key: '', score: 0, completed: false, best: 0, history: {} },
    leaderboards: {},
    playerName: 'YOU',
  };
}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const nonNeg = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : []);

function numRecord(v: unknown): Record<string, number> {
  if (!isObj(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === 'number' && Number.isFinite(val) && val >= 0) out[k] = val;
  return out;
}

/** Version migrations. Each step upgrades raw data by exactly one version. */
const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  // v1 (initial format): achievements were a string array; no stats/daily blocks.
  1: (raw) => {
    const achievements: Record<string, number> = {};
    for (const id of strArray(raw.achievements)) achievements[id] = 0;
    return { ...raw, version: 2, achievements, stats: raw.stats ?? {}, daily: raw.daily ?? {} };
  },
};

export function migrate(raw: Raw): Raw {
  let data = raw;
  let version = typeof data.version === 'number' ? data.version : 1;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    data = step(data);
    version = typeof data.version === 'number' ? data.version : version + 1;
  }
  return data;
}

/** Turns arbitrary (possibly corrupt or hand-edited) data into a valid SaveData. */
export function sanitizeSave(input: unknown): SaveData {
  const base = defaultSave();
  if (!isObj(input)) return base;
  const raw = migrate(input);
  const s = isObj(raw.stats) ? raw.stats : {};
  const stats = defaultStats();
  stats.gamesPlayed = nonNeg(s.gamesPlayed);
  stats.challengesPlayed = nonNeg(s.challengesPlayed);
  stats.challengesCompleted = nonNeg(s.challengesCompleted);
  stats.challengesFailed = nonNeg(s.challengesFailed);
  stats.perfects = nonNeg(s.perfects);
  stats.totalScore = nonNeg(s.totalScore);
  stats.fastestReactionMs = typeof s.fastestReactionMs === 'number' && s.fastestReactionMs > 0 ? s.fastestReactionMs : null;
  stats.endlessBestRound = nonNeg(s.endlessBestRound);
  stats.multiplayerGames = nonNeg(s.multiplayerGames);
  const plays = numRecord(s.categoryPlays);
  const scores = numRecord(s.categoryScore);
  for (const c of CATEGORIES) {
    stats.categoryPlays[c] = plays[c] ?? 0;
    stats.categoryScore[c] = scores[c] ?? 0;
  }
  const d = isObj(raw.daily) ? raw.daily : {};
  const leaderboards: Record<string, LeaderboardEntry[]> = {};
  if (isObj(raw.leaderboards)) {
    for (const [board, entries] of Object.entries(raw.leaderboards)) {
      if (!Array.isArray(entries)) continue;
      leaderboards[board] = entries
        .filter(isObj)
        .map((e) => ({ name: String(e.name ?? '???').slice(0, 12), score: nonNeg(e.score), date: String(e.date ?? ''), mode: String(e.mode ?? '') }))
        .slice(0, 20);
    }
  }
  const bestByMode: Partial<Record<ModeId, number>> = {};
  for (const [k, v] of Object.entries(numRecord(raw.bestScoreByMode))) bestByMode[k as ModeId] = v;
  return {
    version: SAVE_VERSION,
    bestScore: nonNeg(raw.bestScore),
    bestScoreByMode: bestByMode,
    bestCombo: nonNeg(raw.bestCombo),
    stats,
    gameBests: numRecord(raw.gameBests),
    gamePlays: numRecord(raw.gamePlays),
    memoryStreak: nonNeg(raw.memoryStreak),
    unlockedGames: strArray(raw.unlockedGames),
    unlockedThemes: strArray(raw.unlockedThemes),
    titles: strArray(raw.titles),
    achievements: numRecord(raw.achievements),
    settings: sanitizeSettings(raw.settings),
    daily: {
      key: typeof d.key === 'string' ? d.key : '',
      score: nonNeg(d.score),
      completed: d.completed === true,
      best: nonNeg(d.best),
      history: numRecord(d.history),
    },
    leaderboards,
    playerName: typeof raw.playerName === 'string' && raw.playerName.trim() ? raw.playerName.trim().slice(0, 12) : base.playerName,
  };
}
