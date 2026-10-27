#!/usr/bin/env python3
from pathlib import Path
import re

app = Path("desktop/renderer/app.js")
a = app.read_text()

old = "  if (panel && (set.sidebar === false || items[panel] === false)) closePanel();"
new = "  // панель настроек должна открываться даже без боковой полосы\n  if (panel && items[panel] === false) closePanel();"
if old in a:
    a = a.replace(old, new, 1)
    print("closePanel bug fixed")
else:
    print("closePanel bug already fixed or missing")

old_op = """lumen.onOpenPanel((name) => {
  const items = (S.settings && S.settings.sidebarItems) || {};
  if (S.settings.sidebar === false || items[name] === false) {
    const sidebarItems = { ...items, [name]: true };
    lumen.setSettings({ sidebar: true, sidebarItems }).then(() => openPanel(name));
    return;
  }
  openPanel(name);
});"""

new_op = """lumen.onOpenPanel((name) => {
  const set = S.settings || {};
  const items = set.sidebarItems || {};
  if (set.sidebar === false || items[name] === false) {
    const sidebarItems = { ...items, [name]: true };
    lumen.setSettings({ sidebar: true, sidebarItems }).then(() => openPanel(name)).catch(() => openPanel(name));
    return;
  }
  openPanel(name);
});"""

if "S.settings.sidebar === false" in a and old_op in a:
    a = a.replace(old_op, new_op, 1)
    print("onOpenPanel fixed")
elif "set.sidebar === false || items[name] === false" in a:
    print("onOpenPanel already")
else:
    print("onOpenPanel pattern mismatch")

old_t = """  const toggle = (key, label) => h('label', { class: 'row' }, h('span', {}, label),
    h('input', { class: 'sw', type: 'checkbox', checked: !!s[key], onchange: (e) => lumen.setSettings({ [key]: e.target.checked }) }));"""

new_t = """  const toggle = (key, label) => h('label', { class: 'row' }, h('span', {}, label),
    h('input', { class: 'sw', type: 'checkbox', checked: s[key] !== false, onchange: async (e) => {
      await lumen.setSettings({ [key]: !!e.target.checked });
      if (key === 'sidebar') {
        document.body.classList.toggle('nosidebar', !e.target.checked);
        syncChrome();
      }
      paintSettings();
    } }));"""

if "key === 'sidebar'" not in a and old_t in a:
    a = a.replace(old_t, new_t, 1)
    print("toggle fixed")
elif "key === 'sidebar'" in a:
    print("toggle already")
else:
    print("toggle missing")

helper = '''
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
'''

if "function ensureSidebarRestore" not in a:
    i = a.find("function syncChrome()")
    j = a.find("\nfunction ", i + 10)
    if j < 0:
        j = a.find("\n$('#back')", i)
    a = a[:j] + "\n" + helper + a[j:]
    print("helper added")

if a.count("ensureSidebarRestore();") < 1:
    a = a.replace(
        "document.body.classList.toggle('nosidebar', set.sidebar === false);",
        "document.body.classList.toggle('nosidebar', set.sidebar === false);\n  ensureSidebarRestore();",
        1,
    )
    print("render hook")
else:
    print("render hook exists")

app.write_text(a)

css = Path("desktop/renderer/style.css")
c = css.read_text()
if "#sidebar-restore" not in c:
    c = c.rstrip() + """
#sidebar-restore{
  position:fixed;left:10px;bottom:12px;z-index:50;
  width:40px;height:40px;border-radius:12px;border:1px solid var(--line);
  background:var(--bar);color:var(--fg);font-size:18px;cursor:pointer;
  box-shadow:0 4px 16px rgba(0,0,0,.25);
}
#sidebar-restore:hover{background:var(--accent);color:#fff}
"""
    css.write_text(c)
    print("css")

main = Path("desktop/main.js")
m = main.read_text()
old_m = "{ label: 'Боковая панель', accelerator: 'CmdOrCtrl+Shift+S', click: () => { data.settings = sanitizeSettings(data.settings, { sidebar: !data.settings.sidebar }); save(); layout(); pushState(); } },"
new_m = "{ label: 'Боковая панель', accelerator: 'CmdOrCtrl+Shift+S', click: () => { const on = !(data.settings && data.settings.sidebar); data.settings = sanitizeSettings(data.settings, { sidebar: on }); save(); layout(); pushState(); if (on) openPanel('settings'); } },"
if old_m in m:
    m = m.replace(old_m, new_m, 1)
    print("shortcut fixed")
elif "CmdOrCtrl+Shift+S" in m and "sidebar: on" not in m:
    m2, n = re.subn(
        r"\{ label: 'Боковая панель', accelerator: 'CmdOrCtrl\+Shift\+S', click: \(\) => \{[^}]+\}, \},",
        new_m,
        m,
        count=1,
    )
    if n:
        m = m2
        print("shortcut fixed re")
    else:
        print("shortcut not found")
else:
    print("shortcut ok")
main.write_text(m)

pkg = Path("desktop/package.json")
if pkg.exists():
    t = pkg.read_text()
    for x, y in [('"version": "3.2.3"', '"version": "3.2.4"'), ('"version": "3.2.2"', '"version": "3.2.4"')]:
        t = t.replace(x, y)
    pkg.write_text(t)
print("done")
