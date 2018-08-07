const zlib = require('zlib');

const gzip = zlib.gzipSync;
const gunzip = zlib.gunzipSync;

function compress(json) {
  return gzip(JSON.stringify(json));
}

function decompress(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  return gunzip(buffer);
}

exports.compress = compress;
exports.decompress = decompress;