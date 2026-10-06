import { en } from './en';

export type Dictionary = Record<string, string>;

const locales: Record<string, Dictionary> = { en };
let active: Dictionary = en;
let activeId = 'en';
const missing = new Set<string>();

export function registerLocale(id: string, dict: Dictionary): void {
  locales[id] = dict;
}

export function setLocale(id: string): void {
  activeId = locales[id] ? id : 'en';
  active = locales[activeId];
}

export function getLocale(): string {
  return activeId;
}

export function availableLocales(): string[] {
  return Object.keys(locales);
}

/** Looks up a key with {param} interpolation. Falls back to English, then to the key itself. */
export function t(key: string, params?: Record<string, string | number>): string {
  let value = active[key] ?? en[key];
  if (value === undefined) {
    if (!missing.has(key)) {
      missing.add(key);
      console.warn(`[i18n] missing key "${key}"`);
    }
    value = key;
  }
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function hasKey(key: string): boolean {
  return key in en;
}
