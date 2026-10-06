import { el } from './dom';

/** Base for full-screen overlays. Only one menu screen is visible at a time. */
export abstract class Screen {
  readonly root: HTMLElement;

  constructor(id: string, extraClass = '') {
    this.root = el('section', { id, class: `screen ${extraClass}`.trim(), 'aria-hidden': 'true' });
  }

  get visible(): boolean {
    return this.root.classList.contains('visible');
  }

  show(): void {
    this.root.classList.add('visible');
    this.root.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.root.classList.remove('visible');
    this.root.setAttribute('aria-hidden', 'true');
  }

  /** Focus the primary control for keyboard / gamepad users. */
  focusFirst(selector = 'button'): void {
    const target = this.root.querySelector<HTMLElement>(selector);
    target?.focus({ preventScroll: true });
  }
}
