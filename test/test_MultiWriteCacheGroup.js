// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview Testing the MultiWriteCacheGroup
 */

var zcache = require('../index')
var Q = require('kew')
var nodeunitq = require('nodeunitq')
var builder = new nodeunitq.Builder(exports)
var logger = require('logg').getLogger('test CacheCluster')
var PartialResultError = require('../lib/PartialResultError')
var TimeoutError = require('../lib/TimeoutError')

// Mock the setInterval so metrics will not hang the test
global.setInterval = function () {}

builder.add(function testGetAndGet(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cache3 = new zcache.FakeCache(logger, 'FakeCache3')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.addWriteOnlyNode(cache3)
  cacheGroup.connect()

  cache1.setSync('key', 1)
  cache2.setSync('key', 2)
  cache3.setSync('key', 3)

  return cacheGroup.get('key')
    .then(function (data) {
      test.equals(1, data, 'The value should be the value from cache1')

      // Update 'key' with 0, which should go to all instances
      return cacheGroup.set('key', 0)
    })
    .then(function () {
      test.equals(0, cache1.getSync('key'), 'The value in cache1 should be updated')
      test.equals(0, cache2.getSync('key'), 'The value in cache2 should be double-written')
      test.equals(0, cache3.getSync('key'), 'The value in cache3 should be double-written')

      // Delete 'key', which should go to all instances
      return cacheGroup.del('key', 0)
    })
    .then(function () {
      test.deepEqual(undefined, cache1.getSync('key'), 'The value in cache1 should be deleted')
      test.deepEqual(undefined, cache2.getSync('key'), 'The value in cache1 should be deleted')
      test.deepEqual(undefined, cache3.getSync('key'), 'The value in cache1 should be deleted')
    })
})

builder.add(function testMgetAndMget(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cache3 = new zcache.FakeCache(logger, 'FakeCache3')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.addWriteOnlyNode(cache3)
  cacheGroup.connect()

  var items = [
    {key: 'key1', value: 'value1'},
    {key: 'key2', value: 'value2'}
  ]

  return cacheGroup.mset(items)
    .then(function() {
      test.equals('value1', cache1.getSync('key1'))
      test.equals('value2', cache1.getSync('key2'))
      test.equals('value1', cache2.getSync('key1'))
      test.equals('value2', cache2.getSync('key2'))
      test.equals('value1', cache3.getSync('key1'))
      test.equals('value2', cache3.getSync('key2'))

      cache1.setSync('key1', 'value1-1')
      cache1.setSync('key2', 'value2-1')

      return cacheGroup.mget(['key1', 'key2'])
    })
    .then(function(data) {
      test.deepEqual(['value1-1', 'value2-1'], data)
    })
})

builder.add(function testFailure(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cache3 = new zcache.FakeCache(logger, 'FakeCache3')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.addWriteOnlyNode(cache3)
  cacheGroup.connect()

  cache2.setFailureCount(1)
  return cacheGroup.set('key', 'value')
    .then(function (data) {
      test.fail('This test is supposed to fail')
    })
    .fail(function () {})
})

builder.add(function testGetUri(test) {
  var fakeCache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var fakeCache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var fakeCache3 = new zcache.FakeCache(logger, 'FakeCache3')

  var cluster1 = new zcache.CacheCluster()
  cluster1.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster1.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster1.connect()

  var cluster2 = new zcache.CacheCluster()
  cluster2.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster2.addNode('FakeCache3', fakeCache3, 1, 0)
  cluster2.connect()

  var cacheGroup = new zcache.MultiWriteCacheGroup(cluster1)
  cacheGroup.addWriteOnlyNode(cluster2)

  test.equal('FakeCache2', cacheGroup.getUrisByKey('foo').sort().join(','), '"foo" exists on FakeCache2 in both clusters')
  test.equal('FakeCache1,FakeCache3', cacheGroup.getUrisByKey('bar').sort().join(','), '"bar" exists on FakeCache1 and FakeCache3')

  test.done()
})

