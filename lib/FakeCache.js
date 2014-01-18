// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview A very simple cache instance for unit testing.
 */

var Q = require('kew')
var util = require('util')
var CacheInstance = require('./CacheInstance')

var CACHE_LATENCY_MS = 5

/**
 * @constructor
 * @extends CacheInstance
 * @param {Logger} logger A logger for logging debug information.
 */
function FakeCache(logger) {
  this.flush()
  this._logger = logger
  this._failureCount = 0
  this._latencyMs = CACHE_LATENCY_MS
}
util.inherits(FakeCache, CacheInstance)

/** @inheritDoc */
FakeCache.prototype.mget = function (keys) {
  if (this._failureCount > 0) return this._fakeFail()

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualMget() {
      self._requestCounts.mget += 1
      self._requestCounts.mgetItemCount.push(keys.length)
      return Q.resolve(keys.map(function (key) {return self._getInternal(key)}))
    })
}

/** @inheritDoc */
FakeCache.prototype.get = function (key) {
  if (this._failureCount > 0) return this._fakeFail()

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualGet() {
      self._requestCounts.get += 1
      return Q.resolve(self._getInternal(key))
    })
}


/** @inheritDoc */
FakeCache.prototype.del = function (key) {
  if (this._failureCount > 0) return this._fakeFail()
  this._logger.fine('FakeCache - del', key)
  this._requestCounts.del += 1
  delete this._data[key]
  return Q.resolve()
}

/** @inheritDoc */
FakeCache.prototype.set = function (key, value) {
  if (this._failureCount > 0) return this._fakeFail()
  this._logger.fine('FakeCache - set', key, value)

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualSet() {
      self._requestCounts.set += 1
      self._data[key] = value
      return Q.resolve()
    })
}

/** @inheritDoc */
FakeCache.prototype.mset = function (items) {
  if (this._failureCount > 0) return this._fakeFail()

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualMset() {
      self._requestCounts.mset += 1
      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        self._data[item.key] = item.value
      }
      return Q.resolve()
    })
}

/**
 * A sync version of the mget().
 */
FakeCache.prototype.mgetSync = function (keys) {
  return keys.map(function (key) {return this._getInternal(key)})
}

/**
 * A sync version of the get().
 */
FakeCache.prototype.getSync = function (key) {
  return this._getInternal(key)
}

/**
 * A sync version of the set().
 */
FakeCache.prototype.setSync = function (key, value) {
  this._data[key] = value
}

/**
 * A sync version of the mset().
 */
FakeCache.prototype.msetSync = function (items) {
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    this._data[item.key] = item.value
  }
}

FakeCache.prototype.isAvailable = function () {
  return true
}

FakeCache.prototype.connect = function () {}

FakeCache.prototype.disconnect = function () {}

FakeCache.prototype.destroy = function () {}

/**
 * Flush all cached data
 */
FakeCache.prototype.flush = function () {
  this._data = {}
  this.resetRequestCounts()
}

/**
 * Get stats data
 */
FakeCache.prototype.getRequestCounts = function () {
  return this._requestCounts
}

/**
 * Return all cached data
 */
FakeCache.prototype.getData = function () {
  return this._data
}

/**
 * Set failure count
 */
FakeCache.prototype.setFailureCount = function (count) {
  this._failureCount = count
}

/**
 * Set the latency for all cache operations.
 *
 * @param {number} latencyMs The delay of all operation in msec
 */
FakeCache.prototype.setLatencyMs = function (latencyMs) {
  this._latencyMs = latencyMs
  return this
}

FakeCache.prototype.resetRequestCounts = function () {
  this._requestCounts = {
    mget: 0,
    get: 0,
    set: 0,
    del: 0,
    mgetItemCount: [],
    hitCount: 0,
    missCount: 0,
  }
}

FakeCache.prototype._fakeFail = function () {
  this._failureCount -= 1
  return Q.reject(new Error('Fake Error'))
}

FakeCache.prototype._getInternal = function (key) {
  this._logger.fine('FakeCache - get', key, (typeof this._data[key] !== 'undefined') ? '[HIT]' : '[MISS]')
  var val = this._data[key]
  if (typeof val === 'undefined') {
    this._requestCounts.missCount += 1
  } else {
    this._requestCounts.hitCount += 1
  }
  return val
}

module.exports = FakeCache
