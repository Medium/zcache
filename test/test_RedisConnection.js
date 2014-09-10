var zcache = require('../index')
var ServerInfo = require('../lib/ServerInfo')
var Q = require('kew')
var nodeunitq = require('nodeunitq')
var builder = new nodeunitq.Builder(exports)
var redis = require('redis')

  builder.add(function testRedisConnection(test) {
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
        test.deepEqual(vals[0], undefined)
      })
      .then(function () {

        return cacheInstance.mset([{
          key: 'a',
          value: '456'
        }, {
          key: 'b',
          value: '789'
        }, {
          // test negative caching
          key: 'c',
          value: null
        }], 300000)
      })
      .then(function () {
        return cacheInstance.mget(['a', 'b', 'c', 'd'])
      })
      .then(function (vals) {
        test.equal(vals[0], '456')
        test.equal(vals[1], '789')
        test.deepEqual(vals[2], 'null')
        test.deepEqual(vals[3], undefined)

        test.equal(cacheInstance.getStats('set').count(), 1, 'set() is called for once')
        test.equal(cacheInstance.getStats('mset').count(), 1, 'mset() is called for once')
        test.equal(cacheInstance.getStats('get').count(), 0, 'get() is not called')
        test.equal(cacheInstance.getStats('mget').count(), 3, 'mget() is called for three times')
        test.equal(cacheInstance.getStats('del').count(), 1, 'del() is call for once')
        test.equal(cacheInstance.getAccessCount(), 6, 'The number of cache access is 6')
        test.equal(cacheInstance.getHitCount(), 4, 'The number of cache hit is 4')

        // Just print out the stats and spot check by human before we can
        // figure out a good way to systemtically test the stats.
        console.log('get:', cacheInstance.getPrettyStatsString('get'))
        console.log('mget:', cacheInstance.getPrettyStatsString('mget'))
        console.log('set:', cacheInstance.getPrettyStatsString('set'))
        console.log('mset:', cacheInstance.getPrettyStatsString('mset'))
        console.log('del:', cacheInstance.getPrettyStatsString('del'))

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
})

builder.add(function testSetNotExist(test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379)

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')
    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')

    cacheInstance.set('abc', '123', 300000)
      .then(function () {
        return cacheInstance.set('abc', '456', 300000, true)
      })
      .then(function (val) {

        return cacheInstance.get('abc')
      })
      .then(function (val) {
        test.equal(val, '123')
        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.done()
  })

  cacheInstance.connect()
})

builder.add(function testMsetNotExist(test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379)

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')
    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')

    var items = [
      {key: 'key1', value: 'value1'},
      {key: 'key3', value: 'value3'}
    ]

    Q.all([cacheInstance.del('key1'), cacheInstance.del('key2'), cacheInstance.del('key3'), cacheInstance.del('key4')])
      .then(function () {
        cacheInstance.mset(items, 300000)
      })
      .then(function () {
        var items = [
          {key: 'key1', value: 'value1_new'},
          {key: 'key2', value: 'value2'},
          {key: 'key3', value: 'value3_new'},
          {key: 'key4', value: 'value4'}
        ]
        return cacheInstance.mset(items, 300000, true)
      })
      .then(function (val) {
        return cacheInstance.mget(['key1', 'key2', 'key3', 'key4'])
      })
      .then(function (vals) {
        test.deepEqual(['value1', 'value2', 'value3', 'value4'], vals)

        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.done()
  })

  cacheInstance.connect()
})

// Test .set() with TTL
//  (1) set a key with 1 sec TTL
//  (2) wait for 1.05 sec
//  (3) get the key, and it should return 'undefined'.
builder.add(function testSetTimeout(test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379)

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')
    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')

    cacheInstance.set('abc', '123', 1000)
      .then(function () {

        return Q.delay(1050)
      })
      .then(function (val) {

        return cacheInstance.get('abc')
      })
      .then(function (val) {
        test.deepEqual(undefined, val, 'The "abc" key should have been expired after 1.05 sec')

        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.done()
  })

  cacheInstance.connect()
})

