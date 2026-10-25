// Темы, обои и проверка настроек. Без Electron, чтобы это можно было гонять обычным node.
const PALETTES = {
  light: { mode: 'light', bg: '#f5f5f7', bar: '#ececf0', fg: '#1d1d1f', mute: '#6e6e73', pill: '#ffffff', symbol: '#6e6e73' },
  dark: { mode: 'dark', bg: '#1c1c20', bar: '#26262b', fg: '#f2f2f5', mute: '#9a9aa5', pill: '#34343b', symbol: '#9a9aa5' },
  gx: { mode: 'dark', bg: '#120812', bar: '#1c0e1e', fg: '#ffe8fb', mute: '#c892bc', pill: '#2a142e', symbol: '#ff8ade', accent: '#ff2bd6' },
  aurora: { mode: 'dark', bg: '#071410', bar: '#0c1c18', fg: '#e7fff6', mute: '#8dcebb', pill: '#12302a', symbol: '#5dffc8', accent: '#3dffc8' },
  ember: { mode: 'dark', bg: '#160e0a', bar: '#22140e', fg: '#fff1ea', mute: '#d7a894', pill: '#321c14', symbol: '#ff9a70', accent: '#ff6a3d' },
  ocean: { mode: 'dark', bg: '#071018', bar: '#0d1a28', fg: '#e7f3ff', mute: '#8eb0d4', pill: '#12283e', symbol: '#8ec8ff', accent: '#4aa8ff' },
  paper: { mode: 'light', bg: '#f6f1e7', bar: '#efe6d6', fg: '#2c2416', mute: '#7a6a55', pill: '#fffaf2', symbol: '#7a6a55', accent: '#c4552a' },
};

const THEME_IDS = ['system', 'light', 'dark', 'gx', 'aurora', 'ember', 'ocean', 'paper'];
const WALLPAPERS = ['none', 'dusk', 'aurora', 'ember', 'ocean', 'forest', 'mesh', 'grid', 'custom'];
const STARTUPS = ['newtab', 'blank', 'site', 'bookmarks'];
const SIDE_KEYS = ['bookmarks', 'history', 'downloads', 'passwords', 'settings', 'control'];

const DEFAULTS = {
  adblock: true,
  sleep: true,
  sleepMin: 10,
  forceDark: false,
  sidebar: true,
  accent: '#7c5cff',
  theme: 'system',
  wallpaper: 'dusk',
  startup: 'newtab',
  homeUrl: '',
  uiScale: 100,
  fontScale: 100,
  pageZoom: 100,
  sidebarItems: {
    bookmarks: true,
    history: true,
    downloads: true,
    passwords: true,
    settings: true,
    control: true,
  },
};

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** Собирает настройки только из известных полей и зажимает числа в допустимые рамки. */
function sanitizeSettings(current, patch) {
  const base = current && typeof current === 'object' ? current : {};
  const next = {
    ...DEFAULTS,
    ...base,
    sidebarItems: { ...DEFAULTS.sidebarItems, ...(base.sidebarItems || {}) },
  };
  const src = patch && typeof patch === 'object' ? patch : null;
  if (src) {
    for (const k of Object.keys(DEFAULTS)) {
      if (!(k in src)) continue;
      const v = src[k];
      if (k === 'sidebarItems') {
        if (v && typeof v === 'object') {
          for (const key of SIDE_KEYS) if (typeof v[key] === 'boolean') next.sidebarItems[key] = v[key];
        }
        continue;
      }
      if (typeof v === typeof DEFAULTS[k]) next[k] = v;
    }
  }
  for (const key of SIDE_KEYS) {
    if (typeof next.sidebarItems[key] !== 'boolean') next.sidebarItems[key] = DEFAULTS.sidebarItems[key];
  }
  if (typeof next.adblock !== 'boolean') next.adblock = DEFAULTS.adblock;
  if (typeof next.sleep !== 'boolean') next.sleep = DEFAULTS.sleep;
  if (typeof next.forceDark !== 'boolean') next.forceDark = DEFAULTS.forceDark;
  if (typeof next.sidebar !== 'boolean') next.sidebar = DEFAULTS.sidebar;
  if (!/^#[0-9a-f]{6}$/i.test(next.accent)) next.accent = DEFAULTS.accent;
  if (!THEME_IDS.includes(next.theme)) next.theme = 'system';
  if (!WALLPAPERS.includes(next.wallpaper)) next.wallpaper = DEFAULTS.wallpaper;
  if (!STARTUPS.includes(next.startup)) next.startup = 'newtab';
  next.homeUrl = String(next.homeUrl || '').slice(0, 2000);
  next.sleepMin = clampInt(next.sleepMin, 1, 120, DEFAULTS.sleepMin);
  next.uiScale = clampInt(next.uiScale, 80, 140, DEFAULTS.uiScale);
  next.fontScale = clampInt(next.fontScale, 80, 160, DEFAULTS.fontScale);
  next.pageZoom = clampInt(next.pageZoom, 50, 200, DEFAULTS.pageZoom);
  return next;
}

function resolveTheme(id, accent, nativeDark) {
  const key = THEME_IDS.includes(id) ? id : 'system';
  const paletteKey = key === 'system' ? (nativeDark ? 'dark' : 'light') : key;
  const src = PALETTES[paletteKey] || PALETTES.dark;
  const custom = typeof accent === 'string' && /^#[0-9a-f]{6}$/i.test(accent) ? accent : '';
  return {
    id: key,
    mode: src.mode,
    bg: src.bg,
    bar: src.bar,
    fg: src.fg,
    mute: src.mute,
    pill: src.pill,
    symbol: src.symbol,
    accent: custom || src.accent || DEFAULTS.accent,
  };
}

/** Какой themeSource выставить в Electron: фирменные темы фиксируют светлый или тёмный режим. */
function themeSourceFor(id, mode) {
  if (id === 'system') return 'system';
  return mode === 'light' ? 'light' : 'dark';
}

module.exports = {
  PALETTES,
  THEME_IDS,
  WALLPAPERS,
  STARTUPS,
  SIDE_KEYS,
  DEFAULTS,
  sanitizeSettings,
  resolveTheme,
  themeSourceFor,
};
