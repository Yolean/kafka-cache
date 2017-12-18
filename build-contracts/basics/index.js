const { expect } = require('chai');

const KafkaCache = require('/kafka-cache');
const kafka = require('/kafka-cache/lib/kafka');

const uuid = require('uuid');

describe('kafka-cache build-contract basics', function () {

  it('resolves the latest state from a kafka topic', function (done) {
    const cache = KafkaCache.create({
      kafkaHost: 'kafka:9092', // We never talked about this one but I guess it's required nonetheless
      topic: 'build-contract.basics.001'
    });

    // It's just so much easier to re-run tests with random ids
    const id = uuid.v4();

    cache.onReady(() => {
      cache.get(id, (err, value) => {
        expect(err).to.deep.equal({ notFound: true, status: 404 });
        expect(value).to.equal(undefined);

        const producerReady = kafka.createProducer({
          'metadata.broker.list': 'kafka:9092',
          'queue.buffering.max.ms': 0
        });

        kafka.write(producerReady, 'build-contract.basics.001', { json: 'whadup' }, id, (error, offset) => {
          expect(error).to.equal(null);

          // TODO We might want to expose something like cache.waitForOffset(offset)
          // or cache.onUpdate((err, { changes, offset }) ...)
          setTimeout(() => {
            cache.get(id, (err, value) => {
              expect(err).to.equal(null);

              expect(value).to.deep.equal({ json: 'whadup' });
              done();
            });
          }, 3000);
        });
      });
    });
  });

  it('supports gzip compression');
  it('supports snappy compression');
  // We might want to test this by simply creating two caches on the same
  // topic
  it('supports scaling the service to several replicas');
});