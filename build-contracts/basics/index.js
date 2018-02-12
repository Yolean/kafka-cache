const { expect } = require('chai');
const bunyan = require('bunyan');
const log = bunyan.createLogger({ name: 'test-basics', serializers: bunyan.stdSerializers });

const KafkaCache = require('/kafka-cache');

const uuid = require('uuid');

process.on('unhandledRejection', (err, p) => {
  log.error({ err, p }, 'Unhandled rejection!');
  process.exit(1);
});

describe('kafka-cache build-contract basics', function () {

  it('resolves the latest state from a kafka topic', function (done) {
    const cache = KafkaCache.create({
      kafkaHost: 'kafka:9092', // We never talked about this one but I guess it's required nonetheless
      topic: 'build-contract.basics.001',
      readOnly: false
    });

    // It's just so much easier to re-run tests with random ids
    const id = uuid.v4();

    cache.onReady().catch(done);

    cache.onReady(() => {

      log.info('onReady returned');
      cache.get(id, (err, value) => {
        log.info({ err, value }, 'get returned');
        expect(err).to.deep.equal({ notFound: true, status: 404 });
        expect(value).to.equal(undefined);

        log.info('Writing to cache');
        cache.put(id, { json: 'whadup' }, (error, offset) => {
          log.info('put returned');

          // TODO We might want to expose something like cache.waitForOffset(offset)
          // or cache.onUpdate((err, { changes, offset }) ...)
          log.info({ offset }, 'Waiting for offset');
          setTimeout(() => {
            log.info('Getting from cache');
            cache.get(id, (err, value) => {
              log.info('get returned');
              expect(err).to.equal(null);

              expect(value).to.deep.equal({ json: 'whadup' });
              done();
            });
          }, 3000);
        });
      });
    });
  });

  it('doesnt allow writes by default, to save on creating producers when we dont need to', function () {
    const cache = KafkaCache.create({
      kafkaHost: 'kafka:9092',
      topic: 'build-contract.basics.002'
    });

    return cache.onReady().then(() => {
      expect(() => cache.write('test', { foo: 'bar' })).to.throw();
    });
  });

  it('supports gzip compression');
  it('supports snappy compression');
  // We might want to test this by simply creating two caches on the same
  // topic
  it('supports scaling the service to several replicas');
});