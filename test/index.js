const { expect } = require('chai');

const KafkaCache = require('../lib/KafkaCache');
const simple = require('simple-mock');

const memdown = require('memdown');

describe('KafkaCache unit-tests', function () {

  afterEach(() => memdown.clearGlobalStore());

  it('ignores payloads with missing keys', function (done) {

    const logger = {
      debug: simple.spy(),
      error: simple.spy((...args) => console.error(...args)),
      info: simple.spy(),
      warn: simple.spy()
    };

    const mocks = {
      stream: simple.mock()
    };

    const cache = new KafkaCache({
      streamReady: Promise.resolve({ stream: mocks.stream, currentTopicOffset: -1 }),
      log: logger,
      levelupOptions: {
        keyEncoding: 'utf-8',
        valueEncoding: 'json'
      },
      resolver: x => x
    });

    const message = {
      key: null,
      value: Buffer.from(JSON.stringify({ foo: 'bar' }))
    };

    cache.onReady(() => {
      mocks.stream.lastCall.arg(message);
      expect(logger.error.lastCall.arg).to.contain('Falsy keys are not supported');

      done();
    });
  });

  it('defaults to keyEncoding=string and valueEncoding=json', function (done) {

    const mocks = {
      stream: simple.mock()
    };

    const cache = new KafkaCache({
      streamReady: Promise.resolve({ stream: mocks.stream, currentTopicOffset: -1 }),
      log: console,
      levelupOptions: {
        keyEncoding: 'utf-8',
        valueEncoding: 'json'
      },
      resolver: x => x
    });

    const message = {
      key: '1',
      value: Buffer.from(JSON.stringify({ foo: 'bar' }))
    };

    cache.onReady(() => {
      cache.get('1', (error, value) => {
        expect(error).to.be.an('object').with.property('notFound').and.equal(true);
        expect(value).to.equal(undefined);

        mocks.stream.lastCall.arg(message);
        cache.get('1', (error, value) => {
          expect(error).to.equal(null);
          expect(value).to.deep.equal({ foo: 'bar' });
          done();
        });
      });
    });
  });
});