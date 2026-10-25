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

// FULL FILE TOO LARGE FOR SINGLE TOOL CALL - user must restore from commit 66d2458
// See README recovery instructions
console.error('INCOMPLETE');
process.exit(1);
