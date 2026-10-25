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
  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form || !form.querySelector) return;
    var pw = form.querySelector('input[type=password]');
    if (!pw || !pw.value) return;
    var user = form.querySelector('input[type=email],input[type=text],input[autocomplete=username]');
    console.log('LUMEN_PW_SAVE ' + JSON.stringify({
      origin: location.origin,
      username: user ? user.value : '',
      password: pw.value
    }));
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

function blankData() {
  return { settings: sanitizeSettings(DEFAULTS, {}), bookmarks: [], history: [], passwords: [], downloads: [], pwNever: [], perms: {} };
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
  return {
    accent: theme.accent,
    mode: theme.mode,
    wallpaper: data.settings.wallpaper,
    image: data.settings.wallpaper === 'custom' ? wallpaperDataUrl() : '',
    bookmarksMode: !!bookmarksMode,
    fontScale: data.settings.fontScale,
    bookmarks,
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

// ---------- вкладки ----------
function newTab(url = START, activateIt = true) {
  const id = nextId++;
  const tab = { id, url, title: 'Новая вкладка', favicon: '', view: null, sleeping: false, loading: false, lastActive: Date.now(), darkKey: null };
  tabs.set(id, tab);
  createView(tab, url);
  if (activateIt) {
    activate(id);
    if (url === START || isStartUrl(url)) focusUrl();
  } else {
    pushState();
  }
  return id;
}

function createView(tab, url) {
  const view = new WebContentsView({
    webPreferences: { partition: 'persist:lumen', sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  tab.view = view;
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u)) newTab(u);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, u) => {
    if (!/^(https?|file|about):/i.test(u)) e.preventDefault();
  });
  wc.on('page-title-updated', (_e, title) => {
    tab.title = title;
    const h = data.history[0];
    if (h && h.url === wc.getURL()) h.title = title;
    pushState();
  });
  wc.on('page-favicon-updated', (_e, icons) => { tab.favicon = icons[0] || ''; pushState(); });
  wc.on('did-start-loading', () => { tab.loading = true; pushState(); });
  wc.on('did-stop-loading', () => { tab.loading = false; pushState(); });
  wc.on('did-navigate', (_e, u) => { tab.url = u; tab.favicon = ''; addHistory(tab, u); pushState(); });
  wc.on('did-navigate-in-page', (_e, u, isMain) => { if (isMain) { tab.url = u; pushState(); } });
  wc.on('dom-ready', () => {
    applyDark(tab).catch(() => {});
    decorateStart(tab).catch(() => {});
    injectPw(tab);
  });
  wc.on('zoom-changed', () => { if (tab.id === activeId) pushState(); });
  wc.on('found-in-page', (_e, result) => {
    if (!ui || ui.webContents.isDestroyed() || tab.id !== activeId || !result.finalUpdate) return;
    ui.webContents.send('find-result', { active: result.activeMatchOrdinal || 0, total: result.matches || 0 });
  });
  wc.on('console-message', (...a) => onPageConsole(tab, a));
  applyZoom(tab);
  wc.loadURL(url).catch(() => {});
}

function consoleText(args) {
  if (args[0] && typeof args[0].message === 'string') return args[0].message;
  if (args[1] && typeof args[1].message === 'string') return args[1].message;
  if (typeof args[2] === 'string') return args[2];
  if (typeof args[1] === 'string') return args[1];
  return '';
}
function onPageConsole(tab, args) {
  const message = consoleText(args);
  if (!message.startsWith('LUMEN_PW_SAVE ')) return;
  let payload;
  try { payload = JSON.parse(message.slice('LUMEN_PW_SAVE '.length)); } catch { return; }
  offerPassword(payload);
}

function activate(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const prev = tabs.get(activeId);
  if (prev) {
    prev.lastActive = Date.now();
    if (prev.view && !prev.view.webContents.isDestroyed()) {
      try { prev.view.webContents.stopFindInPage('clearSelection'); } catch { /* уже закрыта */ }
    }
    if (prev.view) { try { win.contentView.removeChildView(prev.view); } catch { /* уже убрана */ } }
  }
  activeId = id;
  tab.lastActive = Date.now();
  if (tab.sleeping) wake(tab);
  win.contentView.addChildView(tab.view);
  layout();
  tab.view.webContents.focus();
  if (ui && !ui.webContents.isDestroyed()) ui.webContents.send('find-result', { active: 0, total: 0 });
  pushState();
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (tab.view) {
    try { win.contentView.removeChildView(tab.view); } catch { /* уже убрана */ }
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
  }
  tabs.delete(id);
  if (tabs.size === 0) return void newTab(launchURL());
  if (activeId === id) {
    const ids = [...tabs.keys()];
    activate(ids[ids.length - 1]);
  } else {
    pushState();
  }
}

function cycle(d) {
  const ids = [...tabs.keys()];
  const i = ids.indexOf(activeId);
  activate(ids[(i + d + ids.length) % ids.length]);
}

function sleepTab(tab) {
  if (tab.sleeping || !tab.view) return;
  const wc = tab.view.webContents;
  tab.url = wc.isDestroyed() ? tab.url : (wc.getURL() || tab.url);
  try { win.contentView.removeChildView(tab.view); } catch { /* уже убрана */ }
  if (!wc.isDestroyed()) wc.close();
  tab.view = null;
  tab.sleeping = true;
  tab.loading = false;
  pushState();
}

function wake(tab) {
  if (!tab.sleeping) return;
  tab.sleeping = false;
  createView(tab, tab.url);
}

function sleepSweep() {
  if (!data.settings.sleep) return;
  const limit = data.settings.sleepMin * 60000;
  for (const t of tabs.values()) {
    if (t.id === activeId || t.sleeping || !t.view) continue;
    if (Date.now() - t.lastActive > limit && !t.view.webContents.isCurrentlyAudible()) sleepTab(t);
  }
}

function navigate(tab, url) {
  tab.url = url;
  if (tab.sleeping) wake(tab);
  else tab.view.webContents.loadURL(url).catch(() => {});
}

async function applyDark(tab) {
  if (!tab.view) return;
  const wc = tab.view.webContents;
  if (wc.isDestroyed()) return;
  if (tab.darkKey) {
    try { await wc.removeInsertedCSS(tab.darkKey); } catch { /* стиля уже нет */ }
    tab.darkKey = null;
  }
  const url = wc.getURL();
  if (data.settings.forceDark && url && !url.startsWith('file:') && !url.startsWith('about:')) {
    tab.darkKey = await wc.insertCSS(DARK_CSS);
  }
}

function bumpZoom(delta) {
  const t = tabs.get(activeId);
  if (!t || !t.view || t.view.webContents.isDestroyed()) return;
  const cur = Math.round(t.view.webContents.getZoomFactor() * 100);
  const next = Math.max(50, Math.min(200, cur + delta));
  t.view.webContents.setZoomFactor(next / 100);
  data.settings.pageZoom = next;
  save();
  pushState();
}

// ---------- загрузки ----------
function safeName(filename) {
  const clean = path.basename(String(filename || 'download')).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').slice(0, 180);
  return clean || 'download';
}
function uniqueDownloadName(filename) {
  const dir = app.getPath('downloads');
  const clean = safeName(filename);
  const ext = path.extname(clean);
  const stem = ext ? clean.slice(0, -ext.length) : clean;
  let candidate = clean;
  let n = 1;
  while (fs.existsSync(path.join(dir, candidate)) && n < 1000) {
    candidate = stem + ' (' + n + ')' + ext;
    n += 1;
  }
  return candidate;
}
function downloadSnapshot() {
  const active = [...activeDownloads.values()].map((x) => ({ ...x.rec, live: true }));
  const ids = new Set(active.map((d) => d.id));
  const done = data.downloads.filter((d) => !ids.has(d.id)).map((d) => ({ ...d, live: false }));
  return [...active, ...done].slice(0, 100);
}
function findDownload(id) {
  const live = activeDownloads.get(id);
  if (live) return live.rec;
  return data.downloads.find((d) => d.id === id) || null;
}
function setupDownloads(ses) {
  ses.on('will-download', (_e, item) => {
    const id = crypto.randomBytes(8).toString('hex');
    const dest = path.join(app.getPath('downloads'), uniqueDownloadName(item.getFilename()));
    item.setSavePath(dest);
    const rec = {
      id,
      name: path.basename(dest),
      url: item.getURL(),
      path: dest,
      state: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
      started: Date.now(),
    };
    activeDownloads.set(id, { rec, item });
    const touch = () => {
      rec.received = item.getReceivedBytes();
      rec.total = item.getTotalBytes();
      rec.state = item.isPaused() ? 'paused' : 'progressing';
      pushState();
    };
    item.on('updated', touch);
    item.once('done', (_ev, state) => {
      rec.state = state;
      rec.received = item.getReceivedBytes();
      rec.total = item.getTotalBytes() || rec.received;
      rec.path = item.getSavePath() || dest;
      activeDownloads.delete(id);
      data.downloads.unshift({ ...rec });
      if (data.downloads.length > 100) data.downloads.length = 100;
      save();
      pushState();
    });
    pushState();
  });
}

// ---------- пароли ----------
function publicPasswords() {
  return data.passwords.map((p) => ({ id: p.id, origin: p.origin, username: p.username, updated: p.updated || 0 }));
}
function validOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin;
  } catch { return ''; }
}
function upsertPassword(payload) {
  const origin = validOrigin(payload && payload.origin);
  const username = String((payload && payload.username) || '').slice(0, 200);
  const password = String((payload && payload.password) || '');
  if (!origin || !password || password.length > 500) return false;
  const existing = data.passwords.find((p) => p.origin === origin && p.username === username);
  const secret = seal(password);
  if (existing) {
    existing.secret = secret;
    existing.updated = Date.now();
  } else {
    data.passwords.unshift({ id: crypto.randomBytes(8).toString('hex'), origin, username, secret, updated: Date.now() });
    if (data.passwords.length > 500) data.passwords.length = 500;
  }
  saveNow();
  pushState();
  return true;
}
function offerPassword(payload) {
  const origin = validOrigin(payload && payload.origin);
  const username = String((payload && payload.username) || '').slice(0, 200);
  const password = String((payload && payload.password) || '');
  if (!origin || !password || password.length > 500) return;
  if (data.pwNever.includes(origin)) return;
  const mark = crypto.createHash('sha256').update(origin + '\n' + username + '\n' + password).digest('hex');
  if (offered.has(mark)) return;
  const same = data.passwords.find((p) => p.origin === origin && p.username === username);
  if (same && openSeal(same.secret) === password) return;
  offered.add(mark);
  if (!ui || ui.webContents.isDestroyed()) return;
  ui.webContents.send('pw:offer', { origin, username, password, update: !!same });
}
async function fillLogin(wc, username, password) {
  if (!wc || wc.isDestroyed()) return false;
  const cred = JSON.stringify({ username: String(username || ''), password: String(password || '') });
  return wc.executeJavaScript(`(() => {
    const cred = ${cred};
    const pw = document.querySelector('input[type=password]');
    if (!pw) return false;
    const scope = pw.form || document;
    const user = scope.querySelector('input[type=email],input[type=text],input[autocomplete=username]');
    const set = (el, v) => {
      if (!el) return;
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (proto && proto.set) proto.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(user, cred.username);
    set(pw, cred.password);
    return true;
  })()`);
}

