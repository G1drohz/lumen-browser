const { app, BaseWindow, WebContentsView, ipcMain, session, Menu, nativeTheme, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const SHARED = require('./shared-path');
const { setupAdblock, adblockStats } = require('./adblock');
const { DEFAULTS, sanitizeSettings, resolveTheme, themeSourceFor } = require('./themes');
const { seal, openSeal, vaultSecure } = require('./vault');

const SMOKE = process.argv.includes('--smoke-test');
const START = pathToFileURL(path.join(SHARED, 'start.html')).href;
const DARK_CSS =
  'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}' +
  'img,video,picture,canvas{filter:invert(1) hue-rotate(180deg)!important}';
const PW_HOOK = `(function(){
  if (window.__lumenPw) return;
  window.__lumenPw = 1;
  function pickUser(form) {
    var user = form.querySelector('input[type=email],input[autocomplete=username],input[name=username],input[name=email],input[name=login],input[type=text]');
    return user ? user.value : '';
  }
  function capture(form) {
    if (!form || !form.querySelector) return;
    var pw = form.querySelector('input[type=password]');
    if (!pw || !pw.value) return;
    console.log('LUMEN_PW_SAVE ' + JSON.stringify({
      origin: location.origin,
      username: pickUser(form),
      password: pw.value
    }));
  }
  document.addEventListener('submit', function (ev) {
    capture(ev.target);
  }, true);
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var btn = t.closest('button[type=submit],input[type=submit],button:not([type])');
    if (!btn) return;
    var form = btn.form || btn.closest('form');
    if (form) setTimeout(function(){ capture(form); }, 0);
  }, true);
  document.addEventListener('focusout', function (ev) {
    var t = ev.target;
    if (!t || t.type !== 'password' || !t.value) return;
    var form = t.form || t.closest('form');
    if (form) setTimeout(function(){ capture(form); }, 50);
  }, true);
})();`;

let win = null;
let ui = null;
let panelW = 0;
let chromeTop = 80;
let chromeSide = 56;
let activeId = null;
let nextId = 1;
let permSeq = 1;
const tabs = new Map();
const activeDownloads = new Map();
const pendingPerm = new Map();
const offered = new Set();
let data = blankData();

const DEFAULT_SHORTCUTS = [
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Wikipedia', url: 'https://ru.wikipedia.org' },
  { title: 'Reddit', url: 'https://www.reddit.com' },
  { title: 'Telegram', url: 'https://web.telegram.org' },
  { title: 'Яндекс', url: 'https://ya.ru' },
  { title: 'Claude', url: 'https://claude.ai' },
  { title: 'Twitch', url: 'https://www.twitch.tv' },
];
function defaultShortcuts() {
  return DEFAULT_SHORTCUTS.map((s) => ({ title: s.title, url: s.url }));
}
function normalizeShortcuts(list) {
  if (!Array.isArray(list)) return defaultShortcuts();
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const url = String(s.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const title = String(s.title || url).slice(0, 80);
    out.push({ title, url });
    if (out.length >= 24) break;
  }
  return out;
}
function blankData() {
  return { settings: sanitizeSettings(DEFAULTS, {}), bookmarks: [], history: [], passwords: [], downloads: [], pwNever: [], perms: {}, shortcuts: defaultShortcuts() };
}

// ---------- хранилище ----------
const dataFile = () => path.join(app.getPath('userData'), 'lumen.json');
const wallFile = () => path.join(app.getPath('userData'), 'wallpaper');

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    data = {
      settings: sanitizeSettings(DEFAULTS, d.settings || {}),
      bookmarks: Array.isArray(d.bookmarks) ? d.bookmarks : [],
      history: Array.isArray(d.history) ? d.history : [],
      passwords: Array.isArray(d.passwords) ? d.passwords : [],
      downloads: Array.isArray(d.downloads) ? d.downloads : [],
      pwNever: Array.isArray(d.pwNever) ? d.pwNever.filter((x) => typeof x === 'string').slice(0, 200) : [],
      perms: d.perms && typeof d.perms === 'object' && !Array.isArray(d.perms) ? d.perms : {},
      shortcuts: normalizeShortcuts(d.shortcuts),
    };
  } catch { /* первый запуск */ }
}
function saveNow() {
  try { fs.writeFileSync(dataFile(), JSON.stringify(data)); } catch { /* диск недоступен */ }
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

function chromeTheme() {
  return resolveTheme(data.settings.theme, data.settings.accent, nativeTheme.shouldUseDarkColors);
}
function syncThemeSource() {
  const t = chromeTheme();
  try { nativeTheme.themeSource = themeSourceFor(t.id, t.mode); } catch { /* старые сборки */ }
}

function wallpaperDataUrl() {
  try {
    const buf = fs.readFileSync(wallFile());
    if (!buf.length || buf.length > 6 * 1024 * 1024) return '';
    const mime = fs.existsSync(wallFile() + '.mime') ? fs.readFileSync(wallFile() + '.mime', 'utf8').trim() : 'png';
    if (!/^(png|jpeg|webp|gif)$/.test(mime)) return '';
    return 'data:image/' + mime + ';base64,' + buf.toString('base64');
  } catch { return ''; }
}
function saveWallpaper(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!m) return false;
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > 6 * 1024 * 1024) return false;
  fs.writeFileSync(wallFile(), buf);
  fs.writeFileSync(wallFile() + '.mime', m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase());
  return true;
}