// Test .mset() with 'setWhenNotExist' set and TTL
//  (1) set two keys with a long TTL
//  (2) set two existing keys plus two more new keys with 'setWhenNotExist' set and with 1 sec TTL
//  (3) wait for 1.05 sec.
//  (4) the two new keys should have expired and the two old keys should still exist and have the old value
builder.add(function testMsetNotExistTimeout(test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379)

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')
    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')

    var items = [
      {key: 'key1', value: 'value1'},
      {key: 'key3', value: 'value3'}
    ]

    Q.all([cacheInstance.del('key1'), cacheInstance.del('key2'), cacheInstance.del('key3'), cacheInstance.del('key4')])
      .then(function () {
        cacheInstance.mset(items, 300000)
      })
      .then(function () {
        var items = [
          {key: 'key1', value: 'value1_new'},
          {key: 'key2', value: 'value2'},
          {key: 'key3', value: 'value3_new'},
          {key: 'key4', value: 'value4'}
        ]
        return cacheInstance.mset(items, 1000, true)
      })
      .then(function (val) {
        return Q.delay(1050)
      })
      .then(function (val) {
        return cacheInstance.mget(['key1', 'key2', 'key3', 'key4'])
      })
      .then(function (vals) {
        test.deepEqual(['value1', undefined, 'value3', undefined], vals, '"key2" and "key4" should have been expired at this moment')

        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.done()
  })

  cacheInstance.connect()
})

builder.add(function testCounts(test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379)

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')
    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')

    var items = [
      {key: 'key1', value: 'value1'},
      {key: 'key3', value: 'value3'}
    ]

    Q.all([cacheInstance.del('key1'), cacheInstance.del('key2'), cacheInstance.del('key3'), cacheInstance.del('key4')])
      .then(function () {
        cacheInstance.mset(items, 300000)
      })
      .then(function () {
        return cacheInstance.mget(['key1', 'key2', 'key3', 'key4'])
      })
      .then(function (vals) {
        test.deepEqual(['value1', undefined, 'value3', undefined], vals, '"key2" and "key4" should have been expired at this moment')
        test.equals(4, cacheInstance.getAccessCount())
        test.equals(2, cacheInstance.getHitCount())
        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.done()
  })

  cacheInstance.connect()
})


// Helper function to test all the scenarios of compression, off, on, and dual mode
function runCommonTest(cacheInstancePut, cacheInstanceGet, test, compressionFlag) {
  var bigDeferred = Q.defer()

  // longVal will have a length of 1180 after the for loop is executed, making it longer than the pivot
  var longVal = 'A long string that should be compressed because it is greater than 750 chars'
  for (i = 0; i < 4; i++) {
   longVal = longVal.concat(longVal)
  }
  var longValOn = '@snappy@wAnwPEEgbG9uZyBzdHJpbmcgdGhhdCBzaG91bGQgYmUgY29tcHJlc3NlZCBiZWNhdXNlIGl0IGlzIGdyZWF0ZXIBMChuIDc1MCBjaGFyc/5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAP5MAM5MAA=='
  var tinyVal = 'tiny'
  var tinyValOn = '@orig@tiny'
  var nullVal = 'null'
  var undefinedVal = 'undefined'

  var items = [
    {key: 'longValue2', value: longVal},
    {key: 'tinyValue2', value: tinyVal}
  ]

  var testKeys = ['longValue', 'tinyValue', 'longValue2', 'tinyValue2', 'nullValue', 'undefinedValue']
  var expValsWithoutCompression = [longVal, tinyVal, longVal, tinyVal, nullVal, undefinedVal]
  var expValsWithCompression = [longValOn, tinyValOn, longValOn, tinyValOn, nullVal, undefinedVal]
  var expVals = compressionFlag ? expValsWithCompression : expValsWithoutCompression

  var populateSetterFuncs = function() {
    return [
      cacheInstancePut.set('longValue', longVal, 100000),
      cacheInstancePut.set('tinyValue', tinyVal, 100000),
      cacheInstancePut.set('nullValue', null, 100000),
      cacheInstancePut.set('undefinedValue', undefined, 100000),
      cacheInstancePut.mset(items, 100000)
    ]
  }

  var redisClient = redis.createClient(6379, 'localhost')
  redisClient.on('error', function (err) {
     console.log("error event - " + err)
  })

  var destroyRedisClient = function () {
    redisClient.quit()
    delete redisClient
    return bigDeferred.resolve()
  }

  Q.all(populateSetterFuncs()).then(function () {
    //Retrieve all items from redis directly to inspect format
    var deferred = Q.defer()
    redisClient.mget(testKeys, function(err, value) {
          return deferred.resolve(value)
    })
    return deferred.promise

   }).then(function (vals) {
       // confirm cache entries look good
       test.deepEqual(expVals, vals)
       return Q.resolve()
   }).then(function () { return cacheInstanceGet.get('longValue')
   }).then(function (val) {
       // confirm get works
       test.equal(longVal, val)
       return cacheInstanceGet.mget(testKeys)
   }).then(function (vals) {
       // confirm mget works
       test.deepEqual(expValsWithoutCompression, vals)
       destroyRedisClient()
   })
   .fail(function (e) {
       console.error(e)
       test.fail(e.message)
       destroyRedisClient()
   })

   return bigDeferred.promise
}

