'use strict';

const $ = (s) => document.querySelector(s);

// Элементы строим через DOM, а не innerHTML: заголовки страниц не доверенные
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...kids.flat().filter((x) => x != null));
  return e;
};

const PANEL_W = 320;
document.body.classList.add(lumen.platform);

let S = { tabs: [], activeId: null, settings: {}, canBack: false, canForward: false, bookmarked: false };
let panel = null;
let urlFocused = false;
let killTimer = null;

const activeTab = () => S.tabs.find((t) => t.id === S.activeId);
const isInternal = (u) => !u || u.startsWith('file:');

function shownUrl(t) {
  if (!t || isInternal(t.url)) return '';
  try { return new URL(t.url).hostname.replace(/^www\./, ''); } catch { return t.url; }
}

lumen.onState((s) => { S = s; render(); });
lumen.onFocusUrl(() => $('#url').focus());

function render() {
  const set = S.settings;
  document.documentElement.style.setProperty('--accent', set.accent || '#7c5cff');
  document.body.classList.toggle('nosidebar', set.sidebar === false);
  if (set.sidebar === false && panel) closePanel();
  const t = activeTab();
  $('#back').disabled = !S.canBack;
  $('#fwd').disabled = !S.canForward;
  $('#reload').textContent = t && t.loading ? '✕' : '↻';
  $('#star').textContent = S.bookmarked ? '★' : '☆';
  $('#star').classList.toggle('on', !!S.bookmarked);
  if (!urlFocused) $('#url').value = shownUrl(t);
  renderTabs();
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
      t.favicon && !t.loading ? h('img', { src: t.favicon }) : h('span', { class: 'dot' }),
      h('span', { class: 't' }, t.title || t.url),
      h('button', { class: 'x', title: 'Закрыть', onclick: (e) => { e.stopPropagation(); lumen.close(t.id); } }, '✕'))
    )
  );
}

// ---------- верхняя панель ----------
$('#back').onclick = () => lumen.nav('back');
$('#fwd').onclick = () => lumen.nav('forward');
$('#reload').onclick = () => lumen.nav('reload');
$('#home').onclick = () => lumen.nav('home');
$('#newtab').onclick = () => lumen.newTab();
$('#star').onclick = () => lumen.toggleBookmark();
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

// ---------- боковые панели ----------
document.querySelectorAll('#side [data-panel]').forEach((b) => {
  b.onclick = () => togglePanel(b.dataset.panel);
});

function markSide() {
  document.querySelectorAll('#side [data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === panel));
}

function togglePanel(name) {
  if (panel === name) return closePanel();
  panel = name;
  $('#panel').hidden = false;
  lumen.panel(PANEL_W);
  markSide();
  renderPanel();
}

function closePanel() {
  panel = null;
  clearInterval(killTimer);
  $('#panel').hidden = true;
  lumen.panel(0);
  markSide();
}

const empty = (text) => h('p', { class: 'empty' }, text);

function entry(title, url, onOpen, onRemove) {
  return h('div', { class: 'line' },
    h('button', { class: 'item', onclick: onOpen }, h('b', {}, title || url), h('small', {}, url)),
    onRemove ? h('button', { class: 'rm', title: 'Удалить', onclick: onRemove }, '✕') : null);
}

async function renderPanel() {
  const p = $('#panel');
  clearInterval(killTimer);

  if (panel === 'bookmarks') {
    const list = await lumen.bookmarks();
    p.replaceChildren(
      h('h2', {}, 'Закладки'),
      ...(list.length
        ? list.map((b) => entry(b.title, b.url, () => lumen.go(b.url), () => { lumen.removeBookmark(b.url); setTimeout(renderPanel, 50); }))
        : [empty('Пока пусто. Нажмите ☆ в адресной строке.')])
    );
  } else if (panel === 'history') {
    const list = await lumen.history();
    p.replaceChildren(
      h('h2', {}, 'История'),
      ...(list.length ? list.map((x) => entry(x.title, x.url, () => lumen.go(x.url))) : [empty('История пуста.')]),
      list.length ? h('button', { class: 'btn', onclick: () => { lumen.clearHistory(); setTimeout(renderPanel, 50); } }, 'Очистить историю') : null
    );
  } else if (panel === 'control') {
    const s = S.settings;
    const toggle = (key, label) =>
      h('label', { class: 'row' }, h('span', {}, label),
        h('input', { class: 'sw', type: 'checkbox', checked: !!s[key], onchange: (e) => lumen.setSettings({ [key]: e.target.checked }) }));
    p.replaceChildren(
      h('h2', {}, '⚡ Lumen Control'),
      h('h3', {}, 'Защита'),
      toggle('adblock', 'Блокировщик рекламы и трекеров'),
      h('div', { class: 'muted', id: 'stats' }, ' '),
      h('h3', {}, 'Память'),
      toggle('sleep', 'Усыплять неактивные вкладки'),
      h('label', { class: 'row' }, h('span', {}, 'Усыплять через'),
        h('select', { onchange: (e) => lumen.setSettings({ sleepMin: +e.target.value }) },
          ...[5, 10, 20, 30, 60].map((m) => h('option', { value: String(m), selected: m === s.sleepMin }, m + ' мин')))),
      h('h3', {}, 'Оформление'),
      toggle('forceDark', 'Тёмный режим для сайтов'),
      h('label', { class: 'row' }, h('span', {}, 'Акцентный цвет'),
        h('input', { type: 'color', value: s.accent || '#7c5cff', onchange: (e) => lumen.setSettings({ accent: e.target.value }) })),
      h('h3', {}, 'Вкладки и память'),
      h('div', { id: 'kill' })
    );
    refreshKill();
    killTimer = setInterval(refreshKill, 2500);
  }
}

async function refreshKill() {
  const box = $('#kill');
  if (!box) return;
  const [list, st] = await Promise.all([lumen.metrics(), lumen.blocked()]);
  if (!list || !st) return;
  $('#stats').textContent = `Заблокировано запросов: ${st.blocked} · правил: ${st.rules}`;
  box.replaceChildren(
    ...list.map((t) =>
      h('div', { class: 'kill' },
        h('span', {}, t.title || '—'),
        h('em', {}, t.sleeping ? 'сон' : t.mem + ' МБ'),
        h('button', { disabled: t.sleeping || t.id === S.activeId, onclick: () => lumen.sleep(t.id) }, 'Сон'),
        h('button', { title: 'Закрыть', onclick: () => lumen.close(t.id) }, '✕'))
    )
  );
}

lumen.ready();