builder.add(function testAvoidRedudantMset(test) {
  var fakeCache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var fakeCache2 = new zcache.FakeCache(logger, 'FakeCache1')

  var cacheGroup = new zcache.MultiWriteCacheGroup(fakeCache1)
  cacheGroup.addWriteOnlyNode(fakeCache2)

  var items = [
    {key: 'key1', value: 'value1'},
    {key: 'key2', value: 'value2'}
  ]

  return cacheGroup.mset(items)
    .then(function() {
      test.equals('value1', fakeCache1.getSync('key1'), 'key1 should exist in the first fake cache')
      test.equals('value2', fakeCache1.getSync('key2'), 'key2 should exist in the first fake cache')
      test.deepEqual(undefined, fakeCache2.getSync('key1'), 'key1 should not be in the second fake cache')
      test.deepEqual(undefined, fakeCache2.getSync('key2'), 'key2 should not be in the second fake cache')
    })
})

builder.add(function testAvoidRedudantSet(test) {
  var fakeCache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var fakeCache2 = new zcache.FakeCache(logger, 'FakeCache1')

  var cacheGroup = new zcache.MultiWriteCacheGroup(fakeCache1)
  cacheGroup.addWriteOnlyNode(fakeCache2)

  return cacheGroup.set('key1', 'value1')
    .then(function() {
      test.equals('value1', fakeCache1.getSync('key1'), 'key1 should exist in the first fake cache')
      test.deepEqual(undefined, fakeCache2.getSync('key1'), 'key1 should not be in the second fake cache')
    })
})

builder.add(function testAvoidRedudantDel(test) {
  var fakeCache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var fakeCache2 = new zcache.FakeCache(logger, 'FakeCache1')

  var cacheGroup = new zcache.MultiWriteCacheGroup(fakeCache1)
  cacheGroup.addWriteOnlyNode(fakeCache2)
  fakeCache1.setSync('key1', 'value1')
  fakeCache2.setSync('key1', 'value1')

  return cacheGroup.del('key1')
    .then(function() {
      test.deepEqual(undefined, fakeCache1.getSync('key1'), 'key1 should have been deleted in the first fake cache')
      test.equals('value1', fakeCache2.getSync('key1'), 'key1 should still be in the second fake cache')
    })
})

builder.add(function testAvoidRedudantMsetInCluster(test) {
  var fakeCache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var fakeCache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var fakeCache3 = new zcache.FakeCache(logger, 'FakeCache3')
  var fakeCache4 = new zcache.FakeCache(logger, 'FakeCache4')

  var cluster1 = new zcache.CacheCluster()
  cluster1.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster1.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster1.addNode('FakeCache3', fakeCache3, 1, 0)
  cluster1.connect()

  var cluster2 = new zcache.CacheCluster()
  cluster2.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster2.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster2.addNode('FakeCache3', fakeCache3, 1, 0)
  cluster2.addNode('FakeCache4', fakeCache4, 1, 0)
  cluster2.connect()

  var cacheGroup = new zcache.MultiWriteCacheGroup(cluster1)
  cacheGroup.addWriteOnlyNode(cluster2)

  var items = []
  for (var i = 0; i < 1000; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }

  return cacheGroup.mset(items)
    .then(function() {
      var n1 = fakeCache1.getRequestCounts()['msetItemCount'][0]
      var n2 = fakeCache2.getRequestCounts()['msetItemCount'][0]
      var n3 = fakeCache3.getRequestCounts()['msetItemCount'][0]
      var n4 = fakeCache4.getRequestCounts()['msetItemCount'][0]
      test.equals(1000, n1 + n2 + n3, 'The servers in the first cluster should get exactly 1000 sets')
      test.ok(200 < n4 && n4 < 300, 'The new server in the second cluster should get about 1/4 of the keys')
    })
})

builder.add(function testGetFromReadSecondary(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.enableReadFromSecondary(10)
  cacheGroup.connect()

  cache2.setSync('key', 'value')
  return cacheGroup.get('key')
    .then(function (data) {
      test.equal('value', data, 'The get() should return the right value from the secondary instance')
      test.equals(1, cache2.getRequestCounts()['get'], 'The secondary cache should get one get()')

      // the following is a fragile test... any better ideas?
      return Q.delay(20)
    })
    .then(function () {
      test.equals('value', cache1.getSync('key'), 'key should be been written back to cache1')
    })
})

