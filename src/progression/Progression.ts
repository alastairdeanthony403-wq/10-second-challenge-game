import type { MiniGameDefinition } from '../gameplay/MiniGame';
import type { RoundOutcome, RunSummary } from '../gameplay/RunManager';
import { AchievementManager, type AchievementDef } from './Achievements';
import type { SaveData } from './SaveData';
import { UnlockManager, type UnlockResult } from './Unlocks';

export interface ChallengeProgress {
  newGameBest: boolean;
  previousBest: number;
  achievements: AchievementDef[];
}

export interface RunProgress {
  newBestScore: boolean;
  previousBest: number;
  newDailyBest: boolean;
  achievements: AchievementDef[];
  unlocks: UnlockResult;
  newTitle: string | null;
}

/** Applies gameplay results to persistent progress: stats, bests, achievements and unlocks. */
export class Progression {
  readonly achievements = new AchievementManager();
  readonly unlocks: UnlockManager;

  constructor(private readonly games: readonly MiniGameDefinition[]) {
    this.unlocks = new UnlockManager(games);
  }

  initialize(save: SaveData): void {
    this.unlocks.refresh(save);
  }

  recordChallenge(save: SaveData, def: MiniGameDefinition, outcome: RoundOutcome, countsForStats: boolean): ChallengeProgress {
    const previousBest = save.gameBests[def.id] ?? 0;
    const newGameBest = outcome.score > previousBest && previousBest > 0;
    if (countsForStats) {
      const s = save.stats;
      s.challengesPlayed++;
      if (outcome.failed) s.challengesFailed++;
      else s.challengesCompleted++;
      if (outcome.perfect) s.perfects++;
      s.totalScore += outcome.score;
      s.categoryPlays[def.category] = (s.categoryPlays[def.category] ?? 0) + 1;
      s.categoryScore[def.category] = (s.categoryScore[def.category] ?? 0) + outcome.score;
      const reaction = outcome.result.reactionMs;
      if (reaction && reaction > 0 && (s.fastestReactionMs === null || reaction < s.fastestReactionMs)) s.fastestReactionMs = reaction;
      save.gameBests[def.id] = Math.max(previousBest, outcome.score);
      save.gamePlays[def.id] = (save.gamePlays[def.id] ?? 0) + 1;
      save.bestCombo = Math.max(save.bestCombo, outcome.comboAfter);
      if (def.category === 'memory') save.memoryStreak = outcome.score >= 70 ? save.memoryStreak + 1 : 0;
    }
    const achievements = countsForStats ? this.achievements.evaluate({ save, games: this.games, outcome }) : [];
    return { newGameBest, previousBest, achievements };
  }

  recordRun(save: SaveData, run: RunSummary, titleOrder: readonly string[]): RunProgress {
    const solo = run.players.length === 1 ? run.players[0] : null;
    const previousBest = solo ? (save.bestScoreByMode[run.mode] ?? 0) : 0;
    let newBestScore = false;
    let newDailyBest = false;
    let newTitle: string | null = null;
    save.stats.gamesPlayed++;
    if (!solo) save.stats.multiplayerGames++;
    if (solo) {
      if (solo.points > previousBest) {
        newBestScore = previousBest > 0 || solo.points > 0;
        save.bestScoreByMode[run.mode] = solo.points;
      }
      save.bestScore = Math.max(save.bestScore, solo.points);
      if (run.mode === 'endless') save.stats.endlessBestRound = Math.max(save.stats.endlessBestRound, solo.rounds);
      if (run.mode === 'daily' && run.dailyKey) {
        const prevDaily = save.daily.key === run.dailyKey ? save.daily.score : 0;
        newDailyBest = solo.points > prevDaily;
        save.daily = {
          key: run.dailyKey,
          score: Math.max(prevDaily, solo.points),
          completed: true,
          best: Math.max(save.daily.best, solo.points),
          history: { ...save.daily.history, [run.dailyKey]: Math.max(prevDaily, solo.points) },
        };
        // Keep the last 30 days only.
        const keys = Object.keys(save.daily.history).sort();
        for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete save.daily.history[k];
      }
      if (!save.titles.includes(solo.rankKey) && solo.rounds >= 5) {
        save.titles.push(solo.rankKey);
        // Only announce titles better than any previously earned.
        const rank = titleOrder.indexOf(solo.rankKey);
        const bestPrev = Math.min(...save.titles.filter((t) => t !== solo.rankKey).map((t) => titleOrder.indexOf(t)).filter((i) => i >= 0), Infinity);
        if (rank >= 0 && rank < bestPrev) newTitle = solo.rankKey;
      }
    }
    const achievements = this.achievements.evaluate({ save, games: this.games, run });
    const unlocks = this.unlocks.refresh(save);
    return { newBestScore, previousBest, newDailyBest, achievements, unlocks, newTitle };
  }
}
