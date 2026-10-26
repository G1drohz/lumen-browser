#!/usr/bin/env node
'use strict';
/** Inject express-panel + browser identity (Google login) into baked main.js */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'main.js');
let c = fs.readFileSync(file, 'utf8');

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

// --- express panel / shortcuts ---
if (!c.includes('LUMEN_SC ')) {
  replaceOnce(
    'passwords: [], downloads: [], pwNever: [], perms: {} }',
    'passwords: [], downloads: [], pwNever: [], shortcuts: ' + DS + ', perms: {} }',
    'blankData'
  );

  replaceOnce(
    "perms: d.perms && typeof d.perms === 'object' && !Array.isArray(d.perms) ? d.perms : {},",
    'shortcuts: Array.isArray(d.shortcuts) ? d.shortcuts.filter((s) => s && /^https?:\\/\\//i.test(s.url || \'\')).slice(0, 24) : ' +
      DS +
      ',\n      perms: d.perms && typeof d.perms === \'object\' && !Array.isArray(d.perms) ? d.perms : {},',
    'load.perms'
  );

  replaceOnce(
    'bookmarksMode: !!bookmarksMode,\n    fontScale: data.settings.fontScale,\n    bookmarks,\n  };',
    'bookmarksMode: !!bookmarksMode,\n    fontScale: data.settings.fontScale,\n    bookmarks,\n    shortcuts: (Array.isArray(data.shortcuts) ? data.shortcuts : []).slice(0, 24).map((b) => ({ title: String(b.title || \'\').slice(0, 80), url: String(b.url || \'\') })).filter((b) => /^https?:\\/\\//i.test(b.url)),\n    editable: !bookmarksMode,\n  };',
    'startConfig.return'
  );

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
}

if (c.includes('6 * 1024 * 1024')) {
  c = c.split('6 * 1024 * 1024').join('30 * 1024 * 1024');
}

/*
 * Google blocks Electron "Chrome" UAs. Use Firefox-like UA for Google auth
 * hosts (works in Wexond and other Electron browsers). Elsewhere keep Chrome.
 */
if (!c.includes('function setupBrowserIdentity')) {
  // Remove older chrome-only identity if present (from previous patches)
  if (c.includes('function setupChromeIdentity')) {
    // Replace call site first
    c = c.replace('setupChromeIdentity(ses);', 'setupBrowserIdentity(ses);');
    // Drop old function block by replacing with new one later via anchor
  }

  const anchors = [
    "ses.setUserAgent(app.userAgentFallback.replace(/\\s(Electron|Lumen|lumen-desktop)\\/\\S+/gi, ''));",
    'setupChromeIdentity(ses);',
    'setupBrowserIdentity(ses);',
  ];
  let swapped = false;
  for (const a of anchors) {
    if (c.includes(a) && a !== 'setupBrowserIdentity(ses);') {
      replaceOnce(a, 'setupBrowserIdentity(ses);', 'ua-call');
      swapped = true;
      break;
    }
    if (a === 'setupBrowserIdentity(ses);' && c.includes(a)) {
      swapped = true;
      break;
    }
  }
  if (!swapped) {
    console.error('patch-main: UA call anchor missing');
    process.exit(1);
  }

  // Strip previous chrome identity function if injected
  if (c.includes('function lumenChromeUA')) {
    const start = c.indexOf('function lumenChromeUA');
    const end = c.indexOf('app.whenReady().then(() => {', start);
    if (start >= 0 && end > start) {
      c = c.slice(0, start) + c.slice(end);
    }
  }

  replaceOnce(
    'app.whenReady().then(() => {',
    `function setupBrowserIdentity(ses) {
  const chrome = String(process.versions.chrome || '131.0.0.0');
  const platform =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'linux'
        ? 'X11; Linux x86_64'
        : 'Windows NT 10.0; Win64; x64';
  const chromeUA =
    'Mozilla/5.0 (' +
    platform +
    ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' +
    chrome +
    ' Safari/537.36';
  // Firefox UA — Google account pages accept this more often than Electron-Chrome
  const firefoxUA =
    process.platform === 'darwin'
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'
      : process.platform === 'linux'
        ? 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
  try { app.userAgentFallback = chromeUA; } catch (_) {}
  ses.setUserAgent(chromeUA);
  const googleHost =
    /(?:^|\\.)(google\\.com|google\\.[a-z]{2,3}|youtube\\.com|gmail\\.com|googleapis\\.com|gstatic\\.com)(?::|\\/|$)/i;
  try {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const h = Object.assign({}, details.requestHeaders || {});
      let host = '';
      try { host = new URL(details.url).hostname; } catch (_) {}
      const isGoogle = googleHost.test(host);
      h['User-Agent'] = isGoogle ? firefoxUA : chromeUA;
      if (isGoogle) {
        delete h['sec-ch-ua'];
        delete h['sec-ch-ua-mobile'];
        delete h['sec-ch-ua-platform'];
        delete h['sec-ch-ua-full-version-list'];
        delete h['Sec-CH-UA'];
        delete h['Sec-CH-UA-Mobile'];
        delete h['Sec-CH-UA-Platform'];
      }
      callback({ cancel: false, requestHeaders: h });
    });
  } catch (_) {}
}
app.whenReady().then(() => {`,
    'browserIdentity'
  );
}

fs.writeFileSync(file, c);
console.log('patch-main: ok, size', c.length);
