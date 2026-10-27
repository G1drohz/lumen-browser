'use strict';

const $ = (s) => document.querySelector(s);

const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || k === 'html') continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = String(v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter((x) => x != null && x !== false));
  return e;
};

const THEMES = [
  ['system', 'Система', ''],
  ['light', 'Светлая', ''],
  ['dark', 'Тёмная', ''],
  ['gx', 'GX', '#ff2bd6'],
  ['aurora', 'Аврора', '#3dffc8'],
  ['ember', 'Уголь', '#ff6a3d'],
  ['ocean', 'Океан', '#4aa8ff'],
  ['paper', 'Бумага', '#c4552a'],
];
const WALLS = [
  ['none', 'Нет', 'var(--pill)'],
  ['dusk', 'Сумерки', 'linear-gradient(135deg,#2a2150,#12121a 60%)'],
  ['aurora', 'Сияние', 'linear-gradient(135deg,#0c3b32,#12302a)'],
  ['ember', 'Угли', 'linear-gradient(135deg,#5a2614,#160e0a)'],
  ['ocean', 'Глубина', 'linear-gradient(135deg,#16375c,#071018)'],
  ['forest', 'Лес', 'linear-gradient(135deg,#1c4a30,#0c1610)'],
  ['mesh', 'Сетка', 'linear-gradient(135deg,#3a2a55,#1a2744)'],
  ['grid', 'Клетка', 'repeating-linear-gradient(0deg,#888 0 1px,transparent 1px 10px),repeating-linear-gradient(90deg,#888 0 1px,transparent 1px 10px)'],
];
const PERMS = {
  media: 'камере и микрофону',
  geolocation: 'геолокации',
  notifications: 'уведомлениям',
  'display-capture': 'записи экрана',
  'clipboard-read': 'буферу обмена',
  'idle-detection': 'отслеживанию бездействия',
};
const SIDE_LABELS = {
  bookmarks: 'Закладки',
  history: 'История',
  downloads: 'Загрузки',
  passwords: 'Пароли',
  settings: 'Оформление',
  control: 'Lumen Control',
};

document.body.classList.add(lumen.platform);

let S = { tabs: [], activeId: null, settings: {}, canBack: false, canForward: false, bookmarked: false, downloads: [], chrome: {}, zoom: 100 };
let panel = null;
let urlFocused = false;
let killTimer = null;
let dlStamp = '';
const asks = [];
let findText = '';

const activeTab = () => S.tabs.find((t) => t.id === S.activeId);
const isInternal = (u) => !u || u.startsWith('file:') || u.startsWith('about:');
const uiScale = () => ((S.settings && S.settings.uiScale) || 100) / 100;

function shownUrl(t) {
  if (!t || isInternal(t.url)) return '';
  try { return new URL(t.url).hostname.replace(/^www\./, ''); } catch { return t.url; }
}
function hostOf(origin) {
  try { return new URL(origin).host; } catch { return origin || ''; }
}
function bytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' Б';
  if (v < 1024 * 1024) return Math.max(1, Math.round(v / 1024)) + ' КБ';
  return (v / 1024 / 1024).toFixed(1) + ' МБ';
}

lumen.onState((s) => { S = s; render(); });
lumen.onFocusUrl(() => $('#url').focus());
lumen.onOpenPanel((name) => {
  const set = S.settings || {};
  const items = set.sidebarItems || {};
  if (set.sidebar === false || items[name] === false) {
    const sidebarItems = { ...items, [name]: true };
    lumen.setSettings({ sidebar: true, sidebarItems }).then(() => openPanel(name)).catch(() => openPanel(name));
    return;
  }
  openPanel(name);
});
lumen.onFindOpen(openFind);
lumen.onPwOffer((row) => enqueueAsk({ kind: 'password', ...row }));
lumen.onPerm((row) => enqueueAsk({ kind: 'perm', ...row }));
lumen.onFindResult((r) => {
  const n = $('#findn');
  if (!n) return;
  n.textContent = r && r.total ? r.active + ' / ' + r.total : findText ? '0' : '';
});

