const kafka = require('./kafka');
const compression = require('./compression');
const KafkaCache = require('./KafkaCache');

const defaults = {
  kafkaHost: 'http://localhost:9092', // We never talked about this one but I guess it's required nonetheless
  // topic: 'build-contract.basics.001',
  resolver: x => x,
  valueEncoding: 'json',
  keyEncoding: 'utf-8',
  writeCompression: 'snappy', // snappy,gzip etc?
  compressValues: false,
  log: require('./log'),
  readOnly: true // defaulting to false would mean we might open a lot of unnecessary producers
  // onUpdate TODO
  // logger TODO
}

// A too low consumer wait time means that we'll start receiving a bunch of empty messages
// where librdkafka will enter some kind of chill-down period and actually wait longer than
// this between the polls
const CONSUMER_MAX_WAIT = 50;

function create(options) {

  options = Object.assign({}, defaults, options);

  const metrics = createMetricsApi(options);

  const streamReady = createKafkaStream(options);

  return new KafkaCache({
    streamReady,
    kafkaWrite: createKafkaWrite(streamReady, options),
    resolver: options.resolver,
    levelupOptions: {
      valueEncoding: options.valueEncoding,
      keyEncoding: options.keyEncoding,
      leveldown: options.leveldown
    },
    compressValues: options.compressValues,
    log: options.log,
    metrics
  });
}

function createMetricsApi({ metrics, log }) {

  if (metrics) {
    const missingKeyCounter = new metrics.Counter({
      name: 'kafka_cache_missing_kafka_key',
      help: 'A message was ignored due to lack of kafka "key" attribute'
    });
    const streamErrorCounter = new metrics.Counter({
      name: 'kafka_cache_stream_error',
      help: 'A kafka error was encountered, likely causing connect failure'
    });
    const consumerLagGauge = new metrics.Gauge({
      name: 'kafka_cache_consumer_lag',
      help: 'The consumer_lag statistics metric as reported by librdkafka (should only momentarily be > 0)',
      labelNames: ['topic', 'partition']
    });

    log.info('Prometheus metrics enabled!');

    return {
      incMissingKey: () => missingKeyCounter.inc(),
      incStreamError: () => streamErrorCounter.inc(),
      onKafkaStats: (payload) => {
        const stats = JSON.parse(payload.message.toString());

        Object.keys(stats.topics).forEach(topicName => {
          const partitions = stats.topics[topicName].partitions;

          Object.keys(partitions).forEach(partitionNumber => {
            // I'm not quite sure what this topic is reported for.
            // I'm guessing it's got something to do with the bootstrap broker
            // that also gets reported maybe?
            if (partitionNumber === '-1') return;

            const { consumer_lag } = partitions[partitionNumber];

            consumerLagGauge.set({
              topic: topicName,
              partition: partitionNumber
            }, consumer_lag);
          });
        });
      }
    };
  } else {
    log.warn('Missing "metrics" option, prometheus metrics is disabled!');

    return {
      incMissingKey: () => {},
      incStreamError: () => {},
      onKafkaStats: () => {}
    }
  }
}

function createKafkaStream({ topic, kafkaHost }) {

  const consumerOptions = {
    'metadata.broker.list': kafkaHost,
    'fetch.wait.max.ms': CONSUMER_MAX_WAIT
  };

  return new Promise((resolve, reject) => {
    kafka.checkTopicExists(topic, consumerOptions, (err, offset) => {
      if (err) return reject(err);

      resolve({
        stream: kafka.stream.bind(null, topic, 'node-kafka-cache', consumerOptions, 0),
        currentTopicOffset: offset
      });
    });
  });
}

function createKafkaWrite(streamReady, { valueEncoding, compressValues, log, topic, kafkaHost, writeCompression, readOnly }) {
  log.debug({ readOnly }, 'Setting up kafka write producer');

  if (readOnly) return () => { throw new Error('KafkaCache.put is disabled for readOnly caches, please create the cache with readOnly=false!'); }

  // TODO Previously we've only written json,
  // and I'm not in the position/mood to take writing
  // arbitrary encodings to kafka atm
  if (valueEncoding !== 'json') {
    throw new Error('KafkaCache.put not supported as kafka writes are only implemented for json values yet!');
  }

  // Wait for/make sure the stream gets ready before we create our producer.
  // Both validates topic existence, connection is ok and that we don't
  // write without reading.
  const producerReady = streamReady.then(() => {
    return kafka.createProducer({
     'metadata.broker.list': kafkaHost,
     'compression.codec': writeCompression,
     // TODO I don't know how we should set this for a more generic case
     // 'queue.buffering.max.ms': PRODUCER_MAX_WAIT
   });
  });

  producerReady.then(() => log.info({ topic, kafkaHost }, 'Producer ready'));

  return (key, value, callback) => {
    log.debug({ key, compressValues }, 'Put received, writing to kafka');

    value = compressValues ? compression.compress(value) : value;

    return new Promise((resolve, reject) => {
      kafka.write(producerReady, topic, value, key, (err, offset) => {
        if (err) {
          log.error(err);

          reject(err);
          if (callback) callback(err);
          return;
        }

        resolve(offset);
        if (callback) callback(null, offset);
      });
    });
  };
}

module.exports = {
  create,
  createKafkaWrite: options => createKafkaWrite(Promise.resolve(), Object.assign({}, defaults, { readOnly: false }, options))
};