// ---------- окно ----------
function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  ui.setBounds({ x: 0, y: 0, width: w, height: h });
  const tab = tabs.get(activeId);
  if (tab && tab.view) {
    tab.view.setBounds({
      x: chromeSide + panelW,
      y: chromeTop,
      width: Math.max(0, w - chromeSide - panelW),
      height: Math.max(0, h - chromeTop),
    });
  }
}

function focusUrl() {
  if (!ui || ui.webContents.isDestroyed()) return;
  ui.webContents.focus();
  ui.webContents.send('focus-url');
}

function activeWC() {
  const t = tabs.get(activeId);
  if (!t || !t.view || t.view.webContents.isDestroyed()) return null;
  return t.view.webContents;
}

function pushState() {
  if (!ui || ui.webContents.isDestroyed()) return;
  const wc = activeWC();
  const t = tabs.get(activeId);
  const url = wc ? wc.getURL() : t ? t.url : '';
  const origin = originOf(url);
  ui.webContents.send('state', {
    activeId,
    tabs: [...tabs.values()].map((x) => ({ id: x.id, title: x.title, url: x.url, favicon: x.favicon, loading: x.loading, sleeping: x.sleeping })),
    canBack: wc ? wc.navigationHistory.canGoBack() : false,
    canForward: wc ? wc.navigationHistory.canGoForward() : false,
    bookmarked: data.bookmarks.some((b) => b.url === url),
    settings: data.settings,
    chrome: chromeTheme(),
    downloads: downloadSnapshot(),
    zoom: wc ? Math.round(wc.getZoomFactor() * 100) : data.settings.pageZoom,
    hasLogins: !!(origin && data.passwords.some((p) => p.origin === origin)),
    secureVault: vaultSecure(),
  });
}

