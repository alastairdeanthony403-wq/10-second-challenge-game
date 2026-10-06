import { Random, dateKey, dateSeed } from '../core/Random';
import { AdaptiveDifficulty, Difficulty, rampDifficulty } from './Difficulty';
import type { MiniGameDefinition } from './MiniGame';
import { MiniGameSelector } from './MiniGameSelector';
import { MODIFIERS, rollModifier, type ModifierId } from './Modifiers';
import {
  PASS_THRESHOLD,
  computePoints,
  nextCombo,
  normalizeScore,
  rankFor,
  ratingFor,
  type PointsBreakdown,
  type Rating,
  type ScoreResult,
} from './Scoring';

export type ModeId = 'quick' | 'endless' | 'daily' | 'duel' | 'party';

export interface ModeConfig {
  id: ModeId;
  nameKey: string;
  descKey: string;
  icon: string;
  /** null = unlimited (ends by lives). */
  rounds: number | null;
  lives: number | null;
  minPlayers: number;
  maxPlayers: number;
  adaptive: boolean;
  /** Daily uses every mini-game so all players get the identical sequence. */
  allGames: boolean;
  modifiers: boolean;
  allowPause: boolean;
}

export const MAX_ENDLESS_ROUNDS = 200;

export const MODES: Record<ModeId, ModeConfig> = {
  quick: { id: 'quick', nameKey: 'mode.quick', descKey: 'mode.quick.desc', icon: '▶', rounds: 10, lives: null, minPlayers: 1, maxPlayers: 1, adaptive: true, allGames: false, modifiers: true, allowPause: true },
  endless: { id: 'endless', nameKey: 'mode.endless', descKey: 'mode.endless.desc', icon: '∞', rounds: null, lives: 3, minPlayers: 1, maxPlayers: 1, adaptive: false, allGames: false, modifiers: true, allowPause: true },
  daily: { id: 'daily', nameKey: 'mode.daily', descKey: 'mode.daily.desc', icon: '📅', rounds: 10, lives: null, minPlayers: 1, maxPlayers: 1, adaptive: false, allGames: true, modifiers: true, allowPause: true },
  duel: { id: 'duel', nameKey: 'mode.duel', descKey: 'mode.duel.desc', icon: '⚔', rounds: 5, lives: null, minPlayers: 2, maxPlayers: 2, adaptive: false, allGames: false, modifiers: false, allowPause: true },
  party: { id: 'party', nameKey: 'mode.party', descKey: 'mode.party.desc', icon: '🎉', rounds: 5, lives: null, minPlayers: 2, maxPlayers: 4, adaptive: false, allGames: false, modifiers: true, allowPause: true },
};

export interface ChallengeSpec {
  def: MiniGameDefinition;
  difficulty: Difficulty;
  modifier: ModifierId | null;
  seed: number;
  roundIndex: number;
}

export interface RoundRecord {
  gameId: string;
  category: string;
  score: number;
  rating: Rating;
  points: number;
  modifier: ModifierId | null;
  difficulty: Difficulty;
}

export interface PlayerState {
  name: string;
  points: number;
  scoreSum: number;
  combo: number;
  bestCombo: number;
  perfects: number;
  completed: number;
  failed: number;
  lives: number | null;
  rounds: RoundRecord[];
  bestReactionMs: number | null;
  /** Consecutive non-failed challenges in this run. */
  cleanStreak: number;
  bestCleanStreak: number;
}

export interface RoundOutcome {
  playerIndex: number;
  result: ScoreResult;
  score: number;
  rating: Rating;
  perfect: boolean;
  failed: boolean;
  points: PointsBreakdown;
  comboBefore: number;
  comboAfter: number;
  comboBroken: boolean;
  lostLife: boolean;
  livesLeft: number | null;
}

export interface PlayerSummary {
  name: string;
  points: number;
  scoreSum: number;
  maxScore: number;
  average: number;
  rankKey: string;
  bestCombo: number;
  perfects: number;
  completed: number;
  failed: number;
  rounds: number;
  bestCleanStreak: number;
  bestReactionMs: number | null;
}

