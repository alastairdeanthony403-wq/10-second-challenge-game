import { createInputSnapshot, type Direction, type InputAction, type InputCapability, type InputSnapshot } from './InputTypes';

export interface InputCallbacks {
  /** Gameplay action (only emitted while gameplay input is enabled). */
  onAction: (action: InputAction) => void;
  onPause: () => void;
  onDebugToggle: () => void;
  /** Generic "advance" (tap / Space / Enter / A) used by intro & results screens. */
  onAdvance: () => void;
  onBack: () => void;
  /** First user gesture (needed to unlock audio). */
  onGesture: () => void;
}

export interface CoordinateMapper {
  toWorld(cssX: number, cssY: number): { x: number; y: number };
  worldSize: { width: number; height: number };
}

const CURSOR_SPEED = 1100;
const STICK_DEADZONE = 0.25;

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
};

/**
 * Unified input layer. Mouse, touch, keyboard and gamepad are translated into
 * abstract actions. When a game needs pointing but the player uses keys/pad,
 * a virtual cursor is driven by arrows/stick and Space/A clicks.
 */
export class InputManager {
  readonly snapshot: InputSnapshot = createInputSnapshot();
  private caps = new Set<InputCapability>();
  private gameplay = false;
  private heldDirs = new Set<Direction>();
  private padMove = { x: 0, y: 0 };
  private padButtons: boolean[] = [];
  private padDirs = new Set<Direction>();
  private cursor = { x: 0, y: 0 };
  private cursorActive = false;
  private cursorPressed = false;
  private gestureSeen = false;
  private detach: (() => void)[] = [];
  reverseX = false;

  constructor(
    private readonly surface: HTMLElement,
    private readonly mapper: CoordinateMapper,
    private readonly cb: InputCallbacks,
  ) {}

  attach(): void {
    const opts = { passive: false } as AddEventListenerOptions;
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.detach.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(this.surface, 'pointerdown', (e) => this.pointer('down', e));
    on(this.surface, 'pointermove', (e) => this.pointer('move', e));
    on(this.surface, 'pointerup', (e) => this.pointer('up', e));
    on(this.surface, 'pointercancel', (e) => this.pointer('up', e));
    on(this.surface, 'contextmenu', (e) => e.preventDefault());
    on(window, 'keydown', (e) => this.key(e as KeyboardEvent, true));
    on(window, 'keyup', (e) => this.key(e as KeyboardEvent, false));
    on(window, 'blur', () => this.releaseAll());
    const gesture = () => this.gesture();
    window.addEventListener('pointerdown', gesture, true);
    window.addEventListener('keydown', gesture, true);
    this.detach.push(() => window.removeEventListener('pointerdown', gesture, true));
    this.detach.push(() => window.removeEventListener('keydown', gesture, true));
  }

  dispose(): void {
    for (const fn of this.detach) fn();
    this.detach = [];
  }

  /** Configure for a mini-game's declared capabilities and enable/disable gameplay routing. */
  configure(caps: readonly InputCapability[] | null): void {
    this.caps = new Set(caps ?? []);
    this.gameplay = caps !== null;
    this.releaseAll();
    const w = this.mapper.worldSize;
    this.cursor = { x: w.width / 2, y: w.height / 2 };
    this.cursorActive = false;
  }

  get gameplayEnabled(): boolean {
    return this.gameplay;
  }

  get virtualCursor(): { x: number; y: number } | null {
    return this.gameplay && this.cursorActive && this.usesCursor ? this.cursor : null;
  }

  private get usesCursor(): boolean {
    return this.caps.has('pointer') && !this.caps.has('move');
  }

  private gesture(): void {
    if (this.gestureSeen) {
      this.cb.onGesture();
      return;
    }
    this.gestureSeen = true;
    this.cb.onGesture();
  }

  private emit(action: InputAction): void {
    if (!this.gameplay) return;
    this.cb.onAction(this.transform(action));
  }

  /** Applies REVERSE CONTROLS by mirroring horizontally. */
  private transform(action: InputAction): InputAction {
    if (!this.reverseX) return action;
    const w = this.mapper.worldSize.width;
    switch (action.type) {
      case 'pointerDown':
      case 'pointerMove':
      case 'pointerUp':
        return { ...action, x: w - action.x };
      case 'direction':
        return action.dir === 'left' ? { type: 'direction', dir: 'right' } : action.dir === 'right' ? { type: 'direction', dir: 'left' } : action;
      default:
        return action;
    }
  }

