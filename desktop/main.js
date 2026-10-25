const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');
const os = require('os');

const CACHE = path.join(os.homedir(), '.lumen-main-cache-v3.js');
const URL = 'https://raw.githubusercontent.com/G1drohz/lumen-browser/66d245802e30420d5f8135add2de8cafe9eb6f3b/desktop/main.js';

function run(code) {
  vm.runInThisContext(code, { filename: 'main.js' });
}

if (fs.existsSync(CACHE)) {
  run(fs.readFileSync(CACHE, 'utf8'));
} else {
  https.get(URL, (res) => {
    if (res.statusCode !== 200) {
      console.error('Failed to download main.js', res.statusCode);
      process.exit(1);
    }
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const code = Buffer.concat(chunks).toString('utf8');
      try { fs.writeFileSync(CACHE, code); } catch (_) {}
      run(code);
    });
  }).on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
}
