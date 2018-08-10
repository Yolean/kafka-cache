const { expect } = require('chai');

const customEncodings = require('../lib/custom-encodings');

describe('custom-encodings', function () {

  describe('kafka-cache.json.gzip', function () {

    it('decode(encode(x)) === id(x)', function () {
      const codec = customEncodings.getCustomEncoding('kafka-cache.json.gzip');
      const actual = codec.decode(codec.encode({
        foo: 'bar'
      }));

      expect(actual).to.deep.equal({ foo: 'bar' });
    });
  });
});