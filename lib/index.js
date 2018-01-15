const kafka = require('./kafka');

const KafkaCache = require('./KafkaCache');

const defaults = {
  kafkaHost: 'http://localhost:9092', // We never talked about this one but I guess it's required nonetheless
  // topic: 'build-contract.basics.001',
  resolver: x => x,
  valueEncoding: 'json',
  keyEncoding: 'utf-8',
  log: require('./log')
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

  return new KafkaCache({
    streamReady: createKafkaStream(options),
    resolver: options.resolver,
    levelupOptions: {
      valueEncoding: options.valueEncoding,
      keyEncoding: options.keyEncoding,
      leveldown: options.leveldown
    },
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

    log.info('Prometheus metrics enabled!');

    return {
      incMissingKey: () => missingKeyCounter.inc(),
      incStreamError: () => streamErrorCounter.inc()
    };
  } else {
    log.warn('Missing "metrics" option, prometheus metrics is disabled!');

    return {
      incMissingKey: () => {},
      incStreamError: () => {}
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

module.exports = {
  create
};