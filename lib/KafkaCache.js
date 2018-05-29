const levelup = require('levelup')
const encode = require('encoding-down')
const memdown = require('memdown');

function createDatabase({ valueEncoding, leveldown, keyEncoding }) {
  const store = leveldown || memdown();
  const encodedStore = encode(store, { valueEncoding, keyEncoding });

  return levelup(encodedStore);
}

function encodeMessage(message, db) {

  let codec = db.db.codec;
  // TODO For some reason when two instances of memdown is created within the same process
  // they start to refer to a common storage or something. This needs further investigation.
  if (!codec) codec = db.db._db.codec;

  const { valueEncoding, keyEncoding } = codec.opts;

  return {
    key: codec.encodings[keyEncoding].decode(message.key),
    value: codec.encodings[valueEncoding].decode(message.value)
  }
}

function KafkaCache({ streamReady, kafkaWrite, levelupOptions, resolver, log, metrics }) {
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
      const { key, value } = encodeMessage(message, db);
      const isBuffer = Buffer.isBuffer(key) || (key || {}).type === 'Buffer';

      const isValidBuffer = isBuffer && (key.data ? key.data.length : key.length);

      const isKeySupportedByLevelup = (
        isBuffer && isValidBuffer ||
        !isBuffer && !!key
      );

      if (isKeySupportedByLevelup) {
        db.put(key, resolver(value));
      } else {
        metrics.incMissingKey();
        log.error('Falsy keys are not supported! The risk of overwriting values is considered very big here!');
        // DON'T return here, we still need to trigger ready if this was it
      }

      if (message.offset === currentTopicOffset)
        triggerReady();
    }, metrics.onKafkaStats);

    // Empty topics will never trigger a stream event. So we're already ready
    if (currentTopicOffset === -1)
      triggerReady();

  }).catch(err => {
    metrics.incStreamError();
    log.error(err);
  });

  return {
    get: db.get.bind(db),
    put: kafkaWrite,
    createReadStream: db.createReadStream.bind(db),
    on: db.on.bind(db),
    onReady: fn => {
      if (fn) isReady ? process.nextTick(fn) : callbacks.push(fn);
      return new Promise(resolve => isReady ? process.nextTick(resolve) : callbacks.push(resolve));
    }
  }
}

module.exports = KafkaCache;