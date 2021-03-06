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

  it.only('works with topics not starting from offset 0', async function () {
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
      streamReady: Promise.resolve({ stream: mocks.stream, currentTopicOffset: 17 }),
      log: logger,
      levelupOptions: {
        keyEncoding: 'utf-8',
        valueEncoding: 'json'
      },
      resolver: x => x,
      metrics: metricsApi
    });

    await Promise.resolve();

    const readySpy = simple.spy();
    const readyPromise = cache.onReady();
    readyPromise.then(readySpy);

    mocks.stream.lastCall.arg({
      key: 'key1',
      value: Buffer.from(JSON.stringify({ foo: '1' })),
      offset: 15
    });
    expect(await cache.get('key1')).to.deep.equal({ foo: '1' })
    expect(readySpy.callCount).to.equal(0);

    mocks.stream.lastCall.arg({
      key: 'key1',
      value: Buffer.from(JSON.stringify({ foo: '2' })),
      offset: 16
    });
    expect(await cache.get('key1')).to.deep.equal({ foo: '2' })
    expect(readySpy.callCount).to.equal(0);

    mocks.stream.lastCall.arg({
      key: 'key1',
      value: Buffer.from(JSON.stringify({ foo: '3' })),
      offset: 18
    });
    expect(await cache.get('key1')).to.deep.equal({ foo: '3' })
    expect(readySpy.callCount).to.equal(1);
  });

  it('exposes an additional .waitForOffset functionality that becomes important when kafka is backing a cache', async function () {
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

    const produceFlakyMessage = (message) => {
      setTimeout(() => {
        mocks.stream.lastCall.arg(message);
      }, Math.random() * 50);
    }

    // Support listeners registered before the offset is present
    const offsetReady = cache.waitForOffset(0);
    produceFlakyMessage({
      key: 'key1',
      value: Buffer.from(JSON.stringify({ foo: 'bar' })),
      offset: 0
    });
    await offsetReady;
    const value = await cache.get('key1');
    expect(value).to.deep.equal({ foo: 'bar' });

    // Support listeners registered after the offset was already received
    produceFlakyMessage({
      key: 'key2',
      value: Buffer.from(JSON.stringify({ foo: 'bar' })),
      offset: 2
    });
    produceFlakyMessage({
      key: 'key2',
      value: Buffer.from(JSON.stringify({ foo: 'bar' })),
      offset: 3
    });
    await offsetReady;
    await cache.waitForOffset(3);
    await cache.waitForOffset(2);
    const value2 = await cache.get('key2');
    expect(value2).to.deep.equal({ foo: 'bar' });
  });

  it('helps us avoid adding stupid listeners on the initial catch-up consumption of all messages when starting a service', async function () {
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

    const currentTopicOffset = 3;
    const cache = new KafkaCache({
      streamReady: Promise.resolve({ stream: mocks.stream, currentTopicOffset }),
      log: logger,
      levelupOptions: {
        keyEncoding: 'utf-8',
        valueEncoding: 'json'
      },
      resolver: x => x,
      metrics: metricsApi
    });

    try {
      await cache.waitForOffset(3);
      throw new Error('cache.waitForOffset never thew an error even though onReady was not resolved yet!');
    } catch (err) {
      expect(err.message).to.equal('cache.onReady() must have been triggered before cache.waitForOffset() is available!');
    }

    const produceMessage = offset => {
      mocks.stream.lastCall.arg({
        key: 'key1',
        value: Buffer.from(JSON.stringify({ messageNumber: offset })),
        offset
      });
    }

    for (let i = 0; i <= currentTopicOffset; i++) {
      produceMessage(i);
    }

    await cache.onReady();
    // Should not throw :)
    await cache.waitForOffset(0);
    await cache.waitForOffset(1);
    await cache.waitForOffset(2);
    await cache.waitForOffset(3);
  });

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