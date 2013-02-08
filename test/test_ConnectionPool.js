var zcache = require('../index')

exports.testConnectionPool = function (test) {
  var cacheInstance = new zcache.ConnectionPool({
    create: function (callback) {
      var wrappedCacheInstance = new zcache.MemcacheConnection("localhost", 11212)
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
    test.equal(cacheInstance.isAvailable(), true, "Connection should be available")

    cacheInstance.set('abc', '123', 300000)
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