builder.add(function testGetFromReadSecondaryAndMiss(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.enableReadFromSecondary(10)
  cacheGroup.connect()

  return cacheGroup.get('key')
    .then(function (data) {
      test.equal(undefined, data, 'The get() should return undefined since it is missing in both servers')
      test.equals(1, cache2.getRequestCounts()['get'], 'The secondary cache should get one get()')

      // the following is a fragile test... any better ideas?
      return Q.delay(20)
    })
    .then(function () {
      test.equals(undefined, cache1.getSync('key'), 'key should be still a miss')
    })
})


builder.add(function testGetFromReadSecondaryAndHit(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.enableReadFromSecondary(10)
  cacheGroup.connect()

  cache2.setSync('key', 'value')
  return cacheGroup.get('key')
    .then(function (data) {
      test.equal('value', data, 'The get() should return the right value from the secondary instance')
      test.equals(1, cache2.getRequestCounts()['get'], 'The secondary cache should get one get()')

      // the following is a fragile test... any better ideas?
      return Q.delay(20)
    })
    .then(function () {
      test.equals('value', cache1.getSync('key'), 'key should be been written back to cache1')
    })
})


// Test mget() from both primary and seconday. All the keys already
// exist in primary, i.e., we should *not* query secondary at all.
builder.add(function testMgetFromReadSecondaryAllInPrimary(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.enableReadFromSecondary(10)
  cacheGroup.connect()

  cache1.setSync('key1', 'value1')
  cache1.setSync('key2', 'value2')
  cache1.setSync('key3', 'value3')
  return cacheGroup.mget(['key1', 'key2', 'key3'])
    .then(function (data) {
      test.deepEqual(['value1', 'value2', 'value3'], data, 'The mget() should return the right value from the primary instance')
      test.equals(0, cache2.getRequestCounts()['mget'], 'The secondary cache should never been called for mget()')
    })
})


// Test mget() from both primary and seconday. All the keys only
// exist in secondary.
builder.add(function testMgetFromReadSecondaryAllInSecondary(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.enableReadFromSecondary(10)
  cacheGroup.connect()

  cache2.setSync('key1', 'value1')
  cache2.setSync('key2', 'value2')
  cache2.setSync('key3', 'value3')
  return cacheGroup.mget(['key1', 'key2', 'key3'])
    .then(function (data) {
      test.deepEqual(['value1', 'value2', 'value3'], data, 'The mget() should return the right value from the secondary instance')
      test.equals(1, cache2.getRequestCounts()['mget'], 'The secondary cache should get one mget()')
      test.equals(3, cache2.getRequestCounts()['mgetItemCount'][0], 'The secondary cache should be asked for three keys')

      // the following is a fragile test... any better ideas?
      return Q.delay(20)
    })
    .then(function () {
      test.equals(1, cache1.getRequestCounts()['mset'], 'All three keys should be mset() back to primary')
      test.equals(3, cache1.getRequestCounts()['msetItemCount'][0], 'All three keys should be mset() back to primary')
      test.equals('value1', cache1.getSync('key1'), 'key1 should exist in primary now')
      test.equals('value2', cache1.getSync('key2'), 'key2 should exist in primary now')
      test.equals('value3', cache1.getSync('key3'), 'key3 should exist in primary now')
    })
})

// Test mget() from both primary and seconday. This test case gets
// 5 keys, two of them exist in primary, two of them exist only on
// secondary, and the other one is missing in both.
builder.add(function testMgetFromReadSecondaryMixed(test) {
  var cache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var cache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var cacheGroup = new zcache.MultiWriteCacheGroup(cache1)
  cacheGroup.addWriteOnlyNode(cache2)
  cacheGroup.enableReadFromSecondary(10)
  cacheGroup.connect()

  cache1.setSync('key1', 'value1')
  cache2.setSync('key2', 'value2')
  cache1.setSync('key3', 'value3')
  cache2.setSync('key4', 'value4')
  // 'key5' is missing both

  return cacheGroup.mget(['key1', 'key2', 'key3', 'key4', 'key5'])
    .then(function (data) {
      test.deepEqual(['value1', 'value2', 'value3', 'value4', undefined], data, 'The mget() should return the right value from the secondary instance')
      test.equals(1, cache2.getRequestCounts()['mget'], 'The secondary cache should get one mget()')
      test.equals(3, cache2.getRequestCounts()['mgetItemCount'][0], 'The secondary cache should be asked for three keys')

      // the following is a fragile test... any better ideas?
      return Q.delay(20)
    })
    .then(function () {
      // Notice, although 3 keys are missing, we only back fill two of them,
      // because 'key5' is also missing in secondary.
      test.equals(1, cache1.getRequestCounts()['mset'], 'Two of the missed keys should be mset() back to primary')
      test.equals(2, cache1.getRequestCounts()['msetItemCount'][0], 'Two of the missed keys should be mset() back to primary')
      test.equals('value2', cache1.getSync('key2'), 'key2 should be been written back to cache1')
      test.equals('value4', cache1.getSync('key4'), 'key4 should be been written back to cache1')
      test.equals(undefined, cache1.getSync('key5'), 'key5 should still be a miss')
    })
})

