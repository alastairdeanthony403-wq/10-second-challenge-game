import type { MiniGameDefinition } from '../gameplay/MiniGame';
import { MODIFIERS, type ModifierId } from '../gameplay/Modifiers';
import type { RoundOutcome } from '../gameplay/RunManager';
import type { Difficulty } from '../gameplay/Difficulty';
import { t } from '../i18n/i18n';
import { append, clear, el, formatNumber, replayAnimation } from './dom';
import { Screen } from './Screen';
import type { UIActions } from './types';

/** "GET READY! / instruction / 3-2-1-GO!" overlay. */
export class IntroOverlay extends Screen {
  private content: HTMLElement;
  private count: HTMLElement;

  constructor(actions: UIActions) {
    super('intro', 'overlay intro');
    this.content = el('div', { class: 'intro-card' });
    this.count = el('div', { class: 'countdown', 'aria-live': 'assertive' });
    this.root.append(this.content, this.count);
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      actions.advance();
    });
  }

  present(def: MiniGameDefinition, difficulty: Difficulty, modifier: ModifierId | null, keyboardHint: boolean): void {
    clear(this.content);
    clear(this.count);
    this.root.classList.remove('counting');
    const mod = modifier ? MODIFIERS[modifier] : null;
    append(
      this.content,
      mod ? el('div', { class: 'special-badge' }, '★ ', t('ui.special_round'), ' · ', t(mod.nameKey)) : null,
      el('div', { class: 'get-ready' }, t('ui.get_ready')),
      el('div', { class: 'intro-icon', 'aria-hidden': 'true' }, def.icon),
      el('div', { class: 'instruction' }, t(def.instructionKey)),
      el('div', { class: 'intro-meta' }, el('span', { class: `diff d${difficulty}` }, t(`difficulty.${difficulty}`)), el('span', {}, t(`category.${def.category}`))),
      keyboardHint ? el('div', { class: 'dim small' }, t('ui.keyboard_hint')) : null,
      el('div', { class: 'dim small skip-hint' }, t('ui.tap_to_skip')),
    );
    this.show();
    replayAnimation(this.content, 'enter');
  }

  countdown(value: string, isGo: boolean): void {
    this.root.classList.add('counting');
    clear(this.count);
    const n = el('span', { class: isGo ? 'go' : `n${value}` }, value);
    this.count.append(n);
  }
}

export interface ResultExtras {
  previousBest: number | null;
  newBest: boolean;
  playerName: string | null;
  finishReason: 'time' | 'success' | 'fail' | 'aborted' | null;
}

/** Short post-challenge card: TIME! / +87 / GREAT! / COMBO x4. */
export class ResultsOverlay extends Screen {
  private card: HTMLElement;

  constructor(actions: UIActions) {
    super('results', 'overlay results');
    this.card = el('div', { class: 'result-card' });
    this.root.append(this.card);
    this.root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      actions.advance();
    });
  }

  present(outcome: RoundOutcome, extras: ResultExtras): void {
    clear(this.card);
    const headKey = extras.finishReason === 'time' ? 'ui.time_up' : outcome.failed ? 'ui.oops' : 'ui.done';
    const r = outcome.result;
    const comboLine = outcome.comboBroken
      ? el('div', { class: 'combo broken' }, t('ui.combo_broken'))
      : outcome.comboAfter > 1
        ? el('div', { class: 'combo' }, '🔥 ', t('ui.combo', { combo: Math.min(5, outcome.comboAfter) }))
        : null;
    const pts = outcome.points;
    this.card.className = `result-card rating-${outcome.rating.toLowerCase()}`;
    append(
      this.card,
      extras.playerName ? el('div', { class: 'result-player' }, extras.playerName) : null,
      el('div', { class: 'result-head' }, t(headKey)),
      el('div', { class: 'result-score' }, String(outcome.score), el('small', {}, '/100')),
      el('div', { class: 'result-rating' }, t(`rating.${outcome.rating}`)),
      el('div', { class: 'result-summary' }, t(r.summaryKey, r.summaryParams)),
      outcome.failed && r.failReasonKey ? el('div', { class: 'result-why' }, t('ui.why', { reason: t(r.failReasonKey) })) : null,
      el(
        'div',
        { class: 'result-points' },
        `+${formatNumber(pts.total)}`,
        pts.multiplier > 1 || pts.modifierMultiplier !== 1 || pts.perfectBonus > 0
          ? el('small', {}, ` (${pts.base}${pts.multiplier > 1 ? ` ×${pts.multiplier}` : ''}${pts.perfectBonus ? ` +${pts.perfectBonus}` : ''}${pts.modifierMultiplier !== 1 ? ` ×${pts.modifierMultiplier}` : ''})`)
          : null,
      ),
      comboLine,
      outcome.lostLife ? el('div', { class: 'life-lost' }, '💔 ', t('ui.life_lost')) : null,
      extras.newBest ? el('div', { class: 'new-best' }, '★ ', t('ui.new_best')) : extras.previousBest ? el('div', { class: 'dim small' }, t('ui.personal_best', { score: extras.previousBest })) : null,
      el('div', { class: 'dim small' }, t('ui.tap_to_continue')),
    );
    this.show();
    replayAnimation(this.card, 'enter');
  }
}

/** "Pass the device" screen for hot-seat Duel / Party. */
export class HandoffOverlay extends Screen {
  private card: HTMLElement;

  constructor(private readonly actions: UIActions) {
    super('handoff', 'overlay handoff');
    this.card = el('div', { class: 'panel narrow' });
    this.root.append(this.card);
  }

  present(name: string, index: number, def: MiniGameDefinition, standings: { name: string; points: number }[]): void {
    clear(this.card);
    this.card.append(
      el('div', { class: 'dim' }, t('ui.pass_device')),
      el('h2', { class: `player-name p${index}` }, t('ui.player_ready', { name })),
      el('div', { class: 'intro-icon', 'aria-hidden': 'true' }, def.icon),
      el('div', { class: 'instruction small' }, t(def.nameKey)),
      el('ol', { class: 'standings' }, ...standings.map((s, i) => el('li', { class: `p${i}` }, el('span', {}, s.name), el('strong', {}, formatNumber(s.points))))),
      el('button', { class: 'btn btn-play', onclick: () => this.actions.advance() }, t('ui.ready')),
    );
    this.show();
    this.focusFirst('.btn-play');
  }
}

export class PauseOverlay extends Screen {
  constructor(actions: UIActions) {
    super('pause', 'overlay pause');
    this.root.append(
      el(
        'div',
        { class: 'panel narrow' },
        el('h2', {}, t('ui.pause')),
        el('button', { class: 'btn btn-play', onclick: () => actions.resume() }, '▶ ', t('ui.resume')),
        el('button', { class: 'btn btn-secondary', onclick: () => actions.restartRun() }, '↻ ', t('ui.restart')),
        el('button', { class: 'btn btn-ghost', onclick: () => actions.quitToMenu() }, t('ui.quit')),
      ),
    );
  }

  override show(): void {
    super.show();
    this.focusFirst('.btn-play');
  }
}
