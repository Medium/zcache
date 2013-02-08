var zcache = require('../index')

/*
exports.testConnectionPool = function (test) {
  var cacheInstance = new zcache.CacheCluster({
    create: function (uri, opts, callback) {
      var parts = uri.split(':')

      var wrappedCacheInstance = new zcache.MemcacheConnection(parts[0], parseInt(parts[1], 10))
      var wrapperCacheInstance = new zcache.ConnectionWrapper(wrappedCacheInstance)
      wrapperCacheInstance.on('connect', function () {
        callback(null, wrapperCacheInstance)
      })

      wrapperCacheInstance.connect()
    }
  })
  cacheInstance.setCapacity('localhost:11212', 10, {memcache: true})
  cacheInstance.setCapacity('localhost:11212', 5, {memcache: true})

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
*/