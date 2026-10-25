const { app, BaseWindow, WebContentsView, ipcMain, session, Menu, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const SHARED = require('./shared-path');
const { setupAdblock, adblockStats } = require('./adblock');

const SMOKE = process.argv.includes('--smoke-test');
const TOP = 80; // высота верхней панели: адресная строка + вкладки
const SIDE = 56; // ширина боковой панели
const START = pathToFileURL(path.join(SHARED, 'start.html')).href;
const DARK_CSS =
  'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}' +
  'img,video,picture,canvas{filter:invert(1) hue-rotate(180deg)!important}';
const DEFAULTS = { adblock: true, sleep: true, sleepMin: 10, forceDark: false, sidebar: true, accent: '#7c5cff' };
const THEME = {
  dark: { bg: '#1c1c20', bar: '#26262b', symbol: '#9a9aa5' },
  light: { bg: '#f5f5f7', bar: '#ececf0', symbol: '#6e6e73' },
};
const theme = () => (nativeTheme.shouldUseDarkColors ? THEME.dark : THEME.light);

let win = null;
let ui = null;
let panelW = 0;
let activeId = null;
let nextId = 1;
const tabs = new Map();
let data = { settings: { ...DEFAULTS }, bookmarks: [], history: [] };

// ---------- хранилище ----------
const dataFile = () => path.join(app.getPath('userData'), 'lumen.json');
function load() {
  try {
    const d = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    data = { ...data, ...d, settings: { ...DEFAULTS, ...(d.settings || {}) } };
  } catch {}
}
function saveNow() {
  try { fs.writeFileSync(dataFile(), JSON.stringify(data)); } catch {}
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

// ---------- адреса ----------
function toURL(input) {
  const s = String(input || '').trim();
  if (!s) return START;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(s) || /^localhost(:\d+)?([/?#].*)?$/i.test(s)) return 'https://' + s;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(s);
}

function addHistory(tab, url) {
  if (url.startsWith('file:')) return;
  data.history.unshift({ title: tab.title, url, t: Date.now() });
  if (data.history.length > 500) data.history.length = 500;
  save();
}

// ---------- вкладки ----------
function newTab(url = START, activateIt = true) {
  const id = nextId++;
  const tab = { id, url, title: 'Новая вкладка', favicon: '', view: null, sleeping: false, loading: false, lastActive: Date.now(), darkKey: null };
  tabs.set(id, tab);
  createView(tab, url);
  if (activateIt) {
    activate(id);
    if (url === START) focusUrl();
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
    if (!/^(https?|file):/i.test(u)) e.preventDefault();
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
  wc.on('dom-ready', () => applyDark(tab).catch(() => {}));
  wc.loadURL(url).catch(() => {});
}

function activate(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const prev = tabs.get(activeId);
  if (prev) {
    prev.lastActive = Date.now();
    if (prev.view) { try { win.contentView.removeChildView(prev.view); } catch {} }
  }
  activeId = id;
  tab.lastActive = Date.now();
  if (tab.sleeping) wake(tab);
  win.contentView.addChildView(tab.view);
  layout();
  tab.view.webContents.focus();
  pushState();
}

function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  if (tab.view) {
    try { win.contentView.removeChildView(tab.view); } catch {}
    tab.view.webContents.close();
  }
  tabs.delete(id);
  if (tabs.size === 0) return void newTab();
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

// Усыпление: убиваем процесс страницы, помним только адрес и заголовок
function sleepTab(tab) {
  if (tab.sleeping || !tab.view) return;
  const wc = tab.view.webContents;
  tab.url = wc.getURL() || tab.url;
  try { win.contentView.removeChildView(tab.view); } catch {}
  wc.close();
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
    try { await wc.removeInsertedCSS(tab.darkKey); } catch {}
    tab.darkKey = null;
  }
  if (data.settings.forceDark && !wc.getURL().startsWith('file:')) tab.darkKey = await wc.insertCSS(DARK_CSS);
}

// ---------- окно ----------
function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  ui.setBounds({ x: 0, y: 0, width: w, height: h });
  const side = data.settings.sidebar ? SIDE : 0;
  const tab = tabs.get(activeId);
  if (tab && tab.view) {
    tab.view.setBounds({ x: side + panelW, y: TOP, width: Math.max(0, w - side - panelW), height: Math.max(0, h - TOP) });
  }
}

function focusUrl() {
  if (!ui) return;
  ui.webContents.focus();
  ui.webContents.send('focus-url');
}

function pushState() {
  if (!ui || ui.webContents.isDestroyed()) return;
  const t = tabs.get(activeId);
  const wc = t && t.view && !t.view.webContents.isDestroyed() ? t.view.webContents : null;
  const url = wc ? wc.getURL() : t ? t.url : '';
  ui.webContents.send('state', {
    activeId,
    tabs: [...tabs.values()].map((x) => ({ id: x.id, title: x.title, url: x.url, favicon: x.favicon, loading: x.loading, sleeping: x.sleeping })),
    canBack: wc ? wc.navigationHistory.canGoBack() : false,
    canForward: wc ? wc.navigationHistory.canGoForward() : false,
    bookmarked: data.bookmarks.some((b) => b.url === url),
    settings: data.settings,
  });
}

// Цвета окна и кнопок «свернуть/закрыть» следуют за системной темой
function applyTheme() {
  if (!win || win.isDestroyed()) return;
  const t = theme();
  try { win.setBackgroundColor(t.bg); } catch {}
  try { win.setTitleBarOverlay({ color: t.bar, symbolColor: t.symbol, height: 44 }); } catch {}
  try { ui.setBackgroundColor(t.bg); } catch {}
}
nativeTheme.on('updated', applyTheme);

function createWindow(initialUrl) {
  const t = theme();
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
  win.contentView.addChildView(ui); // добавлен первым, значит под страницами
  ui.webContents.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('resize', layout);
  win.on('closed', () => { win = null; });
  layout();
  newTab(initialUrl || START);
}

function buildMenu() {
  const onPage = (fn) => () => {
    const t = tabs.get(activeId);
    if (t && t.view) fn(t.view.webContents);
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
        { label: 'Увеличить', accelerator: 'CmdOrCtrl+Plus', click: onPage((wc) => wc.setZoomLevel(wc.getZoomLevel() + 0.5)) },
        { label: 'Уменьшить', accelerator: 'CmdOrCtrl+-', click: onPage((wc) => wc.setZoomLevel(wc.getZoomLevel() - 0.5)) },
        { label: 'Сбросить масштаб', accelerator: 'CmdOrCtrl+0', click: onPage((wc) => wc.setZoomLevel(0)) },
        { label: 'Боковая панель', accelerator: 'CmdOrCtrl+Shift+S', click: () => { data.settings.sidebar = !data.settings.sidebar; save(); layout(); pushState(); } },
        { label: 'Инструменты разработчика', accelerator: 'F12', click: onPage((wc) => wc.toggleDevTools()) },
      ],
    },
    { role: 'editMenu' },
  ]));
}