export interface RunSummary {
  mode: ModeId;
  players: PlayerSummary[];
  winnerIndex: number | null;
  dailyKey: string | null;
  records: RoundRecord[][];
}

export interface RunOptions {
  /** Pool of mini-games available (already filtered by unlocks unless the mode needs all). */
  pool: readonly MiniGameDefinition[];
  players?: number;
  playerNames?: string[];
  seed?: number;
  date?: Date;
  /** Player preference; adaptive difficulty only applies when the mode allows it too. */
  adaptive?: boolean;
  /** Debug override: fixed difficulty for every round. */
  forcedDifficulty?: Difficulty | null;
}

/** Owns everything about a single run: selection, difficulty, combo, lives and results. */
export class Run {
  readonly mode: ModeConfig;
  readonly players: PlayerState[];
  readonly dailyKey: string | null;
  private readonly rng: Random;
  private readonly selector: MiniGameSelector;
  private readonly adaptive = new AdaptiveDifficulty();
  private roundIndex = 0;
  private playerIndex = 0;
  private current: ChallengeSpec | null = null;
  private lastModifier: ModifierId | null = null;
  private forcedNext: MiniGameDefinition | null = null;
  private readonly adaptiveEnabled: boolean;
  forcedDifficulty: Difficulty | null;

  constructor(modeId: ModeId, options: RunOptions) {
    this.mode = MODES[modeId];
    const count = Math.max(this.mode.minPlayers, Math.min(this.mode.maxPlayers, options.players ?? this.mode.minPlayers));
    const date = options.date ?? new Date();
    this.dailyKey = modeId === 'daily' ? dateKey(date) : null;
    const seed = modeId === 'daily' ? dateSeed(date) : (options.seed ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)));
    this.rng = new Random(seed);
    // Sort by id so a seeded selection is identical regardless of registration order.
    const pool = [...options.pool].sort((a, b) => a.id.localeCompare(b.id));
    this.selector = new MiniGameSelector(pool, this.rng);
    this.forcedDifficulty = options.forcedDifficulty ?? null;
    this.adaptiveEnabled = this.mode.adaptive && (options.adaptive ?? true);
    this.players = Array.from({ length: count }, (_, i) => ({
      name: options.playerNames?.[i] ?? `P${i + 1}`,
      points: 0,
      scoreSum: 0,
      combo: 0,
      bestCombo: 0,
      perfects: 0,
      completed: 0,
      failed: 0,
      lives: this.mode.lives,
      rounds: [],
      bestReactionMs: null,
      cleanStreak: 0,
      bestCleanStreak: 0,
    }));
  }

  get round(): number {
    return this.roundIndex;
  }

  /** 1-based round shown in the HUD: the current round, or the one just finished during results. */
  get displayRound(): number {
    return Math.max(1, this.current ? this.roundIndex + 1 : this.roundIndex);
  }

  get activePlayerIndex(): number {
    return this.playerIndex;
  }

  get activePlayer(): PlayerState {
    return this.players[this.playerIndex];
  }

  get challenge(): ChallengeSpec | null {
    return this.current;
  }

  get isMultiplayer(): boolean {
    return this.players.length > 1;
  }

  get totalRounds(): number | null {
    return this.mode.rounds;
  }

  /** Debug: make the next challenge a specific game. */
  forceNext(def: MiniGameDefinition): void {
    this.forcedNext = def;
  }

  /** Swaps the current challenge's game (used when a mini-game fails to load). */
  replaceCurrentGame(def: MiniGameDefinition): void {
    if (this.current) this.current = { ...this.current, def, modifier: null };
  }

  /** Creates the challenge for the current round (shared by every player in that round). */
  prepareChallenge(): ChallengeSpec {
    if (this.current) return this.current;
    const def = this.forcedNext ?? this.selector.next();
    if (this.forcedNext) {
      this.selector.remember(def);
      this.forcedNext = null;
    }
    const base = rampDifficulty(this.roundIndex, this.mode.rounds);
    const difficulty = this.forcedDifficulty ?? (this.adaptiveEnabled ? this.adaptive.apply(base) : base);
    const modifier = this.mode.modifiers ? rollModifier(this.rng, this.roundIndex, this.lastModifier, def.modifiers) : null;
    this.lastModifier = modifier;
    this.current = { def, difficulty, modifier, seed: this.rng.seed(), roundIndex: this.roundIndex };
    return this.current;
  }

  /** Records the active player's result and advances turn order. */
  recordResult(result: ScoreResult): RoundOutcome {
    const spec = this.current;
    if (!spec) throw new Error('recordResult called without an active challenge');
    const player = this.players[this.playerIndex];
    const score = normalizeScore(result.score);
    const rating = ratingFor(score);
    const failed = score < PASS_THRESHOLD;
    const comboBefore = player.combo;
    const comboAfter = nextCombo(comboBefore, score);
    const mod = spec.modifier ? MODIFIERS[spec.modifier] : null;
    const points = computePoints(score, comboAfter, (mod?.pointsMultiplier ?? 1) * spec.def.scoreMultiplier, mod?.perfectBonus);

    player.combo = comboAfter;
    player.bestCombo = Math.max(player.bestCombo, comboAfter);
    player.points += points.total;
    player.scoreSum += score;
    if (score >= 100) player.perfects++;
    if (failed) {
      player.failed++;
      player.cleanStreak = 0;
    } else {
      player.completed++;
      player.cleanStreak++;
      player.bestCleanStreak = Math.max(player.bestCleanStreak, player.cleanStreak);
    }
    if (result.reactionMs && result.reactionMs > 0) {
      player.bestReactionMs = player.bestReactionMs === null ? result.reactionMs : Math.min(player.bestReactionMs, result.reactionMs);
    }
    let lostLife = false;
    if (failed && player.lives !== null) {
      player.lives = Math.max(0, player.lives - 1);
      lostLife = true;
    }
    player.rounds.push({ gameId: spec.def.id, category: spec.def.category, score, rating, points: points.total, modifier: spec.modifier, difficulty: spec.difficulty });
    if (this.adaptiveEnabled && !this.isMultiplayer) this.adaptive.record(score);

    const outcome: RoundOutcome = {
      playerIndex: this.playerIndex,
      result,
      score,
      rating,
      perfect: score >= 100,
      failed,
      points,
      comboBefore,
      comboAfter,
      comboBroken: comboBefore > 0 && comboAfter === 0,
      lostLife,
      livesLeft: player.lives,
    };

    this.playerIndex++;
    if (this.playerIndex >= this.players.length) {
      this.playerIndex = 0;
      this.roundIndex++;
      this.current = null;
    }
    return outcome;
  }

  /** True when other players still need to play the current round's challenge. */
  get awaitingNextPlayer(): boolean {
    return this.current !== null && this.playerIndex > 0;
  }

  isOver(): boolean {
    if (this.awaitingNextPlayer) return false;
    if (this.mode.lives !== null && this.players.every((p) => (p.lives ?? 1) <= 0)) return true;
    if (this.mode.rounds !== null) return this.roundIndex >= this.mode.rounds;
    return this.roundIndex >= MAX_ENDLESS_ROUNDS;
  }

  summary(): RunSummary {
    const players = this.players.map<PlayerSummary>((p) => {
      const rounds = p.rounds.length;
      const average = rounds ? p.scoreSum / rounds : 0;
      return {
        name: p.name,
        points: p.points,
        scoreSum: p.scoreSum,
        maxScore: rounds * 100,
        average,
        rankKey: rankFor(average),
        bestCombo: p.bestCombo,
        perfects: p.perfects,
        completed: p.completed,
        failed: p.failed,
        rounds,
        bestCleanStreak: p.bestCleanStreak,
        bestReactionMs: p.bestReactionMs,
      };
    });
    let winnerIndex: number | null = null;
    if (players.length > 1) {
      const best = Math.max(...players.map((p) => p.points));
      const leaders = players.map((p, i) => (p.points === best ? i : -1)).filter((i) => i >= 0);
      winnerIndex = leaders.length === 1 ? leaders[0] : null;
    }
    return { mode: this.mode.id, players, winnerIndex, dailyKey: this.dailyKey, records: this.players.map((p) => p.rounds.slice()) };
  }
}
