var zcache = require('../index')
var Q = require('kew')

// TODO: these test cases should be using nodeunitq

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
  var self = this
  test.equal(0, this.cI.getKeyCount(), 'There is no key in cache')
  this.cI.set('foo', 'bar', 10000)
    .then(function() {
      test.equal(self.cI._data['foo'], 'bar', 'bar should be returned')
      test.equal(1, self.cI.getKeyCount(), 'There is 1 key in cache')
      test.done()
    })
}

exports.testCacheMset = function (test) {
  var self = this
  var items = [
    {key: 'key1', value: 'value1'},
    {key: 'key2', value: 'value2'}
  ]

  test.equal(0, this.cI.getKeyCount(), 'There is no key in cache')
  this.cI.mset(items, 10000)
    .then(function() {
      test.equal('value1', self.cI._data['key1'], '"key1" should be set')
      test.equal('value2', self.cI._data['key2'], '"key2" should be set')
      test.equal(2, self.cI.getKeyCount(), 'There should be two keys in cache')
      test.done()
    })
}

exports.testCacheSetImproperMaxAge = function (test) {
  this.cI.set('foo', 'bar')
    .then(function () {
      test.fail('Invalide max age parameter should fail the test')
    })
    .fail(function () {
      test.done()
    })
}

exports.testCacheOverrideMaxAgeMs = function (test) {
  this.cI.overrideMaxAgeMs(1) // super short
  this.cI.set('foo', 'bar')

  setTimeout(function () {
    this.cI.get('foo')
      .then(function (data) {
        test.deepEqual(data, undefined, 'foo should have expired by now')
        test.done()
      })
  }.bind(this), 2)
}

// TODO: This test case is fragile as it depends on the real system clock.
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

  // the item should be reaped after the reaper interval of 3000 ms
  setTimeout(function () {
    test.deepEqual(this.cI._data['foo'], undefined, 'foo should not be in the cache')
    test.done()
  }.bind(this), 3010)
}

exports.testCacheSetReaperIntervalExpiringGet = function (test) {
  this.cI.setReaperInterval(1000)
  this.cI.set('foo', 'bar', 500)
  var self = this

  // undefined should be returned since the item has expired, but before the reaper could clean it
  setTimeout(function () {
    self.cI.get('foo')
      .then(function (data) {
        test.deepEqual(data, undefined, 'foo should still be in the cache')
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

exports.testCacheGetundefined = function (test) {
  this.cI.get('foo')
    .then(function (data) {
      test.deepEqual(data, undefined, 'foo should have returned undefined')
      test.done()
    })
}

exports.testCacheDel = function (test) {
  var self = this
  self.cI.set('foo', 1, 1000)
    .then(function () {
      return self.cI.del('foo')
    })
    .then(function () {
      test.deepEqual(self.cI._data['foo'], undefined, 'foo should have been deleted')
      test.done()
    })
}

exports.testCacheMget = function (test) {
  this.cI.mset([{key: 'a', value: 1}, {key: 'b', value: 2}, {key: 'c', value: 3}], 1000)
  var self = this
  this.cI.mget(['a', 'b', 'c'])
    .then(function (keys) {
      test.equal(keys.length, 3, '3 items should have been returned')
      test.equal(keys[0], 1, 'a should be 1')
      test.equal(keys[1], 2, 'b should be 2')
      test.equal(keys[2], 3, 'c should be 3')
      test.equal(3, self.cI.getAccessCount(), 'The number of accesses is 3')
      test.equal(3, self.cI.getHitCount(), 'The number of hits is 3')
      test.done()
    })
}

exports.testCacheMgetReturnsUndefined = function (test) {
  this.cI.mget(['a'])
    .then(function (results) {
      test.equal(results.length, 1, '1 key should have been returned')
      test.deepEqual(results[0], undefined, 'the first result should be undefined')
      test.done()
    })
}

exports.testCacheMgetReturnUndefinedAndValid = function (test) {
  this.cI.set('foo', 'bar', 5000)
  test.equal(this.cI._data['foo'], 'bar', 'bar should have been set')

  this.cI.mget(['NON', 'foo'])
    .then(function (results) {
      test.equal(results.length, 2, '2 keys should have been returned')
      test.deepEqual(results[0], undefined, 'NON should have returned undefined')
      test.deepEqual(results[1], 'bar', 'foo should have returned bar')
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
      .then(function (results) {
        test.equal(results.length, 3, '3 results should have been returned')
        test.deepEqual(results[0], undefined, 'a should be undefined')
        test.deepEqual(results[1], undefined, 'b should be undefined')
        test.deepEqual(results[2], undefined, 'c should be undefined')
        test.equal(3, self.cI.getAccessCount(), 'The number of accesses is 3')
        test.equal(0, self.cI.getHitCount(), 'The number of hits is 0')
        test.done()
      })
  }, 1101)
}

exports.testSetNotExist = function (test) {
  var cacheInstance = this.cI

  cacheInstance.set('abc', '123', 30000)
  cacheInstance.set('abc', '456', 30000, true)
  cacheInstance.get('abc')
    .then(function (val) {
      test.equals('123', val, 'The value should still be "123"')
      test.done()
    })
}

exports.testMsetNotExist = function (test) {
  var cacheInstance = this.cI

  var items = [
    {key: 'key1', value: 'value1'},
    {key: 'key3', value: 'value3'}
  ]
  cacheInstance.mset(items, 30000)

  items = [
    {key: 'key1', value: 'value1_new'},
    {key: 'key2', value: 'value2'},
    {key: 'key3', value: 'value3_new'},
    {key: 'key4', value: 'value4'}
  ]
  cacheInstance.mset(items, 30000, true)

  cacheInstance.mget(['key1', 'key2', 'key3', 'key4'])
    .then(function (values) {
      test.deepEqual(['value1', 'value2', 'value3', 'value4'], values, 'key2 and key4 should be set')
      test.done()
    })
}
