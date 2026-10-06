import { createLogger } from '../core/Logger';
import { CHALLENGE_DURATION } from '../core/Timer';
import type { MiniGameDefinition } from './MiniGame';

const log = createLogger('Registry');

/** Holds every mini-game definition. Validates them once so bad content can't break a run. */
export class MiniGameRegistry {
  private defs = new Map<string, MiniGameDefinition>();

  register(def: MiniGameDefinition): boolean {
    const problems: string[] = [];
    if (!def.id) problems.push('missing id');
    if (this.defs.has(def.id)) problems.push(`duplicate id "${def.id}"`);
    if (typeof def.create !== 'function') problems.push('missing create()');
    if (!(def.weight > 0)) problems.push('weight must be > 0');
    if (problems.length) {
      log.error(`Rejected mini-game ${def.id || '(unknown)'}: ${problems.join(', ')}`);
      return false;
    }
    // Every challenge is capped at 10 seconds; this is the game's defining rule.
    const timeLimit = Math.min(CHALLENGE_DURATION, def.timeLimit > 0 ? def.timeLimit : CHALLENGE_DURATION);
    this.defs.set(def.id, { ...def, timeLimit, scoreMultiplier: def.scoreMultiplier > 0 ? def.scoreMultiplier : 1 });
    return true;
  }

  registerAll(defs: readonly MiniGameDefinition[]): void {
    for (const def of defs) this.register(def);
  }

  get(id: string): MiniGameDefinition | undefined {
    return this.defs.get(id);
  }

  all(): MiniGameDefinition[] {
    return [...this.defs.values()];
  }

  get size(): number {
    return this.defs.size;
  }
}
