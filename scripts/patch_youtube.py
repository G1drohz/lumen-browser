#!/usr/bin/env python3
from pathlib import Path

main = Path("desktop/main.js")
m = main.read_text()

old = """  const googleHost =
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
}"""

new = """  // Firefox UA только для входа в Google. На YouTube — Chrome, иначе видео падает через 1–2 минуты.
  const googleAuthHost =
    /(?:^|\\.)(accounts\\.google\\.com|myaccount\\.google\\.com|ogs\\.google\\.com|gmail\\.com)(?::|\\/|$)/i;
  try {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const h = Object.assign({}, details.requestHeaders || {});
      let host = '';
      try { host = new URL(details.url).hostname; } catch (_) {}
      const isAuth = googleAuthHost.test(host);
      h['User-Agent'] = isAuth ? firefoxUA : chromeUA;
      if (isAuth) {
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
}"""

if "googleAuthHost" not in m:
    if old not in m:
        raise SystemExit("googleHost block not found")
    m = m.replace(old, new, 1)
    print("UA narrowed")
else:
    print("UA already narrowed")

main.write_text(m)

adp = Path("desktop/adblock.js")
ad = adp.read_text()
if "googlevideo.com" not in ad:
    old_ab = """function isBlocked(host) {
  let h = host.toLowerCase();
  for (;;) {
    if (hosts.has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
}"""
    new_ab = """function isBlocked(host) {
  let h = (host || '').toLowerCase();
  if (
    h.endsWith('googlevideo.com') ||
    h.endsWith('ytimg.com') ||
    h.endsWith('youtube.com') ||
    h.endsWith('youtu.be') ||
    h.endsWith('ggpht.com') ||
    h.endsWith('googleusercontent.com') ||
    h.endsWith('gvt1.com')
  ) {
    return false;
  }
  for (;;) {
    if (hosts.has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
}"""
    if old_ab not in ad:
        raise SystemExit("isBlocked not found")
    ad = ad.replace(old_ab, new_ab, 1)
    adp.write_text(ad)
    print("adblock whitelist")
else:
    print("adblock already")

pkg = Path("desktop/package.json")
if pkg.exists():
    t = pkg.read_text()
    for a, b in [
        ('"version": "3.2.4"', '"version": "3.2.5"'),
        ('"version": "3.2.3"', '"version": "3.2.5"'),
        ('"version": "3.2.2"', '"version": "3.2.5"'),
    ]:
        t = t.replace(a, b)
    pkg.write_text(t)
    print("version 3.2.5")
print("done")
