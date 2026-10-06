import { t } from '../i18n/i18n';
import { THEMES } from '../render/Theme';
import { clear, el } from './dom';
import { requirementLabel } from './labels';
import { Screen } from './Screen';
import type { UIActions, UIData } from './types';

/** Trophies + collection (mini-games and themes, with how to unlock them). */
export class AchievementsScreen extends Screen {
  private body: HTMLElement;

  constructor(private readonly actions: UIActions, private readonly data: UIData) {
    super('achievements', 'menu-screen');
    this.body = el('div', { class: 'panel scroll' });
    this.root.append(this.body);
  }

  override show(): void {
    this.render();
    super.show();
    this.focusFirst();
  }

  private render(): void {
    const save = this.data.save();
    clear(this.body);
    const achs = this.data.progression.achievements.all;
    const unlockedCount = achs.filter((a) => a.id in save.achievements).length;
    const list = el(
      'div',
      { class: 'ach-grid' },
      ...achs.map((a) => {
        const got = a.id in save.achievements;
        return el(
          'div',
          { class: `ach ${got ? 'got' : 'locked'}` },
          el('span', { class: 'ach-icon', 'aria-hidden': 'true' }, got ? a.icon : '🔒'),
          el('div', {}, el('strong', {}, t(a.nameKey)), el('small', {}, t(a.descKey))),
        );
      }),
    );
    const games = el(
      'div',
      { class: 'collection' },
      ...this.data.games().map((g) => {
        const got = save.unlockedGames.includes(g.id);
        return el(
          'div',
          { class: `collect-item ${got ? 'got' : 'locked'}` },
          el('span', { class: 'ach-icon', 'aria-hidden': 'true' }, got ? g.icon : '🔒'),
          el('div', {}, el('strong', {}, t(g.nameKey)), el('small', {}, got ? `${t(`category.${g.category}`)} · ${t(g.descriptionKey)}` : requirementLabel(g.unlock))),
        );
      }),
      ...THEMES.map((th) => {
        const got = save.unlockedThemes.includes(th.id);
        return el(
          'div',
          { class: `collect-item ${got ? 'got' : 'locked'}` },
          el('span', { class: 'swatch big', style: `background:${th.palette.bg};border-color:${th.palette.accent}` }),
          el('div', {}, el('strong', {}, `${t('settings.theme')}: ${t(th.nameKey)}`), el('small', {}, got ? '✓' : requirementLabel(th.unlock))),
        );
      }),
    );
    this.body.append(
      el('h2', {}, `${t('ach.title')} ${unlockedCount}/${achs.length}`),
      list,
      el('h3', {}, t('ach.collection')),
      games,
      el('button', { class: 'btn btn-ghost', onclick: () => this.actions.openScreen('MAIN_MENU') }, t('ui.back')),
    );
  }
}
