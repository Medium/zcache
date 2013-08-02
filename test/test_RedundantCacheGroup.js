var zcache = require('../index')
var Q = require('kew')

exports.testRedundantCacheGroup = function (test) {
  var memcacheCluster = new zcache.CacheCluster({
    create: function (uri, opts, callback) {
      var parts = uri.split(':')
      var host = parts[0]
      var port = parseInt(parts[1], 10)

      var poolInstance = new zcache.ConnectionPool({
        create: function (callback) {
          var wrappedCacheInstance = new zcache.MemcacheConnection(host, port)
          var wrapperCacheInstance = new zcache.ConnectionWrapper(wrappedCacheInstance)
          wrapperCacheInstance.on('connect', function () {
            callback(null, wrapperCacheInstance)
          })

          wrapperCacheInstance.connect()
        },
        destroy: function (client) {
          client.destroy()
        }
      })

      poolInstance.on('connect', function () {
        callback(null, poolInstance)
      })

      poolInstance.connect()
    }
  })
  memcacheCluster.setNodeCapacity('localhost:11212', 5, {memcache: true}, 0)
  memcacheCluster.setNodeCapacity('localhost:11213', 5, {memcache: true}, 0)

  var redisInstance = new zcache.RedisConnection('localhost', 6379)

  var cacheInstance = new zcache.RedundantCacheGroup()
  cacheInstance.add(redisInstance, 1)
  cacheInstance.add(memcacheCluster, 2)

  test.equal(cacheInstance.isAvailable(), false, "Connection should not be available")

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')

    var defer = Q.defer()
    setTimeout(function () {
      defer.resolve(true)
    }, 100)

    defer
      .then(function () {
        test.equal(cacheInstance.isAvailable(), true, "Connection should be available")

        var promises = []
        promises.push(cacheInstance.set('abc', '123', 300000))
        promises.push(cacheInstance.set('def', '456', 300000))
        promises.push(cacheInstance.set('ghi', '789', 300000))
        promises.push(cacheInstance.set('jkl', '234', 300000))
        promises.push(cacheInstance.set('mno', '567', 300000))

        return Q.all(promises)
      })
      .then(function () {
        return cacheInstance.mget(['abc', 'def', 'ghi', 'jkl', 'mno'])
      })
      .then(function (vals) {
        test.equal(vals[0], '123')
        test.equal(vals[1], '456')
        test.equal(vals[2], '789')
        test.equal(vals[3], '234')
        test.equal(vals[4], '567')

        //disconnect the memcache cluster
        memcacheCluster.disconnect()

        // wait to ensure disconnection
        var defer = Q.defer()
        setTimeout(function () {
          defer.resolve(true)
        }, 100)
        return defer.promise
      })
      .then(function () {
        return cacheInstance.del('abc')
      })
      .then(function () {
        return cacheInstance.mget(['abc'])
      })
      .then(function (vals) {
        test.equal(vals[0], undefined)

        // reconnect the memcache cluster
        memcacheCluster.connect()

        // wait to ensure reconnection
        var defer = Q.defer()
        setTimeout(function () {
          defer.resolve(true)
        }, 200)
        return defer.promise
      })
      .then(function () {
        return cacheInstance.mget(['abc'])
      })
      .then(function (val) {
        test.equal(val, '123')
        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message, e.stack)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.equal(cacheInstance.isAvailable(), false, "Connection should not be available")
    test.done()
  })

  cacheInstance.connect()
}

module.exports = {
  setUp: function (callback) {
    this.memoryInstance1 = new zcache.InMemoryCache()
    this.memoryInstance2 = new zcache.InMemoryCache()

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