function applyTheme() {
  if (!win || win.isDestroyed()) return;
  const t = chromeTheme();
  const uiScale = (data.settings.uiScale || 100) / 100;
  try { win.setBackgroundColor(t.bg); } catch { /* окно закрывается */ }
  try { win.setTitleBarOverlay({ color: t.bar, symbolColor: t.symbol, height: Math.max(32, Math.round(44 * uiScale)) }); } catch { /* не все ОС */ }
  try { ui.setBackgroundColor(t.bg); } catch { /* ещё не создан */ }
}
nativeTheme.on('updated', () => { applyTheme(); pushState(); for (const tab of tabs.values()) decorateStart(tab).catch(() => {}); });

function createWindow(initialUrl) {
  syncThemeSource();
  const t = chromeTheme();
  win = new BaseWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: t.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: t.bar, symbolColor: t.symbol, height: 44 },
    trafficLightPosition: { x: 16, y: 14 },
  });
  win.setMenuBarVisibility(false);
  ui = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });
  ui.setBackgroundColor(t.bg);
  win.contentView.addChildView(ui);
  ui.webContents.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('resize', layout);
  win.on('closed', () => { win = null; });
  layout();
  newTab(initialUrl || launchURL());
}

function openPanel(name) {
  if (ui && !ui.webContents.isDestroyed()) ui.webContents.send('open-panel', name);
}

