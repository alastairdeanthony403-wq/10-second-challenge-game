import { t } from '../i18n/i18n';
import type { Settings } from '../progression/Settings';
import { TEXT_SCALES } from '../progression/Settings';
import { THEMES } from '../render/Theme';
import { clear, el } from './dom';
import { Screen } from './Screen';
import type { UIActions, UIData } from './types';
import { requirementLabel } from './labels';

export class SettingsScreen extends Screen {
  private body: HTMLElement;
  private resetArmed = false;

  constructor(private readonly actions: UIActions, private readonly data: UIData) {
    super('settings', 'menu-screen');
    this.body = el('div', { class: 'panel scroll' });
    this.root.append(this.body);
  }

  override show(): void {
    this.resetArmed = false;
    this.render();
    super.show();
    this.focusFirst('input, button');
  }

  private render(): void {
    const s = this.data.save().settings;
    const save = this.data.save();
    clear(this.body);
    const set = (patch: Partial<Settings>) => this.actions.updateSettings(patch);

    const slider = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume') =>
      el(
        'label',
        { class: 'setting' },
        el('span', {}, label),
        el('input', {
          type: 'range',
          min: 0,
          max: 100,
          step: 5,
          value: Math.round(s[key] * 100),
          'aria-label': label,
          oninput: (e: Event) => set({ [key]: Number((e.target as HTMLInputElement).value) / 100 }),
        }),
      );
    const toggle = (label: string, key: keyof Settings) =>
      el(
        'label',
        { class: 'setting toggle' },
        el('span', {}, label),
        el('input', {
          type: 'checkbox',
          role: 'switch',
          checked: Boolean(s[key]),
          onchange: (e: Event) => set({ [key]: (e.target as HTMLInputElement).checked } as Partial<Settings>),
        }),
      );

    const themeButtons = THEMES.map((theme) => {
      const unlocked = save.unlockedThemes.includes(theme.id);
      return el(
        'button',
        {
          class: `btn btn-chip ${s.theme === theme.id ? 'selected' : ''}`,
          disabled: !unlocked,
          title: unlocked ? '' : requirementLabel(theme.unlock, this.data),
          'aria-pressed': String(s.theme === theme.id),
          onclick: () => {
            set({ theme: theme.id });
            this.render();
          },
        },
        el('span', { class: 'swatch', style: `background:${theme.palette.bg};border-color:${theme.palette.accent}` }),
        unlocked ? t(theme.nameKey) : `🔒 ${t(theme.nameKey)}`,
      );
    });

    const textButtons = TEXT_SCALES.map((scale) =>
      el(
        'button',
        {
          class: `btn btn-chip ${s.textScale === scale ? 'selected' : ''}`,
          'aria-pressed': String(s.textScale === scale),
          onclick: () => {
            set({ textScale: scale });
            this.render();
          },
        },
        `${Math.round(scale * 100)}%`,
      ),
    );

    const nameInput = el('input', {
      type: 'text',
      maxlength: 12,
      value: save.playerName,
      'aria-label': t('settings.name'),
      onchange: (e: Event) => this.actions.setPlayerName((e.target as HTMLInputElement).value),
    });

    const resetBtn = el(
      'button',
      {
        class: 'btn btn-danger',
        onclick: () => {
          if (!this.resetArmed) {
            this.resetArmed = true;
            resetBtn.textContent = t('settings.reset_confirm');
            return;
          }
          this.actions.resetProgress();
          this.resetArmed = false;
          resetBtn.textContent = t('settings.reset_done');
        },
      },
      t('settings.reset'),
    );

    this.body.append(
      el('h2', {}, t('settings.title')),
      el('h3', {}, t('settings.audio')),
      slider(t('settings.master'), 'masterVolume'),
      toggle(t('settings.music_on'), 'musicEnabled'),
      slider(t('settings.music'), 'musicVolume'),
      toggle(t('settings.sfx_on'), 'sfxEnabled'),
      slider(t('settings.sfx'), 'sfxVolume'),
      el('h3', {}, t('settings.accessibility')),
      toggle(t('settings.reduced_shake'), 'reducedShake'),
      toggle(t('settings.reduced_effects'), 'reducedEffects'),
      toggle(t('settings.high_contrast'), 'highContrast'),
      toggle(t('settings.color_blind'), 'colorBlind'),
      el('div', { class: 'setting' }, el('span', {}, t('settings.text_scale')), el('div', { class: 'chip-row' }, ...textButtons)),
      el('h3', {}, t('settings.gameplay')),
      toggle(t('settings.adaptive'), 'adaptiveDifficulty'),
      el('div', { class: 'setting column' }, el('span', {}, t('settings.theme')), el('div', { class: 'chip-row' }, ...themeButtons)),
      el('label', { class: 'setting' }, el('span', {}, t('settings.name')), nameInput),
      resetBtn,
      el('button', { class: 'btn btn-ghost', onclick: () => this.actions.openScreen('MAIN_MENU') }, t('ui.back')),
    );
  }
}