  private pointer(kind: 'down' | 'move' | 'up', e: PointerEvent): void {
    const rect = this.surface.getBoundingClientRect();
    const world = this.mapper.toWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (kind === 'down') {
      e.preventDefault();
      try {
        this.surface.setPointerCapture(e.pointerId);
      } catch {
        /* some browsers reject capture for synthetic events */
      }
    }
    this.cursorActive = false;
    const mirrored = this.reverseX ? { x: this.mapper.worldSize.width - world.x, y: world.y } : world;
    this.snapshot.pointer = mirrored;
    if (kind === 'down') {
      this.snapshot.pointerDown = true;
      if (!this.gameplay) this.cb.onAdvance();
      this.emit({ type: 'pointerDown', x: world.x, y: world.y, id: e.pointerId });
    } else if (kind === 'move') {
      this.emit({ type: 'pointerMove', x: world.x, y: world.y, id: e.pointerId, pressed: e.buttons > 0 || this.snapshot.pointerDown });
    } else {
      this.snapshot.pointerDown = false;
      this.emit({ type: 'pointerUp', x: world.x, y: world.y, id: e.pointerId });
    }
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    const target = e.target as HTMLElement | null;
    const typingInField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (typingInField) return;

    if (down && (code === 'Escape' || code === 'KeyP') && !(this.gameplay && this.caps.has('text') && code === 'KeyP')) {
      e.preventDefault();
      if (!e.repeat) this.cb.onPause();
      return;
    }
    if (down && code === 'Backquote') {
      this.cb.onDebugToggle();
      return;
    }
    if (!this.gameplay) {
      if (down && !e.repeat && (code === 'Space' || code === 'Enter') && !(target instanceof HTMLButtonElement)) this.cb.onAdvance();
      if (down && code === 'Backspace') this.cb.onBack();
      return;
    }

    // --- Gameplay routing ---
    const textMode = this.caps.has('text');
    if (textMode && down && !e.repeat && e.key.length === 1 && /[a-z]/i.test(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.emit({ type: 'text', char: e.key.toUpperCase() });
      return;
    }
    const dir = KEY_DIRECTIONS[code];
    if (dir && !(textMode && code.startsWith('Key'))) {
      e.preventDefault();
      if (down) {
        if (!e.repeat && this.caps.has('direction')) this.emit({ type: 'direction', dir });
        this.heldDirs.add(dir);
        if (this.usesCursor) this.cursorActive = true;
      } else {
        this.heldDirs.delete(dir);
      }
      this.recomputeMove();
      return;
    }
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
      e.preventDefault();
      if (e.repeat) return;
      this.pressPrimary(down);
      return;
    }
    if (down && !e.repeat && /^(Digit|Numpad)[1-9]$/.test(code) && this.caps.has('choice')) {
      this.emit({ type: 'choice', index: Number(code.slice(-1)) - 1 });
      return;
    }
    if (down && !e.repeat && (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyX') && !textMode) {
      this.emit({ type: 'secondary' });
    }
  }

  private pressPrimary(down: boolean): void {
    this.snapshot.primaryHeld = down;
    if (this.caps.has('primary')) {
      if (down) this.emit({ type: 'primary' });
      return;
    }
    if (this.usesCursor || this.caps.has('pointer')) {
      // Space/A act as a click at the virtual cursor.
      this.cursorActive = true;
      const { x, y } = this.cursor;
      if (down && !this.cursorPressed) {
        this.cursorPressed = true;
        this.snapshot.pointer = { x, y };
        this.emit({ type: 'pointerDown', x, y, id: -1 });
      } else if (!down && this.cursorPressed) {
        this.cursorPressed = false;
        this.emit({ type: 'pointerUp', x, y, id: -1 });
      }
    }
  }

  private recomputeMove(): void {
    const kx = (this.heldDirs.has('right') ? 1 : 0) - (this.heldDirs.has('left') ? 1 : 0);
    const ky = (this.heldDirs.has('down') ? 1 : 0) - (this.heldDirs.has('up') ? 1 : 0);
    let x = Math.max(-1, Math.min(1, kx + this.padMove.x));
    const y = Math.max(-1, Math.min(1, ky + this.padMove.y));
    if (this.reverseX) x = -x;
    if (this.caps.has('move')) {
      this.snapshot.move.x = x;
      this.snapshot.move.y = y;
    } else {
      this.snapshot.move.x = 0;
      this.snapshot.move.y = 0;
    }
  }

  private releaseAll(): void {
    this.heldDirs.clear();
    this.padDirs.clear();
    this.padMove = { x: 0, y: 0 };
    this.snapshot.move.x = 0;
    this.snapshot.move.y = 0;
    this.snapshot.pointerDown = false;
    this.snapshot.primaryHeld = false;
    this.cursorPressed = false;
  }

  /** Per-frame: gamepad polling and virtual cursor motion. */
  update(dt: number): void {
    this.pollGamepad();
    if (!this.gameplay || !this.usesCursor || !this.cursorActive) return;
    const kx = (this.heldDirs.has('right') ? 1 : 0) - (this.heldDirs.has('left') ? 1 : 0) + this.padMove.x;
    const ky = (this.heldDirs.has('down') ? 1 : 0) - (this.heldDirs.has('up') ? 1 : 0) + this.padMove.y;
    if (kx === 0 && ky === 0) return;
    const w = this.mapper.worldSize;
    this.cursor.x = Math.max(0, Math.min(w.width, this.cursor.x + Math.max(-1, Math.min(1, kx)) * CURSOR_SPEED * dt));
    this.cursor.y = Math.max(0, Math.min(w.height, this.cursor.y + Math.max(-1, Math.min(1, ky)) * CURSOR_SPEED * dt));
    this.snapshot.pointer = { ...this.cursor };
    this.emit({ type: 'pointerMove', x: this.cursor.x, y: this.cursor.y, id: -1, pressed: this.cursorPressed });
  }

  private pollGamepad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads ?? []).find((p) => p && p.connected);
    if (!pad) return;
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const edge = (i: number) => pressed(i) && !this.padButtons[i];
    const ax = Math.abs(pad.axes[0] ?? 0) > STICK_DEADZONE ? pad.axes[0] : 0;
    const ay = Math.abs(pad.axes[1] ?? 0) > STICK_DEADZONE ? pad.axes[1] : 0;
    const dx = (pressed(15) ? 1 : 0) - (pressed(14) ? 1 : 0);
    const dy = (pressed(13) ? 1 : 0) - (pressed(12) ? 1 : 0);
    const prevMove = this.padMove;
    this.padMove = { x: Math.max(-1, Math.min(1, ax + dx)), y: Math.max(-1, Math.min(1, ay + dy)) };
    if (pressed(9) && !this.padButtons[9]) this.cb.onPause();

