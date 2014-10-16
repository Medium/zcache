// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview Testing the CacheCluster class
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

builder.add(function testSetAndGet(test) {
  var cluster = new zcache.CacheCluster()
  cluster.addNode('FakeCache1', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache2', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  var setPromises = []
  for (var i = 0; i < 100; i++) {
    setPromises.push(cluster.set('key' + i, 'value' + i))
  }

  return Q.all(setPromises)
    .then(function() {
      var getPromises = []
      for (var j = 0; j < 100; j++) {
        getPromises.push(cluster.get('key' + j))
      }
      return Q.all(getPromises)
    })
    .then(function(data) {
      for (var i = 0; i < 100; i++) {
        test.equals('value' + i, data[i])
      }
    })
})

builder.add(function testMgetAndMget(test) {
  var cluster = new zcache.CacheCluster()
  cluster.addNode('FakeCache1', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache2', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  var items = []
  for (var i = 0; i < 100; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }

  return cluster.mset(items)
    .then(function() {
      var keys = []
      for (var j = 0; j < 100; j++) {
        keys.push('key' + j)
      }
      return cluster.mget(keys)
    })
    .then(function(data) {
      test.equals(100, data.length, 'expect: # of returned value === # of keys')
      for (var i = 0; i < 100; i++) {
        test.equals('value' + i, data[i])
      }
    })
})

builder.add(function testAccessAndHitCount(test) {
  var cluster = new zcache.CacheCluster()
  cluster.addNode('FakeCache1', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache2', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  var items = []
  for (var i = 0; i < 10; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }

  return cluster.mset(items)
    .then(function() {
      var keys = []
      for (var j = 0; j < 20; j++) {
        keys.push('key' + j)
      }
      return cluster.mget(keys)
    })
    .then(function(data) {
      test.equals(20, data.length, 'expect: # of returned value === # of keys')
      test.equals(20, cluster.getAccessCount())
      test.equals(10, cluster.getHitCount())
    })
})

builder.add(function testPartialMgetFailure(test) {
  var cluster = new zcache.CacheCluster()
  var fakeCache1 = new zcache.FakeCache(logger)
  cluster.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster.addNode('FakeCache2', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  var items = []
  for (var i = 0; i < 100; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }

  return cluster.mset(items)
    .then(function() {
      var keys = []
      for (var j = 0; j < 100; j++) {
        keys.push('key' + j)
      }
      // the first cache instance will fail for the next request
      fakeCache1.setFailureCount(1)
      return cluster.mget(keys)
    })
    .then(function () {
      test.fail('The mget() call is supposed to fail')
    })
    .fail(function (err) {
      test.ok(err instanceof PartialResultError)
      test.equal(1, cluster.getPartialFailureCount('mget'))
      var data = err.getData()
      var error = err.getError()
      for (var i = 0; i < 100; i++) {
        var key = 'key' + i
        if (key in data) {
          test.equals('value' + i, data[key])
        } else {
          test.equals('Fake Error', error[key].message)
        }
      }
      test.ok(Object.keys(data).length > 60 && Object.keys(data).length < 100, 'Expect partial failures')
    })
})

builder.add(function testPartialMsetFailure(test) {
  var cluster = new zcache.CacheCluster()
  var fakeCache1 = new zcache.FakeCache(logger)
  cluster.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster.addNode('FakeCache2', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  var items = []
  for (var i = 0; i < 100; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }

  // the first cache instance will fail for the next request
  fakeCache1.setFailureCount(1)
  return cluster.mset(items)
    .then(function () {
      test.fail('The mset() call is supposed to fail')
    })
    .fail(function (err) {
      test.ok(err instanceof PartialResultError)
      test.equal(1, cluster.getPartialFailureCount('mset'))
      var data = err.getData()
      var error = err.getError()

      for (var i = 0; i < 100; i++) {
        var key = 'key' + i
        if (key in error) {
          test.equals('Fake Error', error[key].message)
        }
      }
      test.ok(Object.keys(error).length > 0 && Object.keys(error).length < 40, 'Expect partial failures')
    })
})

builder.add(function testMergePartialMsetFailures(test) {
  var cluster = new zcache.CacheCluster()
  var fakeCache1 = new zcache.FakeCache(logger)
  var fakeCache2 = new zcache.FakeCache(logger)
  cluster.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster.connect()

  var data1 = {'key1':  {value: 'valA'}, 'key2':  {value: 'valB'}, "keyBad": {}}
  var errors1 = {'key3': new zcache.TimeoutError()}
  var data2 = {'key5':  {value: 'valC'}, 'key6':  {value: 'valD'}}

  var data3 = {'key7': {value: 'valE'}, 'keyBad2': {}}
  var errors3 = {'key8': new zcache.TimeoutError()}

  var errors2 = {'key4': new zcache.PartialResultError(data3, errors3)}



  fakeCache1.setFailureCount(1)
  fakeCache2.setFailureCount(1)
  fakeCache1.setNextFailure(new zcache.PartialResultError(data1, errors1))
  fakeCache2.setNextFailure(new zcache.PartialResultError(data2, errors2))
  return cluster.mget(['key1', 'key2', 'key3', 'key4', 'key5', 'key6', 'key7', 'key8', 'keyBad', 'keyBad2'])
    .fail(function (err) {
      test.ok(err instanceof PartialResultError)
      var result = err.getData()
      var errors = err.getError()
      test.equal(result['key1'], 'valA')
      test.equal(result['key2'], 'valB')
      test.equal(result['key5'], 'valC')
      test.equal(result['key6'], 'valD')
      test.equal(result['key7'], 'valE')
      test.ok(errors['key3'] instanceof zcache.TimeoutError)
      test.equal(undefined, errors['key4'], "partial result error should be unpacked")
      test.ok(errors['key8'] instanceof zcache.TimeoutError)
    })
})

builder.add(function testDel(test) {
  var cluster = new zcache.CacheCluster()
  cluster.addNode('FakeCache1', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache2', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  var items = []
  for (var i = 0; i < 100; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }

  return cluster.mset(items)
    .then(function() {
      var delPromises = []
      for (var i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          delPromises.push(cluster.del('key' + i))
        }
      }
      return Q.all(delPromises)
    })
    .then(function () {
      var keys = []
      for (var i = 0; i < 100; i++) {
        keys.push('key' + i)
      }
      return cluster.mget(keys)
    })
    .then(function(data) {
      for (var i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          test.equals('undefined', typeof data[i])
        } else {
          test.equals('value' + i, data[i])
        }
      }
    })
})

builder.add(function testGetUri(test) {
  var cluster = new zcache.CacheCluster()
  cluster.addNode('FakeCache1', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache2', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  test.equal('FakeCache2', cluster.getUrisByKey('foo'), 'Key "foo" should be on cache 2')
  test.equal('FakeCache1', cluster.getUrisByKey('bar'), 'Key "foo" should be on cache 1')
  test.done()
})

builder.add(function testCornerCaseWithOnlyOneNode(test) {
  var cluster = new zcache.CacheCluster()
  var fakeCache = new zcache.FakeCache(logger)
  cluster.addNode('FakeCache', fakeCache, 1, 0)
  cluster.connect()

  var items = []
  for (var i = 0; i < 100; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }
  var keys = items.map(function (item) {return item.key})

  return cluster.mset(items)
    .then(function () {
      return cluster.mget(keys)
    })
    .then(function (data) {
      test.equals(100, data.length, 'expect: # of returned value === # of keys')
      for (var i = 0; i < 100; i++) {
        test.equals('value' + i, data[i])
      }

      fakeCache.setFailureCount(1)
      return cluster.mget(keys)
    })
    .fail(function (err) {
      test.ok(err instanceof PartialResultError)
      var data = err.getData()
      var error = err.getError()

      // Just one node, and it fails, so no data fetched
      test.deepEqual({}, data)

      // All the keys should map to an error
      for (var i = 0; i < 100; i++) {
        test.equals('Fake Error', error['key' + i].message)
      }
    })
})

builder.add(function testLatencyMeasurement(test) {
  var cluster = new zcache.CacheCluster({requestTimeoutMs: 200})
  var fakeCache1 = new zcache.FakeCache(logger).setLatencyMs(30)
  var fakeCache2 = new zcache.FakeCache(logger).setLatencyMs(30)
  cluster.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster.connect()

  var setPromises = []
  for (var i = 0; i < 20; i++) {
    setPromises.push(cluster.set('key' + i, 'value' + i))
  }

  return Q.all(setPromises)
    .then(function() {
      test.equal(20, cluster.getStats('set').count())
      test.ok(cluster.getStats('set').mean() > 28)
      test.ok(cluster.getStats('set').mean() < 35)

      var getPromises = []
      for (var i = 0; i < 20; i++) {
        getPromises.push(cluster.get('key' + i))
      }
      return Q.all(getPromises)
    })
    .then(function() {
      test.equal(20, cluster.getStats('get').count())
      test.ok(cluster.getStats('get').mean() > 28)
      test.ok(cluster.getStats('get').mean() < 35)

      var items = []
      for (var i = 0; i < 20; i++) {
        items.push({
          key: 'key' + i,
          value: 'value' + i
        })
      }
      return cluster.mset(items)
    })
    .then(function() {
      test.equal(1, cluster.getStats('mset').count())
      test.ok(cluster.getStats('mset').mean() > 28)
      test.ok(cluster.getStats('mset').mean() < 35)

      var keys = []
      for (var i = 0; i < 20; i++) {
        keys.push('key' + i)
      }
      return cluster.mget(keys)
    })
    .then(function() {
      test.equal(1, cluster.getStats('mget').count())
      test.ok(cluster.getStats('mget').mean() > 28)
      test.ok(cluster.getStats('mget').mean() < 35)
    })

})

// We trust the HashRing library for key distribution. This is more
// of a sanity check to make sure we didn't break things. We are not
// actually to test how evenly the keys are distributed.
// This test case should be updated when we change the hashring
// configuration, such as changing the underlying hash algorithm
// or changing the number of replicas of each server.
builder.add(function testKeyDistribution(test) {
  var cluster = new zcache.CacheCluster()
  cluster.addNode('FakeCache1', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache2', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache4', new zcache.FakeCache(logger), 1, 0)
  cluster.addNode('FakeCache5', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  var items = []
  for (var i = 0; i < 10000; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }

  return cluster.mset(items)
    .then(function() {
      test.equals(1793, Object.keys(cluster._servers['FakeCache1'].getData()).length)
      test.equals(2121, Object.keys(cluster._servers['FakeCache2'].getData()).length)
      test.equals(2260, Object.keys(cluster._servers['FakeCache3'].getData()).length)
      test.equals(2050, Object.keys(cluster._servers['FakeCache4'].getData()).length)
      test.equals(1776, Object.keys(cluster._servers['FakeCache5'].getData()).length)
    })
})

builder.add(function testTimeoutFailure(test) {
  var cluster = new zcache.CacheCluster()
  var fakeCache1 = new zcache.FakeCache(logger)
  var fakeCache2 = new zcache.FakeCache(logger)
  cluster.addNode('FakeCache1', fakeCache1, 1, 0)
  cluster.addNode('FakeCache2', fakeCache2, 1, 0)
  cluster.addNode('FakeCache3', new zcache.FakeCache(logger), 1, 0)
  cluster.connect()

  var items = []
  for (var i = 0; i < 100; i++) {
    items.push({
      key: 'key' + i,
      value: 'value' + i
    })
  }

  // Both fakeCache1 and fakeCache2 will timeout in the next requests.
  // We should see timeout count to be 2.
  fakeCache1.setFailureCount(1)
  fakeCache1.setNextFailure(new TimeoutError())
  fakeCache2.setFailureCount(1)
  fakeCache2.setNextFailure(new TimeoutError())

  return cluster.mset(items)
    .then(function () {
      test.fail('The mget() call is supposed to fail')
    })
    .fail(function (err) {
      test.equal(1, cluster.getPartialFailureCount('mset'), 'One partail failure from mset')
      test.equal(2, cluster.getTimeoutCount('mset'), 'Two timeouts from all cache servers')

      cluster.resetTimeoutCount('mset')
      test.equal(0, cluster.getTimeoutCount('mset'), 'Return 0 after reset')
    })
})
