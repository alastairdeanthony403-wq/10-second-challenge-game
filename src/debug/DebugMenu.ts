import { Difficulty } from '../gameplay/Difficulty';
import type { Game } from '../Game';
import { t } from '../i18n/i18n';
import { el } from '../ui/dom';

/**
 * Developer panel (toggle with ` or the 🛠 button). Only mounted when debug is
 * enabled: `npm run dev`, or `?debug=1` on any build.
 */
export function mountDebugMenu(game: Game, root: HTMLElement): void {
  const btn = (label: string, onClick: () => void) => el('button', { class: 'btn btn-chip', onclick: onClick }, label);
  const toggle = (label: string, key: 'fps' | 'state' | 'timer') =>
    el('label', { class: 'debug-toggle' }, el('input', { type: 'checkbox', onchange: (e: Event) => game.setDebugOverlay(key, (e.target as HTMLInputElement).checked) }), label);

  const forceSelect = el(
    'select',
    { 'aria-label': 'Force mini-game' },
    el('option', { value: '' }, 'Force mini-game…'),
    ...game.registry.all().map((d) => el('option', { value: d.id }, `${d.icon} ${t(d.nameKey)}`)),
  );
  forceSelect.addEventListener('change', () => {
    if (forceSelect.value) game.debugForce(forceSelect.value);
    forceSelect.value = '';
  });

  const diffSelect = el(
    'select',
    { 'aria-label': 'Difficulty' },
    el('option', { value: '' }, 'Difficulty: auto'),
    ...[Difficulty.EASY, Difficulty.NORMAL, Difficulty.HARD, Difficulty.EXTREME].map((d) => el('option', { value: String(d) }, t(`difficulty.${d}`))),
  );
  diffSelect.addEventListener('change', () => game.debugSetDifficulty(diffSelect.value === '' ? null : (Number(diffSelect.value) as Difficulty)));

  const panel = el(
    'aside',
    { class: 'debug-panel', 'aria-label': 'Debug menu' },
    el('strong', {}, `🛠 ${t('debug.title')}`),
    el('div', { class: 'debug-row' }, btn('Skip challenge', () => game.debugSkip()), btn('Restart challenge', () => game.debugRestartChallenge())),
    forceSelect,
    diffSelect,
    el('div', { class: 'debug-row' }, btn('+500 score', () => game.debugAddScore(500)), btn('Unlock all', () => game.debugUnlockAll()), btn('Reset save', () => game.debugResetSave())),
    el('div', { class: 'debug-row' }, toggle('FPS', 'fps'), toggle('State', 'state'), toggle('Timer', 'timer')),
    btn('Dump analytics', () => console.table(game.analyticsLog)),
  );
  const opener = el('button', { class: 'debug-open-btn', 'aria-label': 'Debug menu', onclick: () => document.body.classList.toggle('debug-open') }, '🛠');
  root.append(panel, opener);
}
