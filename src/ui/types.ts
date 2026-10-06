import type { MiniGameDefinition } from '../gameplay/MiniGame';
import type { ModeId } from '../gameplay/RunManager';
import type { Progression } from '../progression/Progression';
import type { SaveData } from '../progression/SaveData';
import type { Settings } from '../progression/Settings';
import type { LeaderboardService } from '../services/Leaderboard';

export type MenuScreenId = 'MAIN_MENU' | 'MODE_SELECT' | 'SETTINGS' | 'STATS' | 'ACHIEVEMENTS';

/** Everything the UI may ask the game to do. The UI never mutates game state directly. */
export interface UIActions {
  startMode(mode: ModeId, players: number): void;
  openScreen(screen: MenuScreenId, mode?: ModeId): void;
  playAgain(): void;
  advance(): void;
  pause(): void;
  resume(): void;
  quitToMenu(): void;
  restartRun(): void;
  updateSettings(patch: Partial<Settings>): void;
  setPlayerName(name: string): void;
  resetProgress(): void;
  uiSound(name: 'click' | 'hover'): void;
}

/** Read-only data the UI renders from. */
export interface UIData {
  save(): SaveData;
  games(): readonly MiniGameDefinition[];
  progression: Progression;
  leaderboard: LeaderboardService;
  dailyKey(): string;
}