    if (this.gameplay) {
      if (this.padMove.x !== 0 || this.padMove.y !== 0) this.cursorActive = this.usesCursor || this.cursorActive;
      if (prevMove.x !== this.padMove.x || prevMove.y !== this.padMove.y) this.recomputeMove();
      if (this.caps.has('direction')) {
        const dirs: [Direction, boolean][] = [
          ['left', this.padMove.x < -0.5],
          ['right', this.padMove.x > 0.5],
          ['up', this.padMove.y < -0.5],
          ['down', this.padMove.y > 0.5],
        ];
        for (const [dir, active] of dirs) {
          if (active && !this.padDirs.has(dir)) this.emit({ type: 'direction', dir });
          if (active) this.padDirs.add(dir);
          else this.padDirs.delete(dir);
        }
      }
      if (edge(0)) this.pressPrimary(true);
      else if (!pressed(0) && this.padButtons[0]) this.pressPrimary(false);
      if (edge(1) || edge(2)) this.emit({ type: 'secondary' });
    } else {
      // Menu navigation: move focus between buttons; A activates; B goes back.
      const navUp = dy < 0 || ay < -0.5;
      const navDown = dy > 0 || ay > 0.5;
      const wasUp = prevMove.y < -0.5;
      const wasDown = prevMove.y > 0.5;
      if (navDown && !wasDown) moveFocus(1);
      if (navUp && !wasUp) moveFocus(-1);
      if (edge(0)) {
        const el = document.activeElement as HTMLElement | null;
        if (el && el !== document.body && typeof el.click === 'function') el.click();
        else this.cb.onAdvance();
      }
      if (edge(1)) this.cb.onBack();
    }
    this.padButtons = pad.buttons.map((b) => b.pressed);
  }
}

/** Moves keyboard focus among visible buttons in the topmost open screen. */
export function moveFocus(delta: number): void {
  const screens = Array.from(document.querySelectorAll<HTMLElement>('.screen.visible'));
  const scope = screens[screens.length - 1] ?? document.body;
  const focusables = Array.from(scope.querySelectorAll<HTMLElement>('button:not([disabled]), input, select')).filter((el) => el.offsetParent !== null);
  if (focusables.length === 0) return;
  const idx = focusables.indexOf(document.activeElement as HTMLElement);
  const next = focusables[(idx + delta + focusables.length) % focusables.length];
  next.focus();
}
