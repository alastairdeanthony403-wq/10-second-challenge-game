export enum GameState {
  BOOT = 'BOOT',
  MAIN_MENU = 'MAIN_MENU',
  MODE_SELECT = 'MODE_SELECT',
  SETTINGS = 'SETTINGS',
  STATS = 'STATS',
  ACHIEVEMENTS = 'ACHIEVEMENTS',
  CHALLENGE_INTRO = 'CHALLENGE_INTRO',
  COUNTDOWN = 'COUNTDOWN',
  CHALLENGE_ACTIVE = 'CHALLENGE_ACTIVE',
  CHALLENGE_RESULTS = 'CHALLENGE_RESULTS',
  ROUND_TRANSITION = 'ROUND_TRANSITION',
  PLAYER_HANDOFF = 'PLAYER_HANDOFF',
  RUN_RESULTS = 'RUN_RESULTS',
  PAUSED = 'PAUSED',
}

const S = GameState;

const MENU_STATES = [S.MAIN_MENU, S.MODE_SELECT, S.SETTINGS, S.STATS, S.ACHIEVEMENTS];

/** Every legal edge in the state graph. Anything else is rejected. */
export const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  [S.BOOT]: [S.MAIN_MENU],
  [S.MAIN_MENU]: [S.MODE_SELECT, S.SETTINGS, S.STATS, S.ACHIEVEMENTS, S.CHALLENGE_INTRO, S.PLAYER_HANDOFF],
  [S.MODE_SELECT]: [S.MAIN_MENU, S.CHALLENGE_INTRO, S.PLAYER_HANDOFF],
  [S.SETTINGS]: MENU_STATES,
  [S.STATS]: MENU_STATES,
  [S.ACHIEVEMENTS]: MENU_STATES,
  [S.PLAYER_HANDOFF]: [S.CHALLENGE_INTRO, S.PAUSED, S.MAIN_MENU],
  [S.CHALLENGE_INTRO]: [S.COUNTDOWN, S.PAUSED, S.MAIN_MENU],
  [S.COUNTDOWN]: [S.CHALLENGE_ACTIVE, S.PAUSED, S.MAIN_MENU, S.CHALLENGE_INTRO],
  [S.CHALLENGE_ACTIVE]: [S.CHALLENGE_RESULTS, S.PAUSED, S.MAIN_MENU, S.CHALLENGE_INTRO],
  [S.CHALLENGE_RESULTS]: [S.ROUND_TRANSITION, S.RUN_RESULTS, S.PAUSED, S.MAIN_MENU, S.CHALLENGE_INTRO],
  [S.ROUND_TRANSITION]: [S.CHALLENGE_INTRO, S.PLAYER_HANDOFF, S.RUN_RESULTS, S.MAIN_MENU],
  [S.RUN_RESULTS]: [S.MAIN_MENU, S.CHALLENGE_INTRO, S.PLAYER_HANDOFF, S.ACHIEVEMENTS],
  // PAUSED may only return to the state it interrupted (enforced by the machine) or quit.
  [S.PAUSED]: [S.PLAYER_HANDOFF, S.CHALLENGE_INTRO, S.COUNTDOWN, S.CHALLENGE_ACTIVE, S.CHALLENGE_RESULTS, S.MAIN_MENU],
};

export const PAUSABLE_STATES: readonly GameState[] = [
  S.PLAYER_HANDOFF,
  S.CHALLENGE_INTRO,
  S.COUNTDOWN,
  S.CHALLENGE_ACTIVE,
  S.CHALLENGE_RESULTS,
];

export interface StateChange {
  from: GameState;
  to: GameState;
}

/**
 * Central finite-state machine. Rejects illegal or duplicate transitions so
 * contradictory states (results firing twice, input after time-up, ...) can't occur.
 */
export class StateMachine {
  private current: GameState = S.BOOT;
  private resumeTarget: GameState | null = null;
  private listeners = new Set<(change: StateChange) => void>();
  /** Increments on every transition; scheduled callbacks compare against it to detect staleness. */
  private epoch = 0;

  get state(): GameState {
    return this.current;
  }

  get stateEpoch(): number {
    return this.epoch;
  }

  get pausedFrom(): GameState | null {
    return this.resumeTarget;
  }

  is(...states: GameState[]): boolean {
    return states.includes(this.current);
  }

  canTransition(to: GameState): boolean {
    if (to === this.current) return false;
    if (!TRANSITIONS[this.current].includes(to)) return false;
    if (this.current === S.PAUSED && to !== S.MAIN_MENU) return to === this.resumeTarget;
    if (to === S.PAUSED) return PAUSABLE_STATES.includes(this.current);
    return true;
  }

  transition(to: GameState): boolean {
    if (!this.canTransition(to)) return false;
    const from = this.current;
    if (to === S.PAUSED) this.resumeTarget = from;
    else if (from === S.PAUSED) this.resumeTarget = null;
    this.current = to;
    this.epoch++;
    for (const listener of [...this.listeners]) listener({ from, to });
    return true;
  }

  pause(): boolean {
    return this.transition(S.PAUSED);
  }

  resume(): boolean {
    if (this.current !== S.PAUSED || !this.resumeTarget) return false;
    return this.transition(this.resumeTarget);
  }

  onChange(listener: (change: StateChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