// Test 1: Compression Off
builder.add(function testCompressionOff(test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379, {requestTimeoutMs : 100})

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')
    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')
    runCommonTest(cacheInstance, cacheInstance, test, false)
      .fin(function () {
        cacheInstance.destroy()
      })
  })

  cacheInstance.on('destroy', function () {
    test.done()
  })

  cacheInstance.connect()
})

// Test 2: Compression On
builder.add(function testCompressionOn(test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379, {compressionEnabled : true, requestTimeoutMs : 100})

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')
    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')
    runCommonTest(cacheInstance, cacheInstance, test, true)
      .fin(function () {
         cacheInstance.destroy()
      })
  })

  cacheInstance.on('destroy', function () {
    test.done()
  })

  cacheInstance.connect()
})

// Test 3: Writing Client compression Off, Reading Client compression On
builder.add(function testCompressionPutOffGetOn(test) {
  var cacheInstancePut = new zcache.RedisConnection('localhost', 6379, {requestTimeoutMs : 100})
  var cacheInstanceGet = new zcache.RedisConnection('localhost', 6379, {compressionEnabled : true, requestTimeoutMs : 100})

  cacheInstancePut.on('connect', function () {
    cacheInstancePut.removeAllListeners('connect')
    test.equal(cacheInstancePut.isAvailable(), true, 'Connection should be available')
    cacheInstanceGet.connect()
  })

  cacheInstanceGet.on('connect', function () {
    cacheInstanceGet.removeAllListeners('connect')
    test.equal(cacheInstanceGet.isAvailable(), true, 'Connection should be available')
    runCommonTest(cacheInstancePut, cacheInstanceGet, test, false)
      .fin(function () {
         cacheInstancePut.destroy()
         cacheInstanceGet.destroy()
      })
  })

  var count = 0
  var destroy = function () {
    if (++count === 2) test.done()
  }

  cacheInstancePut.on('destroy', function() {
    destroy()
  })
  cacheInstanceGet.on('destroy', function () {
     destroy()
  })

  cacheInstancePut.connect()
})

// Test 4: Writing Client compression On, Reading Client compression Off
builder.add(function testCompressionPutOnGetOff(test) {
  var cacheInstanceGet = new zcache.RedisConnection('localhost', 6379, {requestTimeoutMs : 100})
  var cacheInstancePut = new zcache.RedisConnection('localhost', 6379, {compressionEnabled : true, requestTimeoutMs : 100})

  cacheInstancePut.on('connect', function () {
    cacheInstancePut.removeAllListeners('connect')
    test.equal(cacheInstancePut.isAvailable(), true, 'Connection should be available')
    cacheInstanceGet.connect()
  })

  cacheInstanceGet.on('connect', function () {
    cacheInstanceGet.removeAllListeners('connect')
    test.equal(cacheInstanceGet.isAvailable(), true, 'Connection should be available')
    runCommonTest(cacheInstancePut, cacheInstanceGet, test, true)
      .fin(function () {
         cacheInstancePut.destroy()
         cacheInstanceGet.destroy()
      })
  })

  var count = 0
  var destroy = function () {
   if (++count === 2) test.done()
  }

  cacheInstancePut.on('destroy', function() {
    destroy()
  })
  cacheInstanceGet.on('destroy', function () {
    destroy()
  })

  cacheInstancePut.connect()
})

builder.add(function testTimeoutFormget(test) {
  var cacheInstance = new zcache.RedisConnection('localhost', 6379)

  cacheInstance.on('connect', function () {
    cacheInstance.removeAllListeners('connect')
    test.equal(cacheInstance.isAvailable(), true, 'Connection should be available')

    var items = [
      {key: 'key1', value: 'value1'},
      {key: 'key3', value: 'value3'}
    ]

    Q.all([cacheInstance.mset(items, 300000)])
      .then(function () {
        // Set the request timeout to 1ms to fake the timeout
        cacheInstance._reqTimeoutMs = 0
        return cacheInstance.mget(['key1', 'key2', 'key3', 'key4'], {requestTimeoutMs: 50})
      })
      .then(function (vals) {
        test.deepEqual(['value1', undefined, 'value3', undefined], vals, 'Should not timeout')
        cacheInstance.destroy()
      })
      .fail(function (e) {
        console.error(e)
        test.fail(e.message)
        test.done()
      })
  })

  cacheInstance.on('destroy', function () {
    test.done()
  })

  cacheInstance.connect()
})

