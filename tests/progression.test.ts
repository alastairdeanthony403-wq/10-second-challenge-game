import { describe, expect, it, vi } from 'vitest';
import { ALL_MINIGAMES } from '../src/gameplay/minigames';
import { Run, type RoundOutcome, type RunSummary } from '../src/gameplay/RunManager';
import { sanitizeScore } from '../src/gameplay/Scoring';
import { t, registerLocale, setLocale } from '../src/i18n/i18n';
import { en } from '../src/i18n/en';
import { ACHIEVEMENTS, AchievementManager } from '../src/progression/Achievements';
import { Progression } from '../src/progression/Progression';
import { SAVE_VERSION, defaultSave, migrate, sanitizeSave } from '../src/progression/SaveData';
import { BACKUP_KEY, MemoryStorage, SAVE_KEY, SaveManager } from '../src/progression/SaveManager';
import { sanitizeSettings } from '../src/progression/Settings';
import { UnlockManager } from '../src/progression/Unlocks';
import { LocalLeaderboardService, submissionFromRun, validateSubmission } from '../src/services/Leaderboard';
import { TITLE_ORDER } from '../src/ui/MainMenu';

const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('SaveManager', () => {
  it('creates defaults when no save exists', () => {
    const sm = new SaveManager(new MemoryStorage());
    const data = sm.load();
    expect(sm.loadStatus).toBe('new');
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.bestScore).toBe(0);
  });

  it('saves and loads round-trip', () => {
    const storage = new MemoryStorage();
    const a = new SaveManager(storage);
    a.load();
    a.update((d) => {
      d.bestScore = 1234;
      d.bestCombo = 7;
      d.achievements.first_run = 1;
      d.settings.musicVolume = 0.25;
    });
    const b = new SaveManager(storage);
    const data = b.load();
    expect(b.loadStatus).toBe('loaded');
    expect(data.bestScore).toBe(1234);
    expect(data.bestCombo).toBe(7);
    expect(data.achievements.first_run).toBe(1);
    expect(data.settings.musicVolume).toBe(0.25);
  });

  it('recovers from corrupted JSON and keeps a backup', () => {
    const spy = quiet();
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{"version":2,"bestScore":');
    const sm = new SaveManager(storage);
    const data = sm.load();
    expect(sm.loadStatus).toBe('recovered');
    expect(data.bestScore).toBe(0);
    expect(storage.getItem(BACKUP_KEY)).toBe('{"version":2,"bestScore":');
    spy.mockRestore();
  });

  it('recovers from non-object JSON', () => {
    const spy = quiet();
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '42');
    const sm = new SaveManager(storage);
    expect(sm.load().bestScore).toBe(0);
    expect(sm.loadStatus).toBe('recovered');
    spy.mockRestore();
  });

  it('sanitizes wrong types and hostile values field by field', () => {
    const data = sanitizeSave({
      version: 2,
      bestScore: -50,
      bestCombo: 'lots',
      unlockedGames: ['tap_target', 5, null],
      achievements: { perfect: 'yes', on_fire: 3 },
      settings: { masterVolume: 9, musicEnabled: 'no', textScale: 1.2, theme: 42 },
      stats: { gamesPlayed: Infinity, categoryPlays: { reflex: 4, bogus: 3 } },
      playerName: '   ',
      leaderboards: { 'personal:quick': [{ name: 'A very very long name', score: 10 }, 'junk'] },
    });
    expect(data.bestScore).toBe(0);
    expect(data.bestCombo).toBe(0);
    expect(data.unlockedGames).toEqual(['tap_target']);
    expect(data.achievements).toEqual({ on_fire: 3 });
    expect(data.settings.masterVolume).toBe(1);
    expect(data.settings.musicEnabled).toBe(true);
    expect(data.settings.textScale).toBe(1.15);
    expect(data.settings.theme).toBe('neon');
    expect(data.stats.gamesPlayed).toBe(0);
    expect(data.stats.categoryPlays.reflex).toBe(4);
    expect(data.playerName).toBe('YOU');
    expect(data.leaderboards['personal:quick']).toHaveLength(1);
    expect(data.leaderboards['personal:quick'][0].name.length).toBeLessThanOrEqual(12);
  });

  it('migrates a version 1 save', () => {
    const v1 = { version: 1, bestScore: 500, bestCombo: 3, unlockedGames: ['bullseye'], achievements: ['first_run', 'perfect'], settings: { sfxVolume: 0.3 } };
    const migrated = migrate(v1);
    expect(migrated.version).toBe(2);
    const data = sanitizeSave(v1);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.bestScore).toBe(500);
    expect(Object.keys(data.achievements).sort()).toEqual(['first_run', 'perfect']);
    expect(data.settings.sfxVolume).toBe(0.3);
    expect(data.daily.history).toEqual({});
  });

  it('treats a save without a version as v1', () => {
    expect(sanitizeSave({ achievements: ['on_fire'] }).achievements).toHaveProperty('on_fire');
  });

  it('survives storage that throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    const sm = new SaveManager(broken);
    expect(() => sm.load()).not.toThrow();
    expect(sm.save()).toBe(false);
    spy.mockRestore();
  });

  it('reset keeps settings but clears progress', () => {
    const sm = new SaveManager(new MemoryStorage());
    sm.load();
    sm.update((d) => {
      d.bestScore = 99;
      d.settings.colorBlind = true;
    });
    sm.reset();
    expect(sm.data.bestScore).toBe(0);
    expect(sm.data.settings.colorBlind).toBe(true);
  });

  it('settings sanitizer fills defaults', () => {
    const s = sanitizeSettings(undefined);
    expect(s.masterVolume).toBeGreaterThan(0);
    expect(s.theme).toBe('neon');
  });
});

