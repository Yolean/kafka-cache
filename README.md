Note: we're no longer publishing this package to npm. We're using the `yolean/node-kafka-cache` Docker image. For regular npm dependencies use `Yolean/kafka-cache#[commit]` in your package.json.

# kafka-cache
The log-backed in-memory cache we need in almost every service

## Usage

```js
const KafkaCache = require('kafka-cache');

const cache = KafkaCache.create({
  // Default options listed as values
  kafkaHost: 'kafka:9092', // used for bootstrapping kafka connection
  topic: '', // required!
  readOnly: true, // cache.put will throw an error as long as this is not set to false
  valueEncoding: 'json', // anything that encoding-down supports
  keyEncoding: 'utf-8', // anything that encoding-down supports
  // TODO Support resolvers that require batch updates (i.e. update several keys)
  resolver: x => x, // transform your message value before inserting it into the store
  leveldown: memdown(), // an instance of an abstract-leveldown implementation
  metrics: require('prom-client') // optional, prometheus metrics
});

cache.onReady(() => {
  // Cache has caught up to recent messages in the kafka topic

  // Identical to levelup.get. error is an object { notFound: true } for missing keys
  cache.get(key, (error, value) => {

  });

  // Writes to the kafka topic ...
  cache.put(key, value, (error, offset) => {
    // Returns the offset for the topic.

    // TODO: This does not guarantee that cache.get(key, ...)
    // will return value we just put into the cache.
    // We need to add a way to wait for the cache's consumer to catch up
  });
});
```

## Sample data model

All `ID`s are UUIDs.

```graphql
type User {
  id: ID!
  email: String
  displayName: String!
  groups: [Organization]!
}
```


```graphql
type Organization {
  id: ID!
  name: String!
}
```

```graphql
enum SessionType {
  REGULAR
  MEETINGSCREEN
}
```

```graphql
type Session {
  id: ID!
  user: User!
  type: SessionType!
  ipAddress: String
}
```

## Operational aspects

We'll reference these assumptions using OPS[X], as they'll be essential for scoping.

 1. We run Kubernetes (or equivalent), i.e. something with _pods_ in which our microservice is a container.

 2. Likewise, each service is configured and scaled using a _deployment_.

 3. We monitor this using Prometheus (or equivalent),
    i.e a service can _trust_ that a human will be paged if an important metric deviates from the expected.


### Pod identity

Pods give each instance of our service a unique identity, typically through an environment variable:

```yaml
env:
  - name: POD_NAME
    valueFrom:
      fieldRef:
        fieldPath: metadata.name
  - name: POD_NAMESPACE
    valueFrom:
      fieldRef:
        fieldPath: metadata.namespace
```

The identifier becomes `$POD_NAMESPACE.[service name].$POD_NAME`.
With OPS2 we can reduce this to `$POD_NAMESPACE.$POD_NAME`
because the deployment's name is part of pod name
and can be assumed to reflect the service name.

## Caching rules

 1. The cache is _only_ updated through topic events.
    In other words the container is not allowed to write to the cache.

 2. Caches may lag behind their backing topic(s).
    We should be to monitor this using regular Kafka consumer lag.

## Handling inconsistencies.

Design decisions, probably per topic and/or per service.

 1. Do we accept invalid writes to the topic. I.e. do we techically _enforce_ a schema?

 2. Do we validate individual messages at read?

 3. Do we validate that the cache mutation that a message leads to?
