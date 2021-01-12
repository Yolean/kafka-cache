const { expect } = require('chai');
const KafkaCache = require('.');
const aguid = require('aguid');

function getTopicName(suffix) {
  return Date.now() + '_' + suffix;
}

describe.only('topics with retention', function () {

  it('works', async function () {
    this.timeout(10000);
    const topic = getTopicName('fakeretention.json.');

    const kafkaWrite = KafkaCache.createKafkaWrite({
      topic,
      kafkaHost: 'kafka:9092',
    });

    await kafkaWrite(aguid('key1'), { foo: 'bar' });
    await kafkaWrite(aguid('key2'), { foo: 'bar' });
    await kafkaWrite(aguid('key3'), { foo: 'bar' });
    await kafkaWrite(aguid('key4'), { foo: 'bar' });

    const cache = KafkaCache.create({
      kafkaHost: 'kafka:9092',
      topic,
      readOnly: false,
      startOffset: 2
    });

    await cache.onReady();

    expect(await cache.get(aguid('key3'))).to.deep.equal({ foo: 'bar' });
    expect(await cache.get(aguid('key4'))).to.deep.equal({ foo: 'bar' });

    expect(await cache.get(aguid('key1')).catch(err => err).notFound).to.equal(true);
    expect(await cache.get(aguid('key2')).catch(err => err).notFound).to.equal(true);
  });
});