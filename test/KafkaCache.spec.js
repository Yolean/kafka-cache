const { expect } = require('chai');

const KafkaCache = require('../lib/KafkaCache');
const simple = require('simple-mock');

const memdown = require('memdown');

function createMockMetricsApi() {
  return {
    incMissingKey: simple.spy(),
    incStreamError: simple.spy()
  };
}

describe('KafkaCache unit-tests', function () {

  it('ignores payloads with missing keys but logs them and reports them as metrics', async function () {

    const logger = {
      debug: simple.spy(),
      error: simple.spy((...args) => console.error(...args)),
      info: simple.spy(),
      warn: simple.spy()
    };

    const mocks = {
      stream: simple.mock()
    };

    const metricsApi = createMockMetricsApi();

    const cache = new KafkaCache({
      streamReady: Promise.resolve({ stream: mocks.stream, currentTopicOffset: -1 }),
      log: logger,
      levelupOptions: {
        keyEncoding: 'utf-8',
        valueEncoding: 'json'
      },
      resolver: x => x,
      metrics: metricsApi
    });

    const message = {
      key: null,
      value: Buffer.from(JSON.stringify({ foo: 'bar' }))
    };

    await cache.onReady();

    expect(metricsApi.incMissingKey.callCount).to.equal(0);
    mocks.stream.lastCall.arg(message);
    expect(logger.error.lastCall.arg).to.contain('Falsy keys are not supported');
    expect(metricsApi.incMissingKey.callCount).to.equal(1);
  });

  it('supports encoding buffer keys as long as they are not empty', async function () {

    const logger = {
      debug: simple.spy(),
      error: simple.spy((...args) => console.error(...args)),
      info: simple.spy(),
      warn: simple.spy()
    };

    const mocks = {
      stream: simple.mock()
    };

    const metricsApi = createMockMetricsApi();

    const cache = new KafkaCache({
      streamReady: Promise.resolve({ stream: mocks.stream, currentTopicOffset: -1 }),
      log: logger,
      levelupOptions: {
        keyEncoding: 'utf-8',
        valueEncoding: 'json'
      },
      resolver: x => x,
      metrics: metricsApi
    });

    await cache.onReady();

    expect(metricsApi.incMissingKey.callCount).to.equal(0);
    mocks.stream.lastCall.arg({
      key: Buffer.from('foo'),
      value: Buffer.from(JSON.stringify({ foo: 'bar' }))
    });
    expect(metricsApi.incMissingKey.callCount).to.equal(0);
    const foo = await cache.get('foo');
    expect(foo).to.deep.equal({ foo: 'bar' });

    mocks.stream.lastCall.arg({
      key: Buffer.from(''),
      value: Buffer.from(JSON.stringify({ foo: 'bar' }))
    });
    expect(metricsApi.incMissingKey.callCount).to.equal(1);

    mocks.stream.lastCall.arg({
      key: {
        "type": "Buffer",
        "data": []
      },
      value: Buffer.from(JSON.stringify({ foo: 'bar' }))
    });

    expect(metricsApi.incMissingKey.callCount).to.equal(2);
  });

  it('defaults to keyEncoding=string and valueEncoding=json', async function () {

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
      resolver: x => x,
      metrics: createMockMetricsApi()
    });

    const message = {
      key: '1',
      value: Buffer.from(JSON.stringify({ foo: 'bar' }))
    };

    await cache.onReady();

    try {
      const value = await cache.get('1');
      expect(value).to.equal(undefined);
    } catch (error) {
      expect(error).to.be.an('object').with.property('notFound').and.equal(true);
    }
    mocks.stream.lastCall.arg(message);
    const value = await cache.get('1');
    expect(value).to.deep.equal({ foo: 'bar' });
  });
});