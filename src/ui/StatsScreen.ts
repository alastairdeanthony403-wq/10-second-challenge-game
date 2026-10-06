import { CATEGORIES } from '../gameplay/MiniGame';
import { t } from '../i18n/i18n';
import { clear, el, formatNumber } from './dom';
import { Screen } from './Screen';
import type { UIActions, UIData } from './types';

export class StatsScreen extends Screen {
  private body: HTMLElement;

  constructor(private readonly actions: UIActions, private readonly data: UIData) {
    super('stats', 'menu-screen');
    this.body = el('div', { class: 'panel scroll' });
    this.root.append(this.body);
  }

  override show(): void {
    void this.render();
    super.show();
    this.focusFirst();
  }

  private async render(): Promise<void> {
    const save = this.data.save();
    const s = save.stats;
    clear(this.body);
    const avg = s.challengesPlayed ? Math.round(s.totalScore / s.challengesPlayed) : null;
    const fav = CATEGORIES.reduce<{ cat: string | null; n: number }>((best, c) => ((s.categoryPlays[c] ?? 0) > best.n ? { cat: c, n: s.categoryPlays[c] } : best), { cat: null, n: 0 });
    const rows: [string, string][] = [
      [t('stats.games_played'), formatNumber(s.gamesPlayed)],
      [t('stats.challenges_completed'), formatNumber(s.challengesCompleted)],
      [t('stats.challenges_failed'), formatNumber(s.challengesFailed)],
      [t('stats.perfects'), formatNumber(s.perfects)],
      [t('stats.best_score'), formatNumber(save.bestScore)],
      [t('stats.best_combo'), `x${save.bestCombo}`],
      [t('stats.average'), avg === null ? t('stats.none') : String(avg)],
      [t('stats.fastest_reaction'), s.fastestReactionMs ? t('stats.ms', { ms: s.fastestReactionMs }) : t('stats.none')],
      [t('stats.favorite_category'), fav.cat ? t(`category.${fav.cat}`) : t('stats.none')],
      [t('stats.endless_best'), formatNumber(s.endlessBestRound)],
      [t('stats.daily_best'), formatNumber(save.daily.best)],
    ];
    const table = el('dl', { class: 'stats-grid' }, ...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));

    const bests = el(
      'div',
      { class: 'game-bests' },
      ...this.data.games().map((g) => {
        const best = save.gameBests[g.id];
        const unlocked = save.unlockedGames.includes(g.id);
        return el(
          'div',
          { class: `game-best ${unlocked ? '' : 'locked'}` },
          el('span', { class: 'gb-icon', 'aria-hidden': 'true' }, unlocked ? g.icon : '🔒'),
          el('span', { class: 'gb-name' }, t(g.nameKey)),
          el('span', { class: 'gb-score' }, best === undefined ? t('stats.none') : String(best)),
        );
      }),
    );

    const board = el('ol', { class: 'leaderboard' });
    this.body.append(
      el('h2', {}, t('stats.title')),
      table,
      el('h3', {}, t('stats.leaderboard')),
      board,
      el('h3', {}, t('stats.game_bests')),
      bests,
      el('button', { class: 'btn btn-ghost', onclick: () => this.actions.openScreen('MAIN_MENU') }, t('ui.back')),
    );
    const entries = await this.data.leaderboard.top('personal', 5, 'quick');
    if (entries.length === 0) board.append(el('li', { class: 'dim' }, t('stats.leaderboard_empty')));
    for (const e of entries) board.append(el('li', {}, el('span', {}, e.name), el('span', { class: 'dim' }, e.date), el('strong', {}, formatNumber(e.score))));
  }
}
