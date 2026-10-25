const zlib = require('zlib');
const parts = [0,1,2,3,4,5].map(i => require('./main-d' + i + '.json').d);
const code = zlib.inflateSync(Buffer.from(parts.join(''), 'base64')).toString('utf8');
require('vm').runInThisContext(code, { filename: 'main.js' });