function buildMenu() {
  const onPage = (fn) => () => {
    const wc = activeWC();
    if (wc) fn(wc);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Вкладки',
      submenu: [
        { label: 'Новая вкладка', accelerator: 'CmdOrCtrl+T', click: () => newTab() },
        { label: 'Закрыть вкладку', accelerator: 'CmdOrCtrl+W', click: () => closeTab(activeId) },
        { label: 'Адресная строка', accelerator: 'CmdOrCtrl+L', click: focusUrl },
        { label: 'Следующая вкладка', accelerator: 'Ctrl+Tab', click: () => cycle(1) },
        { label: 'Предыдущая вкладка', accelerator: 'Ctrl+Shift+Tab', click: () => cycle(-1) },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { label: 'Обновить', accelerator: 'CmdOrCtrl+R', click: onPage((wc) => wc.reload()) },
        { label: 'Назад', accelerator: 'Alt+Left', click: onPage((wc) => wc.navigationHistory.goBack()) },
        { label: 'Вперёд', accelerator: 'Alt+Right', click: onPage((wc) => wc.navigationHistory.goForward()) },
        { label: 'Найти на странице', accelerator: 'CmdOrCtrl+F', click: () => ui && ui.webContents.send('open-find') },
        { label: 'Увеличить', accelerator: 'CmdOrCtrl+Plus', click: () => bumpZoom(10) },
        { label: 'Уменьшить', accelerator: 'CmdOrCtrl+-', click: () => bumpZoom(-10) },
        { label: 'Сбросить масштаб', accelerator: 'CmdOrCtrl+0', click: () => bumpZoom(100 - Math.round((activeWC() ? activeWC().getZoomFactor() : 1) * 100)) },
        { label: 'Боковая панель', accelerator: 'CmdOrCtrl+Shift+S', click: () => { data.settings = sanitizeSettings(data.settings, { sidebar: !data.settings.sidebar }); save(); layout(); pushState(); } },
        { label: 'Загрузки', accelerator: 'CmdOrCtrl+J', click: () => openPanel('downloads') },
        { label: 'Пароли', accelerator: 'CmdOrCtrl+Shift+P', click: () => openPanel('passwords') },
        { label: 'Настройки', accelerator: 'CmdOrCtrl+,', click: () => openPanel('settings') },
        { label: 'Инструменты разработчика', accelerator: 'F12', click: onPage((wc) => wc.toggleDevTools()) },
      ],
    },
    { role: 'editMenu' },
  ]));
}

