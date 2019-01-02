const bunyan = require('bunyan');

const logger = bunyan.createLogger({
  name: 'kafka-cache',
  streams: [
    {
      level: process.env.KAFKA_CACHE_LOG_LEVEL || 'DEBUG',
      stream: process.stdout
    }
  ],
  serializers: bunyan.stdSerializers
});

exports.info = logger.info.bind(logger);
exports.error = logger.error.bind(logger);
exports.warn = logger.warn.bind(logger);
exports.debug = logger.debug.bind(logger);