import type { ModeId, RunSummary } from '../gameplay/RunManager';
import { maxPointsPerRound } from '../gameplay/Scoring';
import type { LeaderboardEntry, SaveData } from '../progression/SaveData';

export type BoardId = 'global' | 'daily' | 'friends' | 'personal';

export interface ScoreSubmission {
  board: BoardId;
  mode: ModeId;
  name: string;
  points: number;
  rounds: number;
  /** Sum of normalized scores (0–100 each); used for plausibility checks. */
  scoreSum: number;
  dailyKey?: string | null;
}

export type SubmitResult = { ok: true; rank: number } | { ok: false; reason: string };

/**
 * Backend-agnostic leaderboard. The game only talks to this interface, so an
 * online implementation can replace the local one without touching gameplay.
 */
export interface LeaderboardService {
  readonly online: boolean;
  submit(entry: ScoreSubmission): Promise<SubmitResult>;
  top(board: BoardId, limit: number, key?: string): Promise<LeaderboardEntry[]>;
}

/** Rejects obviously impossible scores. A server implementation must repeat this check. */
export function validateSubmission(s: ScoreSubmission): string | null {
  if (!Number.isFinite(s.points) || s.points < 0) return 'invalid points';
  if (!Number.isInteger(s.rounds) || s.rounds < 1 || s.rounds > 500) return 'invalid rounds';
  if (s.scoreSum < 0 || s.scoreSum > s.rounds * 100) return 'impossible score sum';
  if (s.points > s.rounds * maxPointsPerRound()) return 'impossible points';
  return null;
}

export function submissionFromRun(run: RunSummary, name: string): ScoreSubmission | null {
  if (run.players.length !== 1) return null;
  const p = run.players[0];
  if (p.rounds === 0) return null;
  return {
    board: run.mode === 'daily' ? 'daily' : 'personal',
    mode: run.mode,
    name,
    points: p.points,
    rounds: p.rounds,
    scoreSum: p.scoreSum,
    dailyKey: run.dailyKey,
  };
}

const MAX_ENTRIES = 10;

/** Stores boards inside the local save. "Global" and "friends" stay empty until a backend exists. */
export class LocalLeaderboardService implements LeaderboardService {
  readonly online = false;

  constructor(private readonly getSave: () => SaveData, private readonly persist: () => void) {}

  private boardKey(board: BoardId, mode: string, key?: string | null): string {
    return board === 'daily' ? `daily:${key ?? ''}` : `${board}:${mode}`;
  }

  async submit(entry: ScoreSubmission): Promise<SubmitResult> {
    const problem = validateSubmission(entry);
    if (problem) return { ok: false, reason: problem };
    const save = this.getSave();
    const key = this.boardKey(entry.board, entry.mode, entry.dailyKey);
    const list = save.leaderboards[key] ?? [];
    const record: LeaderboardEntry = { name: entry.name.slice(0, 12), score: Math.round(entry.points), date: new Date().toISOString().slice(0, 10), mode: entry.mode };
    list.push(record);
    list.sort((a, b) => b.score - a.score);
    save.leaderboards[key] = list.slice(0, MAX_ENTRIES);
    this.persist();
    const rank = save.leaderboards[key].indexOf(record);
    return { ok: true, rank: rank >= 0 ? rank + 1 : list.indexOf(record) + 1 };
  }

  async top(board: BoardId, limit: number, key?: string): Promise<LeaderboardEntry[]> {
    const save = this.getSave();
    return (save.leaderboards[board === 'daily' ? `daily:${key ?? ''}` : `${board}:${key ?? 'quick'}`] ?? []).slice(0, limit);
  }
}
