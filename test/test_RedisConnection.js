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
        test.equal(vals[0], undefined)
      })
      .then(function () {
        return cacheInstance.mset([{
          key: 'a',
          value: '456'
        }, {
          key: 'b',
          value: '789'
        }], 300000)
      })
      .then(function () {
        return cacheInstance.mget(['a', 'b'])
      })
      .then(function (vals) {
        test.equal(vals.length, 2, 'Should have precisely 2 results')
        test.equal(vals[0], '456')
        test.equal(vals[1], '789')
        test.equal(1, cacheInstance.getStats('set').count(),  'set() is called for once')
        test.equal(1, cacheInstance.getStats('mset').count(), 'mset() is called for once')
        test.equal(0, cacheInstance.getStats('get').count(),  'get() is not called')
        test.equal(3, cacheInstance.getStats('mget').count(), 'mget() is called for three times')
        test.equal(1, cacheInstance.getStats('del').count(),  'del() is call for once')
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
