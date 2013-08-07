var zcache = require('../index')
var Q = require('kew')

exports.setUp = function (callback) {
  this.cI = new zcache.InMemoryCache()
  this.cI.connect()
  this.cI.resetCount()
  callback()
}

exports.tearDown = function (callback) {
  this.cI.disconnect()
  this.cI.destroy()
  callback()
}

exports.testInMemoryCache = function (test) {
  test.equal(this.cI.isAvailable(), true, 'In memory cache is always available')
  test.done()
}

exports.testCacheSet = function (test) {
  test.equal(0, this.cI.getKeyCount(), 'There is no key in cache')
  this.cI.set('foo', 'bar', 10000)
  test.equal(this.cI._data['foo'], 'bar', 'bar should be returned')
  test.equal(1, this.cI.getKeyCount(), 'There is 1 key in cache')
  test.done()
}

exports.testCacheOverrideMaxAgeMs = function (test) {
  this.cI.overrideMaxAgeMs(1) // super short
  this.cI.set('foo', 'bar')

  setTimeout(function () {
    this.cI.get('foo')
      .then(function (data) {
        test.equal(data, undefined, 'foo should have expired by now')
        test.done()
      })
  }.bind(this), 2)
}

exports.testCacheSetReaperInterval = function (test) {
  this.cI.setReaperInterval(3000)
  this.cI.set('foo', 'bar', 250)

  // these tests check the reaper
  // the item should still be in the cache at the 500ms mark
  setTimeout(function () {
    test.equal(this.cI._data['foo'], 'bar', 'foo should still be in the cache')
  }.bind(this), 500)

  // the item should still be in the cache even after the default reaping time of 2500ms
  setTimeout(function () {
    test.equal(this.cI._data['foo'], 'bar', 'foo should still be in the cache')
  }.bind(this), 2500)

  // the item should be reaped after the reaper interval of 5000 ms
  setTimeout(function () {
    test.equal(this.cI._data['foo'], undefined, 'foo should not be in the cache')
    test.done()
  }.bind(this), 3001)
}

exports.testCacheSetReaperIntervalExpiringGet = function (test) {
  this.cI.setReaperInterval(1000)
  this.cI.set('foo', 'bar', 500)
  var self = this

  // undefined should be returned since the item has expired, but before the reaper could clean it
  setTimeout(function () {
    self.cI.get('foo')
      .then(function (data) {
        test.equal(data, undefined, 'foo should still be in the cache')
        test.equal(1, self.cI.getAccessCount(), 'The number of accesses is 1')
        test.equal(0, self.cI.getHitCount(), 'The number of hits is 0 - the cache entry has expired')
        test.done()
      })
  }, 750)
}

exports.testCacheGet = function (test) {
  this.cI._data['foo'] = 1
  this.cI._expireAt['foo'] = Date.now() + 1000
  var self = this
  this.cI.get('foo')
    .then(function (data) {
      test.equal(data, 1, '1 should be returned')
      test.equal(1, self.cI.getAccessCount(), 'The number of accesses is 1')
      test.equal(1, self.cI.getHitCount(), 'The number of hits is 1')
      test.done()
    })
}

exports.testCacheDel = function (test) {
  this.cI.set('foo', 1, 1000)
  this.cI.del('foo')
  test.equal(this.cI._data['foo'], undefined, 'foo should have been deleted')
  test.done()
}

exports.testCacheMset = function (test) {
  var sampleKeys = [
    {key: 'a', value: 1},
    {key: 'b', value: 2},
    {key: 'c', value: 3}
  ]

  this.cI.mset(sampleKeys)
  test.equal(this.cI._data['a'], 1, 'a should be 1')
  test.equal(this.cI._data['b'], 2, 'b should be 2')
  test.equal(this.cI._data['c'], 3, 'c should be 3')
  test.equal(3, this.cI.getKeyCount(), 'There are 3 keys in cache')
  test.done()
}

exports.testCacheMget = function (test) {
  this.cI.mset([{key: 'a', value: 1}, {key: 'b', value: 2}, {key: 'c', value: 3}], 1000)
  var self = this
  this.cI.mget(['a', 'b', 'c'])
    .then(function (keys) {
      if (keys.length != 3) test.fail('there should be 3 items returned')
      test.equal(keys[0], 1, 'a should be 1')
      test.equal(keys[1], 2, 'b should be 2')
      test.equal(keys[2], 3, 'c should be 3')
      test.equal(3, self.cI.getAccessCount(), 'The number of accesses is 3')
      test.equal(3, self.cI.getHitCount(), 'The number of hits is 3')
      test.done()
    })
}

exports.testCacheMgetMissing = function (test) {
  this.cI.setReaperInterval(1000)

  // the time passed in is ignored because overrideTTL was set
  this.cI.mset([{key: 'a', value: 1}, {key: 'b', value: 2}, {key: 'c', value: 3}], 100)
  var self = this
  setTimeout(function () {
    self.cI.mget(['a', 'b', 'c'])
      .then(function (keys) {
        test.equal(keys[0], undefined, 'a should be undefined')
        test.equal(keys[1], undefined, 'b should be undefined')
        test.equal(keys[2], undefined, 'c should be undefined')
        test.equal(3, self.cI.getAccessCount(), 'The number of accesses is 3')
        test.equal(0, self.cI.getHitCount(), 'The number of hits is 0')
        test.done()
      })
  }, 1101)
}