// ---------- адреса ----------
function toURL(input) {
  const s = String(input || '').trim();
  if (!s) return START;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(s) || /^localhost(:\d+)?([/?#].*)?$/i.test(s)) return 'https://' + s;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}
function launchURL(explicit) {
  if (explicit) return explicit;
  const s = data.settings;
  if (s.startup === 'blank') return 'about:blank';
  if (s.startup === 'site' && String(s.homeUrl || '').trim()) return toURL(s.homeUrl);
  if (s.startup === 'bookmarks') return START + '#bookmarks';
  return START;
}
function originOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin;
  } catch { return ''; }
}
function isStartUrl(url) {
  return typeof url === 'string' && url.startsWith('file:') && url.includes('start.html');
}
function addHistory(tab, url) {
  if (!url || url.startsWith('file:') || url.startsWith('about:')) return;
  data.history.unshift({ title: tab.title, url, t: Date.now() });
  if (data.history.length > 500) data.history.length = 500;
  save();
}

function startConfig(bookmarksMode) {
  const theme = chromeTheme();
  const bookmarks = data.bookmarks.slice(0, 24).map((b) => ({
    title: String(b.title || '').slice(0, 80),
    url: String(b.url || ''),
  })).filter((b) => /^https?:\/\//i.test(b.url));
  const shortcuts = normalizeShortcuts(data.shortcuts);
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
function decorateStart(tab) {
  if (!tab.view || tab.view.webContents.isDestroyed()) return Promise.resolve();
  const wc = tab.view.webContents;
  const url = wc.getURL();
  if (!isStartUrl(url)) return Promise.resolve();
  const cfg = JSON.stringify(startConfig(url.includes('#bookmarks'))).replace(/</g, '\\u003c');
  return wc.executeJavaScript('window.applyLumen&&window.applyLumen(' + cfg + ')');
}
function injectPw(tab) {
  if (!tab.view || tab.view.webContents.isDestroyed()) return;
  const url = tab.view.webContents.getURL();
  if (!/^https?:/i.test(url)) return;
  tab.view.webContents.executeJavaScript(PW_HOOK).catch(() => {});
}
function applyZoom(tab) {
  if (!tab.view || tab.view.webContents.isDestroyed()) return;
  tab.view.webContents.setZoomFactor((data.settings.pageZoom || 100) / 100);
}

// NOTE: REST OF FILE CONTINUES IN NEXT PUSH - incomplete
module.exports = {};
