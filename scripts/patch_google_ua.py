#!/usr/bin/env python3
from pathlib import Path

main = Path("desktop/main.js")
m = main.read_text()

old = """    const ses = session.fromPartition('persist:lumen');
    // Честный User-Agent: движок настоящий Chromium, убираем только служебные метки Electron
    ses.setUserAgent(app.userAgentFallback.replace(/\\s(Electron|Lumen|lumen-desktop)\\/\\S+/gi, ''));
    setupPermissions(ses);"""

new = """    const ses = session.fromPartition('persist:lumen');
    setupBrowserIdentity(ses);
    setupPermissions(ses);"""

if "setupBrowserIdentity(ses)" not in m:
    if old not in m:
        raise SystemExit("UA setup block not found")
    m = m.replace(old, new, 1)
    print("wired setupBrowserIdentity")
else:
    print("already wired")

if "function setupBrowserIdentity" not in m:
    anchor = "app.whenReady().then(() => {"
    fn = """function setupBrowserIdentity(ses) {
  const chrome = String(process.versions.chrome || '131.0.0.0');
  const platform =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'linux'
        ? 'X11; Linux x86_64'
        : 'Windows NT 10.0; Win64; x64';
  const chromeUA =
    'Mozilla/5.0 (' + platform + ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + chrome + ' Safari/537.36';
  const firefoxUA =
    process.platform === 'darwin'
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0'
      : process.platform === 'linux'
        ? 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
  try { app.userAgentFallback = chromeUA; } catch (_) {}
  ses.setUserAgent(chromeUA);
  const googleHost =
    /(?:^|\\.)(google\\.com|google\\.[a-z]{2,3}|googleapis\\.com|gstatic\\.com|youtube\\.com|gmail\\.com|googleusercontent\\.com)(?::|\\/|$)/i;
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
        delete h['sec-ch-ua-arch'];
        delete h['sec-ch-ua-bitness'];
        delete h['sec-ch-ua-model'];
        delete h['sec-ch-ua-platform-version'];
      }
      callback({ cancel: false, requestHeaders: h });
    });
  } catch (_) {}
}

app.whenReady().then(() => {"""
    if anchor not in m:
        raise SystemExit("whenReady not found")
    m = m.replace(anchor, fn, 1)
    print("injected function")
else:
    print("function exists")

old_copy = """  } else if (p.selectionText && p.selectionText.trim()) {
    const q = p.selectionText.trim().slice(0, 200);
    items.push({ role: 'copy' });
    add('Искать «' + (q.length > 28 ? q.slice(0, 28) + '…' : q) + '»', () => newTab(searchURL(q), false));"""

new_copy = """  } else if (p.selectionText && p.selectionText.trim()) {
    const q = p.selectionText.trim().slice(0, 200);
    items.push({
      label: 'Копировать',
      accelerator: 'CmdOrCtrl+C',
      click: () => {
        try { clipboard.writeText(p.selectionText); } catch (_) {}
        try { wc.copy(); } catch (_) {}
      },
    });
    add('Искать «' + (q.length > 28 ? q.slice(0, 28) + '…' : q) + '»', () => newTab(searchURL(q), false));"""

if "clipboard.writeText(p.selectionText)" not in m:
    if old_copy not in m:
        print("WARNING: copy block missing")
    else:
        m = m.replace(old_copy, new_copy, 1)
        print("copy fixed")
else:
    print("copy already fixed")

if "label: 'Правка'" not in m and "{ role: 'editMenu' }" not in m:
    needle = """    {
      label: 'Страница',"""
    edit = """    {
      label: 'Правка',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'Страница',"""
    if needle in m:
        m = m.replace(needle, edit, 1)
        print("edit menu")

main.write_text(m)

pkg = Path("desktop/package.json")
if pkg.exists():
    t = pkg.read_text()
    for a, b in [
        ('"version": "3.2.2"', '"version": "3.2.3"'),
        ('"version": "3.2.1"', '"version": "3.2.3"'),
        ('"version": "3.2.0"', '"version": "3.2.3"'),
    ]:
        t = t.replace(a, b)
    pkg.write_text(t)
    print("version 3.2.3")
print("done")
