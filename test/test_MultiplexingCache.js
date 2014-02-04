var zcache = require('../index')
var nodeunitq = require('nodeunitq')
var Q = require('kew')

var fake
var cache

exports.setUp = function (done) {
  fake = new zcache.FakeCache({fine: function () {}})
  fake.setLatencyMs(100)
  cache = new zcache.MultiplexingCache(fake)
  done()
}

exports.tearDown = function (done) {
  cache.disconnect()
  cache.destroy()
  done()
}

var builder = new nodeunitq.Builder(exports)

builder.add(function testConcurrentGet(test) {
  fake.setSync('abc', 'donkey')

  var p1 = cache.get('abc')
  var p2 = cache.get('abc')
  var p3 = cache.get('abc')

  return Q.all([p1, p2, p3]).then(function (results) {
    test.equal(results[0], 'donkey')
    test.equal(results[1], 'donkey')
    test.equal(results[2], 'donkey')
    test.equal(fake.getRequestCounts().mget, 1, 'Only one request should be made to delegate')
    test.equal(fake.getRequestCounts().get, 0, 'get() really calls mget()')
  })
})

builder.add(function testSerialGets(test) {
  fake.setSync('abc', 'donkey')

  return cache.get('abc')
  .then(function (v1) {
    test.equal(v1, 'donkey')
    return cache.get('abc')
  })
  .then(function (v2) {
    test.equal(v2, 'donkey')
    test.equal(fake.getRequestCounts().mget, 2, 'Two requests should be made to delegate')
    test.equal(fake.getRequestCounts().get, 0, 'get() really calls mget()')
  })
})

builder.add(function testConcurrentGetWithSet(test) {
  fake.setSync('abc', 'donkey')

  var p1 = cache.get('abc')
  var p2 = cache.get('abc')
  cache.set('abc', 'elephant')
  var p3 = cache.get('abc')

  return Q.all([p1, p2, p3]).then(function (results) {
    test.equal(results[0], 'donkey')
    test.equal(results[1], 'donkey')
    test.equal(results[2], 'elephant')
    test.equal(fake.getRequestCounts().mget, 2, 'Two requests should be made to delegate')
    test.equal(fake.getRequestCounts().get, 0, 'get() really calls mget()')
  })
})

builder.add(function testConcurrentGetWithDel(test) {
  fake.setSync('abc', 'donkey')

  var p1 = cache.get('abc')
  var p2 = cache.get('abc')
  cache.del('abc')
  var p3 = cache.get('abc')

  return Q.all([p1, p2, p3]).then(function (results) {
    test.equal(results[0], 'donkey')
    test.equal(results[1], 'donkey')
    test.equal(results[2], undefined)
    test.equal(fake.getRequestCounts().mget, 2, 'Two requests should be made to delegate')
    test.equal(fake.getRequestCounts().get, 0, 'get() really calls mget()')
  })
})

builder.add(function testConcurrentMGets(test) {
  fake.setSync('a', '1')
  fake.setSync('b', '2')
  fake.setSync('c', '3')
  fake.setSync('d', '4')
  fake.setSync('e', '5')
  fake.setSync('f', '6')
  fake.setSync('g', '7')

  var p1 = cache.mget(['a', 'b', 'c'])
  var p2 = cache.mget(['b', 'c', 'd'])
  var p3 = cache.mget(['e', 'f', 'g'])
  var p4 = cache.mget(['a', 'b', 'c', 'd', 'e', 'f', 'g'])

  return Q.all([p1, p2, p3, p4]).then(function (results) {
    test.deepEqual(results[0], ['1', '2', '3'])
    test.deepEqual(results[1], ['2', '3', '4'])
    test.deepEqual(results[2], ['5', '6', '7'])
    test.deepEqual(results[3], ['1', '2', '3', '4', '5', '6', '7'])
    var counts = fake.getRequestCounts()
    test.equal(counts.mget, 3, 'Three requests should be made to delegate')

    // 2nd request should share some results with first request.
    // 4th request shouldn't need any more results.
    test.deepEqual(counts.mgetItemCount, [3, 1, 3])
  })
})

builder.add(function testMGetWithMultipleSameKey(test) {
  fake.setSync('a', '1')
  fake.setSync('b', '2')
  fake.setSync('c', '3')

  var p1 = cache.mget(['a', 'a', 'a'])

  return Q.all([p1]).then(function (results) {
    test.deepEqual(results[0], ['1', '1', '1'])
  })
})

builder.add(function testConcurrentMGetsWithSet(test) {
  fake.setSync('a', '1')
  fake.setSync('b', '2')
  fake.setSync('c', '3')

  var p1 = cache.mget(['a', 'b', 'c'])
  cache.set('b', '20')
  var p2 = cache.mget(['a', 'b', 'c'])

  return Q.all([p1, p2]).then(function (results) {
    test.deepEqual(results[0], ['1', '2', '3'])
    test.deepEqual(results[1], ['1', '20', '3'])
    var counts = fake.getRequestCounts()
    test.equal(counts.mget, 2, 'Two requests should be made to delegate')
  })
})


builder.add(function testConcurrentMGetsWithMSet(test) {
  fake.setSync('a', '1')
  fake.setSync('b', '2')
  fake.setSync('c', '3')
  fake.setSync('d', '4')

  var p1 = cache.mget(['a', 'b', 'c', 'd'])
  cache.mset([{key: 'b', value: '20'}, {key: 'c', value: '30'}])
  var p2 = cache.mget(['a', 'b', 'c', 'd'])

  return Q.all([p1, p2]).then(function (results) {
    test.deepEqual(results[0], ['1', '2', '3', '4'])
    test.deepEqual(results[1], ['1', '20', '30', '4'])
  })
})