function render() {
  const set = S.settings || {};
  const chrome = S.chrome || {};
  const root = document.documentElement.style;
  root.setProperty('--accent', chrome.accent || set.accent || '#7c5cff');
  root.setProperty('--bg', chrome.bg || '');
  root.setProperty('--bar', chrome.bar || '');
  root.setProperty('--fg', chrome.fg || '');
  root.setProperty('--mute', chrome.mute || '');
  root.setProperty('--pill', chrome.pill || '');
  root.setProperty('--ui', String((set.uiScale || 100) / 100));
  root.setProperty('--font', String((set.fontScale || 100) / 100));
  document.body.classList.toggle('nosidebar', set.sidebar === false);
  ensureSidebarRestore();
  const items = set.sidebarItems || {};
  document.querySelectorAll('#side [data-panel]').forEach((b) => {
    b.hidden = items[b.dataset.panel] === false;
  });
  // панель настроек должна открываться даже без боковой полосы
  if (panel && items[panel] === false) closePanel();
  const t = activeTab();
  $('#back').disabled = !S.canBack;
  $('#fwd').disabled = !S.canForward;
  $('#reload').textContent = t && t.loading ? '✕' : '↻';
  $('#star').textContent = S.bookmarked ? '★' : '☆';
  $('#star').classList.toggle('on', !!S.bookmarked);
  const zoom = S.zoom || 100;
  $('#zoom').hidden = zoom === 100;
  $('#zoom').textContent = zoom + '%';
  $('#fill').hidden = !S.hasLogins;
  $('#fill').classList.toggle('on', !!S.hasLogins);
  const dlBtn = document.querySelector('[data-panel=downloads]');
  if (dlBtn) dlBtn.classList.toggle('busy', (S.downloads || []).some((d) => d.live));
  if (!urlFocused) $('#url').value = shownUrl(t);
  renderTabs();
  if (panel === 'downloads') paintDownloads();
  syncChrome();
}

function renderTabs() {
  $('#tabs').replaceChildren(
    ...S.tabs.map((t) =>
      h('div', {
        class: 'tab' + (t.id === S.activeId ? ' active' : '') + (t.sleeping ? ' sleep' : '') + (t.loading ? ' loading' : ''),
        title: t.title,
        onclick: () => lumen.activate(t.id),
        onauxclick: (e) => { if (e.button === 1) lumen.close(t.id); },
      },
      t.favicon && !t.loading ? h('img', { src: t.favicon, alt: '' }) : h('span', { class: 'dot' }),
      h('span', { class: 't' }, t.title || 'Новая вкладка'),
      h('button', { class: 'x', title: 'Закрыть', onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); lumen.close(t.id); }, onclick: (e) => { e.preventDefault(); e.stopPropagation(); } }, '✕'))
    )
  );
}

function syncChrome() {
  const topEl = $('#top');
  const sideEl = $('#side');
  if (!topEl || !sideEl) return;
  const top = Math.round(topEl.getBoundingClientRect().height);
  const side = document.body.classList.contains('nosidebar') ? 0 : Math.round(sideEl.getBoundingClientRect().width);
  if (top < 48) return;
  if (!document.body.classList.contains('nosidebar') && side < 20) return;
  document.documentElement.style.setProperty('--top', top + 'px');
  document.documentElement.style.setProperty('--side', side + 'px');
  lumen.chrome(top, side);
}

$('#back').onclick = () => lumen.nav('back');
$('#fwd').onclick = () => lumen.nav('forward');
$('#reload').onclick = () => lumen.nav('reload');
$('#home').onclick = () => lumen.nav('home');
$('#newtab').onclick = () => lumen.newTab();
$('#star').onclick = () => lumen.toggleBookmark();
$('#zoom').onclick = () => lumen.zoomSet(100);
$('#fill').onclick = () => lumen.pwFillBest();
$('#omni').addEventListener('submit', (e) => {
  e.preventDefault();
  lumen.go($('#url').value);
  $('#url').blur();
});
$('#url').addEventListener('focus', () => {
  urlFocused = true;
  const t = activeTab();
  $('#url').value = t && !isInternal(t.url) ? t.url : '';
  setTimeout(() => $('#url').select());
});
$('#url').addEventListener('blur', () => { urlFocused = false; render(); });
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#url').blur(); });

document.querySelectorAll('#side [data-panel]').forEach((b) => {
  b.onclick = () => togglePanel(b.dataset.panel);
});


