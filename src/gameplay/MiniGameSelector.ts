import type { Random } from '../core/Random';
import type { Category, MiniGameDefinition } from './MiniGame';

export interface SelectorOptions {
  /** How many recent games are excluded (shrinks automatically for small pools). */
  historySize: number;
  /** How many recent categories are avoided. */
  categoryHistory: number;
}

const DEFAULTS: SelectorOptions = { historySize: 5, categoryHistory: 2 };

/**
 * Controlled randomness: weighted picks that avoid recently played games and
 * categories, with progressive relaxation so selection never fails.
 */
export class MiniGameSelector {
  private recentGames: string[] = [];
  private recentCategories: Category[] = [];
  private readonly options: SelectorOptions;

  constructor(
    private pool: readonly MiniGameDefinition[],
    private readonly rng: Random,
    options: Partial<SelectorOptions> = {},
  ) {
    if (pool.length === 0) throw new Error('MiniGameSelector needs at least one mini-game');
    this.options = { ...DEFAULTS, ...options };
  }

  get history(): readonly string[] {
    return this.recentGames;
  }

  setPool(pool: readonly MiniGameDefinition[]): void {
    if (pool.length > 0) this.pool = pool;
  }

  next(): MiniGameDefinition {
    const gameWindow = Math.min(this.options.historySize, Math.max(0, this.pool.length - 2));
    const blockedGames = new Set(this.recentGames.slice(-gameWindow));
    const lastGame = this.recentGames[this.recentGames.length - 1];
    const categoryCount = new Set(this.pool.map((d) => d.category)).size;
    const catWindow = Math.min(this.options.categoryHistory, Math.max(0, categoryCount - 1));
    const blockedCats = new Set(this.recentCategories.slice(-catWindow));

    const tiers: ((d: MiniGameDefinition) => boolean)[] = [
      (d) => !blockedGames.has(d.id) && !blockedCats.has(d.category),
      (d) => !blockedGames.has(d.id) && d.category !== this.recentCategories[this.recentCategories.length - 1],
      (d) => !blockedGames.has(d.id),
      (d) => d.id !== lastGame,
      () => true,
    ];
    let candidates: MiniGameDefinition[] = [];
    for (const tier of tiers) {
      candidates = this.pool.filter(tier);
      if (candidates.length > 0) break;
    }
    const pick = this.rng.weighted(candidates, (d) => d.weight);
    this.remember(pick);
    return pick;
  }

  /** Force-selects a specific game (debug menu) while keeping history consistent. */
  remember(def: MiniGameDefinition): void {
    this.recentGames.push(def.id);
    this.recentCategories.push(def.category);
    const keep = Math.max(this.options.historySize, this.options.categoryHistory) + 1;
    if (this.recentGames.length > keep) this.recentGames.shift();
    if (this.recentCategories.length > keep) this.recentCategories.shift();
  }

  reset(): void {
    this.recentGames = [];
    this.recentCategories = [];
  }
}
