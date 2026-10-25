#!/usr/bin/env node
'use strict';
/** Inject express-panel (shortcuts) support into baked main.js */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'main.js');
let c = fs.readFileSync(file, 'utf8');

if (c.includes('LUMEN_SC ')) {
  console.log('patch-main: already patched');
  process.exit(0);
}

const DEFAULT_SHORTCUTS = JSON.stringify([
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Wikipedia', url: 'https://wikipedia.org' },
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
]);

function mustReplace(oldStr, newStr, label) {
  if (!c.includes(oldStr)) {
    console.error('patch-main: missing anchor:', label);
    process.exit(1);
  }
  c = c.replace(oldStr, newStr);
}

mustReplace(
  'passwords: [], downloads: [], pwNever: [], perms: {} }',
  'passwords: [], downloads: [], pwNever: [], shortcuts: ' + DEFAULT_SHORTCUTS + ', perms: {} }',
  'blankData'
);

mustReplace(
  `passwords: Array.isArray(d.passwords) ? d.passwords : [],
      downloads: Array.isArray(d.downloads) ? d.downloads : [],
      pwNever: Array.isArray(d.pwNever) ? d.pwNever.filter((x) => typeof x === 'string').slice(0, 200) : [],
      perms: d.perms && typeof d.perms === 'object' && !Array.isArray(d.perms) ? d.perms : {},`,
  `passwords: Array.isArray(d.passwords) ? d.passwords : [],
      downloads: Array.isArray(d.downloads) ? d.downloads : [],
      pwNever: Array.isArray(d.pwNever) ? d.pwNever.filter((x) => typeof x === 'string').slice(0, 200) : [],
      shortcuts: Array.isArray(d.shortcuts) ? d.shortcuts.filter((s) => s && /^https?:\/\//i.test(s.url || '')).slice(0, 24) : ${DEFAULT_SHORTCUTS},
      perms: d.perms && typeof d.perms === 'object' && !Array.isArray(d.perms) ? d.perms : {},`,
  'load shortcuts'
);

mustReplace(
  `function startConfig(bookmarksMode) {
  const theme = chromeTheme();
  const bookmarks = data.bookmarks.slice(0, 24).map((b) => ({
    title: String(b.title || '').slice(0, 80),
    url: String(b.url || ''),
  })).filter((b) => /^https?:\/\//i.test(b.url));
  return {
    accent: theme.accent,
    mode: theme.mode,
    wallpaper: data.settings.wallpaper,
    image: data.settings.wallpaper === 'custom' ? wallpaperDataUrl() : '',
    bookmarksMode: !!bookmarksMode,
    fontScale: data.settings.fontScale,
    bookmarks,
  };
}`,
  `function startConfig(bookmarksMode) {
  const theme = chromeTheme();
  const bookmarks = data.bookmarks.slice(0, 24).map((b) => ({
    title: String(b.title || '').slice(0, 80),
    url: String(b.url || ''),
  })).filter((b) => /^https?:\/\//i.test(b.url));
  const shortcuts = (Array.isArray(data.shortcuts) ? data.shortcuts : []).slice(0, 24).map((b) => ({
    title: String(b.title || '').slice(0, 80),
    url: String(b.url || ''),
  })).filter((b) => /^https?:\/\//i.test(b.url));
  return {
    accent: theme.accent,
    mode: theme.mode,
    wallpaper: data.settings.wallpaper,
    image: data.settings.wallpaper === 'custom' ? wallpaperDataUrl() : '',
    bookmarksMode: !!bookmarksMode,
    fontScale: data.settings.fontScale,
    bookmarks,
    shortcuts,
    editable: !bookmarksMode,
  };
}
function normalizeShortcut(row) {
  if (!row || typeof row !== 'object') return null;
  let url = String(row.url || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { return null; }
  const title = String(row.title || url.replace(/^https?:\/\//i, '').split('/')[0]).slice(0, 80);
  return { title, url };
}
function applyShortcutOp(payload) {
  if (!payload || typeof payload !== 'object') return;
  const op = payload.op;
  if (!Array.isArray(data.shortcuts)) data.shortcuts = [];
  if (op === 'add') {
    const row = normalizeShortcut(payload);
    if (!row) return;
    data.shortcuts = data.shortcuts.filter((s) => s.url !== row.url);
    data.shortcuts.push(row);
    if (data.shortcuts.length > 24) data.shortcuts = data.shortcuts.slice(-24);
  } else if (op === 'remove') {
    const url = String(payload.url || '');
    data.shortcuts = data.shortcuts.filter((s) => s.url !== url);
  } else if (op === 'reset') {
    data.shortcuts = ${DEFAULT_SHORTCUTS};
  } else return;
  save();
  for (const t of tabs.values()) decorateStart(t).catch(() => {});
}`,
  'startConfig'
);

mustReplace(
  `function onPageConsole(tab, args) {
  const message = consoleText(args);
  if (!message.startsWith('LUMEN_PW_SAVE ')) return;
  let payload;
  try { payload = JSON.parse(message.slice('LUMEN_PW_SAVE '.length)); } catch { return; }
  offerPassword(payload);
}`,
  `function onPageConsole(tab, args) {
  const message = consoleText(args);
  if (message.startsWith('LUMEN_SC ')) {
    let payload;
    try { payload = JSON.parse(message.slice('LUMEN_SC '.length)); } catch { return; }
    applyShortcutOp(payload);
    return;
  }
  if (!message.startsWith('LUMEN_PW_SAVE ')) return;
  let payload;
  try { payload = JSON.parse(message.slice('LUMEN_PW_SAVE '.length)); } catch { return; }
  offerPassword(payload);
}`,
  'onPageConsole'
);

mustReplace(
  "handle('wall:get', () => (data.settings.wallpaper === 'custom' ? wallpaperDataUrl() : ''));",
  `handle('wall:get', () => (data.settings.wallpaper === 'custom' ? wallpaperDataUrl() : ''));
handle('sc:list', () => (Array.isArray(data.shortcuts) ? data.shortcuts : []));
handle('sc:set', (list) => {
  data.shortcuts = (Array.isArray(list) ? list : []).map(normalizeShortcut).filter(Boolean).slice(0, 24);
  save();
  for (const t of tabs.values()) decorateStart(t).catch(() => {});
  return data.shortcuts;
});`,
  'sc handlers'
);

fs.writeFileSync(file, c);
console.log('patch-main: shortcuts injected, size', c.length);
