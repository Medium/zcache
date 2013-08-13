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
    this.cacheInstance.connect()
    callback()
  },

  tearDown: function (callback) {
    if (this.cacheInstance) {
      this.cacheInstance.disconnect()
      this.cacheInstance.destroy()
    }
    callback()
  },

  testCacheWriteThrough: function (test) {
    this.cacheInstance.set('foo', 'bar', 10000)
    this.memoryInstance1.get('foo')
      .then(function (data) {
        test.equal(data, 'bar', 'bar should be in memoryInstance1')
      })

    this.memoryInstance2.get('foo')
      .then(function (data) {
        test.equal(data, 'bar', 'bar should be in memoryInstance2')
        test.done()
      })
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

  testCacheMgetUndefinedMget: function (test) {
    this.cacheInstance.mget(['foo', 'bar'])
      .then(function (results) {
        test.deepEqual(results[0], undefined, 'foo should be undefined')
        test.deepEqual(results[1], undefined, 'bar should be undefined')
        test.done()
      })
  },

  testCacheMgetMultipleSingleHolesStagger: function (test) {
    this.cacheInstance.set('one', 'one', 10000)

    // this will be a 'hole'
    this.cacheInstance.set('two', 'two', 10000)
    this.memoryInstance1.del('two')

    this.cacheInstance.set('three', 'three', 10000)

    // this will be a 'hole'
    this.cacheInstance.set('four', 'four', 10000)
    this.memoryInstance1.del('four')

    this.cacheInstance.set('five', 'five', 10000)

    this.cacheInstance.mget(['one', 'two', 'three', 'four', 'five'])
      .then(function (results) {
        test.equal(results[0], 'one', 'one should have been found')
        test.equal(results[1], 'two', 'two should have been found')
        test.equal(results[2], 'three', 'three should have been found')
        test.equal(results[3], 'four', 'four should have been found')
        test.equal(results[4], 'five', 'five should have been found')
        test.done()
      })

  },

  testCacheMgetMultipleLargeHolesStagger: function (test) {
    this.cacheInstance.set('one', 'one', 10000)

    // this will be a 'hole'
    this.cacheInstance.set('two', 'two', 10000)
    this.memoryInstance1.del('two')
    this.cacheInstance.set('three', 'three', 10000)
    this.memoryInstance1.del('three')

    this.cacheInstance.set('four', 'four', 10000)

    // this will be a 'hole'
    this.cacheInstance.set('five', 'five', 10000)
    this.memoryInstance1.del('five')
    this.cacheInstance.set('six', 'six', 10000)
    this.memoryInstance1.del('six')

    this.cacheInstance.set('seven', 'seven', 10000)

    this.cacheInstance.mget(['one', 'two', 'three', 'four', 'five', 'six', 'seven'])
      .then(function (results) {
        test.equal(results[0], 'one', 'one should have been found')
        test.equal(results[1], 'two', 'two should have been found')
        test.equal(results[2], 'three', 'three should have been found')
        test.equal(results[3], 'four', 'four should have been found')
        test.equal(results[4], 'five', 'five should have been found')
        test.equal(results[5], 'six', 'six should have been found')
        test.equal(results[6], 'seven', 'seven should have been found')
        test.done()
      })

  },

  testCacheMgetAllHole: function (test) {
    this.cacheInstance.set('one', 'one', 10000)
    this.memoryInstance1.del('one')
    this.cacheInstance.set('two', 'two', 10000)
    this.memoryInstance1.del('two')
    this.cacheInstance.set('three', 'three', 10000)
    this.memoryInstance1.del('three')

    this.cacheInstance.mget(['one', 'two', 'three'])
      .then(function (results) {
        test.equal(results[0], 'one', 'one should have been found')
        test.equal(results[1], 'two', 'two should have been found')
        test.equal(results[2], 'three', 'three should have been found')
        test.done()
      })

  },

  testCacheMgetHoleBeginning: function (test) {
    this.cacheInstance.set('one', 'one', 10000)
    this.memoryInstance1.del('one')
    this.cacheInstance.set('two', 'two', 10000)
    this.cacheInstance.set('three', 'three', 10000)

    this.cacheInstance.mget(['one', 'two', 'three'])
      .then(function (results) {
        test.equal(results[0], 'one', 'one should have been found')
        test.equal(results[1], 'two', 'two should have been found')
        test.equal(results[2], 'three', 'three should have been found')
        test.done()
      })

  },

  testCacheMgetHoleEnd: function (test) {
    this.cacheInstance.set('one', 'one', 10000)
    this.cacheInstance.set('two', 'two', 10000)
      this.cacheInstance.set('three', 'three', 10000)
    this.memoryInstance1.del('three')

    this.cacheInstance.mget(['one', 'two', 'three'])
      .then(function (results) {
        test.equal(results[0], 'one', 'one should have been found')
        test.equal(results[1], 'two', 'two should have been found')
        test.equal(results[2], 'three', 'three should have been found')
        test.done()
      })

  },

  testCacheMsetStagger: function (test) {
    this.cacheInstance.mset([{key: 'foo', value: 'bar'}, {key: 'fah', value: 'bah'}], 1000)

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