// ---------- IPC ----------
const fromUI = (e) => ui && e.sender === ui.webContents;
const on = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (fromUI(e)) fn(...a); });
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => (fromUI(e) ? fn(...a) : null));

on('ui:ready', () => { applyTheme(); pushState(); });
on('tab:new', () => newTab());
on('tab:activate', (id) => activate(id));
on('tab:close', (id) => closeTab(id));
on('tab:sleep', (id) => { const t = tabs.get(id); if (t && id !== activeId) sleepTab(t); });
on('nav:go', (text) => {
  const t = tabs.get(activeId);
  if (!t) return;
  navigate(t, toURL(text));
  if (t.view) t.view.webContents.focus();
});
on('nav:action', (a) => {
  const t = tabs.get(activeId);
  if (!t) return;
  if (a === 'home') return navigate(t, START);
  if (!t.view) return;
  const wc = t.view.webContents;
  if (a === 'back') wc.navigationHistory.goBack();
  else if (a === 'forward') wc.navigationHistory.goForward();
  else if (a === 'reload') (wc.isLoading() ? wc.stop() : wc.reload());
});
on('panel:width', (w) => { panelW = Math.max(0, Math.min(Number(w) || 0, 520)); layout(); });
on('chrome:bounds', (top, side) => {
  const t = Math.max(48, Math.min(420, top | 0));
  const s = Math.max(0, Math.min(140, side | 0));
  if (t === chromeTop && s === chromeSide) return;
  chromeTop = t;
  chromeSide = s;
  layout();
});
on('zoom:set', (percent) => {
  const next = Math.max(50, Math.min(200, percent | 0));
  data.settings = sanitizeSettings(data.settings, { pageZoom: next });
  const wc = activeWC();
  if (wc) wc.setZoomFactor(next / 100);
  save();
  pushState();
});
on('find:query', (text, opts) => {
  const wc = activeWC();
  if (!wc) return;
  const q = String(text || '');
  if (!q) { wc.stopFindInPage('clearSelection'); if (ui) ui.webContents.send('find-result', { active: 0, total: 0 }); return; }
  const o = opts || {};
  wc.findInPage(q, { forward: o.forward !== false, findNext: !!o.again });
});
on('perm:reply', (id, allow) => {
  const pending = pendingPerm.get(id);
  if (!pending) return;
  pendingPerm.delete(id);
  clearTimeout(pending.timer);
  if (pending.host) {
    data.perms[pending.host + '|' + pending.perm] = allow ? 'allow' : 'block';
    const keys = Object.keys(data.perms);
    if (keys.length > 300) delete data.perms[keys[0]];
    save();
  }
  pending.cb(!!allow);
});

