var zcache = require('../index')
var Q = require('kew')

exports.testConnectionPool = function (test) {
  var cacheInstance = new zcache.ConnectionPool({
    create: function (callback) {
      var wrappedCacheInstance = new zcache.MemcacheConnection("localhost", 11211)
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

  test.equal(cacheInstance.isAvailable(), false, "Connection should not be available")

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')

    Q.resolve(true)
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
        return cacheInstance.mget(['abc', 'def', 'ghi', 'jkl', 'mno'])
      })
      .then(function (vals) {
        test.equal(vals[0], '123')
        test.equal(vals[1], '456')
        test.equal(vals[2], '789')
        test.equal(vals[3], '234')
        test.equal(vals[4], '567')
        return cacheInstance.del('abc')
      })
      .then(function () {
        return cacheInstance.mget(['abc'])
      })
      .then(function (vals) {
        test.equal(vals[0], undefined)
        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.equal(cacheInstance.isAvailable(), false, "Connection should not be available")
    test.done()
  })

  cacheInstance.connect()
}