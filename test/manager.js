var CacheCluster = require('../lib/CacheCluster')
var CacheManager = require('../lib/CacheManager')
var FakeMemcache = require('../lib/FakeMemcache')
var Q = require('kew')

process.on('uncaughtException', function (e) {
  console.error(e, e.stack)
})
exports.testManager = function (test) {
  var cacheManager = new CacheManager()

  var primaryCluster = new CacheCluster({
    clientCtor: FakeMemcache
  })
  primaryCluster.setServerCapacity('localhost:11212', 5)
  primaryCluster.setServerCapacity('localhost:11213', 5)
  cacheManager.addCluster('primary', primaryCluster, 1)

  var secondaryCluster = new CacheCluster({
    clientCtor: FakeMemcache
  })
  secondaryCluster.setServerCapacity('localhost:11214', 100)
  secondaryCluster.setServerCapacity('localhost:11215', 100)
  cacheManager.addCluster('secondary', secondaryCluster, 2)

  var defer = Q.defer()
  setTimeout(function () {
    defer.resolve(true)
  }, 200)

  defer.promise
    .then(function () {
      return cacheManager.set("a", "123")
    })
    .then(function (data) {
      test.equal(data, true, "Should set key")
      primaryCluster.setServerCapacity('localhost:11212', 0)
      primaryCluster.setServerCapacity('localhost:11213', 0)
      return cacheManager.get("a")
    })
    .then(function (data) {
      test.equal(data, '123', "Should get key")
      return cacheManager.set("a", "456")
    })
    .then(function (data) {
      test.equal(data, true, "Should set key again")
      return cacheManager.get("a")
    })
    .then(function (data) {
      test.equal(data, '456', "Should get key again")
      return cacheManager.del("a")
    })
    .then(function (data) {
      test.equal(data, true, "Should delete key")
      return cacheManager.get("a")
    })
    .then(function (data) {
      test.equal(data, undefined, "Should get undefined")
      primaryCluster.setServerCapacity('localhost:11212', 5)
      primaryCluster.setServerCapacity('localhost:11213', 5)
      var defer = Q.defer()
      setTimeout(function () {
        defer.resolve(cacheManager.get("a"))
      }, 1000)
      return defer.promise
    })
    .then(function (data) {
      test.equal(data, '123', "Should get original key")
      return cacheManager.del("a")
    })
    .then(function (data) {
      test.equal(data, true, "Should delete key again")
      return cacheManager.get("a")
    })
    .then(function (data) {
      test.equal(data, undefined, "Should get undefined again")
      test.done()
    })
}