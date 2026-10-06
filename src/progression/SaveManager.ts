import { createLogger } from '../core/Logger';
import { defaultSave, sanitizeSave, type SaveData } from './SaveData';

const log = createLogger('Save');

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageAdapter {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** localStorage when available; falls back to memory (private mode, blocked storage, SSR). */
export function createBrowserStorage(): StorageAdapter {
  try {
    const ls = globalThis.localStorage;
    const probe = '__tsc_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    log.warn('localStorage unavailable; progress will not persist this session.');
    return new MemoryStorage();
  }
}

export const SAVE_KEY = 'ten-second-challenge.save';
export const BACKUP_KEY = 'ten-second-challenge.save.corrupt';

export type LoadStatus = 'new' | 'loaded' | 'recovered';

/** Loads, validates, migrates and persists the player's save. Never throws. */
export class SaveManager {
  private current: SaveData;
  private status: LoadStatus = 'new';

  constructor(private readonly storage: StorageAdapter, private readonly prefersReducedMotion = false) {
    this.current = defaultSave(prefersReducedMotion);
  }

  get data(): SaveData {
    return this.current;
  }

  get loadStatus(): LoadStatus {
    return this.status;
  }

  load(): SaveData {
    let text: string | null = null;
    try {
      text = this.storage.getItem(SAVE_KEY);
    } catch (err) {
      log.error('Failed to read save', err);
    }
    if (text === null) {
      this.current = defaultSave(this.prefersReducedMotion);
      this.status = 'new';
      return this.current;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('save is not an object');
      this.current = sanitizeSave(parsed);
      this.status = 'loaded';
    } catch (err) {
      log.warn('Save data corrupted; starting fresh and keeping a backup.', err);
      try {
        this.storage.setItem(BACKUP_KEY, text);
      } catch {
        /* ignore — backup is best effort */
      }
      this.current = defaultSave(this.prefersReducedMotion);
      this.status = 'recovered';
    }
    return this.current;
  }

  save(): boolean {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.current));
      return true;
    } catch (err) {
      log.error('Failed to write save', err);
      return false;
    }
  }

  update(mutator: (data: SaveData) => void): void {
    mutator(this.current);
    this.save();
  }

  reset(): void {
    const settings = this.current.settings;
    this.current = defaultSave(this.prefersReducedMotion);
    this.current.settings = settings;
    this.save();
  }
}