// ---------- IPC (принимаем только от интерфейса) ----------
const fromUI = (e) => ui && e.sender === ui.webContents;
const on = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (fromUI(e)) fn(...a); });
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => (fromUI(e) ? fn(...a) : null));

on('ui:ready', () => pushState());
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
on('panel:width', (w) => { panelW = Math.max(0, Math.min(Number(w) || 0, 480)); layout(); });

handle('settings:set', (patch) => {
  if (patch && typeof patch === 'object') {
    for (const k of Object.keys(DEFAULTS)) {
      if (k in patch && typeof patch[k] === typeof DEFAULTS[k]) data.settings[k] = patch[k];
    }
  }
  if (!/^#[0-9a-f]{6}$/i.test(data.settings.accent)) data.settings.accent = DEFAULTS.accent;
  data.settings.sleepMin = Math.max(1, Math.min(120, data.settings.sleepMin | 0));
  save();
  for (const t of tabs.values()) applyDark(t).catch(() => {});
  layout();
  pushState();
  return data.settings;
});

handle('bm:list', () => data.bookmarks);
handle('bm:toggle', () => {
  const t = tabs.get(activeId);
  if (!t || !t.view) return;
  const url = t.view.webContents.getURL();
  if (!url || url.startsWith('file:')) return;
  const i = data.bookmarks.findIndex((b) => b.url === url);
  if (i >= 0) data.bookmarks.splice(i, 1);
  else data.bookmarks.unshift({ title: t.title, url });
  save();
  pushState();
});
on('bm:remove', (url) => { data.bookmarks = data.bookmarks.filter((b) => b.url !== url); save(); pushState(); });
handle('hist:list', () => data.history.slice(0, 200));
on('hist:clear', () => { data.history = []; save(); });

handle('tabs:metrics', () => {
  const metrics = app.getAppMetrics();
  return [...tabs.values()].map((t) => {
    let mem = 0;
    if (t.view && !t.view.webContents.isDestroyed()) {
      const m = metrics.find((x) => x.pid === t.view.webContents.getOSProcessId());
      if (m) mem = Math.round((m.memory.workingSetSize || 0) / 1024); // КБ -> МБ
    }
    return { id: t.id, title: t.title, mem, sleeping: t.sleeping };
  });
});
handle('adblock:stats', () => adblockStats());

// ---------- запуск ----------
app.setAppUserModelId('dev.g1drohz.lumen');

// Один экземпляр: повторный запуск открывает адрес в уже запущенном окне
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
    const ses = session.fromPartition('persist:lumen');
    ses.setUserAgent(app.userAgentFallback.replace(/\s(Electron|Lumen|lumen-desktop)\/\S+/gi, ''));
    // Пока нет диалога запроса, разрешаем только безопасное
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['fullscreen', 'clipboard-sanitized-write', 'pointerLock'].includes(perm)));
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
