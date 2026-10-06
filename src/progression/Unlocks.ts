import type { MiniGameDefinition, UnlockRequirement } from '../gameplay/MiniGame';
import { THEMES } from '../render/Theme';
import type { SaveData } from './SaveData';

export function meetsRequirement(req: UnlockRequirement, save: SaveData): boolean {
  switch (req.type) {
    case 'none':
      return true;
    case 'runs':
      return save.stats.gamesPlayed >= req.count;
    case 'bestScore':
      return save.bestScore >= req.points;
    case 'achievement':
      return req.id in save.achievements;
  }
}

export interface UnlockResult {
  games: string[];
  themes: string[];
}

/** Applies unlock rules to the save; returns what became newly available. Never pay-to-win. */
export class UnlockManager {
  constructor(private readonly games: readonly MiniGameDefinition[]) {}

  refresh(save: SaveData): UnlockResult {
    const result: UnlockResult = { games: [], themes: [] };
    for (const g of this.games) {
      if (!save.unlockedGames.includes(g.id) && meetsRequirement(g.unlock, save)) {
        save.unlockedGames.push(g.id);
        if (g.unlock.type !== 'none') result.games.push(g.id);
      }
    }
    for (const t of THEMES) {
      if (!save.unlockedThemes.includes(t.id) && meetsRequirement(t.unlock, save)) {
        save.unlockedThemes.push(t.id);
        if (t.unlock.type !== 'none') result.themes.push(t.id);
      }
    }
    return result;
  }

  isGameUnlocked(save: SaveData, id: string): boolean {
    return save.unlockedGames.includes(id);
  }

  unlockedGames(save: SaveData): MiniGameDefinition[] {
    const list = this.games.filter((g) => save.unlockedGames.includes(g.id));
    return list.length > 0 ? list : this.games.filter((g) => g.unlock.type === 'none');
  }

  unlockEverything(save: SaveData): void {
    save.unlockedGames = this.games.map((g) => g.id);
    save.unlockedThemes = THEMES.map((t) => t.id);
  }
}
