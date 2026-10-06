import { t } from '../i18n/i18n';
import { clear, el, formatNumber } from './dom';
import { Screen } from './Screen';
import type { UIActions, UIData } from './types';

export class MainMenu extends Screen {
  private info: HTMLElement;

  constructor(actions: UIActions, private readonly data: UIData) {
    super('main-menu', 'menu-screen');
    const btn = (label: string, cls: string, onClick: () => void, icon = '') =>
      el('button', { class: `btn ${cls}`, onclick: () => (actions.uiSound('click'), onClick()), onmouseenter: () => actions.uiSound('hover') }, icon ? el('span', { class: 'btn-icon', 'aria-hidden': 'true' }, icon) : null, label);

    this.info = el('div', { class: 'menu-info' });
    this.root.append(
      el('div', { class: 'menu-bg', 'aria-hidden': 'true' }, ...Array.from({ length: 12 }, (_, i) => el('span', { class: `float-shape s${i % 6}`, style: `--i:${i}` }))),
      el(
        'div',
        { class: 'menu-content' },
        el('h1', { class: 'logo' }, el('span', { class: 'logo-top' }, t('app.title_top')), el('span', { class: 'logo-bottom' }, t('app.title_bottom'))),
        el('p', { class: 'tagline' }, t('app.tagline')),
        btn(t('menu.play'), 'btn-play', () => actions.startMode('quick', 1), '▶'),
        el(
          'div',
          { class: 'menu-grid' },
          btn(t('menu.daily'), 'btn-secondary', () => actions.startMode('daily', 1), '📅'),
          btn(t('menu.endless'), 'btn-secondary', () => actions.startMode('endless', 1), '∞'),
          btn(t('menu.duel'), 'btn-secondary', () => actions.openScreen('MODE_SELECT', 'duel'), '⚔'),
          btn(t('menu.party'), 'btn-secondary', () => actions.openScreen('MODE_SELECT', 'party'), '🎉'),
        ),
        el(
          'div',
          { class: 'menu-row' },
          btn(t('menu.settings'), 'btn-ghost', () => actions.openScreen('SETTINGS'), '⚙'),
          btn(t('menu.stats'), 'btn-ghost', () => actions.openScreen('STATS'), '📊'),
          btn(t('menu.achievements'), 'btn-ghost', () => actions.openScreen('ACHIEVEMENTS'), '🏆'),
        ),
        this.info,
      ),
    );
  }

  override show(): void {
    this.refresh();
    super.show();
    this.focusFirst('.btn-play');
  }

  refresh(): void {
    const save = this.data.save();
    clear(this.info);
    if (save.bestScore > 0) this.info.append(el('span', { class: 'pill' }, t('menu.best', { score: formatNumber(save.bestScore) })));
    if (save.daily.key === this.data.dailyKey() && save.daily.completed) {
      this.info.append(el('span', { class: 'pill' }, '📅 ', t('menu.daily_done', { score: formatNumber(save.daily.score) })));
    }
    const title = bestTitle(save.titles);
    if (title) this.info.append(el('span', { class: 'pill pill-accent' }, t('menu.title', { title: t(title) })));
  }
}

export const TITLE_ORDER = ['rank.legend', 'rank.master', 'rank.speed_demon', 'rank.fast_hands', 'rank.quick_thinker', 'rank.warming_up', 'rank.sleepy'];

export function bestTitle(titles: string[]): string | null {
  return TITLE_ORDER.find((k) => titles.includes(k)) ?? null;
}
