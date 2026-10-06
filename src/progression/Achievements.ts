import type { MiniGameDefinition } from '../gameplay/MiniGame';
import type { RoundOutcome, RunSummary } from '../gameplay/RunManager';
import type { SaveData } from './SaveData';

export interface AchievementContext {
  save: SaveData;
  games: readonly MiniGameDefinition[];
  outcome?: RoundOutcome;
  run?: RunSummary;
}

export interface AchievementDef {
  id: string;
  icon: string;
  nameKey: string;
  descKey: string;
  /** Checked after every challenge and at the end of every run. */
  check: (ctx: AchievementContext) => boolean;
}

const solo = (run?: RunSummary) => (run && run.players.length === 1 ? run.players[0] : null);

/** Add new achievements here; they are evaluated automatically. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first_run', icon: '🏁', nameKey: 'ach.first_run', descKey: 'ach.first_run.desc', check: ({ run }) => !!run },
  { id: 'perfect', icon: '💯', nameKey: 'ach.perfect', descKey: 'ach.perfect.desc', check: ({ outcome }) => !!outcome?.perfect },
  { id: 'on_fire', icon: '🔥', nameKey: 'ach.on_fire', descKey: 'ach.on_fire.desc', check: ({ outcome }) => (outcome?.comboAfter ?? 0) >= 5 },
  {
    id: 'no_mistakes',
    icon: '🛡️',
    nameKey: 'ach.no_mistakes',
    descKey: 'ach.no_mistakes.desc',
    check: ({ run }) => (solo(run)?.bestCleanStreak ?? 0) >= 10,
  },
  {
    id: 'speed_demon',
    icon: '😈',
    nameKey: 'ach.speed_demon',
    descKey: 'ach.speed_demon.desc',
    check: ({ run }) => {
      const p = solo(run);
      return !!p && p.rounds >= 10 && p.average >= 85;
    },
  },
  {
    id: 'chaos_master',
    icon: '🌪️',
    nameKey: 'ach.chaos_master',
    descKey: 'ach.chaos_master.desc',
    check: ({ save, games }) => {
      const chaos = games.filter((g) => g.category === 'chaos');
      return chaos.length > 0 && chaos.every((g) => (save.gameBests[g.id] ?? 0) >= 50);
    },
  },
  { id: 'memory_machine', icon: '🧠', nameKey: 'ach.memory_machine', descKey: 'ach.memory_machine.desc', check: ({ save }) => save.memoryStreak >= 3 },
  { id: 'daily_devotee', icon: '📅', nameKey: 'ach.daily', descKey: 'ach.daily.desc', check: ({ run }) => run?.mode === 'daily' },
  { id: 'marathon', icon: '🏃', nameKey: 'ach.marathon', descKey: 'ach.marathon.desc', check: ({ run }) => run?.mode === 'endless' && (solo(run)?.rounds ?? 0) >= 20 },
  {
    id: 'lightning',
    icon: '⚡',
    nameKey: 'ach.lightning',
    descKey: 'ach.lightning.desc',
    check: ({ save }) => save.stats.fastestReactionMs !== null && save.stats.fastestReactionMs < 250,
  },
  { id: 'party_animal', icon: '🎉', nameKey: 'ach.party', descKey: 'ach.party.desc', check: ({ run }) => !!run && run.players.length > 1 },
  {
    id: 'collector',
    icon: '🗂️',
    nameKey: 'ach.collector',
    descKey: 'ach.collector.desc',
    check: ({ save, games }) => games.length > 0 && games.every((g) => (save.gamePlays[g.id] ?? 0) > 0),
  },
  { id: 'high_roller', icon: '💰', nameKey: 'ach.high_roller', descKey: 'ach.high_roller.desc', check: ({ run }) => (solo(run)?.points ?? 0) >= 5000 },
];

export class AchievementManager {
  constructor(private readonly defs: readonly AchievementDef[] = ACHIEVEMENTS) {}

  get all(): readonly AchievementDef[] {
    return this.defs;
  }

  /** Unlocks every newly satisfied achievement on the save and returns them. */
  evaluate(ctx: AchievementContext, now = Date.now()): AchievementDef[] {
    const unlocked: AchievementDef[] = [];
    for (const def of this.defs) {
      if (def.id in ctx.save.achievements) continue;
      let ok = false;
      try {
        ok = def.check(ctx);
      } catch (err) {
        console.error(`[Achievements] check "${def.id}" failed`, err);
      }
      if (ok) {
        ctx.save.achievements[def.id] = now;
        unlocked.push(def);
      }
    }
    return unlocked;
  }

  isUnlocked(save: SaveData, id: string): boolean {
    return id in save.achievements;
  }
}