handle('settings:set', (patch) => {
  const prevZoom = data.settings.pageZoom;
  const prevTheme = data.settings.theme;
  data.settings = sanitizeSettings(data.settings, patch || {});
  if (!patch || typeof patch !== 'object' || !('pageZoom' in patch)) data.settings.pageZoom = prevZoom;
  save();
  if (data.settings.theme !== prevTheme || (patch && 'theme' in patch)) syncThemeSource();
  applyTheme();
  for (const t of tabs.values()) {
    applyDark(t).catch(() => {});
    decorateStart(t).catch(() => {});
    if (patch && typeof patch === 'object' && 'pageZoom' in patch) applyZoom(t);
  }
  layout();
  pushState();
  return data.settings;
});

handle('wall:set', (dataUrl) => {
  const ok = saveWallpaper(dataUrl);
  if (ok) data.settings = sanitizeSettings(data.settings, { wallpaper: 'custom' });
  save();
  for (const t of tabs.values()) decorateStart(t).catch(() => {});
  pushState();
  return ok;
});
handle('wall:get', () => (data.settings.wallpaper === 'custom' ? wallpaperDataUrl() : ''));
on('wall:clear', () => {
  try { fs.unlinkSync(wallFile()); } catch { /* файла нет */ }
  try { fs.unlinkSync(wallFile() + '.mime'); } catch { /* файла нет */ }
  if (data.settings.wallpaper === 'custom') data.settings = sanitizeSettings(data.settings, { wallpaper: 'dusk' });
  save();
  for (const t of tabs.values()) decorateStart(t).catch(() => {});
  pushState();
});

handle('bm:list', () => data.bookmarks);
handle('bm:toggle', () => {
  const t = tabs.get(activeId);
  const wc = activeWC();
  if (!t || !wc) return;
  const url = wc.getURL();
  if (!url || url.startsWith('file:') || url.startsWith('about:')) return;
  const i = data.bookmarks.findIndex((b) => b.url === url);
  if (i >= 0) data.bookmarks.splice(i, 1);
  else data.bookmarks.unshift({ title: t.title, url });
  save();
  pushState();
  for (const tab of tabs.values()) decorateStart(tab).catch(() => {});
});
on('bm:remove', (url) => {
  data.bookmarks = data.bookmarks.filter((b) => b.url !== url);
  save();
  pushState();
  for (const tab of tabs.values()) decorateStart(tab).catch(() => {});
});
handle('hist:list', () => data.history.slice(0, 200));
on('hist:clear', () => { data.history = []; save(); });

handle('pw:list', () => publicPasswords());
handle('pw:save', (payload) => ({ ok: upsertPassword(payload) }));
handle('pw:reveal', (id) => {
  const row = data.passwords.find((p) => p.id === id);
  return row ? openSeal(row.secret) : '';
});
on('pw:remove', (id) => {
  data.passwords = data.passwords.filter((p) => p.id !== id);
  save();
  pushState();
});
on('pw:never', (origin) => {
  const o = validOrigin(origin);
  if (!o || data.pwNever.includes(o)) return;
  data.pwNever.push(o);
  save();
});
on('pw:never-clear', () => { data.pwNever = []; save(); });
handle('pw:fill', async (id) => {
  const row = data.passwords.find((p) => p.id === id);
  const wc = activeWC();
  if (!row || !wc) return false;
  return !!(await fillLogin(wc, row.username, openSeal(row.secret)));
});
handle('pw:fill-best', async () => {
  const wc = activeWC();
  if (!wc) return 'none';
  const origin = originOf(wc.getURL());
  const rows = data.passwords.filter((p) => p.origin === origin);
  if (rows.length === 1) return (await fillLogin(wc, rows[0].username, openSeal(rows[0].secret))) ? 'filled' : 'nofield';
  if (rows.length > 1) { openPanel('passwords'); return 'many'; }
  return 'none';
});

