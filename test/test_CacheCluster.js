// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview Testing the CacheCluster class
 */

var zcache = require('../index')
var Q = require('kew')
var nodeunitq = require('nodeunitq')
var builder = new nodeunitq.Builder(exports)
var logger = require('logg').getLogger('test CacheCluster')

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
      for (var i = 0; i < 100; i++) {
        test.equals('value' + i, data[i])
      }
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

// We trust the hashring library for key distribution. This is more
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
