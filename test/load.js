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
    //clientCtor: FakeMemcache
  })
  primaryCluster.setServerCapacity('localhost:11212', 100)
  primaryCluster.setServerCapacity('localhost:11213', 100 )
  cacheManager.addCluster('primary', primaryCluster, 1)

  var secondaryCluster = new CacheCluster({
    //clientCtor: FakeMemcache
  })
  secondaryCluster.setServerCapacity('localhost:11214', 100)
  secondaryCluster.setServerCapacity('localhost:11215', 100)
  cacheManager.addCluster('secondary', secondaryCluster, 2)

  var defer = Q.defer()
  setTimeout(function () {
    defer.resolve(true)
  }, 1000)

  defer.promise.then(function (data) {
    var currentVal = 0
    var setVal = function () {
      currentVal++
      console.log('setting', currentVal)
      return cacheManager.set('testKey', currentVal)
    }
    var getVal = function () {
      console.log('getting', currentVal)
      return cacheManager.get('testKey')
    }
    var handleLoop
    handleLoop = function () {
      return setVal()
        .then(getVal)
        .then(function (val) {
          test.equal(val, currentVal, "Val should be correct")
          if (currentVal <= 10000) {
            var defer = Q.defer()
            process.nextTick(function () {
              defer.resolve(handleLoop())
            })
            return defer.promise
          }
          else test.done()
        })
    }
    handleLoop()
  })
}