var zcache = require('../index')

exports.testConnectionWrapper = function (test) {
  var wrappedCacheInstance = new zcache.MemcacheConnection("localhost", 11212)
  var cacheInstance = new zcache.ConnectionWrapper(wrappedCacheInstance)

  test.equal(cacheInstance.isAvailable(), false, "Connection should not be available")

  var secondConnectHandler = function () {
    cacheInstance.on('destroy', function () {
      test.equal(cacheInstance.isAvailable(), false, "Connection should not be available")
      test.done()
    })

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
  }

  var firstConnectHandler = function () {
    cacheInstance.removeListener('connect', firstConnectHandler)
    cacheInstance.on('connect', secondConnectHandler)
    wrappedCacheInstance.disconnect()
  }

  cacheInstance.on('connect', firstConnectHandler)

  cacheInstance.connect()
}