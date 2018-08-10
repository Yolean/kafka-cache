const compression = require('./compression');

const customEncodings = {
  'kafka-cache.json.gzip': {
    encode: function (data) {
      return compression.compress(data);
    },
    decode: function (data) {
      return JSON.parse(compression.decompress(data));
    },
    buffer: true,
    type: 'kafka-cache.json.gzip'
  }
};

function getCustomEncoding(valueEncoding) {
  // Make it possible to provide your own encodings still
  if (typeof valueEncoding !== 'string') return null;
  // Try to enforce a strict naming convention
  if (!/^kafka-cache\./.test(valueEncoding)) return null;

  const encoding = customEncodings[valueEncoding];
  if (!encoding) throw new Error('Invalid custom encoding: ' + valueEncoding);

  return encoding;
}

exports.getCustomEncoding = getCustomEncoding;