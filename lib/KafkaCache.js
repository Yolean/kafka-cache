const levelup = require('levelup')
const encode = require('encoding-down')
const memdown = require('memdown');
const compression = require('./compression');

function createDatabase({ valueEncoding, leveldown, keyEncoding }) {
  const store = leveldown || memdown();
  const encodedStore = encode(store, { valueEncoding, keyEncoding });

  return levelup(encodedStore);
}

function decodeMessage(message, db) {

  let codec = db.db.codec;
  // TODO For some reason when two instances of memdown is created within the same process
  // they start to refer to a common storage or something. This needs further investigation.
  if (!codec) codec = db.db._db.codec;

  return {
    key: codec.decodeKey(message.key),
    value: codec.decodeValue(message.value)
  }
}

function KafkaCache({ streamReady, kafkaWrite, compressValues, levelupOptions, resolver, log, metrics }) {
  log.debug('New KafkaCache instance created');

  const db = createDatabase(levelupOptions);

  let isReady = false, callbacks = [];
  const offsetWaiters = new Map();
  let lastOffset = -1;

  const triggerReady = () => {
    if (isReady) return;

    isReady = true;
    callbacks.forEach(callback => callback());
    callbacks = [];
  }

  const waitForOffset = async (offset) => {
    if (!isReady) throw new Error('cache.onReady() must have been triggered before cache.waitForOffset() is available!');
    if (!Number.isInteger(offset)) throw new Error('Invalid offset: ' + offset);
    if (lastOffset >= offset) return Promise.resolve();

    return new Promise(resolve => {
      const callbacks = offsetWaiters.get(offset) || [];
      offsetWaiters.set(offset, callbacks);
      callbacks.push(resolve);
    });
  }

  const onOffsetReceived = async (offset) => {
    lastOffset = offset;
    const callbacks = offsetWaiters.get(offset) || [];
    log.debug({ nCallbacks: callbacks.length, offset }, 'Notifying callbacks for offset');
    callbacks.forEach(cb => cb());
    offsetWaiters.delete(offset);
  }

  streamReady.then(({ stream, currentTopicOffset }) => {
    log.debug({ currentTopicOffset }, 'Kafkacache stream ready to start consuming');

    stream(message => {
      if (compressValues) message.value = compression.decompress(message.value);

      const { key, value } = decodeMessage(message, db);
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

      if (message.offset >= currentTopicOffset) {
        setImmediate(triggerReady);
      }

      if (message.offset >= currentTopicOffset)
        setImmediate(() => onOffsetReceived(message.offset));
    }, metrics.onKafkaStats);

    // Empty topics will never trigger a stream event. So we're already ready
    if (currentTopicOffset === -1) {
      setImmediate(triggerReady);
    }

  }).catch(err => {
    metrics.incStreamError();
    log.error(err);
  });

  return {
    get: db.get.bind(db),
    put: kafkaWrite,
    waitForOffset,
    createReadStream: db.createReadStream.bind(db),
    on: db.on.bind(db),
    onReady: fn => {
      if (fn) isReady ? process.nextTick(fn) : callbacks.push(fn);
      return new Promise(resolve => isReady ? process.nextTick(resolve) : callbacks.push(resolve));
    }
  }
}

module.exports = KafkaCache;