function outcome(partial: Partial<RoundOutcome>): RoundOutcome {
  const score = partial.score ?? 60;
  return {
    playerIndex: 0,
    result: sanitizeScore({ score, summaryKey: 'x' }),
    score,
    rating: 'GOOD',
    perfect: score === 100,
    failed: score < 30,
    points: { base: score, multiplier: 1, modifierMultiplier: 1, perfectBonus: 0, total: score },
    comboBefore: 0,
    comboAfter: 1,
    comboBroken: false,
    lostLife: false,
    livesLeft: null,
    ...partial,
  };
}

function playRun(scores: number[], mode: 'quick' | 'endless' | 'daily' = 'quick'): RunSummary {
  const run = new Run(mode, { pool: ALL_MINIGAMES, seed: 5, adaptive: false });
  for (const s of scores) {
    if (run.isOver()) break;
    run.prepareChallenge();
    run.recordResult(sanitizeScore({ score: s, summaryKey: 'x' }));
  }
  return run.summary();
}

describe('Progression', () => {
  it('records challenge stats, bests and achievements', () => {
    const save = defaultSave();
    const p = new Progression(ALL_MINIGAMES);
    const def = ALL_MINIGAMES.find((d) => d.id === 'tap_target')!;
    const r1 = p.recordChallenge(save, def, outcome({ score: 100, comboAfter: 5 }), true);
    expect(save.stats.challengesPlayed).toBe(1);
    expect(save.stats.perfects).toBe(1);
    expect(save.gameBests.tap_target).toBe(100);
    expect(save.bestCombo).toBe(5);
    expect(r1.achievements.map((a) => a.id).sort()).toEqual(['on_fire', 'perfect']);
    // Already unlocked achievements are not re-announced.
    const r2 = p.recordChallenge(save, def, outcome({ score: 100, comboAfter: 6 }), true);
    expect(r2.achievements).toHaveLength(0);
  });

  it('multiplayer challenges do not pollute personal stats', () => {
    const save = defaultSave();
    const p = new Progression(ALL_MINIGAMES);
    p.recordChallenge(save, ALL_MINIGAMES[0], outcome({ score: 100 }), false);
    expect(save.stats.challengesPlayed).toBe(0);
    expect(save.achievements).toEqual({});
  });

  it('tracks fastest reaction', () => {
    const save = defaultSave();
    const p = new Progression(ALL_MINIGAMES);
    const def = ALL_MINIGAMES.find((d) => d.id === 'lightning_tap')!;
    p.recordChallenge(save, def, outcome({ result: { ...sanitizeScore({ score: 90, summaryKey: 'x' }), reactionMs: 240 } }), true);
    p.recordChallenge(save, def, outcome({ result: { ...sanitizeScore({ score: 90, summaryKey: 'x' }), reactionMs: 300 } }), true);
    expect(save.stats.fastestReactionMs).toBe(240);
    expect('lightning' in save.achievements).toBe(true);
  });

  it('memory machine needs 3 consecutive strong memory results', () => {
    const save = defaultSave();
    const p = new Progression(ALL_MINIGAMES);
    const mem = ALL_MINIGAMES.find((d) => d.category === 'memory')!;
    p.recordChallenge(save, mem, outcome({ score: 80 }), true);
    p.recordChallenge(save, mem, outcome({ score: 40 }), true);
    p.recordChallenge(save, mem, outcome({ score: 80 }), true);
    p.recordChallenge(save, mem, outcome({ score: 80 }), true);
    expect('memory_machine' in save.achievements).toBe(false);
    p.recordChallenge(save, mem, outcome({ score: 90 }), true);
    expect('memory_machine' in save.achievements).toBe(true);
  });

  it('records a run: best score, first run, titles and unlocks', () => {
    const save = defaultSave();
    const p = new Progression(ALL_MINIGAMES);
    p.initialize(save);
    expect(save.unlockedGames).not.toContain('button_mash');
    const summary = playRun(Array(10).fill(95));
    const res = p.recordRun(save, summary, TITLE_ORDER);
    expect(res.newBestScore).toBe(true);
    expect(save.bestScore).toBe(summary.players[0].points);
    expect(save.stats.gamesPlayed).toBe(1);
    expect(res.achievements.map((a) => a.id)).toEqual(expect.arrayContaining(['first_run', 'no_mistakes', 'speed_demon']));
    expect(res.unlocks.games).toContain('button_mash');
    expect(res.newTitle).toBe('rank.legend');
    // A worse run is not a new best.
    const res2 = p.recordRun(save, playRun(Array(10).fill(40)), TITLE_ORDER);
    expect(res2.newBestScore).toBe(false);
    expect(res2.previousBest).toBe(summary.players[0].points);
  });

  it('daily results are stored per date', () => {
    const save = defaultSave();
    const p = new Progression(ALL_MINIGAMES);
    const s = playRun(Array(10).fill(70), 'daily');
    p.recordRun(save, s, TITLE_ORDER);
    expect(save.daily.completed).toBe(true);
    expect(save.daily.key).toBe(s.dailyKey);
    expect(save.daily.history[s.dailyKey!]).toBe(s.players[0].points);
    expect('daily_devotee' in save.achievements).toBe(true);
  });
});

