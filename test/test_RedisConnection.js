var zcache = require('../index')
var ServerInfo = require('../lib/ServerInfo')
var Q = require('kew')
var nodeunitq = require('nodeunitq')
var builder = new nodeunitq.Builder(exports)

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
