const { expect } = require('chai');
const KafkaCache = require('./');
const kafka = require('./kafka');
const aguid = require('aguid');
const { promisify } = require('util');

const mockedUser = {
  "timestamp": 1535635403000,
  "realm": "demo",
  "userId": "7fce8bfd-2602-4775-bca2-ca320a05d502",
  "displayName": "Glenn Backman",
  "email": "glenn@yolean.com",
  "roles": [],
  "realmManagementRoles": [
    "foo-bar"
  ],
  "groups": [
    "/Project 1",
    "/Project 2"
  ]
}

function getTopicName(suffix) {
  return Date.now() + '_' + suffix;
}

describe('consumption from several different kafka caches', function () {
  this.timeout(10000);

  it('keeps the caches in sync between each other', async function () {
    const topic = getTopicName('foobar.json.');

    const createCache = () => KafkaCache.create({
      kafkaHost: 'kafka:9092',
      topic,
      readOnly: false
    });

    const cache1 = createCache();
    await cache1.onReady();


    const kafkaWrite = KafkaCache.createKafkaWrite({
      topic,
      kafkaHost: 'kafka:9092',
    });

    const offset = await kafkaWrite(aguid('key1'), { foo: 'bar' });
    await cache1.waitForOffset(offset);

    const cache2 = createCache();
    await cache2.onReady();

    const value1 = await cache1.get(aguid('key1'), 'cache1 contains the correct key');
    const value2 = await cache2.get(aguid('key1'), 'cache1 contains the correct key');

    expect(value1).to.deep.equal({ foo: 'bar' });
    expect(value2).to.deep.equal({ foo: 'bar' });

    const offsetReady = cache2.put(aguid('key2'), { foo: 'bar' });

    const offset2 = await offsetReady;
    await cache1.waitForOffset(offset2);
    const value4 = await cache1.get(aguid('key2'));
    expect(value4).to.deep.equal({ foo: 'bar' });

    await cache2.waitForOffset(offset2);
    const value3 = await cache2.get(aguid('key2'));
    expect(value3).to.deep.equal({ foo: 'bar' });

  });

  after(() => KafkaCache.destroyAllClients());
});

describe('how kafka-cache handles large gzip topics that we invented ourselves', function () {

  it('it only ever reads the last message when asked for', async function () {
    this.timeout(10000);

    const userTopic = getTopicName('user-states.json.')
    const nWrites = 20;

    const kafkaWriteUsers = KafkaCache.createKafkaWrite({
      topic: userTopic,
      kafkaHost: 'kafka:9092',
    });

    const userWrites = [];
    for (let i = 0; i < nWrites; i++) {
      const id = aguid(Math.floor(Math.random() * 800) + '');
      userWrites.push(kafkaWriteUsers(id, mockedUser));
    }

    await Promise.all(userWrites);

    const id = aguid(Math.floor(Math.random() * 800) + '');
    const now = Date.now();
    await kafkaWriteUsers(id, mockedUser);

    const offset = await promisify(kafka.queryTopicOffsetFromTimestamp)(userTopic, {
      'metadata.broker.list': 'kafka:9092',
      'fetch.wait.max.ms': 50
    }, now);

    expect(offset).to.equal(nWrites);

    const userCacheSinceNow = KafkaCache.create({
      kafkaHost: 'kafka:9092',
      topic: userTopic,
      readOnly: true,
      consumeFromTimestamp: now
    });

    const userCacheSinceForever = KafkaCache.create({
      kafkaHost: 'kafka:9092',
      topic: userTopic,
      readOnly: true
    });

    let userCacheSinceNowPutCount = 0;
    userCacheSinceNow.on('put', () => userCacheSinceNowPutCount++);

    let userCacheSinceForeverPutCount = 0;
    userCacheSinceForever.on('put', () => userCacheSinceForeverPutCount++);

    console.log('Waiting for userCacheSinceForever onReady...')
    await userCacheSinceForever.onReady();
    console.log('Waiting for userCacheSinceNow onReady...')
    await userCacheSinceNow.onReady();

    const user = await userCacheSinceNow.get(id);
    expect(user).to.deep.equal(mockedUser);

    expect(userCacheSinceNowPutCount).to.equal(1);
    expect(userCacheSinceForeverPutCount).to.equal(nWrites + 1);
  });

  it('it would be great if calling applications could send in Date.now() and always expect one message back', async function () {
    this.timeout(10000);

    const userTopic = getTopicName('user-states.json.')
    const nWrites = 20;

    const kafkaWriteUsers = KafkaCache.createKafkaWrite({
      topic: userTopic,
      kafkaHost: 'kafka:9092',
    });

    const userWrites = [];
    for (let i = 0; i < nWrites; i++) {
      const id = aguid(Math.floor(Math.random() * 800) + '');
      userWrites.push(kafkaWriteUsers(id, mockedUser));
    }

    await Promise.all(userWrites);

    const userCache = KafkaCache.create({
      kafkaHost: 'kafka:9092',
      topic: userTopic,
      readOnly: true,
      consumeFromTimestamp: Date.now()
    });

    let putCount = 0;
    userCache.on('put', () => putCount++);

    console.log('Waiting for userCacheSinceNow onReady...')
    await userCache.onReady();
    await new Promise(resolve => setTimeout(resolve, 1));

    expect(putCount).to.equal(1);
  });

  it('fails hard when a malformed consumeFromTimestamp option is supplied, consuming from start on a huge topic might cause a lot of problems', function () {
    expect(() => KafkaCache.create({
      kafkaHost: 'kafka:9092',
      topic: 'foobar',
      consumeFromTimestamp: 'foobar'
    })).to.throw('Received invalid option "consumeFromTimestamp": foobar');
  });

  after(() => KafkaCache.destroyAllClients());
});