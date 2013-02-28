var zcache = require('../index')
var Q = require('kew')

// exports.testThroughput = function (test) {
//   var cluster = new zcache.CacheCluster({
//     create: function (uri, opts, callback) {
//       var parts = uri.split(':')
//       var host = parts[0]
//       var port = parseInt(parts[1], 10)

//       var poolInstance = new zcache.ConnectionPool({
//         create: function (callback) {
//           // create a raw memcache instance (and use base64 encoding for everything stored)
//           var wrappedCacheInstance = new zcache.MemcacheConnection(host, port, 'base64')
//           // make sure it stays connected
//           var wrapperCacheInstance = new zcache.ConnectionWrapper(wrappedCacheInstance)
//           // return when it's ready
//           wrapperCacheInstance.on('connect', function () {
//             callback(null, wrapperCacheInstance)
//           })
//           // connect
//           wrapperCacheInstance.connect()
//         },
//         destroy: function (client) {
//           client.destroy()
//         }
//       })

//       poolInstance.on('connect', function () {
//         callback(null, poolInstance)
//       })

//       poolInstance.connect()
//     }
//   })

//   cluster.setNodeCapacity('localhost:11211', 100, {}, 0)
//   cluster.setNodeCapacity('localhost:11212', 100, {}, 0)
//   cluster.connect()

//   var cacheClient = new zcache.RedundantCacheGroup()
//   cacheClient.add(cluster, 1)
//   cacheClient.connect()

//   cacheClient = cluster

//   // set up a list of keys to write and read
//   var vals = {a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7'}

//   function getVals() {
//     var startTime = Date.now()
//     var getPromises = []
//     var keys = []
//     for (var i = 0; i < 5; i++) {
//       for (var key in vals) {
//         keys.push(key)
//       }
//     }

//     return Q.all(cacheClient.mget(keys))
//       .then(function (results) {
//         console.log("Retrieved in", (Date.now() - startTime), results)
//         return Q.delay(500)
//           .then(getVals)
//       })
//   }

//   Q.delay(500)
//     .then(function () {
//       var setPromises = []
//       for (var key in vals) {
//         setPromises.push(cacheClient.set(key, vals[key]))
//       }
//       return Q.all(setPromises)
//     })
//     .then(function () {
//       return getVals()
//     })
// }