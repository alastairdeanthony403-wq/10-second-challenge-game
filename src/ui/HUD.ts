import { t } from '../i18n/i18n';
import { el, formatNumber, replayAnimation } from './dom';

export interface HudState {
  round: number;
  totalRounds: number | null;
  points: number;
  combo: number;
  lives: number | null;
  maxLives: number | null;
  playerName: string | null;
  playerIndex: number;
}

/** Top bar during a run: big timer, round, score, combo, lives. Never blocks gameplay input. */
export class HUD {
  readonly root: HTMLElement;
  private timer: HTMLElement;
  private bar: HTMLElement;
  private round: HTMLElement;
  private points: HTMLElement;
  private combo: HTMLElement;
  private lives: HTMLElement;
  private player: HTMLElement;
  private lastTimerText = '';
  private lastPoints = -1;
  private lastCombo = -1;
  private lastLivesKey = '';
  private urgent = false;

  constructor(onPause: () => void) {
    this.timer = el('div', { class: 'hud-timer', role: 'timer', 'aria-live': 'off' }, '10.0');
    this.bar = el('div', { class: 'hud-bar-fill' });
    this.round = el('div', { class: 'hud-round' });
    this.player = el('div', { class: 'hud-player' });
    this.points = el('div', { class: 'hud-points' }, '0');
    this.combo = el('div', { class: 'hud-combo' });
    this.lives = el('div', { class: 'hud-lives', 'aria-label': t('ui.lives') });
    this.root = el(
      'header',
      { id: 'hud', class: 'hud' },
      el('div', { class: 'hud-left' }, el('button', { class: 'hud-pause', 'aria-label': t('ui.pause'), onclick: onPause }, '❚❚'), el('div', {}, this.round, this.player)),
      this.timer,
      el('div', { class: 'hud-right' }, this.points, el('div', { class: 'hud-sub' }, this.combo, this.lives)),
      el('div', { class: 'hud-bar' }, this.bar),
    );
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('visible', visible);
  }

  setState(s: HudState): void {
    const label = s.totalRounds ? `${s.round}/${s.totalRounds}` : String(s.round);
    if (this.round.dataset.v !== label) {
      this.round.dataset.v = label;
      this.round.replaceChildren(el('span', { class: 'hud-round-label' }, `${t('ui.round')} `), label);
    }
    this.player.textContent = s.playerName ?? '';
    this.player.className = `hud-player p${s.playerIndex}`;
    if (s.points !== this.lastPoints) {
      this.points.textContent = formatNumber(s.points);
      if (this.lastPoints >= 0) replayAnimation(this.points, 'bump');
      this.lastPoints = s.points;
    }
    if (s.combo !== this.lastCombo) {
      this.combo.textContent = s.combo > 1 ? `🔥 x${Math.min(5, s.combo)}` : '';
      if (s.combo > this.lastCombo && s.combo > 1) replayAnimation(this.combo, 'bump');
      this.lastCombo = s.combo;
    }
    const livesKey = `${s.lives}/${s.maxLives}`;
    if (livesKey !== this.lastLivesKey) {
      this.lives.textContent = s.lives === null || s.maxLives === null ? '' : '❤'.repeat(s.lives) + '♡'.repeat(Math.max(0, s.maxLives - s.lives));
      this.lastLivesKey = livesKey;
    }
  }

  /** Called every frame; only touches the DOM when the displayed value changes. */
  setTimer(text: string, progress: number, remaining: number, running: boolean): void {
    if (text !== this.lastTimerText) {
      this.timer.textContent = text;
      this.lastTimerText = text;
    }
    this.bar.style.transform = `scaleX(${Math.max(0, 1 - progress)})`;
    const urgent = running && remaining <= 3;
    if (urgent !== this.urgent) {
      this.urgent = urgent;
      this.root.classList.toggle('urgent', urgent);
    }
  }

  pulseTimer(): void {
    replayAnimation(this.timer, 'tick');
  }

  reset(): void {
    this.lastPoints = -1;
    this.lastCombo = -1;
    this.lastLivesKey = '';
  }
}
