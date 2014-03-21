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
