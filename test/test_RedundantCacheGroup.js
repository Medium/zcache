var zcache = require('../index')
var Q = require('kew')

module.exports = {
  setUp: function (callback) {
    this.memoryInstance1 = new zcache.InMemoryCache()
    this.memoryInstance1.connect()
    this.memoryInstance2 = new zcache.InMemoryCache()
    this.memoryInstance2.connect()

    this.cacheInstance = new zcache.RedundantCacheGroup()
    this.cacheInstance.add(this.memoryInstance1, 2)
    this.cacheInstance.add(this.memoryInstance2, 1)
    callback()
  },

  tearDown: function (callback) {
    if (this.cacheInstance) this.cacheInstance.destroy()
    callback()
  },

  testCacheWriteThrough: function (test) {
    this.cacheInstance.set('foo', 'bar', 10000)
    test.equal(this.memoryInstance1.get('foo'), 'bar', 'bar should be in memory')
    test.equal(this.memoryInstance2.get('foo'), 'bar', 'bar should be in memory')
    test.done()
  },

  testCacheGetStagger: function (test) {
    this.cacheInstance.set('foo', 'bar', 10000)
    this.memoryInstance1.del('foo')
    test.equal(this.memoryInstance1._data['foo'], undefined, 'foo should have been deleted in memoryInstance1')
    test.equal(this.memoryInstance2._data['foo'], 'bar', 'foo should still be in memoryInstance2')

    this.cacheInstance.get('foo')
      .then(function (data) {
        test.equal(data, 'bar', 'bar should have been read from memoryInstance2')
        test.done()
      })
  },

  testCacheMgetStagger: function (test) {
    this.cacheInstance.set('foo', 'bar', 10000)
    this.cacheInstance.set('fah', 'baz', 10000)
    this.memoryInstance1.del('foo')
    test.equal(this.memoryInstance1._data['foo'], undefined, 'foo should have been deleted in memoryInstance1')
    test.equal(this.memoryInstance2._data['foo'], 'bar', 'foo should still be in memoryInstance2')

    this.cacheInstance.mget(['foo', 'fah'])
      .then(function (results) {
        test.equal(results[0], 'bar', 'bar should have been returned')
        test.equal(results[1], 'baz', 'baz should have been returned')
        test.done()
      })
  },

  testCacheMsetStagger: function (test) {
    this.cacheInstance.mset([{key: 'foo', value: 'bar'}, {key: 'fah', value: 'bah'}])

    test.equal(this.memoryInstance1._data['foo'], 'bar', 'bar should be in memoryInstance1')
    test.equal(this.memoryInstance2._data['foo'], 'bar', 'bar should be in memoryInstance2')

    test.equal(this.memoryInstance1._data['fah'], 'bah', 'bah should be in memoryInstance1')
    test.equal(this.memoryInstance2._data['fah'], 'bah', 'bah should be in memoryInstance2')

    test.done()
  },

  testCacheDelStagger: function (test) {
    this.cacheInstance.set('foo', 'bar', 10000)
    this.cacheInstance.get('foo')
      .then(function (data) {
        test.equal(data, 'bar', 'bar should be in the cache')
      })
    this.cacheInstance.del('foo')

    this.cacheInstance.get('foo')
      .then(function (data) {
        test.equal(data, undefined, 'bar should not be in the cache')
        test.done()
      })
  }
}
