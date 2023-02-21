const { expect } = require('chai');
const KafkaCache = require('.');
const aguid = require('aguid');

function getTopicName(suffix) {
  return Date.now() + '_' + suffix;
}

describe('producing too large messages', function () {

  it('does not cause unhandled rejections', async function () {
    const topic = getTopicName('produce');

    const kafkaWrite = KafkaCache.createKafkaWrite({
      topic,
      kafkaHost: 'kafka:9092',
    });

    process.on('unhandledRejection', (err) => {
      throw new Error('Expected this promise rejection to have been exposed to application code');
    });

    let err = {};
    try {
      await kafkaWrite(aguid('key1'), { foo: 'bar'.repeat(1000000) });
    } catch (_err) {
      err = _err;
    }
    
    expect(err.message).to.equal('Broker: Message size too large');
  });
});