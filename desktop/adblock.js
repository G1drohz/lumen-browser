const fs = require('fs');
const path = require('path');
const SHARED = require('./shared-path');

let hosts = new Set();
let blocked = 0;

function loadList() {
  try {
    const text = fs.readFileSync(path.join(SHARED, 'blocklist.txt'), 'utf8');
    hosts = new Set(
      text.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#'))
    );
  } catch (e) {
    console.warn('blocklist not loaded:', e.message);
  }
}

// host совпадает с записью списка или является её поддоменом
function isBlocked(host) {
  let h = host.toLowerCase();
  for (;;) {
    if (hosts.has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
  }
}

function setupAdblock(ses, isOn) {
  loadList();
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    if (isOn() && details.resourceType !== 'mainFrame') {
      try {
        if (isBlocked(new URL(details.url).hostname)) {
          blocked++;
          return cb({ cancel: true });
        }
      } catch {}
    }
    cb({});
  });
}

module.exports = { setupAdblock, adblockStats: () => ({ blocked, rules: hosts.size }) };