builder.add(function testAvoidDoubleReadForGet(test) {
  var fakeCache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var fakeCache2 = new zcache.FakeCache(logger, 'FakeCache1')
  fakeCache1.connect()
  fakeCache2.connect()

  var cacheGroup = new zcache.MultiWriteCacheGroup(fakeCache1)
  cacheGroup.addWriteOnlyNode(fakeCache2)
  cacheGroup.enableReadFromSecondary(10)

  return cacheGroup.get('key')
    .then(function(value) {
      test.equals(1, fakeCache1.getRequestCounts()['get'], 'The primary server should be hit only once')
      test.equals(0, fakeCache2.getRequestCounts()['get'], 'The secondary server should not be hit at all, since it has the same URI')
      test.deepEqual(undefined, value, 'get() should return undefined')
    })
})


// If the primary and secondry clusters have overlap and 'readFromSecondary'
// is enabled, mget() should only try to get the keys that are located in the
// new server, because the keys located on the old servers will still be missed.
builder.add(function testAvoidDoubleReadFromMget(test) {
  var fakeCache1 = new zcache.FakeCache(logger, 'FakeCache1')
  var fakeCache2 = new zcache.FakeCache(logger, 'FakeCache2')
  var fakeCache3 = new zcache.FakeCache(logger, 'FakeCache3')
  var fakeCache4 = new zcache.FakeCache(logger, 'FakeCache4')

  var cluster1 = new zcache.CacheCluster()
  cluster1.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster1.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster1.addNode('FakeCache3', fakeCache3, 1, 0)
  cluster1.connect()

  var cluster2 = new zcache.CacheCluster()
  cluster2.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster2.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster2.addNode('FakeCache3', fakeCache3, 1, 0)
  cluster2.addNode('FakeCache4', fakeCache4, 1, 0)
  cluster2.connect()

  var cacheGroup = new zcache.MultiWriteCacheGroup(cluster1)
  cacheGroup.addWriteOnlyNode(cluster2)
  cacheGroup.enableReadFromSecondary(10)

  // Generate 1000 random key/value pairs. They all miss in the
  // primary cluster, so we will try to get all of them from the
  // secondary cluster. Only the keys that are relocated to the
  // forth (new) node in the secondary cluster have values.
  var keys = []
  var expected = []
  for (var i = 0; i < 1000; i++) {
    var key = 'key' + i
    var value = 'value' + i
    keys.push(key)
    if ('FakeCache4' == cluster2.getUrisByKey(key)) {
      fakeCache4.setSync(key, value)
      expected.push(value)
    } else {
      expected.push(undefined)
    }
  }

  // The first cache servers should only be hit once for each key,
  // although they also belong to the secondary cluster.
  // The new server in the secondary cluster should be hit for
  // about 1/4 of the keys and they should all return cached values.
  return cacheGroup.mget(keys)
    .then(function(values) {
      test.deepEqual(expected, values, 'The mget() results should match the expected')
      var n1 = fakeCache1.getRequestCounts()['mgetItemCount'][0]
      var n2 = fakeCache2.getRequestCounts()['mgetItemCount'][0]
      var n3 = fakeCache3.getRequestCounts()['mgetItemCount'][0]
      var n4 = fakeCache4.getRequestCounts()['mgetItemCount'][0]
      test.equals(1000, n1 + n2 + n3, 'The servers in the first cluster should get exactly 1000 gets')
      test.ok(200 < n4 && n4 < 300, 'The new server in the second cluster should be quried for about 1/4 of the keys')
    })
})

