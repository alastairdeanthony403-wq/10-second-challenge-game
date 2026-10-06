import { MODES, type ModeId } from '../gameplay/RunManager';
import { t } from '../i18n/i18n';
import { clear, el } from './dom';
import { Screen } from './Screen';
import type { UIActions } from './types';

/** Player-count setup for local multiplayer modes (Duel / Party). */
export class ModeSelect extends Screen {
  private body: HTMLElement;
  private mode: ModeId = 'duel';
  private players = 2;

  constructor(private readonly actions: UIActions) {
    super('mode-select', 'menu-screen');
    this.body = el('div', { class: 'panel narrow' });
    this.root.append(this.body);
  }

  open(mode: ModeId): void {
    this.mode = mode;
    this.players = MODES[mode].minPlayers;
    this.render();
    this.show();
    this.focusFirst('.btn-play');
  }

  private render(): void {
    const cfg = MODES[this.mode];
    clear(this.body);
    const stepper =
      cfg.maxPlayers > cfg.minPlayers
        ? el(
            'div',
            { class: 'stepper' },
            el('button', { class: 'btn btn-round', 'aria-label': '-', onclick: () => this.setPlayers(this.players - 1) }, '−'),
            el('div', { class: 'stepper-value', 'aria-live': 'polite' }, String(this.players), el('small', {}, t('mode.players'))),
            el('button', { class: 'btn btn-round', 'aria-label': '+', onclick: () => this.setPlayers(this.players + 1) }, '+'),
          )
        : el('div', { class: 'stepper-value' }, String(this.players), el('small', {}, t('mode.players')));
    this.body.append(
      el('div', { class: 'mode-icon', 'aria-hidden': 'true' }, cfg.icon),
      el('h2', {}, t(cfg.nameKey)),
      el('p', { class: 'dim' }, t(cfg.descKey)),
      stepper,
      el('div', { class: 'player-chips' }, ...Array.from({ length: this.players }, (_, i) => el('span', { class: `chip p${i}` }, `P${i + 1}`))),
      el('button', { class: 'btn btn-play', onclick: () => this.actions.startMode(this.mode, this.players) }, '▶ ', t('mode.start')),
      el('button', { class: 'btn btn-ghost', onclick: () => this.actions.openScreen('MAIN_MENU') }, t('ui.back')),
    );
  }

  private setPlayers(n: number): void {
    const cfg = MODES[this.mode];
    this.players = Math.max(cfg.minPlayers, Math.min(cfg.maxPlayers, n));
    this.actions.uiSound('click');
    this.render();
  }
}
