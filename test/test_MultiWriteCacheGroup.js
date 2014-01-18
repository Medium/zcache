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
  var cache1 = new zcache.FakeCache(logger)
  var cache2 = new zcache.FakeCache(logger)
  var cache3 = new zcache.FakeCache(logger)
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
  var cache1 = new zcache.FakeCache(logger)
  var cache2 = new zcache.FakeCache(logger)
  var cache3 = new zcache.FakeCache(logger)
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
  var cache1 = new zcache.FakeCache(logger)
  var cache2 = new zcache.FakeCache(logger)
  var cache3 = new zcache.FakeCache(logger)
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
