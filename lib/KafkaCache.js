const levelup = require('levelup')
const encode = require('encoding-down')
const memdown = require('memdown');

function createDatabase({ valueEncoding, leveldown, keyEncoding }) {
  const store = leveldown || memdown();
  const encodedStore = encode(store, { valueEncoding, keyEncoding });

  return levelup(encodedStore);
}

function encodeMessage(message, codec) {
  const { valueEncoding, keyEncoding } = codec.opts;

  console.log(codec.encodings, keyEncoding, valueEncoding)
  return {
    key: codec.encodings[keyEncoding].decode(message.key),
    value: codec.encodings[valueEncoding].decode(message.value)
  }
}

function KafkaCache({ streamReady, levelupOptions, resolver, log }) {
  log.debug('New KafkaCache instance created');

  const db = createDatabase(levelupOptions);

  let isReady = false, callbacks = [];

  const triggerReady = () => {
    isReady = true;
    callbacks.forEach(callback => callback());
    callbacks = [];
  }

  streamReady.then(({ stream, currentTopicOffset }) => {
    log.debug({ currentTopicOffset }, 'Kafkacache stream ready to start consuming');

    stream(message => {
      const { key, value } = encodeMessage(message, db.db.codec);

      db.put(key, resolver(value));

      if (message.offset === currentTopicOffset)
        triggerReady();
    });

    // Empty topics will never trigger a stream event. So we're already ready
    if (currentTopicOffset === -1)
      triggerReady();
  })

  return {
    get: db.get.bind(db),
    onReady: fn => isReady ? process.nextTick(fn) : callbacks.push(fn)
    // has: (key, callback) => {
  }
}

module.exports = KafkaCache;