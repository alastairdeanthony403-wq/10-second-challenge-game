import type { RunSummary } from '../gameplay/RunManager';
import { t } from '../i18n/i18n';
import type { RunProgress } from '../progression/Progression';
import { THEMES } from '../render/Theme';
import { append, clear, el, formatNumber, replayAnimation } from './dom';
import { Screen } from './Screen';
import type { UIActions, UIData } from './types';

export class FinalResults extends Screen {
  private body: HTMLElement;

  constructor(private readonly actions: UIActions, private readonly data: UIData) {
    super('final-results', 'menu-screen final');
    this.body = el('div', { class: 'panel scroll' });
    this.root.append(this.body);
  }

  present(summary: RunSummary, progress: RunProgress | null, leaderboardRank: number | null): void {
    clear(this.body);
    const multi = summary.players.length > 1;
    const p = summary.players[0];
    const endedByLives = summary.mode === 'endless';
    const heading = multi
      ? summary.winnerIndex === null
        ? t('results.tie')
        : t('results.winner', { name: summary.players[summary.winnerIndex].name })
      : t(endedByLives ? 'results.game_over' : 'results.run_complete');

    this.body.append(el('h2', { class: 'final-head' }, heading));

    if (multi) {
      const ranking = summary.players.map((pl, i) => ({ pl, i })).sort((a, b) => b.pl.points - a.pl.points);
      this.body.append(
        el(
          'ol',
          { class: 'standings big' },
          ...ranking.map(({ pl, i }, place) =>
            el(
              'li',
              { class: `p${i} ${place === 0 && summary.winnerIndex !== null ? 'winner' : ''}` },
              el('span', {}, place === 0 && summary.winnerIndex !== null ? '👑 ' : '', pl.name),
              el('small', {}, `${pl.scoreSum}/${pl.maxScore} · ${t(pl.rankKey)}`),
              el('strong', {}, formatNumber(pl.points)),
            ),
          ),
        ),
      );
    } else {
      const stat = (label: string, value: string) => el('div', { class: 'final-stat' }, el('small', {}, label), el('strong', {}, value));
      append(
        this.body,
        el('div', { class: 'final-label' }, t('results.final_score')),
        el('div', { class: 'final-points' }, formatNumber(p.points)),
        el('div', { class: 'final-outof' }, `${p.scoreSum} / ${p.maxScore}`),
        progress?.newBestScore ? el('div', { class: 'new-best big' }, '★ ', t('results.new_record'), ' ★') : progress && progress.previousBest > 0 ? el('div', { class: 'dim' }, t('results.previous_best', { score: formatNumber(progress.previousBest) })) : null,
        el('div', { class: 'final-rank' }, el('small', {}, t('results.rank')), el('span', {}, t(p.rankKey))),
        el(
          'div',
          { class: 'final-stats' },
          stat(t('results.best_combo'), `x${p.bestCombo}`),
          stat(t('results.perfects'), String(p.perfects)),
          stat(t('results.challenges'), String(p.rounds)),
          stat(t('results.cleared'), String(p.completed)),
        ),
        leaderboardRank ? el('div', { class: 'dim' }, t('results.leaderboard_rank', { rank: leaderboardRank })) : null,
        summary.mode === 'daily' ? el('div', { class: 'dim' }, '📅 ', t('results.daily_saved')) : null,
      );
    }

    if (progress) {
      const unlocks: HTMLElement[] = [];
      for (const id of progress.unlocks.games) {
        const def = this.data.games().find((g) => g.id === id);
        if (def) unlocks.push(el('span', { class: 'pill pill-accent' }, def.icon, ' ', t(def.nameKey)));
      }
      for (const id of progress.unlocks.themes) {
        const th = THEMES.find((x) => x.id === id);
        if (th) unlocks.push(el('span', { class: 'pill pill-accent' }, '🎨 ', t(th.nameKey)));
      }
      if (progress.newTitle) unlocks.push(el('span', { class: 'pill pill-accent' }, '🏷 ', t('results.new_title'), ': ', t(progress.newTitle)));
      if (unlocks.length) this.body.append(el('div', { class: 'final-unlocks' }, el('small', {}, t('results.unlocked')), ...unlocks));
      if (progress.achievements.length) {
        this.body.append(
          el('div', { class: 'final-unlocks' }, el('small', {}, t('results.trophies')), ...progress.achievements.map((a) => el('span', { class: 'pill' }, a.icon, ' ', t(a.nameKey)))),
        );
      }
    }

    this.body.append(
      el('button', { class: 'btn btn-play', onclick: () => this.actions.playAgain() }, '↻ ', t('results.play_again')),
      el('button', { class: 'btn btn-ghost', onclick: () => this.actions.openScreen('MAIN_MENU') }, t('results.menu')),
    );
    this.show();
    replayAnimation(this.body, 'enter');
    this.focusFirst('.btn-play');
  }
}
