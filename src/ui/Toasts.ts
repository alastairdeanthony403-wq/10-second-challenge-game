import { el } from './dom';

/** Non-blocking notifications (achievements, unlocks) that never cover the play area centre. */
export class Toasts {
  readonly root = el('div', { class: 'toasts', 'aria-live': 'polite' });

  show(icon: string, title: string, body = '', duration = 2800): void {
    const toast = el('div', { class: 'toast' }, el('span', { class: 'toast-icon', 'aria-hidden': 'true' }, icon), el('div', {}, el('strong', {}, title), body ? el('small', {}, body) : null));
    this.root.append(toast);
    while (this.root.children.length > 3) this.root.firstElementChild?.remove();
    setTimeout(() => toast.classList.add('out'), duration);
    setTimeout(() => toast.remove(), duration + 400);
  }
}
