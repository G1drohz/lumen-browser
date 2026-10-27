#!/usr/bin/env python3
"""Fix tabs closing only on second click."""
from pathlib import Path

main = Path('desktop/main.js')
m = main.read_text()

old_close = '''function closeTab(id) {
  const tab = tabs.get(id);
  if (!tab) return;
  const last = tab.view && !tab.view.webContents.isDestroyed() ? tab.view.webContents.getURL() : tab.url;
  if (/^https?:/i.test(last)) {
    closedTabs.push(last);
    if (closedTabs.length > 20) closedTabs.shift();
  }
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
}'''

new_close = '''function closeTab(id) {
  id = Number(id);
  const tab = tabs.get(id);
  if (!tab) return;
  tab.closing = true;
  const last = tab.view && tab.view.webContents && !tab.view.webContents.isDestroyed()
    ? tab.view.webContents.getURL()
    : tab.url;
  if (/^https?:/i.test(last || '')) {
    closedTabs.push(last);
    if (closedTabs.length > 20) closedTabs.shift();
  }
  if (tab.view) {
    try { win.contentView.removeChildView(tab.view); } catch { /* уже убрана */ }
    try {
      const wc = tab.view.webContents;
      if (wc && !wc.isDestroyed()) wc.destroy();
    } catch { /* already gone */ }
    tab.view = null;
  }
  tabs.delete(id);
  if (activeId === id) activeId = null;
  if (tabs.size === 0) return void newTab(launchURL());
  if (activeId == null || !tabs.has(activeId)) {
    const ids = [...tabs.keys()];
    activate(ids[ids.length - 1]);
  } else {
    pushState();
  }
}'''

if 'tab.closing = true' not in m:
    if old_close not in m:
        raise SystemExit('closeTab block not found')
    m = m.replace(old_close, new_close, 1)
    print('closeTab patched')
else:
    print('closeTab already patched')

old_rpg = '''wc.on('render-process-gone', (_e, d) => {
    // страница упала — один-два раза пробуем перезагрузить, а не оставляем пустой экран
    if (d.reason === 'clean-exit' || tab.crashes >= 2) return;
    tab.crashes += 1;
    setTimeout(() => { if (!wc.isDestroyed()) wc.reload(); }, 400);
  });'''

new_rpg = '''wc.on('render-process-gone', (_e, d) => {
    if (tab.closing || !tabs.has(tab.id) || d.reason === 'clean-exit' || tab.crashes >= 2) return;
    tab.crashes += 1;
    setTimeout(() => { if (!tab.closing && tabs.has(tab.id) && !wc.isDestroyed()) wc.reload(); }, 400);
  });'''

if 'tab.closing || !tabs.has(tab.id)' not in m:
    if old_rpg not in m:
        print('WARNING: render-process-gone block not found')
    else:
        m = m.replace(old_rpg, new_rpg, 1)
        print('render-process-gone patched')
else:
    print('render-process-gone already patched')

old_ipc = "on('tab:activate', (id) => activate(id));\non('tab:close', (id) => closeTab(id));"
new_ipc = "on('tab:activate', (id) => activate(Number(id)));\non('tab:close', (id) => closeTab(Number(id)));"
if "activate(Number(id))" not in m:
    if old_ipc in m:
        m = m.replace(old_ipc, new_ipc, 1)
        print('ipc ids coerced')
    else:
        print('WARNING: ipc activate/close not found')

main.write_text(m)

app = Path('desktop/renderer/app.js')
a = app.read_text()
old_btn = "h('button', { class: 'x', title: 'Закрыть', onclick: (e) => { e.stopPropagation(); lumen.close(t.id); } }, '✕')"
new_btn = "h('button', { class: 'x', title: 'Закрыть', onmousedown: (e) => { e.preventDefault(); e.stopPropagation(); lumen.close(t.id); }, onclick: (e) => { e.preventDefault(); e.stopPropagation(); } }, '✕')"
if 'onmousedown' not in a or 'lumen.close(t.id)' not in a.split('onmousedown')[1][:80] if 'onmousedown' in a else True:
    if old_btn in a:
        a = a.replace(old_btn, new_btn, 1)
        app.write_text(a)
        print('close button uses mousedown')
    else:
        print('WARNING: close button pattern not found')
else:
    print('close button already ok')

pkg = Path('desktop/package.json')
if pkg.exists():
    t = pkg.read_text()
    t2 = t.replace('"version": "3.2.0"', '"version": "3.2.1"').replace('"version": "3.1.0"', '"version": "3.2.1"')
    if t2 != t:
        pkg.write_text(t2)
        print('version -> 3.2.1')

print('done')
