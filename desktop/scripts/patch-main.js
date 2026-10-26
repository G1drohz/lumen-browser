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

const DEFAULT_SHORTCUTS = [
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Wikipedia', url: 'https://wikipedia.org' },
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
];
const DS = JSON.stringify(DEFAULT_SHORTCUTS);

function must(idx, label) {
  if (idx < 0) {
    console.error('patch-main: missing:', label);
    process.exit(1);
  }
  return idx;
}

function replaceOnce(needle, replacement, label) {
  const i = c.indexOf(needle);
  must(i, label);
  c = c.slice(0, i) + replacement + c.slice(i + needle.length);
}

// 1) blankData: add shortcuts field
replaceOnce(
  'passwords: [], downloads: [], pwNever: [], perms: {} }',
  'passwords: [], downloads: [], pwNever: [], shortcuts: ' + DS + ', perms: {} }',
  'blankData'
);

// 2) load(): restore shortcuts from disk
replaceOnce(
  'perms: d.perms && typeof d.perms === \'object\' && !Array.isArray(d.perms) ? d.perms : {},',
  'shortcuts: Array.isArray(d.shortcuts) ? d.shortcuts.filter((s) => s && /^https?:\\/\\//i.test(s.url || \'\')).slice(0, 24) : ' +
    DS +
    ',\n      perms: d.perms && typeof d.perms === \'object\' && !Array.isArray(d.perms) ? d.perms : {},',
  'load.perms'
);

// 3) startConfig: include shortcuts + editable
replaceOnce(
  'bookmarksMode: !!bookmarksMode,\n    fontScale: data.settings.fontScale,\n    bookmarks,\n  };',
  'bookmarksMode: !!bookmarksMode,\n    fontScale: data.settings.fontScale,\n    bookmarks,\n    shortcuts: (Array.isArray(data.shortcuts) ? data.shortcuts : []).slice(0, 24).map((b) => ({ title: String(b.title || \'\').slice(0, 80), url: String(b.url || \'\') })).filter((b) => /^https?:\\/\\//i.test(b.url)),\n    editable: !bookmarksMode,\n  };',
  'startConfig.return'
);

// 4) helpers after startConfig
replaceOnce(
  'function decorateStart(tab) {',
  `function normalizeShortcut(row) {
  if (!row || typeof row !== 'object') return null;
  let url = String(row.url || '').trim();
  if (!url) return null;
  if (!/^https?:\\/\\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { return null; }
  const title = String(row.title || url.replace(/^https?:\\/\\//i, '').split('/')[0]).slice(0, 80);
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
    data.shortcuts = data.shortcuts.filter((s) => s.url !== String(payload.url || ''));
  } else if (op === 'reset') {
    data.shortcuts = ${DS};
  } else return;
  save();
  for (const t of tabs.values()) decorateStart(t).catch(() => {});
}
function decorateStart(tab) {`,
  'decorateStart'
);

// 5) console handler: LUMEN_SC
replaceOnce(
  "if (!message.startsWith('LUMEN_PW_SAVE ')) return;",
  `if (message.startsWith('LUMEN_SC ')) {
    let sc;
    try { sc = JSON.parse(message.slice(9)); } catch { return; }
    applyShortcutOp(sc);
    return;
  }
  if (!message.startsWith('LUMEN_PW_SAVE ')) return;`,
  'onPageConsole'
);

// 6) IPC
replaceOnce(
  "handle('wall:get', () => (data.settings.wallpaper === 'custom' ? wallpaperDataUrl() : ''));",
  `handle('wall:get', () => (data.settings.wallpaper === 'custom' ? wallpaperDataUrl() : ''));
handle('sc:list', () => (Array.isArray(data.shortcuts) ? data.shortcuts : []));
handle('sc:set', (list) => {
  data.shortcuts = (Array.isArray(list) ? list : []).map(normalizeShortcut).filter(Boolean).slice(0, 24);
  save();
  for (const t of tabs.values()) decorateStart(t).catch(() => {});
  return data.shortcuts;
});`,
  'sc.ipc'
);

fs.writeFileSync(file, c);
try {
  require('vm').runInNewContext(c, { require, module: { exports: {} }, exports: {}, console, process, Buffer, __dirname: path.dirname(file), __filename: file }, { timeout: 1 });
} catch (e) {
  // syntax is checked separately with node --check
}
console.log('patch-main: ok, size', c.length);
