type Level = 'debug' | 'info' | 'warn' | 'error';

const history: { level: Level; msg: string; time: number }[] = [];
const MAX_HISTORY = 200;

function push(level: Level, scope: string, args: unknown[]): void {
  const msg = `[${scope}] ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')}`;
  history.push({ level, msg, time: Date.now() });
  if (history.length > MAX_HISTORY) history.shift();
}

/** Scoped logger that also keeps a short in-memory history for the debug menu. */
export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => {
      push('debug', scope, args);
      if (import.meta.env?.DEV) console.debug(`[${scope}]`, ...args);
    },
    info: (...args: unknown[]) => {
      push('info', scope, args);
      console.info(`[${scope}]`, ...args);
    },
    warn: (...args: unknown[]) => {
      push('warn', scope, args);
      console.warn(`[${scope}]`, ...args);
    },
    error: (...args: unknown[]) => {
      push('error', scope, args);
      console.error(`[${scope}]`, ...args);
    },
  };
}

export function getLogHistory() {
  return history.slice();
}
