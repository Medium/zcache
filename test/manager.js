var CacheCluster = require('../lib/CacheCluster')
var CacheManager = require('../lib/CacheManager')
var Q = require('kew')

process.on('uncaughtException', function (e) {
  console.error(e, e.stack)
})
exports.testManager = function (test) {
  var cacheManager = new CacheManager()

  var primaryCluster = new CacheCluster()
  primaryCluster.setServerCapacity('localhost:11212', 5)
  primaryCluster.setServerCapacity('localhost:11213', 5)
  cacheManager.addCluster('primary', primaryCluster, 1)

  var secondaryCluster = new CacheCluster()
  secondaryCluster.setServerCapacity('localhost:11214', 100)
  secondaryCluster.setServerCapacity('localhost:11215', 100)
  cacheManager.addCluster('secondary', secondaryCluster, 2)

  setTimeout(function () {
    cacheManager.set("a", "123")
      .then(function (data) {
        console.log("SET", data)
        primaryCluster.setServerCapacity('localhost:11212', 0)
        primaryCluster.setServerCapacity('localhost:11213', 0)
        return cacheManager.get("a")
      })
      .then(function (data) {
        console.log("GET", data)
        return cacheManager.set("a", "456")
      })
      .then(function (data) {
        console.log("SET", data)
        return cacheManager.get("a")
      })
      .then(function (data) {
        console.log("GET", data)
        return cacheManager.del("a")
      })
      .then(function (data) {
        console.log("DEL", data)
        return cacheManager.get("a")
      })
      .then(function (data) {
        console.log("GET", data)
        primaryCluster.setServerCapacity('localhost:11212', 5)
        primaryCluster.setServerCapacity('localhost:11213', 5)
        var defer = Q.defer()
        setTimeout(function () {
          defer.resolve(cacheManager.get("a"))
        }, 1000)
        return defer.promise
      })
      .then(function (data) {
        console.log("GET", data)
        return cacheManager.del("a")
      })
      .then(function (data) {
        console.log("DEL", data)
        return cacheManager.get("a")
      })
      .then(function (data) {
        console.log("GET", data)
      })
      .fail(function (e) {
        console.error("ERROR", e, e.stack)
        throw e
      })
  }, 2000)

  setTimeout(function () {
    test.done()
  }, 300000)
}