function ensureSidebarRestore() {
  let btn = document.getElementById('sidebar-restore');
  const hidden = document.body.classList.contains('nosidebar');
  if (!hidden) {
    if (btn) btn.remove();
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'sidebar-restore';
    btn.type = 'button';
    btn.title = 'Показать боковую панель (Ctrl+Shift+S)';
    btn.textContent = '☰';
    btn.addEventListener('click', async () => {
      await lumen.setSettings({ sidebar: true });
      document.body.classList.remove('nosidebar');
      syncChrome();
      openPanel('settings');
    });
    document.body.appendChild(btn);
  }
}

function markSide() {
  document.querySelectorAll('#side [data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === panel));
}
function panelWidth() {
  return Math.round(340 * uiScale());
}
function openPanel(name) {
  if (!name || panel === name) return;
  panel = name;
  dlStamp = '';
  $('#panel').hidden = false;
  lumen.panel(panelWidth());
  markSide();
  renderPanel();
}
function togglePanel(name) {
  if (panel === name) return closePanel();
  openPanel(name);
}
function closePanel() {
  panel = null;
  clearInterval(killTimer);
  $('#panel').hidden = true;
  lumen.panel(0);
  markSide();
}

const empty = (text) => h('p', { class: 'empty' }, text);

function entry(title, url, onOpen, extra) {
  return h('div', { class: 'line' },
    h('button', { class: 'item', onclick: onOpen }, h('b', {}, title || url), h('small', {}, url || '')),
    ...(extra || []));
}

function enqueueAsk(item) {
  asks.push(item);
  if (asks.length === 1) paintAsk();
}
function shiftAsk() {
  asks.shift();
  paintAsk();
}
function paintAsk() {
  const box = $('#ask');
  const item = asks[0];
  if (!item) {
    box.hidden = true;
    box.replaceChildren();
    syncChrome();
    return;
  }
  box.hidden = false;
  if (item.kind === 'password') {
    const host = hostOf(item.origin);
    box.replaceChildren(
      h('p', {}, (item.update ? 'Обновить пароль для ' : 'Сохранить пароль для ') + host + (item.username ? ' (' + item.username + ')' : '') + '?'),
      h('button', { class: 'mini', onclick: () => { lumen.pwSave(item); shiftAsk(); } }, 'Сохранить'),
      h('button', { class: 'mini', onclick: () => { lumen.pwNever(item.origin); shiftAsk(); } }, 'Никогда'),
      h('button', { class: 'mini', onclick: shiftAsk }, 'Не сейчас')
    );
  } else {
    const what = PERMS[item.perm] || 'дополнительному доступу';
    box.replaceChildren(
      h('p', {}, (item.host || 'Сайт') + ' запрашивает доступ к ' + what),
      h('button', { class: 'mini', onclick: () => { lumen.perm(item.id, true); shiftAsk(); } }, 'Разрешить'),
      h('button', { class: 'mini', onclick: () => { lumen.perm(item.id, false); shiftAsk(); } }, 'Отклонить')
    );
  }
  syncChrome();
}

function openFind() {
  $('#find').hidden = false;
  $('#findq').focus();
  $('#findq').select();
  syncChrome();
}
function runFind(again, forward) {
  findText = $('#findq').value;
  lumen.find(findText, { again: !!again, forward: forward !== false });
}
$('#findq').addEventListener('input', () => runFind(false, true));
$('#findq').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); runFind(true, !e.shiftKey); }
  if (e.key === 'Escape') closeFind();
});
$('#findnext').onclick = () => runFind(true, true);
$('#findprev').onclick = () => runFind(true, false);
$('#findclose').onclick = closeFind;
function closeFind() {
  $('#find').hidden = true;
  findText = '';
  $('#findq').value = '';
  $('#findn').textContent = '';
  lumen.find('');
  syncChrome();
}

