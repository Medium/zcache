// Copyright 2014 The Obvious Corporation.

/**
 * @fileoverview The base class of all cache instances.
 */

var events = require('events')
var util = require('util')
var metrics = require('metrics')
var util = require('util')
var Q = require('kew')

/**
* Default timeout for cache request. Notice, not the timeout for connection.
* @const
* @type {number}
*/
var DEFAULT_REQ_TIMEOUT_MS = 50

/**
 * A generic cache instance.
 *
 * @param {Object=} options Additional options for this connection.
 *     'requestTimeoutMs' specifies the timeout of a Redis request.
 * @constructor
 */
function CacheInstance(options) {
  this._stats = {}
  this._timeoutCount = {}
  this._accessCount = 0
  this._hitCount = 0
  this._reqTimeoutMs = (options && options.requestTimeoutMs) || DEFAULT_REQ_TIMEOUT_MS
}
util.inherits(CacheInstance, events.EventEmitter)

/**
 * Indicate if this cache instance is available.
 *
 * @return{boolean}
 */
CacheInstance.prototype.isAvailable = function () {
  throw new Error("isAvailable() must be implemented by any class extending CacheInstance")
}

/**
 * Connect this cache instance.
 */
CacheInstance.prototype.connect = function () {
  throw new Error("connect() must be implemented by any class extending CacheInstance")
}

/**
 * Disconnect this cache instance.
 */
CacheInstance.prototype.disconnect = function () {
  throw new Error("disconnect() must be implemented by any class extending CacheInstance")
}

/**
 * Destroy this cache instance.
 */
CacheInstance.prototype.destroy = function () {
  throw new Error("destroy() must be implemented by any class extending CacheInstance")
}

/**
 * Get the values of multiple keys.
 *
 * @param {Array.<string>} keys A list of keys
 * @return {Promise.<Array.<string>>} The fetched values. For keys that do not exist,
 *         returns 'undefined's.
 */
CacheInstance.prototype.mget = function (keys) {
  throw new Error("mget() must be implemented by any class extending CacheInstance")
}

/**
 * Set values to multiple keys.
 *
 * @param {Array.<{key: string, value: string}} items Key-value pairs to set.
 * @param {number} maxAgeMs The living time of keys, in milliseconds.
 * @param {boolean=} setWhenNotExist Only set the keys that do not exist yet.
 * @return {Promise}
 */
CacheInstance.prototype.mset = function (items, maxAgeMs, setWhenNotExist) {
  throw new Error("mset() must be implemented by any class extending CacheInstance")
}

/**
 * Get the value of a given key.
 *
 * @param {string} key The key to get value of.
 * @return {Promise.<string>} The fetched value. Returns 'undefined' if the doesn't exist.
 */
CacheInstance.prototype.get = function (key) {
  throw new Error("get() must be implemented by any class extending CacheInstance")
}

/**
 * Set a key.
 *
 * @param {string} key
 * @param {string} value
 * @param {number} maxAgeMs The living time of this key, in milliseconds.
 * @param {boolean=} setWhenNotExist Only set the key when it doesn't exist.
 * @return {Promise}
 */
CacheInstance.prototype.set = function (key, val, maxAgeMs, setWhenNotExist) {
  throw new Error("set() must be implemented by any class extending CacheInstance")
}

/**
 * Delete a key.
 *
 * @param {string} key
 * @param {Promise}
 */
CacheInstance.prototype.del = function (key) {
  throw new Error("del() must be implemented by any class extending CacheInstance")
}

/**
 * Get the uri of the cache server(s) that is in charge of the given key.
 *
 * @param {string} key
 * @return {Array.<string>}
 */
CacheInstance.prototype.getUrisByKey = function (key) {
  return ['UnknownUri']
}

/**
 * Get the number of cache accesses.
 *
 * @return {number}
 */
CacheInstance.prototype.getAccessCount = function () {
  return this._accessCount
}

/**
 * Get the number of cache hits.
 *
 * @return {number}
 */
CacheInstance.prototype.getHitCount = function () {
  return this._hitCount
}

/**
 * Reset the access count and hit count to get counts during time intervals.
 *
 * @return {number}
 */
CacheInstance.prototype.resetCount = function () {
  this._hitCount = 0
  this._accessCount = 0
}

/**
 * Get service information about this cache instance if it is a standlone service.
 *
 * @param {string} key
 * @param {Promise.<ServerInfo>} A promise that returns the server information. Returns
 *                               null if the server info is not available.
 */
CacheInstance.prototype.getServerInfo = function (key) {
  return Q.resolve(null)
}

/**
 * Update the access count and hit count according to the result of get/mget.
 *
 * @param {Array.<Object>|Object} data The data fetched by get or mget.
 * @return {Function} A function that updates the counts and returns the parameter
 *                    that is passed into it. It is handy to chain to a promise.
 */
CacheInstance.prototype.updateCount = function() {
  var self = this
  return function (data) {
    if (Array.isArray(data)) {
      self._accessCount += data.length
      for (var i = 0; i < data.length; i++) {
        if (typeof data[i] !== 'undefined') self._hitCount += 1
      }
    } else {
      self._accessCount += 1
      if (typeof data !== 'undefined') self._hitCount += 1
    }
    return data
  }
}

/**
 * Get the stats of a certain operation.
 *
 * @param {string} op The name of the operation, e.g., get, set, etc.
 * @return {metrics.Timer}
 */
CacheInstance.prototype.getStats = function (op) {
  if (!this._stats[op]) this._stats[op] = new metrics.Timer()
  return this._stats[op]
}

/**
 * Get the timeout count of a certain operation.
 *
 * @param {string} op The name of the operation, e.g., get, set, etc.
 * @return {number}
 */
CacheInstance.prototype.getTimeoutCount = function (op) {
  return this._getTimeoutCounter(op).count
}

/**
 * Reset the timeout count of a certain operation.
 *
 * @param {string} op The name of the operation, e.g., get, set, etc.
 */
CacheInstance.prototype.resetTimeoutCount = function (op) {
  this._getTimeoutCounter(op).clear()
}

/**
 * Get the stats of a certain operation in a human-readable format.
 *
 * @param {string} op The name of the operation, e.g., get, set, etc.
 * @return {string}
 */
CacheInstance.prototype.getPrettyStatsString = function (op) {
  var m = this.getStats(op)
  return util.format('%d ops min/max/avg %d/%d/%d 1min/5min/15min %d/%d/%d',
                     m.count(), m.min(), m.max(), m.mean(),
                     m.oneMinuteRate(), m.fiveMinuteRate(), m.fifteenMinuteRate())
}

/**
 * Gets a map of cacheInstance uri and the requestCounts
 * @return {Object}
 */
CacheInstance.prototype.getPendingRequestsCount = function () {
  throw new Error("getPendingRequestsCount() must be implemented by any class extending CacheInstance")
}

/**
 * Get the Counter object that tracks the number of timeouts of a certain
 * operations.
 *
 * @param {string} op The name of the operation, e.g., get, set, etc.
 * @return {metrics.Counter}
 */
CacheInstance.prototype._getTimeoutCounter = function (op) {
  if (!this._timeoutCount[op]) this._timeoutCount[op] = new metrics.Counter()
  return this._timeoutCount[op]
}

module.exports = CacheInstance