on('dl:cancel', (id) => {
  const live = activeDownloads.get(id);
  if (live) live.item.cancel();
});
on('dl:pause', (id) => {
  const live = activeDownloads.get(id);
  if (!live) return;
  if (live.item.isPaused()) live.item.resume();
  else live.item.pause();
});
on('dl:open', (id) => {
  const d = findDownload(id);
  if (d && d.path && d.state === 'completed' && fs.existsSync(d.path)) shell.openPath(d.path);
});
on('dl:show', (id) => {
  const d = findDownload(id);
  if (d && d.path && fs.existsSync(d.path)) shell.showItemInFolder(d.path);
});
on('dl:forget', (id) => {
  const live = activeDownloads.get(id);
  if (live) return;
  data.downloads = data.downloads.filter((d) => d.id !== id);
  save();
  pushState();
});
on('dl:clear', () => {
  data.downloads = [];
  save();
  pushState();
});

handle('tabs:metrics', () => {
  const metrics = app.getAppMetrics();
  return [...tabs.values()].map((t) => {
    let mem = 0;
    if (t.view && !t.view.webContents.isDestroyed()) {
      const m = metrics.find((x) => x.pid === t.view.webContents.getOSProcessId());
      if (m) mem = Math.round((m.memory.workingSetSize || 0) / 1024);
    }
    return { id: t.id, title: t.title, mem, sleeping: t.sleeping };
  });
});
handle('adblock:stats', () => adblockStats());
handle('data:clear', async () => {
  data.history = [];
  data.perms = {};
  const ses = session.fromPartition('persist:lumen');
  await ses.clearCache();
  await ses.clearStorageData();
  saveNow();
  pushState();
  return true;
});

// ---------- разрешения сайтов ----------
function setupPermissions(ses) {
  const safe = ['fullscreen', 'clipboard-sanitized-write', 'pointerLock'];
  const askable = ['media', 'geolocation', 'notifications', 'display-capture', 'clipboard-read', 'idle-detection'];
  ses.setPermissionRequestHandler((wc, perm, cb) => {
    if (safe.includes(perm)) return cb(true);
    if (!askable.includes(perm)) return cb(false);
    let host = '';
    try { host = new URL(wc.getURL()).host; } catch { /* about:blank */ }
    const remembered = host ? data.perms[host + '|' + perm] : '';
    if (remembered === 'allow') return cb(true);
    if (remembered === 'block') return cb(false);
    if (!ui || ui.webContents.isDestroyed()) return cb(false);
    const id = permSeq++;
    const timer = setTimeout(() => {
      const pending = pendingPerm.get(id);
      if (!pending) return;
      pendingPerm.delete(id);
      pending.cb(false);
    }, 45000);
    pendingPerm.set(id, { cb, timer, host, perm });
    ui.webContents.send('perm:ask', { id, perm, host });
  });
}

// ---------- запуск ----------
app.setAppUserModelId('dev.g1drohz.lumen');

const gotLock = SMOKE || app.requestSingleInstanceLock();
const urlFromArgs = (argv) => argv.find((a) => /^https?:\/\//i.test(a));

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const u = urlFromArgs(argv);
    if (u) newTab(u);
  });

  app.whenReady().then(() => {
    load();
    syncThemeSource();
    const ses = session.fromPartition('persist:lumen');
    ses.setUserAgent(app.userAgentFallback.replace(/\s(Electron|Lumen|lumen-desktop)\/\S+/gi, ''));
    setupPermissions(ses);
    setupDownloads(ses);
    setupAdblock(ses, () => data.settings.adblock);
    createWindow(urlFromArgs(process.argv));
    buildMenu();
    setInterval(sleepSweep, 30000);
    if (SMOKE) {
      require('./smoke')({ ui: () => ui, tabs, newTab, activate, sleepTab, adblockStats });
    }
  });
}

app.on('before-quit', saveNow);
app.on('window-all-closed', () => app.quit());
