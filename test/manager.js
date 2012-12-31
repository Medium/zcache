var CacheCluster = require('../lib/CacheCluster')
var CacheManager = require('../lib/CacheManager')

exports.testManager = function (test) {
  var cacheManager = new CacheManager()

  var primaryCluster = new CacheCluster()
  primaryCluster.setServerCapacity('localhost:11212', 5)
  primaryCluster.setServerCapacity('localhost:11213', 5)
  cacheManager.addCluster('primary', primaryCluster, 1)

  primaryCluster.getClientsForKeys(['a', 'b', 'c', 'd'])

  setTimeout(function () {
    primaryCluster.getClientsForKeys(['a', 'b', 'c', 'd'])
  }, 5000)

  /*
  var secondaryCluster = new CacheCluster()
  secondaryCluster.setServerCapacity('localhost:11214', 100)
  secondaryCluster.setServerCapacity('localhost:11215', 100)
  cacheManager.addCluster('secondary', secondaryCluster, 2)
  */

  setTimeout(function () {
    test.done()
  }, 300000)
}