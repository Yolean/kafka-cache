const Kafka = require('node-rdkafka');
const log = require('./log');
const async = require('async');

const CONNECT_TIMEOUT = 5000;
const N_CONNECT_RETRIES = 5;
const STATS_INTERVAL_MS = 10 * 1000;

let opaque = 0;
const callbacks = new Map();

const KAFKA_DEBUG_LEVEL = process.env.DEBUG === '*' ? 'all' : 'broker';

log.info({ features: Kafka.features, version: Kafka.librdkafkaVersion }, 'node-rdkafka build');

function triggerWriteCallback(error, { opaque, offset, key, topic, partition, size }) {
  const reportWithKeyString = {
    opaque, offset, topic, partition, size, key: key.toString()
  };
  log.debug(reportWithKeyString, 'Delivery report');
  const callback = callbacks.get(opaque);
  if (!callback) {
    throw new Error(`Missing producer callback for opaque ${opaque} at offset ${offset}`);
  }

  callbacks.delete(opaque);
  callback(error, offset);
}

function createProducer(options) {
  log.info('Creating producer');
  return new Promise((resolve, reject) => {
    const producer = new Kafka.Producer(Object.assign({
      'debug': KAFKA_DEBUG_LEVEL,
      'dr_cb': true
    }, options), {
      // From https://kafka.apache.org/08/documentation.html:
      // -1, which means that the producer gets an acknowledgement after all
      // in-sync replicas have received the data. This option provides the best durability,
      // we guarantee that no messages will be lost as long as at least one in sync replica remains.
      'request.required.acks': '-1'
    });

    // NOTE: Unless we do this we can't get delivery-reports it seems
    producer.setPollInterval(100);

    producer.on('delivery-report', triggerWriteCallback);

    producer.on('event.log', event => {
      log.debug(event, 'producer.event.log');
      if (event.fac === 'BROKERFAIL') reject(event.message);
    });
    producer.on('ready', () => {
      log.info('Producer ready');
      resolve(producer);
    });
    producer.on('error', reject);
    // NOTE This has never fired for me, so I don't know if it works?
    // The above event.log event fires instead. So confused ...
    // producer.on('event.error', reject);

    process.on('exit', () => producer.disconnect());

    producer.connect();
  });
}

function checkTopicExists(topic, options, callback) {
  log.info({ topic }, 'checkTopicExists');
  const consumer = new Kafka.KafkaConsumer(Object.assign({
    'debug': KAFKA_DEBUG_LEVEL,
    'group.id': 'check-topic-exists',
    'enable.auto.commit': false,
    event_cb: true
  }, options), {});

  async.retry(
    N_CONNECT_RETRIES,
    retryCb => {
      log.debug({ topic }, 'checkTopicExists: Attempting to connect to kafka');
      return consumer.connect({}, retryCb);
    },
    err => {
      if (err) {
        log.error(err);
        log.error('Failed to check for topic existence!');
        consumer.disconnect();
        return callback(err);
      }

      log.debug({ topic }, 'Consumer connected');
    }
  );

  consumer.on('event', log.info.bind(null, 'checkTopicExists.event'));
  consumer.on('event.log', log.debug.bind(null, 'checkTopicExists.event.log'));
  consumer.on('event.error', log.error.bind(null, 'checkTopicExists.event.error'));
  consumer.on('error', log.error.bind(null, 'checkTopicExists.error'));

  process.on('exit', () => consumer.disconnect());

  consumer.on('ready', () => {
    log.debug({ topic }, 'checkTopicExists consumer ready');
    async.retry(
      N_CONNECT_RETRIES,
      retryCb => consumer.queryWatermarkOffsets(topic, 0, CONNECT_TIMEOUT, retryCb),
      (err, offsets) => {
        log.debug(offsets, 'queryWatermarkOffsets');

        consumer.disconnect();

        if (err) callback(err);
        else callback(null, offsets.highOffset - 1);
      }
    );
  });
}

