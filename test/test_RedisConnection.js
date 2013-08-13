var zcache = require('../index')
var ServerInfo = require('../lib/ServerInfo')
var Q = require('kew')

exports.testRedisConnection = function (test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379)

  test.equal(cacheInstance.isAvailable(), false, 'Connection should not be available')

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')

    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')

    cacheInstance.set('abc', '123', 300000)
      .then(function () {
        cacheInstance.disconnect()

        // wait to ensure reconnection
        var defer = Q.defer()
        setTimeout(function () {
          defer.resolve(true)
        }, 200)
        return defer.promise
      })
      .then(function () {
        cacheInstance.connect()

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
      .then(function (vals) {
        test.equal(vals[0], '123')
        return cacheInstance.del('abc')
      })
      .then(function () {
        return cacheInstance.mget(['abc'])
      })
      .then(function (vals) {
        test.deepEqual(vals[0], undefined)
      })
      .then(function () {
        return cacheInstance.mset([{
          key: 'a',
          value: '456'
        }, {
          key: 'b',
          value: '789'
        }, {
          // test negative caching
          key: 'c',
          value: null
        }], 300000)
      })
      .then(function () {
        return cacheInstance.mget(['a', 'b', 'c', 'd'])
      })
      .then(function (vals) {
        test.equal(vals[0], '456')
        test.equal(vals[1], '789')
        test.deepEqual(vals[2], 'null')
        test.deepEqual(vals[3], undefined)
        test.equal(cacheInstance.getStats('set').count(), 1, 'set() is called for once')
        test.equal(cacheInstance.getStats('mset').count(), 1, 'mset() is called for once')
        test.equal(cacheInstance.getStats('get').count(), 0, 'get() is not called')
        test.equal(cacheInstance.getStats('mget').count(), 3, 'mget() is called for three times')
        test.equal(cacheInstance.getStats('del').count(), 1, 'del() is call for once')
        test.equal(cacheInstance.getAccessCount(), 6, 'The number of cache access is 6')
        test.equal(cacheInstance.getHitCount(), 4, 'The number of cache hit is 4')
        return cacheInstance.getServerInfo()
      })
      .then(function (info) {
        test.ok(info instanceof ServerInfo, 'The returned object should be a ServerInfo')
        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.equal(cacheInstance.isAvailable(), false, 'Connection should not be available')
    test.done()
  })

  cacheInstance.connect()
}