async function renderPanel() {
  const p = $('#panel');
  const name = panel;
  clearInterval(killTimer);
  if (name === 'bookmarks') {
    const list = await lumen.bookmarks();
    if (panel !== name) return;
    p.replaceChildren(
      h('h2', {}, 'Закладки'),
      ...(list.length
        ? list.map((b) => entry(b.title, b.url, () => lumen.go(b.url), [
          h('button', { class: 'rm', title: 'Удалить', onclick: () => { lumen.removeBookmark(b.url); setTimeout(renderPanel, 40); } }, '✕'),
        ]))
        : [empty('Пока пусто. Нажмите звёздочку в адресной строке.')])
    );
  } else if (name === 'history') {
    const list = await lumen.history();
    if (panel !== name) return;
    p.replaceChildren(
      h('h2', {}, 'История'),
      ...(list.length ? list.map((x) => entry(x.title, x.url, () => lumen.go(x.url))) : [empty('История пуста.')]),
      list.length ? h('button', { class: 'btn', onclick: () => { lumen.clearHistory(); setTimeout(renderPanel, 40); } }, 'Очистить историю') : null
    );
  } else if (name === 'downloads') {
    dlStamp = '';
    paintDownloads();
  } else if (name === 'passwords') {
    await paintPasswords();
  } else if (name === 'settings') {
    await paintSettings();
  } else if (name === 'control') {
    paintControl();
  }
}

function paintDownloads() {
  if (panel !== 'downloads') return;
  const list = S.downloads || [];
  const stamp = JSON.stringify(list);
  if (stamp === dlStamp && $('#panel').childElementCount) return;
  dlStamp = stamp;
  const row = (d) => {
    const pct = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : (d.live ? 12 : 0);
    const status = d.state === 'completed' ? 'Готово' : d.state === 'paused' ? 'Пауза' : d.state === 'cancelled' ? 'Отменено' : d.state === 'interrupted' ? 'Ошибка' : 'Загрузка';
    return h('div', { class: 'kill', style: 'display:block;padding:8px 0;border-bottom:1px solid var(--line)' },
      h('div', { class: 'line' },
        h('div', { class: 'item' }, h('b', {}, d.name || 'Файл'), h('small', {}, status + ' · ' + bytes(d.received) + (d.total ? ' / ' + bytes(d.total) : ''))),
        d.live ? h('button', { class: 'mini', onclick: () => lumen.dlPause(d.id) }, d.state === 'paused' ? 'Далее' : 'Пауза') : null,
        d.live ? h('button', { class: 'mini', onclick: () => lumen.dlCancel(d.id) }, 'Стоп') : null,
        d.state === 'completed' ? h('button', { class: 'mini', onclick: () => lumen.dlOpen(d.id) }, 'Открыть') : null,
        d.path ? h('button', { class: 'mini', onclick: () => lumen.dlShow(d.id) }, 'Папка') : null,
        !d.live ? h('button', { class: 'rm', title: 'Убрать из списка', onclick: () => lumen.dlForget(d.id) }, '✕') : null),
      d.live || d.state === 'completed' ? h('div', { class: 'barline' }, h('i', { style: 'width:' + (d.state === 'completed' ? 100 : pct) + '%' })) : null);
  };
  $('#panel').replaceChildren(
    h('h2', {}, 'Загрузки'),
    h('p', { class: 'muted' }, 'Файлы сохраняются в системную папку «Загрузки».'),
    ...(list.length ? list.map(row) : [empty('Пока ничего не скачивалось.')]),
    list.some((d) => !d.live) ? h('button', { class: 'btn', onclick: () => lumen.dlClear() }, 'Очистить список') : null
  );
}

