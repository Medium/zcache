// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview A very simple cache instance for unit testing.
 */

var Q = require('kew')
var util = require('util')
var CacheInstance = require('./CacheInstance')
var TimeoutError = require('./TimeoutError')

var CACHE_LATENCY_MS = 5

/** @typedef {{fine: !Function}} */
var Logger

/**
 * @constructor
 * @extends CacheInstance
 * @param {Logger} logger A logger for logging debug information.
 * @param {string=} optUri Give an URI to this fake cache instance
 */
function FakeCache(logger, optUri) {
  CacheInstance.call(this)

  this.flush()
  this._logger = logger
  this._failureCount = 0
  this._latencyMs = CACHE_LATENCY_MS
  this._nextFailure = null
  this._uri = optUri || 'FakeCache'
}
util.inherits(FakeCache, CacheInstance)

/** @override */
FakeCache.prototype.mget = function (keys) {
  if (this._failureCount > 0) return this._fakeFail('mget')

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualMget() {
      self._requestCounts.mget += 1
      self._requestCounts.mgetItemCount.push(keys.length)
      return Q.resolve(keys.map(function (key) {return self._getInternal(key)}))
    })
}

/** @override */
FakeCache.prototype.get = function (key) {
  if (this._failureCount > 0) return this._fakeFail('get')
  this._logger.fine('FakeCache - get', key)

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualGet() {
      self._requestCounts.get += 1
      return Q.resolve(self._getInternal(key))
    })
}


/** @override */
FakeCache.prototype.del = function (key) {
  if (this._failureCount > 0) return this._fakeFail('del')
  this._logger.fine('FakeCache - del', key)

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualDel() {
      self._requestCounts.del += 1
      delete self._data[key]
    })
}

/** @override */
FakeCache.prototype.set = function (key, value, maxAgeMs, setWhenNotExist) {
  if (this._failureCount > 0) return this._fakeFail('set')
  this._logger.fine('FakeCache - set', key, value)

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualSet() {
      self._requestCounts.set += 1
      if (!setWhenNotExist || !(key in self._data)) self._data[key] = value
    })
}

/** @override */
FakeCache.prototype.mset = function (items, maxAgeMs, setWhenNotExist) {
  if (this._failureCount > 0) return this._fakeFail('mset')

  var self = this
  // Add an artificial delay to mimic real world cache latency.
  return Q.delay(this._latencyMs)
    .then(function actualMset() {
      self._requestCounts.mset += 1
      self._requestCounts.msetItemCount.push(items.length)
      for (var i = 0; i < items.length; i++) {
        var item = items[i]
        if (!setWhenNotExist || !(item.key in self._data)) self._data[item.key] = item.value
      }
    })
}

/** @override */
FakeCache.prototype.getUrisByKey = function (key) {
  return [this._uri]
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
 * Set failure count
 */
FakeCache.prototype.setNextFailure = function (err) {
  this._nextFailure = err
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
    mset: 0,
    get: 0,
    set: 0,
    del: 0,
    mgetItemCount: [],
    msetItemCount: [],
    hitCount: 0,
    missCount: 0,
  }
}

FakeCache.prototype._fakeFail = function (op) {
  this._failureCount -= 1
  var failure
  if (this._nextFailure) {
    if (this._nextFailure instanceof TimeoutError) this._getTimeoutCounter(op).inc()
    failure = this._nextFailure
    this._nextFailure = null
  } else {
    failure = new Error('Fake Error')
  }
  return Q.reject(failure)
}

FakeCache.prototype._getInternal = function (key) {
  this._logger.fine('FakeCache - getInternal', key, (typeof this._data[key] !== 'undefined') ? '[HIT]' : '[MISS]')
  var val = this._data[key]
  this._accessCount += 1
  if (typeof val === 'undefined') {
    this._requestCounts.missCount += 1
  } else {
    this._hitCount += 1
    this._requestCounts.hitCount += 1
  }
  return val
}

module.exports = FakeCache