describe('Achievements', () => {
  it('ids are unique and every string is localized', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACHIEVEMENTS) {
      expect(en[a.nameKey], a.nameKey).toBeTruthy();
      expect(en[a.descKey], a.descKey).toBeTruthy();
    }
  });

  it('a throwing check does not break evaluation', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mgr = new AchievementManager([
      { id: 'bad', icon: '', nameKey: '', descKey: '', check: () => { throw new Error('x'); } },
      { id: 'good', icon: '', nameKey: '', descKey: '', check: () => true },
    ]);
    const save = defaultSave();
    expect(mgr.evaluate({ save, games: [] }).map((a) => a.id)).toEqual(['good']);
    spy.mockRestore();
  });
});

describe('Unlocks', () => {
  it('base games are unlocked from the start; others follow their rules', () => {
    const save = defaultSave();
    const u = new UnlockManager(ALL_MINIGAMES);
    u.refresh(save);
    const base = ALL_MINIGAMES.filter((g) => g.unlock.type === 'none').map((g) => g.id);
    expect(save.unlockedGames.sort()).toEqual(base.sort());
    expect(base.length).toBeGreaterThanOrEqual(10);
    save.achievements.on_fire = 1;
    expect(u.refresh(save).games).toContain('feed_monster');
  });

  it('unlockEverything unlocks all games and themes', () => {
    const save = defaultSave();
    const u = new UnlockManager(ALL_MINIGAMES);
    u.unlockEverything(save);
    expect(u.unlockedGames(save)).toHaveLength(ALL_MINIGAMES.length);
  });
});

describe('Leaderboard', () => {
  it('validates impossible submissions', () => {
    const ok = { board: 'personal' as const, mode: 'quick' as const, name: 'A', points: 500, rounds: 10, scoreSum: 700 };
    expect(validateSubmission(ok)).toBeNull();
    expect(validateSubmission({ ...ok, points: -1 })).not.toBeNull();
    expect(validateSubmission({ ...ok, scoreSum: 1001 })).not.toBeNull();
    expect(validateSubmission({ ...ok, points: 1e9 })).not.toBeNull();
    expect(validateSubmission({ ...ok, rounds: 0 })).not.toBeNull();
  });

  it('stores sorted top entries locally', async () => {
    const save = defaultSave();
    const lb = new LocalLeaderboardService(() => save, () => {});
    for (const pts of [100, 300, 200]) {
      await lb.submit({ board: 'personal', mode: 'quick', name: 'P', points: pts, rounds: 10, scoreSum: 500 });
    }
    const top = await lb.top('personal', 5, 'quick');
    expect(top.map((e) => e.score)).toEqual([300, 200, 100]);
    const bad = await lb.submit({ board: 'personal', mode: 'quick', name: 'P', points: 1e9, rounds: 1, scoreSum: 1 });
    expect(bad.ok).toBe(false);
  });

  it('builds submissions only for solo runs', () => {
    const s = playRun(Array(10).fill(50));
    expect(submissionFromRun(s, 'ME')?.points).toBe(s.players[0].points);
    expect(submissionFromRun({ ...s, players: [...s.players, ...s.players] }, 'ME')).toBeNull();
  });
});

describe('i18n', () => {
  it('interpolates params', () => {
    expect(t('summary.hits', { hits: 3, goal: 5 })).toBe('3 / 5 hit');
  });

  it('falls back to English, then to the key', () => {
    const spy = quiet();
    registerLocale('xx', { 'menu.play': 'JUGAR' });
    setLocale('xx');
    expect(t('menu.play')).toBe('JUGAR');
    expect(t('menu.settings')).toBe('SETTINGS');
    expect(t('no.such.key')).toBe('no.such.key');
    setLocale('en');
    spy.mockRestore();
  });

  it('every summary/fail key used by mini-games exists', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '../src');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith('en.ts')) files.push(p);
      }
    };
    walk(dir);
    const keys = new Set<string>();
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/['`]((?:summary|fail|fx|ui|menu|mode|results|settings|stats|ach|toast|unlock|theme|rank|rating|category|difficulty|modifier|game)\.[a-z0-9_.]+)['`]/g)) keys.add(m[1]);
    }
    const missing = [...keys].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });
});