function queryTopicOffsetFromTimestamp(topic, consumerOptions, timestamp, callback) {
  log.info({ topic, timestamp}, 'Querying for offset from timestamp queryTopicOffsetFromTimestamp');
  const consumer = new Kafka.KafkaConsumer(Object.assign({
    'debug': KAFKA_DEBUG_LEVEL,
    'group.id': 'query-topic-offset-from-timestamp',
    'enable.auto.commit': false,
    event_cb: true
  }, consumerOptions), {});

  consumer.connect(err => {
    if (err) {
      log.error({ topic, timestamp }, 'Failed to connect consumer when querying for offset from timestamp');
      return callback(err);
    }
  });

  consumer.on('ready', () => {
    log.info({ topic, timestamp }, 'Consumer ready, querying for offset from timestamp... queryTopicOffsetFromTimestamp');

    const toppar = [{ topic, partition: 0, offset: timestamp }]
    consumer.offsetsForTimes(toppar, CONNECT_TIMEOUT, (err, result) => {
      if (err) {
        log.error({ topic, timestamp, err }, 'Failed to query for offset from timestamp!');
        return callback(new Error('Failed to query for offset from timestamp! Kafka returned an error'));
      }

      const [{ offset }] = result;

      log.info({ topic, timestamp, offset }, 'Offset returned for timestamp queryTopicOffsetFromTimestamp');
      callback(null, offset);
    });
  });
}

function stream(topic, consumerId, options, offset, callback, onKafkaStats) {
  if (!topic) throw new Error('Missing topic to stream from!');
  if (!consumerId) throw new Error('Missing consumerId to define the consumer to kafka!');
  if (!callback || typeof callback !== 'function') throw new Error('Missing callback to stream data to!');
  log.debug({ offset, topic, args: Array.from(arguments) }, 'Setting up kafka stream');
  const consumer = new Kafka.KafkaConsumer(Object.assign({
    'debug': KAFKA_DEBUG_LEVEL,
    'group.id': consumerId,
    'statistics.interval.ms': onKafkaStats ? STATS_INTERVAL_MS : 0,
    event_cb: true
  }, options), {});

  consumer.connect(null, err => {
    if (err) throw err;
    consumer.assign([{ topic, offset, partition: 0 }]);
  });

  // NOTE: This is the only way I've been able to get the internal logs from librdkafka
  // All of them seem to get logged with severity=7 however (node-rdkafka 2.2.1 with librdkafka 0.11.1)
  // so we don't have a general way of knowing when something went bottoms up yet.
  consumer.on('event.log', ({ message, fac, severity }) => {
    if (fac === 'CODEC') {
      // This seems to get logged upon compression codec errors, which ultimately
      // leads to a dead consumer, i.e. a production stop.
      // So I guess this is one of those errors that should wake us up
      log.error({ topic, consumerId, severity }, '[KAFKA] ' + message);
    }

    log.debug({ message, fac, severity }, 'stream.event.log');
  });

  consumer.on('event.error', log.error.bind(null, 'stream.event.error'));
  consumer.on('error', log.error.bind(null, 'stream.error'));

  consumer.on('ready', () => {
    log.debug({ topic, consumerId }, 'Stream consumer ready');

    consumer.consume();
    consumer.on('data', callback);
  });

  if (onKafkaStats) consumer.on('event.stats', onKafkaStats);

  process.on('exit', () => consumer.disconnect());

  return {
    endStream: () => {
      log.info({ topic, consumerId }, 'Ending stream');
      consumer.disconnect();
    }
  };
}

function write(producerReady, topic, payload, id, callback) {
  log.debug({ id }, 'Write request received, waiting for producer ready');
  producerReady.then(producer => {
    const isPayloadBuffer = Buffer.isBuffer(payload);
    log.debug({ id, opaque, isPayloadBuffer }, 'Producer ready. Writing to kafka')
    callbacks.set(opaque, callback);

    if (!isPayloadBuffer) {
      payload = Buffer.from(JSON.stringify(payload))
    }

    producer.produce(
      topic,
      0,
      payload,
      id,
      Date.now(),
      opaque
    );

    opaque++;
  }, callback);
}

// options => Promise
exports.createProducer = createProducer;
// topic, options, callback
exports.checkTopicExists = checkTopicExists;
// topic, timestamp
exports.queryTopicOffsetFromTimestamp = queryTopicOffsetFromTimestamp;
// topic, consumerOptions, offset, callback
exports.stream = stream;
// producerReady (Promise), topic, payload (JSON), id (UUID), callback
exports.write = write;