async function paintPasswords() {
  const name = 'passwords';
  const list = await lumen.passwords();
  if (panel !== name) return;
  const origin = h('input', { class: 'text', placeholder: 'https://site.com', spellcheck: false });
  const user = h('input', { class: 'text', placeholder: 'Логин', spellcheck: false, autocomplete: 'off' });
  const pass = h('input', { class: 'text', placeholder: 'Пароль', type: 'password', autocomplete: 'new-password' });
  const save = async () => {
    let o = origin.value.trim();
    if (o && !/^https?:\/\//i.test(o)) o = 'https://' + o;
    const res = await lumen.pwSave({ origin: o, username: user.value, password: pass.value });
    if (!res || !res.ok) return;
    pass.value = '';
    paintPasswords();
  };
  $('#panel').replaceChildren(
    h('h2', {}, 'Пароли'),
    h('p', { class: 'muted' }, S.secureVault
      ? 'Пароли шифруются средствами системы и не уходят с этого устройства.'
      : 'На этой системе нет связки ключей: пароли спрятаны локально и никуда не отправляются.'),
    ...(list.length ? list.map((row) => {
      const reveal = h('input', { class: 'text secret', readOnly: true, hidden: true });
      return h('div', {},
        entry(row.username || '(без логина)', row.origin, () => lumen.go(row.origin), [
          h('button', { class: 'mini', onclick: async () => {
            reveal.hidden = false;
            reveal.value = await lumen.pwReveal(row.id);
            reveal.focus();
          } }, 'Показать'),
          h('button', { class: 'mini', onclick: () => lumen.pwFill(row.id) }, 'Вставить'),
          h('button', { class: 'rm', title: 'Удалить', onclick: () => { lumen.pwRemove(row.id); setTimeout(paintPasswords, 40); } }, '✕'),
        ]),
        reveal);
    }) : [empty('Сохранённых паролей нет. Они предлагаются при входе на сайт или добавляются здесь.')]),
    h('h3', {}, 'Добавить'),
    h('div', { class: 'field' }, origin),
    h('div', { class: 'field' }, user),
    h('div', { class: 'field' }, pass),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: save }, 'Сохранить'),
      h('button', { class: 'btn', onclick: () => { lumen.pwNeverClear(); } }, 'Снова спрашивать'))
  );
}

async function paintSettings() {
  const name = 'settings';
  const s = S.settings || {};
  const custom = s.wallpaper === 'custom' ? await lumen.wallGet() : '';
  if (panel !== name) return;
  const toggle = (key, label) => h('label', { class: 'row' }, h('span', {}, label),
    h('input', { class: 'sw', type: 'checkbox', checked: s[key] !== false, onchange: async (e) => {
      await lumen.setSettings({ [key]: !!e.target.checked });
      if (key === 'sidebar') {
        document.body.classList.toggle('nosidebar', !e.target.checked);
        syncChrome();
      }
      paintSettings();
    } }));
  const home = h('input', { class: 'text', placeholder: 'https://example.com', value: s.homeUrl || '', spellcheck: false });
  home.addEventListener('change', () => lumen.setSettings({ homeUrl: home.value }));
  const file = h('input', { class: 'clip', type: 'file', accept: 'image/png,image/x-png,image/jpeg,image/jpg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif' });
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (f.size > 30 * 1024 * 1024) {
      alert('Файл больше 30 МБ — выберите изображение поменьше.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const res = await lumen.wallSet(String(reader.result || ''));
      const ok = res === true || (res && res.ok);
      if (ok) {
        paintSettings();
        return;
      }
      const err = res && res.error;
      if (err === 'size') alert('Файл слишком большой. Нужно изображение до 30 МБ (крупные PNG автоматически ужимаются).');
      else if (err === 'write') alert('Не удалось записать файл обоев. Проверьте права на папку приложения.');
      else alert('Не удалось сохранить обои. Поддерживаются PNG, JPEG, WebP и GIF.');
    };
    reader.onerror = () => alert('Не удалось прочитать файл.');
    reader.readAsDataURL(f);
  });
  const range = (key, min, max, label) => h('label', { class: 'row' },
    h('span', {}, label + ' · ' + (s[key] || 100) + '%'),
    h('input', {
      type: 'range', min: String(min), max: String(max), step: '5', value: String(s[key] || 100),
      oninput: key === 'uiScale' || key === 'fontScale' ? (e) => {
        document.documentElement.style.setProperty(key === 'uiScale' ? '--ui' : '--font', String(+e.target.value / 100));
        e.target.parentElement.querySelector('span').textContent = label + ' · ' + e.target.value + '%';
        syncChrome();
      } : (e) => { e.target.parentElement.querySelector('span').textContent = label + ' · ' + e.target.value + '%'; },
      onchange: (e) => lumen.setSettings({ [key]: +e.target.value }).then(() => { if (panel === name) paintSettings(); }),
    }));
  $('#panel').replaceChildren(
    h('h2', {}, 'Оформление'),
    h('h3', {}, 'Тема'),
    h('div', { class: 'seg' }, ...THEMES.map(([id, label, accent]) =>
      h('button', {
        class: s.theme === id ? 'on' : '',
        onclick: () => lumen.setSettings(accent ? { theme: id, accent } : { theme: id }).then(() => paintSettings()),
      }, label))),
    h('label', { class: 'row' }, h('span', {}, 'Акцентный цвет'),
      h('input', { type: 'color', value: s.accent || '#7c5cff', onchange: (e) => lumen.setSettings({ accent: e.target.value }) })),
    h('h3', {}, 'Обои новой вкладки'),
    h('div', { class: 'swatches' }, ...WALLS.map(([id, label, bg]) =>
      h('button', {
        class: 'swatch' + (s.wallpaper === id ? ' on' : ''),
        title: label,
        style: 'background:' + bg,
        onclick: () => lumen.setSettings({ wallpaper: id }).then(() => paintSettings()),
      }, h('span', {}, label)))),
    custom ? h('img', { src: custom, alt: '', style: 'width:100%;height:84px;object-fit:cover;border-radius:10px;margin-top:8px' }) : null,
    h('div', { class: 'actions' },
      h('label', { class: 'btn flat' }, 'Загрузить своё', file),
      s.wallpaper === 'custom' ? h('button', { class: 'btn', onclick: () => { lumen.wallClear(); setTimeout(paintSettings, 40); } }, 'Убрать своё') : null),
    h('h3', {}, 'При запуске открывать'),
    h('div', { class: 'seg' },
      ...[['newtab', 'Новая вкладка'], ['blank', 'Пустая'], ['site', 'Сайт'], ['bookmarks', 'Закладки']].map(([id, label]) =>
        h('button', {
          class: s.startup === id ? 'on' : '',
          onclick: () => lumen.setSettings({ startup: id }).then(() => paintSettings()),
        }, label))),
    s.startup === 'site' ? h('div', { class: 'field' }, home) : null,
    h('h3', {}, 'Интерфейс'),
    toggle('sidebar', 'Боковая панель'),
    toggle('adblock', 'Блокировка рекламы'),
    toggle('sleep', 'Усыплять фоновые вкладки'),
    toggle('forceDark', 'Принудительная тёмная тема на сайтах'),
    range('uiScale', 80, 140, 'Масштаб UI'),
    range('fontScale', 80, 140, 'Шрифт UI'),
    range('pageZoom', 50, 200, 'Масштаб страниц'),
    h('h3', {}, 'Элементы боковой панели'),
    ...Object.entries(SIDE_LABELS).map(([key, label]) =>
      h('label', { class: 'row' }, h('span', {}, label),
        h('input', {
          class: 'sw', type: 'checkbox',
          checked: (s.sidebarItems || {})[key] !== false,
          onchange: (e) => {
            const sidebarItems = { ...(s.sidebarItems || {}), [key]: e.target.checked };
            lumen.setSettings({ sidebarItems }).then(() => paintSettings());
          },
        }))),
    h('h3', {}, 'Данные'),
    h('button', { class: 'btn', onclick: async () => {
      if (!confirm('Очистить историю, загрузки и кэш? Пароли и закладки останутся.')) return;
      await lumen.clearData();
      alert('Готово.');
    } }, 'Очистить данные')
  );
}

