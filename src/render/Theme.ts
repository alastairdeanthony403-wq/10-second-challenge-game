/** Colors mini-games draw with. Gameplay never relies on color alone (shapes/symbols too). */
export interface Palette {
  bg: string;
  bgAlt: string;
  grid: string;
  text: string;
  textDim: string;
  accent: string;
  good: string;
  bad: string;
  warn: string;
  /** Four distinct "team" colors for sequences, bins, etc. */
  a: string;
  b: string;
  c: string;
  d: string;
  shadow: string;
}

export interface ThemeDef {
  id: string;
  nameKey: string;
  palette: Palette;
  /** CSS custom properties applied to the document root. */
  css: Record<string, string>;
  unlock: { type: 'none' } | { type: 'runs'; count: number } | { type: 'bestScore'; points: number } | { type: 'achievement'; id: string };
}

const neon: Palette = {
  bg: '#12082b', bgAlt: '#1d1145', grid: 'rgba(255,255,255,0.05)', text: '#ffffff', textDim: '#b9a8e8',
  accent: '#ffd400', good: '#2ee59d', bad: '#ff3b5c', warn: '#ff9f1c',
  a: '#3d8bff', b: '#ff4fd8', c: '#ffd400', d: '#2ee59d', shadow: 'rgba(0,0,0,0.35)',
};

const sunset: Palette = {
  bg: '#2a0f1f', bgAlt: '#43172d', grid: 'rgba(255,220,200,0.06)', text: '#fff6ec', textDim: '#f5b9a0',
  accent: '#ffcf40', good: '#5ff0b0', bad: '#ff4d4d', warn: '#ff9a3c',
  a: '#4cc9f0', b: '#f72585', c: '#ffcf40', d: '#80ed99', shadow: 'rgba(0,0,0,0.35)',
};

const ocean: Palette = {
  bg: '#04213a', bgAlt: '#08345a', grid: 'rgba(180,230,255,0.06)', text: '#f0fbff', textDim: '#9cc9e3',
  accent: '#ffe066', good: '#3ddc97', bad: '#ff5470', warn: '#ffa94d',
  a: '#4dabf7', b: '#f783ac', c: '#ffe066', d: '#63e6be', shadow: 'rgba(0,0,0,0.35)',
};

const contrast: Palette = {
  bg: '#000000', bgAlt: '#111111', grid: 'rgba(255,255,255,0.12)', text: '#ffffff', textDim: '#e0e0e0',
  accent: '#ffff00', good: '#00ff66', bad: '#ff2222', warn: '#ffaa00',
  a: '#33aaff', b: '#ff55ff', c: '#ffff00', d: '#00ff66', shadow: 'rgba(0,0,0,0.6)',
};

function cssFor(p: Palette, panel: string, panelBorder: string): Record<string, string> {
  return {
    '--bg': p.bg, '--bg-alt': p.bgAlt, '--text': p.text, '--text-dim': p.textDim, '--accent': p.accent,
    '--good': p.good, '--bad': p.bad, '--warn': p.warn, '--a': p.a, '--b': p.b, '--c': p.c, '--d': p.d,
    '--panel': panel, '--panel-border': panelBorder,
  };
}

export const THEMES: readonly ThemeDef[] = [
  { id: 'neon', nameKey: 'theme.neon', palette: neon, css: cssFor(neon, 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.14)'), unlock: { type: 'none' } },
  { id: 'contrast', nameKey: 'theme.contrast', palette: contrast, css: cssFor(contrast, '#000', '#fff'), unlock: { type: 'none' } },
  { id: 'sunset', nameKey: 'theme.sunset', palette: sunset, css: cssFor(sunset, 'rgba(255,240,230,0.07)', 'rgba(255,240,230,0.16)'), unlock: { type: 'runs', count: 3 } },
  { id: 'ocean', nameKey: 'theme.ocean', palette: ocean, css: cssFor(ocean, 'rgba(220,245,255,0.07)', 'rgba(220,245,255,0.16)'), unlock: { type: 'bestScore', points: 2500 } },
];

export function getTheme(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Color-blind-safe swap: good/bad become blue/orange (shapes already differ too). */
export function applyColorBlind(p: Palette): Palette {
  return { ...p, good: '#3d9bff', bad: '#ff8c1a', d: '#3d9bff', b: '#ff8c1a' };
}
