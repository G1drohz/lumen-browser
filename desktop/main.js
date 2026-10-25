const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const CACHE = path.join(os.homedir(), '.lumen-main-cache-v3.js');
const URL = 'https://raw.githubusercontent.com/G1drohz/lumen-browser/66d245802e30420d5f8135add2de8cafe9eb6f3b/desktop/main.js';

function boot(file) {
  // require() даёт нормальный Node-контекст (require, module, __dirname)
  const resolved = require.resolve(file);
  delete require.cache[resolved];
  require(file);
}

function downloadAndBoot() {
  https.get(URL, (res) => {
    if (res.statusCode !== 200) {
      console.error('Failed to download main.js', res.statusCode);
      process.exit(1);
    }
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const code = Buffer.concat(chunks).toString('utf8');
      try {
        fs.writeFileSync(CACHE, code, 'utf8');
      } catch (e) {
        console.error('Cannot write cache', e);
        process.exit(1);
      }
      boot(CACHE);
    });
  }).on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
}

if (fs.existsSync(CACHE) && fs.statSync(CACHE).size > 1000) {
  try {
    boot(CACHE);
  } catch (e) {
    console.error('Cache broken, re-download', e);
    try { fs.unlinkSync(CACHE); } catch (_) {}
    downloadAndBoot();
  }
} else {
  downloadAndBoot();
}