function paintControl() {
  clearInterval(killTimer);
  const box = $('#panel');
  const draw = async () => {
    if (panel !== 'control') return;
    const metrics = await lumen.metrics();
    const blocked = await lumen.blocked();
    if (panel !== 'control') return;
    box.replaceChildren(
      h('h2', {}, 'Lumen Control'),
      h('p', { class: 'muted' }, 'Состояние вкладок и блокировщика.'),
      h('h3', {}, 'Вкладки'),
      ...(metrics && metrics.length ? metrics.map((m) =>
        h('div', { class: 'kill' },
          h('span', {}, m.title || m.url || ('#' + m.id)),
          h('em', {}, m.sleeping ? 'сон' : (m.memory || '—')),
          h('button', { class: 'mini', onclick: () => lumen.sleep(m.id) }, 'Усыпить'))
      ) : [empty('Нет данных')]),
      h('h3', {}, 'Adblock'),
      h('p', { class: 'muted' }, blocked ? ('Заблокировано за сессию: ' + (blocked.blocked || 0)) : 'Нет статистики')
    );
  };
  draw();
  killTimer = setInterval(draw, 2500);
}

window.addEventListener('resize', () => syncChrome());
new ResizeObserver(() => syncChrome()).observe($('#top'));
lumen.ready();
